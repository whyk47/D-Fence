/**
 * D-Fence — ingestion coordination and source health.
 * Stereotype: <<control>>. Traces: 1.1.18, 1.4.1, 1.4.2, 2.3.4, 10.2.2, 10.2.3.
 *
 * **Why this class exists at all**, given that `server.ts` already owns a scheduled cycle: 1.1.18
 * gives an Operations Manager a manually triggered run, and a manual run needs three things the
 * scheduler does not — an authorisation check (2.3.4: nobody else may spend the department's quota
 * against a public API), a *result* to hand back to the screen that asked, and a guarantee that it
 * cannot be started twice at once. None of those belong in a route handler, and none of them
 * belong in a `setInterval`.
 *
 * **It does not re-implement the cycle.** `AbstractIngestionJob.run(trigger)` is the same path for
 * both triggers — that is the whole point of the template — and what follows ingestion (scoring,
 * exposure re-evaluation, alerts) is handed in as `RescoreAfterIngestion`. A manual run that
 * ingested without rescoring would leave the manager looking at a refreshed source health panel
 * beside a stale priority table, which is worse than not offering the button.
 *
 * The `DomainEventPublisher` the design sketched for this seam is still a skeleton, and wiring a
 * fan-out that nothing subscribes to would be decoration; the callback is named for what it is.
 */
import { SourceKind } from '../entity/enums';
import { IngestionRun } from '../entity/IngestionRun';
import { AbstractIngestionJob } from './ingestion/AbstractIngestionJob';
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';
import { SourceHealthController, SourceHealthRow } from './SourceHealthController';

/**
 * What must happen after a manual ingestion so the screens agree with each other: scoring, saved
 * location re-evaluation, alert evaluation. Injected rather than imported, because `server.ts`
 * already owns that sequence for the scheduled cycle and two copies of it would diverge.
 */
export interface RescoreAfterIngestion {
  /** @param rainfallFailed marks the rainfall drivers stale for this pass (4.1.x, 10.2.2). */
  rescore(rainfallFailed: boolean): Promise<void>;
}

/** What the Data Sources screen gets back from a manual run. */
export interface ManualRunResult {
  runs: { source: SourceKind; outcome: string; featureCount: number }[];
  /** The panel as it stands *after* the run, so the screen needs no second request. */
  sources: SourceHealthRow[];
}

/** 1.1.18 refused because one is already running. Not an error condition — a state. */
export class IngestionAlreadyRunning extends Error {
  constructor() {
    super('an ingestion run is already in progress');
    this.name = 'IngestionAlreadyRunning';
  }
}

export class IngestionController {
  /**
   * A manual run holds no lock in the database, so this guard is per-process and honest about it:
   * it stops the double-click and the impatient second click, which is what 1.1.18 is exposed to.
   * It does not stop two server processes, and a scheduled cycle firing mid-manual-run is not
   * blocked either — `AbstractIngestionJob` records both runs, and 1.1.21 wants that visible.
   */
  private running = false;

  constructor(
    private readonly ac: AccessControlService,
    private readonly jobs: Map<SourceKind, AbstractIngestionJob>,
    private readonly health: SourceHealthController,
    private readonly rescoring: RescoreAfterIngestion,
  ) {}

  /**
   * 1.1.18 — run every ingesting source now, then rescore.
   *
   * @param source one source, or undefined for all of them. A manager watching one feed recover
   *   should not have to spend the other two sources' quota to check it.
   * @throws NotAuthorised when the caller is not an Operations Manager (2.3.4, 2.3.7)
   * @throws IngestionAlreadyRunning
   */
  async runManual(by: Principal, source?: SourceKind): Promise<ManualRunResult> {
    await this.ac.authorise(by, 'ingestion:trigger', { kind: 'ingestion' });
    if (this.running) {
      throw new IngestionAlreadyRunning();
    }
    this.running = true;
    try {
      const selected = source === undefined ? [...this.jobs.keys()] : [source];
      const runs: ManualRunResult['runs'] = [];
      let rainfallFailed = false;
      for (const kind of selected) {
        const job = this.jobs.get(kind);
        if (job === undefined) {
          // A source with no job is not a failure to report as one — the geocoder has no
          // ingestion job by design (3.1.16), and asking for it should say so plainly.
          continue;
        }
        const run = await job.run('MANUAL');
        runs.push({ source: kind, outcome: run.outcome, featureCount: run.featureCount });
        if (kind === SourceKind.Rainfall && run.outcome === 'FAILED') {
          rainfallFailed = true;
        }
      }
      // Outside the loop: rescoring once after all the sources is what the scheduled cycle does,
      // and scoring between two sources would score against a half-updated picture.
      await this.rescoring.rescore(rainfallFailed);
      return { runs, sources: await this.health.report() };
    } finally {
      // `finally`, not after the return: a job that throws past its own catch must not leave the
      // trigger permanently jammed for the rest of the process's life.
      this.running = false;
    }
  }

  /** 1.4.1, 1.4.2 — what the Data Sources screen displays. */
  reportSourceHealth(now = new Date()): Promise<SourceHealthRow[]> {
    return this.health.report(now);
  }

  /**
   * 10.2.3 — the scheduled cycle is primed at start-up by `server.ts`, which owns the timers.
   * Kept as the named seam the design calls for so the requirement has one place to point at.
   */
  async resumeAfterRestart(): Promise<IngestionRun[]> {
    const runs: IngestionRun[] = [];
    for (const job of this.jobs.values()) {
      runs.push(await job.run('SCHEDULED'));
    }
    return runs;
  }
}
