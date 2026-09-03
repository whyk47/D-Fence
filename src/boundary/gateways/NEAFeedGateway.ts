/**
 * D-Fence — NEAFeedGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.1.1, 1.1.11, 1.1.19, 1.1.20, 1.1.21, 10.2.1.
 *
 * **Feed characterised 2026-09-03** (previously an open item carried from Lab 2):
 * - dataset `d_dbfabf16158d1b0e1c420627c0819168`, GeoJSON, ~25 KB, 12 active clusters
 * - the metadata resource carries `lastUpdatedAt`, which moves **daily** at about 10:06 SGT
 * - only two distinct `FMEL_UPD_D` values across all twelve features, so cluster *attributes* are
 *   revised roughly twice a week — the daily republication usually carries identical data
 *
 * The hourly cycle in 1.1.1 is kept and made cheap: `fetchLastUpdatedAt()` polls the sub-2 KB
 * metadata resource, and `fetchClusters()` runs only when that value has moved (1.1.20). The
 * download is two hops — poll-download returns a short-lived signed S3 URL, not the payload — and
 * both hops go through HttpClient so 10.4.6 and the 1.1.11 retry rule live in one place.
 */
import { ClusterSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';

interface DatasetMetadata {
  code?: number;
  data?: { lastUpdatedAt?: string; name?: string };
}

interface PollDownload {
  code?: number;
  data?: { url?: string };
}

export class NEAFeedGateway implements ClusterSource {
  /**
   * @param metadataBaseUrl `api-production.data.gov.sg` — the metadata resource lives here only.
   * @param downloadBaseUrl `api-open.data.gov.sg` — poll-download lives here only. Two hosts, and
   *   getting them the wrong way round returns a 403 that reads like an auth problem.
   */
  constructor(
    private readonly http: HttpClient,
    private readonly metadataBaseUrl = 'https://api-production.data.gov.sg',
    private readonly downloadBaseUrl = 'https://api-open.data.gov.sg',
    private readonly datasetId: string = NEAFeedGateway.DENGUE_CLUSTERS_DATASET_ID,
  ) {}

  /** Verified live 2026-09-03. Also recorded in config/scoring.default.json. */
  static readonly DENGUE_CLUSTERS_DATASET_ID = 'd_dbfabf16158d1b0e1c420627c0819168';

  sourceKind(): SourceKind {
    return SourceKind.Clusters;
  }

  /** Health is the metadata resource answering, not the payload downloading: cheap and sufficient. */
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
   * 1.1.19 — the publisher's own revision stamp, which 1.1.20 uses to decide whether to download.
   * @returns the `data.lastUpdatedAt` value, or null when the field is absent. Null is not an
   *   error: 1.1.20 reads it as "download anyway", which is the safe direction.
   */
  async fetchLastUpdatedAt(): Promise<string | null> {
    const meta = await this.http.getJson<DatasetMetadata>(this.metadataUrl(), { attempts: 3 });
    return meta.data?.lastUpdatedAt ?? null;
  }

  /**
   * The GeoJSON payload, in two hops. Called only when 1.1.20 says the file has changed.
   * The signed URL expires, so it is requested immediately before use and never cached.
   */
  async fetchClusters(): Promise<RawPayload> {
    const poll = await this.http.getJson<PollDownload>(this.pollDownloadUrl(), { attempts: 3 });
    const signedUrl = poll.data?.url;
    if (!signedUrl) {
      throw new Error('poll-download returned no url; the dataset id may be wrong');
    }
    const body = await this.http.getJson<unknown>(signedUrl, { attempts: 3, timeoutMs: 30_000 });
    return { retrievedAt: new Date(), body };
  }
}
