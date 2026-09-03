/**
 * D-Fence — ingestion job (Template Method).
 * Stereotype: <<control>>. Traces: 1.1.x, 1.2.x, 1.3.x, 1.4.x, 10.2.1–10.2.4.
 *
 * `run()` is fixed and the three sources differ only in fetch/parse/persist. That is what makes
 * 10.2.2 (serve stale data, marked), 10.2.3 (resume after restart) and 10.2.4 (lose nothing on an
 * external failure) true once rather than three times, each slightly differently.
 *
 * The one addition the NEA feed forced is `shouldRun()`: a source may decide, before fetching, that
 * nothing has changed (1.1.20). The run is still recorded — outcome UNCHANGED (1.1.21) — because a
 * skipped download is evidence the source is alive, and 1.4.x must not mark a healthy source stale
 * merely because the publisher published nothing.
 */
import { SourceKind } from '../../entity/enums';
import { IngestionRun } from '../../entity/IngestionRun';
import { IngestionRunStore } from '../../ports/Stores';
import { ExternalGateway } from '../../ports/ExternalGateway';
import { ParsedBatch, RawPayload } from '../../ports/types';

export const RunOutcome = {
  Success: 'SUCCESS',
  Unchanged: 'UNCHANGED',
  Failed: 'FAILED',
} as const;

export abstract class AbstractIngestionJob {
  constructor(
    protected readonly gateway: ExternalGateway,
    protected readonly runs: IngestionRunStore,
  ) {}

  /**
   * The template. Do not override.
   * record start → decide whether to fetch → fetch → parse → persist → record outcome; on failure,
   * mark the source stale and record the failure **without touching stored data** (10.2.4).
   *
   * @param trigger 'SCHEDULED' or 'MANUAL' — 1.1.18's manual run is the same path, recorded
   *   differently, so a demo trigger cannot diverge from what the scheduler does.
   */
  async run(trigger: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<IngestionRun> {
    const run = await this.runs.recordStart(this.sourceKind(), trigger);
    try {
      if (!(await this.shouldRun())) {
        return await this.runs.recordOutcome(run, RunOutcome.Unchanged, 0);
      }
      const raw = await this.fetch();
      const batch = await this.parse(raw);
      const written = await this.persist(batch);
      await this.afterPersist(raw, batch);
      return await this.runs.recordOutcome(run, RunOutcome.Success, written);
    } catch (error) {
      // Order matters: mark stale first, so a crash between the two lines leaves the source
      // marked rather than silently presenting stale data as fresh (10.2.2).
      await this.markStale();
      await this.onFailure(error instanceof Error ? error : new Error(String(error)));
      await this.runs.recordOutcome(run, RunOutcome.Failed, 0);
      return run;
    }
  }

  protected abstract sourceKind(): SourceKind;
  protected abstract fetch(): Promise<RawPayload>;
  protected abstract parse(raw: RawPayload): Promise<ParsedBatch>;
  /** @returns the number of records written, for the IngestionRun feature count (1.1.14). */
  protected abstract persist(batch: ParsedBatch): Promise<number>;

  /** 1.1.20 — a source may skip the fetch. Defaults to always fetching. */
  protected shouldRun(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /** Hook for what must happen only after a successful write, e.g. recording a publisher stamp. */
  protected afterPersist(_raw: RawPayload, _batch: ParsedBatch): Promise<void> {
    return Promise.resolve();
  }

  protected onFailure(_error: Error): Promise<void> {
    return Promise.resolve();
  }

  /** 10.2.2: the last good data stays available, marked stale, rather than disappearing. */
  protected markStale(): Promise<void> {
    return this.runs.markStale(this.sourceKind());
  }
}
