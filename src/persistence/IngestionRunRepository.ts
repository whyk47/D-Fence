/**
 * D-Fence — IngestionRunRepository.
 * Stereotype: <<persistence>>. Traces: 1.1.14, 1.1.18, 1.1.20, 1.1.21, 1.4.1, 10.2.2, 10.2.3.
 *
 * The table this writes is what makes 10.2.3 true. A restart currently loses every run, so the
 * question "when did the cluster feed last succeed" resets to "never" each time the process
 * bounces — and 1.4.3's three-interval rule, which is measured against exactly that timestamp,
 * silently starts its count again.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { IngestionRun } from '../entity/IngestionRun';
import { SourceKind } from '../entity/enums';
import { IngestionRunStore } from '../ports/Stores';

export class IngestionRunRepository implements IngestionRunStore {
  constructor(private readonly db: Database) {}

  async recordStart(source: SourceKind, trigger: string): Promise<IngestionRun> {
    const rows = await this.db.query(
      `INSERT INTO ingestion_run (id, source, started_at, feature_count, outcome, trigger)
       VALUES ($1, $2, now(), 0, 'RUNNING', $3)
       RETURNING id, source, started_at, ended_at, feature_count, outcome, trigger`,
      [randomUUID(), source, trigger],
    );
    return IngestionRunRepository.toRun(rows[0] as Row);
  }

  async recordOutcome(run: IngestionRun, outcome: string, featureCount: number): Promise<IngestionRun> {
    const rows = await this.db.query(
      `UPDATE ingestion_run SET ended_at = now(), outcome = $2, feature_count = $3
        WHERE id = $1
       RETURNING id, source, started_at, ended_at, feature_count, outcome, trigger`,
      [run.id, outcome, featureCount],
    );
    // 10.2.2 — a run that ended in anything but FAILED clears the stale mark. Done in the same
    // statement pair as the outcome so the two cannot disagree after a crash between them.
    if (outcome !== 'FAILED') {
      await this.db.query(`UPDATE source_state SET marked_stale_at = NULL WHERE source = $1`, [run.source]);
      await this.db.query(
        `INSERT INTO source_health (source, last_success_at, is_warning) VALUES ($1, now(), false)
         ON CONFLICT (source) DO UPDATE SET last_success_at = now(), is_warning = false`,
        [run.source],
      );
    }
    const updated = IngestionRunRepository.toRun(rows[0] as Row);
    // The caller holds the object it passed in; keep it in step rather than making them re-read.
    run.endedAt = updated.endedAt;
    run.outcome = updated.outcome;
    run.featureCount = updated.featureCount;
    return updated;
  }

  /** 1.1.20 — the publisher stamp recorded at the last successful download, or null. */
  async lastPublisherStamp(source: SourceKind): Promise<string | null> {
    const rows = await this.db.query(`SELECT publisher_stamp FROM source_state WHERE source = $1`, [source]);
    return rows.length === 0 ? null : ((rows[0] as Row).publisher_stamp as string | null);
  }

  async savePublisherStamp(source: SourceKind, stamp: string): Promise<void> {
    await this.db.query(
      `INSERT INTO source_state (source, publisher_stamp) VALUES ($1, $2)
       ON CONFLICT (source) DO UPDATE SET publisher_stamp = EXCLUDED.publisher_stamp`,
      [source, stamp],
    );
  }

  /** 10.2.2 — mark the source stale without touching the data it already produced. */
  async markStale(source: SourceKind): Promise<void> {
    await this.db.query(
      `INSERT INTO source_state (source, marked_stale_at) VALUES ($1, now())
       ON CONFLICT (source) DO UPDATE SET marked_stale_at = now()`,
      [source],
    );
  }

  async recentRuns(source: SourceKind, limit: number): Promise<IngestionRun[]> {
    const rows = await this.db.query(
      `SELECT id, source, started_at, ended_at, feature_count, outcome, trigger
         FROM ingestion_run WHERE source = $1 ORDER BY started_at DESC LIMIT $2`,
      [source, limit],
    );
    return rows.map((r) => IngestionRunRepository.toRun(r));
  }

  private static toRun(row: Row): IngestionRun {
    const run = new IngestionRun();
    run.id = String(row.id);
    run.source = row.source as SourceKind;
    run.startedAt = row.started_at as Date;
    run.endedAt = (row.ended_at as Date | null) ?? null;
    run.featureCount = Number(row.feature_count);
    run.outcome = String(row.outcome);
    run.trigger = String(row.trigger);
    return run;
  }
}
