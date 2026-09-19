/**
 * D-Fence — GravitrapGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.1.19, 1.1.20, 1.1.21, 10.2.1, 10.4.6.
 *
 * NEA's `d_5d060d8b7838a15e8906fb22c50dbf51`, "Areas with High Aedes Population (GEOJSON)" —
 * polygons of the areas where Gravitraps caught relatively more *Aedes aegypti*.
 *
 * **Feed characterised 2026-09-19**, by fetching it: GeoJSON, ~420 KB, 135 features, `lastUpdatedAt`
 * 2026-08-29, `coverageStart` 2025-10-23, eight feature properties of which three carry anything
 * (OBJECTID, NAME, DESCRIPTION).
 *
 * Two things about the fields are worth knowing before reading them:
 *
 *   - **NAME is not a name.** Every one of the 135 features carries the identical string "High
 *     Aedes Mosquitoes Population Area. Let's fight Dengue together. Do the Mozzie Wipe-out today".
 *     It is a public-health slogan in a label field. The identifier a person would recognise —
 *     "CO77 - Belimbing Ave / Butterfly Ave / Cedar Ave / ..." — is in DESCRIPTION. Both are stored
 *     as given; any screen that shows one of them should show DESCRIPTION.
 *   - The dataset's prose description still reads "from April to June 2019" while the file is
 *     republished on a different schedule. The two disagree, and this gateway believes
 *     `lastUpdatedAt` rather than the prose, because that is the field that moves.
 *
 * Same two hops and the same 1.1.20 discipline as `NEAFeedGateway`: poll the small metadata
 * resource, download only when the publisher's stamp has moved. At 420 KB against a cluster feed's
 * 25 KB that discipline matters more here, not less — this is a file that changes rarely and is
 * seventeen times the size of the one that changes daily.
 */
import { ExternalGateway } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';

interface DatasetMetadata {
  data?: { lastUpdatedAt?: string; name?: string };
}

interface PollDownload {
  data?: { url?: string };
}

export interface HighAedesAreaSource extends ExternalGateway {
  fetchLastUpdatedAt(): Promise<string | null>;
  fetchAreas(): Promise<RawPayload>;
}

export class GravitrapGateway implements HighAedesAreaSource {
  /** Verified live 2026-09-19. Recorded in PEST-PRIORITY-MODEL.md §8 step 9. */
  static readonly HIGH_AEDES_DATASET_ID = 'd_5d060d8b7838a15e8906fb22c50dbf51';

  /**
   * @param metadataBaseUrl `api-production.data.gov.sg` — the metadata resource lives here only.
   * @param downloadBaseUrl `api-open.data.gov.sg` — poll-download lives here only. Two hosts, and
   *   getting them the wrong way round returns a 403 that reads like an auth problem.
   */
  constructor(
    private readonly http: HttpClient,
    private readonly metadataBaseUrl = 'https://api-production.data.gov.sg',
    private readonly downloadBaseUrl = 'https://api-open.data.gov.sg',
    private readonly datasetId: string = GravitrapGateway.HIGH_AEDES_DATASET_ID,
  ) {}

  sourceKind(): SourceKind {
    return SourceKind.Gravitrap;
  }

  /** Health is the metadata resource answering, not the 420 KB payload downloading. */
  async isHealthy(): Promise<boolean> {
    try {
      return (await this.fetchLastUpdatedAt()) !== null;
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

  /**
   * @returns the publisher's revision stamp, or null when the field is absent. Null means
   *   "download anyway", which is the safe direction: a missed republication is worse than a
   *   redundant download of a file that changes a few times a year.
   */
  async fetchLastUpdatedAt(): Promise<string | null> {
    const meta = await this.http.getJson<DatasetMetadata>(this.metadataUrl(), { attempts: 3 });
    return meta.data?.lastUpdatedAt ?? null;
  }

  /** The GeoJSON payload. The signed URL expires, so it is requested immediately before use. */
  async fetchAreas(): Promise<RawPayload> {
    const poll = await this.http.getJson<PollDownload>(this.pollDownloadUrl(), { attempts: 3 });
    const signedUrl = poll.data?.url;
    if (signedUrl === undefined || signedUrl === '') {
      throw new Error('poll-download returned no url; the dataset id may be wrong');
    }
    const body = await this.http.getJson<unknown>(signedUrl, { attempts: 3, timeoutMs: 30_000 });
    return { retrievedAt: new Date(), body };
  }
}
