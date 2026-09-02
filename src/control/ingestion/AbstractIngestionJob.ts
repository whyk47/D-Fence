/**
 * D-Fence — ingestion job (Template Method).
 * Stereotype: <<control>>. Traces: 1.1.x, 1.2.x, 1.3.x, 1.4.x, 10.2.1-10.2.4.
 *
 * run() is fixed and the three sources differ only in fetch/parse/persist. That is what makes
 * 10.2.2 (serve stale data, marked), 10.2.3 (resume after restart) and 10.2.4 (lose nothing on
 * an external failure) true once rather than three times, each slightly differently.
 */
import { SourceKind } from '../../entity/enums';
import { IngestionRun } from '../../entity/IngestionRun';
import { IngestionRunRepository } from '../../persistence/IngestionRunRepository';
import { ExternalGateway } from '../../ports/ExternalGateway';
import { ParsedBatch, RawPayload } from '../../ports/types';

export abstract class AbstractIngestionJob {
  constructor(
    protected readonly gateway: ExternalGateway,
    protected readonly runs: IngestionRunRepository,
  ) {}

  /**
   * The template. Do not override.
   * record start → fetch → parse → persist → record outcome; on failure, mark the source stale
   * and record the failure, without touching stored data.
   */
  async run(): Promise<IngestionRun> {
    // TODO(F1): implement the fixed sequence exactly once, here.
    throw new Error('not implemented');
  }

  protected abstract sourceKind(): SourceKind;
  protected abstract fetch(): Promise<RawPayload>;
  protected abstract parse(raw: RawPayload): Promise<ParsedBatch>;
  /** @returns the number of records written, for the IngestionRun feature count. */
  protected abstract persist(batch: ParsedBatch): Promise<number>;

  protected onFailure(_error: Error): Promise<void> {
    throw new Error('not implemented');
  }

  /** 10.2.2: the last good data stays available, marked stale, rather than disappearing. */
  protected markStale(): Promise<void> {
    throw new Error('not implemented');
  }
}
