/**
 * D-Fence — RainfallIngestionJob.
 * Stereotype: <<control>>. Traces: 1.2.1–1.2.4, 1.2.10, 10.2.2.
 *
 * The same Template Method as the cluster job, which is the point of having one: retry, staleness
 * marking and run recording are inherited, and only fetch/parse/persist differ.
 *
 * Unlike the cluster feed there is no conditional download — this source genuinely changes every
 * five minutes, and it is the source that carries the "live data" criterion.
 */
import { SourceKind } from '../../entity/enums';
import { AbstractIngestionJob } from './AbstractIngestionJob';
import { ParsedBatch, RawPayload } from '../../ports/types';
import { IngestionRunStore, RainfallStore } from '../../ports/Stores';
import { RainfallSource } from '../../ports/ExternalGateway';
import { RainfallFeedParser, RawRainfallPayload, ParsedReading } from './RainfallFeedParser';

export class RainfallIngestionJob extends AbstractIngestionJob {
  constructor(
    private readonly source: RainfallSource,
    runs: IngestionRunStore,
    private readonly rainfall: RainfallStore,
    /** 1.2.4's window. A backfill overrides it, because those readings are old on purpose. */
    private readonly maxAgeMinutes = 30,
  ) {
    super(source, runs);
  }

  /** Readings discarded by 1.2.4 in the last cycle — reported, not silently dropped. */
  discarded = 0;

  protected sourceKind(): SourceKind {
    return SourceKind.Rainfall;
  }

  protected fetch(): Promise<RawPayload> {
    return this.source.fetchReadings(new Date(Date.now() - this.maxAgeMinutes * 60_000));
  }

  protected async parse(raw: RawPayload): Promise<ParsedBatch> {
    const payload = raw.body as RawRainfallPayload;
    const stations = RainfallFeedParser.parseStations(payload);
    const all = RainfallFeedParser.parseReadings(payload);
    const fresh = RainfallFeedParser.freshOnly(all, raw.retrievedAt, this.maxAgeMinutes);
    this.discarded = all.length - fresh.length;
    await this.rainfall.saveStations(stations);
    return { retrievedAt: raw.retrievedAt, records: fresh };
  }

  protected async persist(batch: ParsedBatch): Promise<number> {
    return this.rainfall.saveReadings(batch.records as ParsedReading[]);
  }

  /**
   * Cold-start backfill. The 72-hour accumulation cannot be built from a five-minute snapshot, and
   * on the first run of a demo day there is no stored history to build it from either.
   *
   * Deliberately **not** part of `run()`: it is dozens of requests, it is not something an hourly
   * scheduler should ever do, and folding it into the template would make the ordinary cycle
   * unpredictably slow.
   */
  async backfill(pages: RawPayload[]): Promise<number> {
    let written = 0;
    for (const page of pages) {
      const payload = page.body as RawRainfallPayload;
      await this.rainfall.saveStations(RainfallFeedParser.parseStations(payload));
      written += await this.rainfall.saveReadings(RainfallFeedParser.parseReadings(payload));
    }
    return written;
  }
}
