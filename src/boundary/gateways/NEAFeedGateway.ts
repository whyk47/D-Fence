/**
 * D-Fence — NEAFeedGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.1.1, 1.1.19, 1.1.20, 1.1.21.
 *
 * **Feed characterised 2026-09-03** (previously an open item carried from Lab 2):
 * - dataset `d_dbfabf16158d1b0e1c420627c0819168`, GeoJSON, ~25 KB, 12 active clusters
 * - metadata resource carries `lastUpdatedAt`; on 2026-09-03 it read 2026-09-02T10:06:42+08:00
 * - only two distinct `FMEL_UPD_D` values across all twelve features (25 Aug, 28 Aug), so the
 *   publisher revises cluster attributes roughly twice a week — **not hourly**
 *
 * The hourly cycle in 1.1.1 is kept and made cheap instead: `fetchLastUpdatedAt()` polls the sub-2 KB
 * metadata resource, and `fetchClusters()` is called only when that value has moved (1.1.20). The
 * download itself is two hops — poll-download returns a short-lived signed S3 URL, not the payload.
 */
import { ClusterSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';

export class NEAFeedGateway implements ClusterSource {
  /**
   * @param baseUrl the data.gov.sg host; dataset id is configuration (10.6.2), not a constant here,
   *   so a marker or a teammate can point the build at a fixture without editing code.
   */
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string,
    private readonly datasetId: string = NEAFeedGateway.DENGUE_CLUSTERS_DATASET_ID,
  ) {}

  /** Verified live on 2026-09-03. Recorded here and in config/scoring.default.json. */
  static readonly DENGUE_CLUSTERS_DATASET_ID = 'd_dbfabf16158d1b0e1c420627c0819168';

  sourceKind(): SourceKind {
    return SourceKind.Clusters;
  }

  isHealthy(): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** The metadata resource, which is what 1.1.19 retrieves before every scheduled cycle. */
  metadataUrl(): string {
    return `${this.baseUrl}/v2/public/api/datasets/${this.datasetId}/metadata`;
  }

  /** poll-download returns a signed, expiring URL to the GeoJSON — never the payload itself. */
  pollDownloadUrl(): string {
    return `${this.baseUrl}/v1/public/api/datasets/${this.datasetId}/poll-download`;
  }

  /**
   * 1.1.19 — the publisher's own revision stamp, used by 1.1.20 to decide whether to download.
   * @returns the `data.lastUpdatedAt` value, or null when the field is absent, which 1.1.20 treats
   *   as "download anyway" rather than as "unchanged".
   */
  fetchLastUpdatedAt(): Promise<string | null> {
    // TODO(F1): GET metadataUrl(), read data.lastUpdatedAt.
    throw new Error('not implemented');
  }

  /** The GeoJSON payload. Called only when 1.1.20 says the file has changed. */
  fetchClusters(): Promise<RawPayload> {
    // TODO(F1): GET pollDownloadUrl() -> data.url, then GET that signed URL.
    throw new Error('not implemented');
  }
}
