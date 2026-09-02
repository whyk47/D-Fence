/**
 * D-Fence — NEAFeedGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.1.x
 */
import { ClusterSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';
import { RawPayload } from '../../ports/types';

export class NEAFeedGateway implements ClusterSource {
  constructor(private readonly http: HttpClient, private readonly baseUrl: string) {}

  sourceKind(): SourceKind {
    return SourceKind.Clusters;
  }

  isHealthy(): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** NEA dengue cluster GeoJSON. UPDATE FREQUENCY STILL UNVERIFIED — open item carried from Lab 2. */
  fetchClusters(): Promise<RawPayload> {
    // TODO
    throw new Error('not implemented');
  }

}
