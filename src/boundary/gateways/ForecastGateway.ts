/**
 * D-Fence — ForecastGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.3.x
 */
import { ForecastSource } from './ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';
import { RawPayload } from './types';

export class ForecastGateway implements ForecastSource {
  constructor(private readonly http: HttpClient, private readonly baseUrl: string) {}

  sourceKind(): SourceKind {
    return SourceKind.Forecast;
  }

  isHealthy(): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** Five macro-regions. */
  fetch24hForecast(): Promise<RawPayload> {
    // TODO
    throw new Error('not implemented');
  }

}
