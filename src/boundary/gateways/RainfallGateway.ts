/**
 * D-Fence — RainfallGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.2.x
 */
import { RainfallSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';
import { RawPayload } from '../../ports/types';

export class RainfallGateway implements RainfallSource {
  constructor(private readonly http: HttpClient, private readonly baseUrl: string) {}

  sourceKind(): SourceKind {
    return SourceKind.Rainfall;
  }

  isHealthy(): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** 97 stations, data.gov.sg. */
  fetchStations(): Promise<RawPayload> {
    // TODO
    throw new Error('not implemented');
  }

  /** 5-minute readings. */
  fetchReadings(since: Date): Promise<RawPayload> {
    // TODO
    throw new Error('not implemented');
  }

}
