/**
 * D-Fence — ForecastIngestionJob.
 * Stereotype: <<control>>. Traces: 1.3.1–1.3.5, 4.1.4, 6.1.5, 10.2.4.
 *
 * The third Template Method subclass, and the one that does more in `persist` than store what it
 * parsed: five regional forecasts are not useful to anything until they have been *joined* to the
 * clusters, which is where 1.3.2's centroid mapping and 1.3.5's recorded region happen.
 *
 * Until this job existed, `Cluster.heavyRainExpected` was never written by anything — so 4.1.4's
 * driver read false for every cluster and the heavy-rain alert of 6.1.5 could not fire at all. That
 * is the specific hole this closes, and it is why the job counts *clusters flagged*, not forecasts
 * stored, as its feature count: storing five rows nobody joined would look like success.
 */
import { SourceKind } from '../../entity/enums';
import { AbstractIngestionJob } from './AbstractIngestionJob';
import { ParsedBatch, RawPayload } from '../../ports/types';
import { ClusterStore, ForecastStore, IngestionRunStore } from '../../ports/Stores';
import { ForecastSource } from '../../ports/ExternalGateway';
import { RegionForecast } from '../../entity/RegionForecast';
import { ForecastFeedParser, RawForecastPayload } from './ForecastFeedParser';
import { ForecastRegionMap } from './ForecastRegionMap';

export class ForecastIngestionJob extends AbstractIngestionJob {
  constructor(
    private readonly source: ForecastSource,
    runs: IngestionRunStore,
    private readonly forecasts: ForecastStore,
    private readonly clusters: ClusterStore,
  ) {
    super(source, runs);
  }

  /** Clusters whose centroid fell outside every region box and took the nearest-region fallback.
   *  Reported rather than silent: a growing number here means the boxes need revisiting. */
  readonly outsideEveryRegion: string[] = [];

  protected sourceKind(): SourceKind {
    return SourceKind.Forecast;
  }

  protected fetch(): Promise<RawPayload> {
    return this.source.fetch24hForecast();
  }

  protected async parse(raw: RawPayload): Promise<ParsedBatch> {
    const records = ForecastFeedParser.parse(raw.body as RawForecastPayload, raw.retrievedAt);
    return { retrievedAt: raw.retrievedAt, records };
  }

  /**
   * Store the forecasts, then derive onto every active cluster (1.3.2–1.3.5).
   *
   * A region the payload omitted leaves the clusters in it **untouched** rather than clearing their
   * flag: the previous forecast is still the best available answer and 10.2.2 says stale data keeps
   * serving. Silently setting `heavyRainExpected = false` would turn a partial payload into a
   * confident all-clear, which is the direction of failure that matters for a warning.
   *
   * @returns the number of clusters whose derivation was written — see the class note on why.
   */
  protected async persist(batch: ParsedBatch): Promise<number> {
    const records = batch.records as RegionForecast[];
    await this.forecasts.saveAll(records);

    const byRegion = new Map(records.map((f) => [f.region, f]));
    this.outsideEveryRegion.length = 0;
    let flagged = 0;
    for (const cluster of await this.clusters.findActive()) {
      const centroid = cluster.boundary.centroid();
      if (ForecastRegionMap.containing(centroid) === null) {
        this.outsideEveryRegion.push(cluster.objectId);
      }
      const region = ForecastRegionMap.assign(centroid);
      const forecast = byRegion.get(region);
      if (forecast === undefined) {
        continue;
      }
      await this.clusters.saveForecastDerivation(cluster.id, {
        region,
        heavyRainExpected: forecast.heavyRainExpected,
        validFrom: forecast.validFrom,
        validTo: forecast.validTo,
      });
      flagged += 1;
    }
    return flagged;
  }
}
