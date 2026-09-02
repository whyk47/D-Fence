/**
 * D-Fence — RainfallIngestionJob.
 * Stereotype: <<control>>. Traces: 1.2.x
 */
import { SourceKind, ChangeClass } from '../../entity/enums';
import { ClusterSnapshot } from '../../entity/ClusterSnapshot';
import { AbstractIngestionJob } from './AbstractIngestionJob';
import { ParsedBatch, RawPayload } from '../../boundary/gateways/types';

export class RainfallIngestionJob extends AbstractIngestionJob {
  protected sourceKind(): SourceKind {
    return SourceKind.Rainfall;
  }

  protected fetch(): Promise<RawPayload> {
    throw new Error('not implemented');
  }

  protected parse(_raw: RawPayload): Promise<ParsedBatch> {
    throw new Error('not implemented');
  }

  protected persist(_batch: ParsedBatch): Promise<number> {
    throw new Error('not implemented');
  }
}
