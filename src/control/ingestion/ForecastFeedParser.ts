/**
 * D-Fence — the 24-hour forecast payload.
 * Stereotype: <<control>>. Traces: 1.3.1, 1.3.3, 1.3.4, 1.1.3, 1.1.4.
 *
 * **Verified live 2026-09-03** against
 * `GET https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast`:
 *
 *     { code, errorMsg, data: { records: [ {
 *         date, updatedTimestamp, timestamp,
 *         general: { validPeriod: { text, start, end }, temperature, relativeHumidity, forecast… },
 *         periods: [ { timePeriod: { text, start, end },
 *                      regions: { west, east, central, south, north }: { code, text } } ]
 *     } ] } }
 *
 * One record, three periods, five macro-regions per period — which is the shape 1.3.2 was rewritten
 * against in REQUIREMENTS v0.3.
 *
 * **Three periods, one flag.** 1.3.3 asks for a heavy-rain-expected flag *per cluster* over the
 * 24-hour horizon, not per six-hour period. The parser therefore folds the periods together with
 * OR: rain in any period in that region is rain expected. Anything else would make the flag depend
 * on what time of day the scheduler happened to run, and 6.1.5's warning is about the next day, not
 * about the next six hours. The validity period (1.3.4) is correspondingly the span from the
 * earliest period start to the latest period end, which is what the flag was actually derived over.
 */
import { randomUUID } from 'node:crypto';
import { ForecastRegion } from '../../entity/enums';
import { RegionForecast } from '../../entity/RegionForecast';

export interface RawForecastRegionEntry {
  code?: string;
  text?: string;
}

export interface RawForecastPeriod {
  timePeriod?: { text?: string; start?: string; end?: string };
  regions?: Partial<Record<ForecastRegion, RawForecastRegionEntry>>;
}

export interface RawForecastRecord {
  date?: string;
  updatedTimestamp?: string;
  timestamp?: string;
  general?: { validPeriod?: { text?: string; start?: string; end?: string } };
  periods?: RawForecastPeriod[];
}

export interface RawForecastPayload {
  code?: number;
  errorMsg?: string;
  data?: { records?: RawForecastRecord[] };
}

export class ForecastFeedParser {
  /**
   * 1.3.3's keyword rule, exactly as written: true when the forecast text contains any of "Heavy",
   * "Thundery Showers" or "Showers".
   *
   * Case-insensitive, because the requirement names the words and not their capitalisation, and the
   * live feed writes "Thundery Showers" in some periods and "Late Morning and Afternoon Thundery
   * Showers" in others. "Showers" already subsumes "Thundery Showers"; both are listed because the
   * requirement lists both, and a reader checking the code against 1.3.3 should find all three.
   */
  static readonly HEAVY_RAIN_KEYWORDS = ['Heavy', 'Thundery Showers', 'Showers'] as const;

  static impliesHeavyRain(forecastText: string): boolean {
    const text = forecastText.toLowerCase();
    return ForecastFeedParser.HEAVY_RAIN_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
  }

  /**
   * The whole payload into one RegionForecast per region (1.3.3, 1.3.4).
   *
   * A region missing from a period is skipped rather than defaulted: an absent forecast is not a
   * dry forecast, and 4.1.12's degraded-score machinery exists precisely so that "we do not know"
   * does not have to be rounded to "no".
   *
   * @throws when the payload carries no record at all — that is a failed cycle (10.2.4), and the
   *   template method's catch will mark the source stale rather than write five empty forecasts
   *   over five good ones.
   */
  static parse(payload: RawForecastPayload, retrievedAt: Date): RegionForecast[] {
    const record = payload.data?.records?.[0];
    if (record === undefined) {
      throw new Error('24-hour forecast payload carried no records (1.3.1)');
    }
    const periods = record.periods ?? [];
    if (periods.length === 0) {
      throw new Error('24-hour forecast record carried no periods (1.3.1)');
    }

    const texts = new Map<ForecastRegion, string[]>();
    let validFrom: Date | null = null;
    let validTo: Date | null = null;

    for (const period of periods) {
      const start = ForecastFeedParser.toDate(period.timePeriod?.start);
      const end = ForecastFeedParser.toDate(period.timePeriod?.end);
      if (start !== null && (validFrom === null || start < validFrom)) {
        validFrom = start;
      }
      if (end !== null && (validTo === null || end > validTo)) {
        validTo = end;
      }
      for (const region of Object.values(ForecastRegion)) {
        const text = period.regions?.[region]?.text;
        if (text === undefined || text.trim() === '') {
          continue;
        }
        texts.set(region, [...(texts.get(region) ?? []), `${period.timePeriod?.text ?? 'period'}: ${text}`]);
      }
    }

    // 1.3.4's fallback: `general.validPeriod` when the periods carry no usable timestamps, and a
    // flat 24 hours from retrieval when neither does. The horizon is named by 1.3.1, so a forecast
    // with no stated validity is still bounded rather than valid forever.
    const generalFrom = ForecastFeedParser.toDate(record.general?.validPeriod?.start);
    const generalTo = ForecastFeedParser.toDate(record.general?.validPeriod?.end);
    const from = validFrom ?? generalFrom ?? retrievedAt;
    const to = validTo ?? generalTo ?? new Date(from.getTime() + 24 * 3_600_000);

    const forecasts: RegionForecast[] = [];
    for (const [region, parts] of texts) {
      const forecast = new RegionForecast();
      forecast.id = randomUUID();
      forecast.region = region;
      forecast.forecastText = parts.join(' | ');
      forecast.heavyRainExpected = ForecastFeedParser.impliesHeavyRain(forecast.forecastText);
      forecast.validFrom = from;
      forecast.validTo = to;
      forecast.retrievedAt = retrievedAt;
      forecasts.push(forecast);
    }
    return forecasts;
  }

  /** An ISO-8601 stamp with the feed's `+08:00` offset, or null when absent or unparseable. */
  private static toDate(raw: string | undefined): Date | null {
    if (raw === undefined || raw.trim() === '') {
      return null;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
