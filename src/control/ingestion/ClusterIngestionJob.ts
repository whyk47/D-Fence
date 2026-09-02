       /**
        * D-Fence — ClusterIngestionJob.
        * Stereotype: <<control>>. Traces: 1.1.x
        */
       import { SourceKind, ChangeClass } from '../../entity/enums';
       import { ClusterSnapshot } from '../../entity/ClusterSnapshot';
       import { AbstractIngestionJob } from './AbstractIngestionJob';
       import { ParsedBatch, RawPayload } from '../../boundary/gateways/types';

       export class ClusterIngestionJob extends AbstractIngestionJob {
         protected sourceKind(): SourceKind {
           return SourceKind.Clusters;
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

     /**
      * NEW / GROWN / UNCHANGED / SHRUNK / CLOSED, by comparing the incoming snapshot with the last
      * stored one. The feed publishes current values only, so this comparison is the only place
      * change is knowable — 1.1.8, 9.1.9 and 9.1.10 all depend on it.
      */
     private detectChange(_previous: ClusterSnapshot, _current: ClusterSnapshot): ChangeClass {
       throw new Error('not implemented');
     }
}
