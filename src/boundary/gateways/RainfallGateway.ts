/**
 * D-Fence — RainfallGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 1.2.1, 1.2.2, 1.2.3, 10.2.1, 10.4.6.
 *
 * **Verified live 2026-09-03** against `GET /v2/real-time/api/rainfall`:
 * 87 stations (the 97 in `research/API-INVENTORY.md` is out of date — the count is not a constant),
 * `readingType: "TB1 Rainfall 5 Minute Total F"`, `readingUnit: "mm"`, one readings block per
 * five-minute timestamp. Stations and readings arrive in the **same** payload, so `fetchStations`
 * and `fetchReadings` deliberately hit one endpoint rather than pretending there are two.
 *
 * `?date=YYYY-MM-DD` returns a whole day, newest block first, **paged 25 blocks at a time** with a
 * `paginationToken` — a full day is 288 blocks, so a 72-hour backfill is about 35 requests. That is
 * what `fetchWindow` does, and why it goes through HttpClient's per-host spacing.
 */
import { RainfallSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { RawPayload } from '../../ports/types';
import { singaporeDate } from '../../entity/valueTypes';
import { RawRainfallPayload, RainfallFeedParser } from '../../control/ingestion/RainfallFeedParser';

export class RainfallGateway implements RainfallSource {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl = 'https://api-open.data.gov.sg',
  ) {}

  sourceKind(): SourceKind {
    return SourceKind.Rainfall;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const payload = (await this.fetchReadings()).body as RawRainfallPayload;
      return RainfallFeedParser.parseReadings(payload).length > 0;
    } catch {
      return false;
    }
  }

  private url(params: Record<string, string> = {}): string {
    const query = new URLSearchParams(params).toString();
    return `${this.baseUrl}/v2/real-time/api/rainfall${query === '' ? '' : `?${query}`}`;
  }

  /** Stations come back with the readings; this is the same call, named for the port. */
  fetchStations(): Promise<RawPayload> {
    return this.fetchReadings();
  }

  /** The latest five-minute block. `since` is honoured by 1.2.4 at parse time, not by the API. */
  async fetchReadings(_since?: Date): Promise<RawPayload> {
    const body = await this.http.getJson<RawRainfallPayload>(this.url(), { attempts: 3 });
    return { retrievedAt: new Date(), body };
  }

  /**
   * Historical backfill for the 24- and 72-hour accumulations, which cannot be built from a
   * five-minute snapshot on a cold start.
   *
   * @param days how many days back to walk, today included
   * @param maxPagesPerDay a guard rail: 288 blocks a day at 25 a page is ~12 pages, and a runaway
   *   loop against a public API is a good way to be rate-limited out of a demo
   *
   * **data.gov.sg rate-limits this.** Observed 2026-09-03: a 429 after roughly five rapid pages.
   * Each request therefore asks for four attempts, so HttpClient's 429 handling (which honours
   * `Retry-After`) can absorb it, and a backfill should be given a slower HttpClient than the one
   * the five-minute cycle uses. It is a cold-start operation, not something to do often.
   */
  async fetchWindow(days: number, maxPagesPerDay = 15): Promise<RawPayload[]> {
    const pages: RawPayload[] = [];
    for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
      const date = new Date(Date.now() - dayOffset * 86_400_000);
      const iso = RainfallGateway.singaporeDate(date);
      let token: string | null = null;
      for (let page = 0; page < maxPagesPerDay; page += 1) {
        const params: Record<string, string> = { date: iso };
        if (token !== null) {
          params.paginationToken = token;
        }
        const body: RawRainfallPayload = await this.http.getJson<RawRainfallPayload>(this.url(params), {
          attempts: 4,
          timeoutMs: 30_000,
        });
        pages.push({ retrievedAt: new Date(), body });
        token = RainfallFeedParser.paginationToken(body);
        if (token === null) {
          break;
        }
      }
    }
    return pages;
  }

  /** The API's `date` is a Singapore calendar date; deriving it from a UTC clock is off by a day
   *  for eight hours out of every twenty-four. */
  static singaporeDate(instant: Date): string {
    return singaporeDate(instant);
  }
}
