/**
 * D-Fence — ObservationRecord (entity).
 * Stereotype: <<entity>>. Traces: 1.5.3, 1.5.9, 1.5.11, 4.1.24.
 * Data dictionary: `lab3/DATA-DICTIONARY-DELTA.md` §3.
 *
 * One admitted iNaturalist observation, bound to a locality.
 *
 * **A sighting is not a complaint.** A naturalist photographing a snake in a nature reserve is
 * close to the opposite of a nuisance report, and the two would be indistinguishable once this
 * became a number. That is why the driver it feeds is capped at 0.20, and why every surface that
 * shows it calls it *recent wildlife activity* rather than pest pressure — see 11.2.26.
 *
 * `observationId` is the supplier's id and is the store key, which is what makes 1.5.11 true: an
 * ingestion run that overlaps the previous one re-presents records it has already given us, and
 * counting those twice would inflate the driver by exactly the overlap.
 */
import { GeoPoint } from './valueTypes';
import { PestType } from './enums';

export class ObservationRecord {
  constructor(
    /** The supplier's own id. Unique per record and stable across runs — 1.5.11 depends on it. */
    readonly observationId: string,
    readonly pestType: PestType,
    readonly taxonName: string,
    readonly observedOn: Date,
    readonly location: GeoPoint,
    /** Metres, as reported. Null means the supplier gave none, which 1.5.7 admits: an absent
     *  accuracy is not a bad one, and rejecting it would discard most of the older records. */
    readonly positionalAccuracyM: number | null,
    readonly qualityGrade: string,
    /** 1.5.9. Null until bound; 1.5.10 discards a record that binds to nothing. */
    readonly localityId: string | null = null,
  ) {}

  boundTo(localityId: string): ObservationRecord {
    return new ObservationRecord(
      this.observationId,
      this.pestType,
      this.taxonName,
      this.observedOn,
      this.location,
      this.positionalAccuracyM,
      this.qualityGrade,
      localityId,
    );
  }
}
