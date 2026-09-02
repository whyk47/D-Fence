/**
 * D-Fence — OneMapGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 3.1.x, 8.1.x
 */
import { GeocodingSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';
import { RawPayload } from '../../ports/types';

export class OneMapGateway implements GeocodingSource {
  constructor(private readonly http: HttpClient, private readonly baseUrl: string) {}

  sourceKind(): SourceKind {
    return SourceKind.Geocoding;
  }

  isHealthy(): Promise<boolean> {
    throw new Error('not implemented');
  }


private token: string | null = null;
private tokenExpiry: Date | null = null;

/** OneMap tokens last three days; 48 h refresh leaves margin. */
requestToken(): Promise<void> {
  throw new Error('not implemented');
}

private ensureToken(): Promise<void> {
  throw new Error('not implemented');
}

  /** NOT TEST-PULLED YET — open item from Lab 2. */
  search(address: string): Promise<GeoPoint[]> {
    // TODO
    throw new Error('not implemented');
  }

}
