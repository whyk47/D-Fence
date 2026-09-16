/**
 * D-Fence — ObservationIngestionJob (Template Method).
 * Stereotype: <<control>>. Traces: 1.5.1, 1.5.8–1.5.14, 10.2.2, 10.2.4.
 *
 * One job per pest type, not one job for all of them. 1.5.2 makes the supplier call taxon-by-taxon
 * anyway, and 1.5.14 wants the pest type recorded on the run — a combined job would have to write a
 * run record naming six pests, from which nobody could tell which of them actually returned data.
 *
 * What the template gives for free is the part that matters most here: on failure, `run()` marks
 * the source stale and records the failure **without touching stored data**, which is 1.5.13 (serve
 * the most recently stored observations) satisfied structurally rather than by remembering to.
 */
import { AbstractIngestionJob } from './AbstractIngestionJob';
import {
  INaturalistGateway,
  NO_REJECTIONS,
  RawObservation,
  RawObservationPayload,
  RejectionCounts,
} from '../../boundary/gateways/INaturalistGateway';
import { ObservationSource } from '../../ports/ExternalGateway';
import { ClusterLocator, IngestionRunStore, ObservationStore } from '../../ports/Stores';
import { ObservationRecord } from '../../entity/ObservationRecord';
import { PestProfile } from '../../entity/PestProfile';
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';
import { IngestionRun } from '../../entity/IngestionRun';
import { ParsedBatch, RawPayload } from '../../ports/types';

/** 1.5.12. Five minutes, three times — the requirement's numbers, named once. */
export const RETRY_ATTEMPTS = 3;
export const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export class ObservationIngestionJob extends AbstractIngestionJob {
  /** 1.5.8 — the last run's per-rule rejections, in the shape `RejectionCounts` names. */
  rejections: RejectionCounts = { ...NO_REJECTIONS };
  /** 1.5.10 — accepted by the boundary rules, then discarded for binding to no locality. */
  unbound = 0;
  accepted = 0;

  constructor(
    private readonly source: ObservationSource,
    runs: IngestionRunStore,
    private readonly observations: ObservationStore,
    private readonly locator: ClusterLocator,
    private readonly profile: PestProfile,
    /** Injected so a test does not wait fifteen real minutes to prove 1.5.12. */
    private readonly sleep: (ms: number) => Promise<void> = ObservationIngestionJob.realSleep,
    private readonly now: () => Date = () => new Date(),
  ) {
    super(source, runs);
  }

  protected sourceKind(): SourceKind {
    return SourceKind.Observations;
  }

  /**
   * 1.5.2 — the taxon id comes from the profile and nowhere else.
   *
   * A tier B pest with no taxon id is a configuration error, not a runtime condition to work
   * around: fetching without one would return every observation in Singapore and bind a few
   * thousand unrelated sightings to our localities.
   */
  protected async fetch(): Promise<RawPayload> {
    const taxonId = this.profile.observationTaxonId;
    if (taxonId === null) {
      throw new Error(`${this.profile.pestType} has no observationTaxonId; 1.5.2 cannot be satisfied`);
    }
    return this.withRetries(() => this.source.fetchObservations(taxonId, this.windowStart()));
  }

  /** 1.5.5's window, as the supplier's `d1` parameter wants it. */
  windowStart(): string {
    const since = new Date(this.now().getTime() - 90 * 86_400_000);
    return since.toISOString().slice(0, 10);
  }

  /**
   * 1.5.12 — three retries at five-minute intervals.
   *
   * Distinct from HttpClient's own attempts, and deliberately so: that one covers a dropped
   * connection or a 429, and retries in seconds. This one covers the supplier being *down*, where
   * retrying in seconds three times is the same as not retrying at all.
   */
  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < RETRY_ATTEMPTS) {
          await this.sleep(RETRY_INTERVAL_MS);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * 1.5.3–1.5.8. The four rules are applied by the gateway; this method counts what they rejected
   * and turns what survived into entities.
   */
  protected async parse(raw: RawPayload): Promise<ParsedBatch> {
    this.rejections = { ...NO_REJECTIONS };
    const body = raw.body as RawObservationPayload;
    const records: ObservationRecord[] = [];

    for (const observation of body.results ?? []) {
      const rejection = INaturalistGateway.isAdmissible(observation, raw.retrievedAt);
      if (rejection !== null) {
        this.rejections[rejection] += 1;
        continue;
      }
      records.push(this.toRecord(observation));
    }
    return { retrievedAt: raw.retrievedAt, records };
  }

  private toRecord(raw: RawObservation): ObservationRecord {
    const point = INaturalistGateway.coordinatesOf(raw) as { latitude: number; longitude: number };
    return new ObservationRecord(
      String(raw.id),
      this.profile.pestType,
      raw.taxon?.name ?? 'unknown',
      new Date(`${raw.observed_on}T00:00:00Z`),
      new GeoPoint(point.latitude, point.longitude),
      raw.positional_accuracy ?? null,
      raw.quality_grade ?? 'unknown',
    );
  }

  /** 1.5.9, 1.5.10, 1.5.11. */
  protected async persist(batch: ParsedBatch): Promise<number> {
    const bound: ObservationRecord[] = [];
    this.unbound = 0;

    for (const record of batch.records as ObservationRecord[]) {
      const locality = await this.locator.containing(record.location);
      if (locality === null) {
        // 1.5.10. A sighting in the middle of a reservoir is real and is not evidence about any
        // locality we score, so it is discarded rather than attached to the nearest one. Attaching
        // it to the nearest would be inventing a location for a record whose value is its location.
        this.unbound += 1;
        continue;
      }
      bound.push(record.boundTo(locality.id));
    }

    const written = await this.observations.save(bound);
    this.accepted = bound.length;
    return written;
  }

  /**
   * Overridden only to stamp 1.5.14's three fields onto the run the template produced. The template
   * itself is untouched: every other source would have to carry three nulls through it otherwise.
   */
  override async run(trigger: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED'): Promise<IngestionRun> {
    this.accepted = 0;
    this.unbound = 0;
    const run = await super.run(trigger);
    run.pestType = this.profile.pestType;
    run.acceptedCount = this.accepted;
    run.rejectedCount = this.rejectedTotal();
    return run;
  }

  /** 1.5.8's counts summed, plus 1.5.10's discards — every record that did not reach the store. */
  rejectedTotal(): number {
    const r = this.rejections;
    return r.missingField + r.tooOld + r.obscured + r.imprecise + this.unbound;
  }

  private static realSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
