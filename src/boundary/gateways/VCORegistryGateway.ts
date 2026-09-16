/**
 * D-Fence — VCORegistryGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.6.1, 1.6.2, 1.6.3, 1.6.7, 10.2.1, 10.4.6.
 *
 * NEA's Registered Vector Control Operator dataset, `d_0921c2daa08b8bd846d2405c934da8c6` — 290
 * rows, every one carrying a full address and a valid postal code, verified 2026-09-16.
 *
 * **This is reference data and the class is shaped to say so.** There is no `since`, no polling and
 * no change detection, because the dataset's own `lastUpdatedAt` is 2024-06-06: there is nothing to
 * detect. `fetchPublishedAt()` exists solely so that 1.6.7 has something true to display. A feed
 * that is two years old and presented beside live NEA cluster data is the one thing here a viewer
 * could most easily misread.
 *
 * The transport is the same two-hop poll-download as the cluster feed, and for the same reason it
 * goes through HttpClient — so 10.4.6 and the retry rule live in one place. The payload is CSV
 * rather than GeoJSON, which is the only real difference.
 */
import { OperatorRegistrySource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';
import { VectorControlOperator } from '../../entity/VectorControlOperator';

interface DatasetMetadata {
  data?: { lastUpdatedAt?: string };
}

interface PollDownload {
  data?: { url?: string };
}

/** The header names in the published file, verified 2026-09-16. */
const COLUMNS = {
  company: 'company_name',
  block: 'block_house_number',
  street: 'street_name',
  postal: 'postal_code',
  phone: 'tel_no',
} as const;

export class VCORegistryGateway implements OperatorRegistrySource {
  constructor(
    private readonly http: HttpClient,
    private readonly metadataBaseUrl = 'https://api-production.data.gov.sg',
    private readonly downloadBaseUrl = 'https://api-open.data.gov.sg',
    private readonly datasetId: string = VCORegistryGateway.VCO_DATASET_ID,
  ) {}

  /** Verified live 2026-09-16: 290 rows, CSV, `lastUpdatedAt` 2024-06-06. */
  static readonly VCO_DATASET_ID = 'd_0921c2daa08b8bd846d2405c934da8c6';

  sourceKind(): SourceKind {
    return SourceKind.OperatorRegistry;
  }

  async isHealthy(): Promise<boolean> {
    try {
      return (await this.fetchPublishedAt()) !== null;
    } catch {
      return false;
    }
  }

  metadataUrl(): string {
    return `${this.metadataBaseUrl}/v2/public/api/datasets/${this.datasetId}/metadata`;
  }

  pollDownloadUrl(): string {
    return `${this.downloadBaseUrl}/v1/public/api/datasets/${this.datasetId}/poll-download`;
  }

  /** 1.6.7 — the publisher's stamp, which is the date every display of this registry must carry. */
  async fetchPublishedAt(): Promise<Date | null> {
    const meta = await this.http.getJson<DatasetMetadata>(this.metadataUrl(), { attempts: 3 });
    const stamp = meta.data?.lastUpdatedAt;
    if (stamp === undefined) {
      return null;
    }
    const at = new Date(stamp);
    return Number.isNaN(at.getTime()) ? null : at;
  }

  /** The CSV, in two hops. The signed URL expires, so it is used immediately and never cached. */
  async fetchRegistry(): Promise<RawPayload> {
    const poll = await this.http.getJson<PollDownload>(this.pollDownloadUrl(), { attempts: 3 });
    const signedUrl = poll.data?.url;
    if (signedUrl === undefined) {
      throw new Error('poll-download returned no url; the dataset id may be wrong');
    }
    const res = await this.http.get(signedUrl, { attempts: 3, timeoutMs: 30_000 });
    if (!res.ok) {
      throw new Error(`registry download failed: ${res.status}`);
    }
    return { retrievedAt: new Date(), body: await res.text() };
  }

  /**
   * 1.6.2, 1.6.3 — CSV text to operators, ungeocoded.
   *
   * Static because it is a pure function of the payload, which is what lets G1 test the postal-code
   * rule without a network, a clock or a geocoder.
   */
  static parse(csv: string): VectorControlOperator[] {
    const rows = VCORegistryGateway.parseCsv(csv);
    if (rows.length === 0) {
      return [];
    }
    const header = rows[0] as string[];
    const at = (name: string): number => header.findIndex((h) => h.trim().toLowerCase() === name);
    const idx = {
      company: at(COLUMNS.company),
      block: at(COLUMNS.block),
      street: at(COLUMNS.street),
      postal: at(COLUMNS.postal),
      phone: at(COLUMNS.phone),
    };
    if (idx.postal < 0) {
      throw new Error(`registry CSV has no '${COLUMNS.postal}' column; headers: ${header.join(', ')}`);
    }

    const operators: VectorControlOperator[] = [];
    for (const row of rows.slice(1)) {
      const field = (i: number): string => (i < 0 ? '' : (row[i] ?? '').trim());
      const postalCode = field(idx.postal);
      // 1.6.3. Six digits exactly: a four-digit sector alone geocodes to the centre of a whole
      // district, which would place an operator kilometres from where it is and quietly improve
      // the response-capacity number for everyone near that centre.
      if (!/^\d{6}$/.test(postalCode)) {
        continue;
      }
      operators.push(
        new VectorControlOperator(
          field(idx.company),
          field(idx.block),
          field(idx.street),
          postalCode,
          field(idx.phone),
        ),
      );
    }
    return operators;
  }

  /**
   * A CSV reader that handles quoted fields, because company names in this file contain commas
   * ("PEST-PRO MANAGEMENT PTE. LTD., SINGAPORE") and a `split(',')` would shear them into two
   * columns, shifting every later field — including the postal code — one place left. The failure
   * would not look like a parsing bug; it would look like 290 rows with invalid postal codes.
   */
  private static parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (ch !== '\r') {
        field += ch;
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
}
