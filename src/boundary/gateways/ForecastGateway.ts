/**
 * D-Fence — ForecastGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.3.1, 10.2.1, 10.4.6.
 *
 * **Verified live 2026-09-03** against `GET /v2/real-time/api/twenty-four-hr-forecast`: one record,
 * three periods, five macro-regions per period, `code: 0` on success. The endpoint is open — no
 * key, no token — which is why it is the one ingestion source that could be finished without
 * anything arriving from outside the project.
 *
 * The shape lives in `ForecastFeedParser`; this class does nothing but fetch, so that a change to
 * the payload is a change to the parser and its tests rather than to the network code.
 */
import { ForecastSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';
import { RawForecastPayload } from '../../control/ingestion/ForecastFeedParser';

export class ForecastGateway implements ForecastSource {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl = 'https://api-open.data.gov.sg',
  ) {}

  sourceKind(): SourceKind {
    return SourceKind.Forecast;
  }

  /**
   * 1.4.x — healthy means "returns a forecast", not "returns 200". A 200 carrying `code: 1` and an
   * `errorMsg` is exactly the failure a status-code check would report as fine.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const body = (await this.fetch24hForecast()).body as RawForecastPayload;
      return (body.data?.records?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /** Five macro-regions across three periods. 1.3.1. */
  async fetch24hForecast(): Promise<RawPayload> {
    const body = await this.http.getJson<RawForecastPayload>(
      `${this.baseUrl}/v2/real-time/api/twenty-four-hr-forecast`,
      // 1.1.11's three attempts: the same allowance the other feeds get, for the same reason.
      { attempts: 3 },
    );
    return { retrievedAt: new Date(), body };
  }
}
