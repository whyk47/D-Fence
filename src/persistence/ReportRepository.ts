/**
 * D-Fence — ReportRepository.
 * Stereotype: <<persistence>>. Traces: 5.1.1–5.1.14, 5.2.1–5.2.9, 5.3.1–5.3.5, 7.3.5, 4.1.3, 8.3.21.
 *
 * Implements the same `ReportStore` port as `InMemoryReportStore`, so `ReportController` and
 * `ModerationController` cannot tell which one they have.
 *
 * **The duplicate check is the reason this class is worth writing.** 5.1.11 asks for open reports
 * of the same type within fifty metres of a point in the last twenty-four hours. In memory that is
 * a linear scan over every report ever submitted, which is fine at a hundred and useless at a
 * hundred thousand; here it is `ST_DWithin` over a GIST index on a `geography` column, so the
 * radius is stated in **metres** — the unit 5.1.11 is actually written in. On a `geometry` column
 * the same call would take degrees and fifty metres would silently become about five and a half
 * million.
 *
 * `ST_DWithin` is inclusive of the radius, which matches `InMemoryReportStore`'s `<=` and the Lab 4
 * boundary cases at 49, 50 and 51 metres. The two implementations have to agree exactly at 50 m or
 * the tests are testing the store rather than the rule.
 */
import { randomUUID } from 'node:crypto';
import { Database, Row } from './Database';
import { Report } from '../entity/Report';
import { ReportPhoto } from '../entity/ReportPhoto';
import { Corroboration } from '../entity/Corroboration';
import { GeoPoint, Uuid } from '../entity/valueTypes';
import { ReportStatus, ReportType } from '../entity/enums';
import { ReportStore } from '../ports/Stores';

/** Every column, once. `point` comes back as GeoJSON because `geography` has no useful text form. */
const COLUMNS = `
  id, reporter_id, ST_AsGeoJSON(point) AS point, type, description, status, cluster_id,
  locality_binding, corroboration_count, submitted_at, moderator_id, moderated_at,
  moderation_reason, work_order_id`;

/** 5.1.11, 5.2.5 — the three live statuses, kept in one place so the two queries cannot drift. */
const OPEN_STATUSES = [ReportStatus.Submitted, ReportStatus.Verified, ReportStatus.Actioned];

export class ReportRepository implements ReportStore {
  constructor(private readonly db: Database) {}

  async findById(id: Uuid): Promise<Report | null> {
    const rows = await this.db.query(`SELECT ${COLUMNS} FROM report WHERE id = $1`, [id]);
    return rows.length === 0 ? null : ReportRepository.toReport(rows[0] as Row);
  }

  /**
   * Upsert by id, and the id is assigned here when the caller has not set one — the same contract
   * `InMemoryReportStore.save` offers, so a controller that reads `report.id` after saving gets an
   * id in both modes rather than in one.
   */
  async save(report: Report): Promise<Report> {
    report.id = report.id || randomUUID();
    await this.db.query(
      `INSERT INTO report (
         id, reporter_id, point, type, description, status, cluster_id, locality_binding,
         corroboration_count, submitted_at, moderator_id, moderated_at, moderation_reason,
         work_order_id)
       VALUES ($1, $2, ST_MakePoint($4, $3)::geography, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         reporter_id         = EXCLUDED.reporter_id,
         point               = EXCLUDED.point,
         type                = EXCLUDED.type,
         description         = EXCLUDED.description,
         status              = EXCLUDED.status,
         cluster_id          = EXCLUDED.cluster_id,
         locality_binding    = EXCLUDED.locality_binding,
         corroboration_count = EXCLUDED.corroboration_count,
         submitted_at        = EXCLUDED.submitted_at,
         moderator_id        = EXCLUDED.moderator_id,
         moderated_at        = EXCLUDED.moderated_at,
         moderation_reason   = EXCLUDED.moderation_reason,
         work_order_id       = EXCLUDED.work_order_id`,
      [
        report.id,
        report.reporterId,
        report.point.latitude,
        report.point.longitude,
        report.type,
        report.description,
        report.currentStatus(),
        report.clusterId,
        report.localityBinding,
        report.corroborationCount,
        report.submittedAt,
        report.moderatorId,
        report.moderatedAt,
        report.moderationReason,
        report.workOrderId,
      ],
    );
    return report;
  }

  /** 5.1.11 — inclusive on both the radius and the cut-off, matching the in-memory store exactly. */
  async findNearbyOpen(
    point: GeoPoint,
    type: ReportType,
    radiusMetres: number,
    since: Date,
  ): Promise<Report[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM report
        WHERE type = $3
          AND status = ANY($4)
          AND submitted_at >= $5
          AND ST_DWithin(point, ST_MakePoint($2, $1)::geography, $6)
        ORDER BY submitted_at DESC`,
      [point.latitude, point.longitude, type, OPEN_STATUSES, since, radiusMetres],
    );
    return rows.map((r) => ReportRepository.toReport(r));
  }

  /** 5.3.1 — the moderation queue, oldest first: a queue read newest-first starves its own tail. */
  async findByStatus(status: ReportStatus): Promise<Report[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM report WHERE status = $1 ORDER BY submitted_at`,
      [status],
    );
    return rows.map((r) => ReportRepository.toReport(r));
  }

  async findByReporter(reporterId: Uuid): Promise<Report[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM report WHERE reporter_id = $1 ORDER BY submitted_at DESC`,
      [reporterId],
    );
    return rows.map((r) => ReportRepository.toReport(r));
  }

  /** 7.3.5 — inclusive of the cut-off, oldest first, matching every other window in the system. */
  async submittedSince(since: Date): Promise<Report[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM report WHERE submitted_at >= $1 ORDER BY submitted_at`,
      [since],
    );
    return rows.map((r) => ReportRepository.toReport(r));
  }

  /**
   * 5.2.5 into 4.1.3 — one aggregate query per scoring cycle, served by the partial index
   * `report_cluster_open_idx`. Reading every report and counting in application code would make
   * the fourth driver cost a full table scan on every cycle.
   */
  async verifiedOpenCountByCluster(): Promise<Map<Uuid, number>> {
    const rows = await this.db.query(
      `SELECT cluster_id, count(*)::int AS n FROM report
        WHERE cluster_id IS NOT NULL AND status IN ('Verified','Actioned')
        GROUP BY cluster_id`,
    );
    const counts = new Map<Uuid, number>();
    for (const row of rows) {
      counts.set(row.cluster_id as Uuid, Number(row.n));
    }
    return counts;
  }

  async findForWorkOrder(workOrderId: Uuid): Promise<Report[]> {
    const rows = await this.db.query(
      `SELECT ${COLUMNS} FROM report WHERE work_order_id = $1 ORDER BY submitted_at`,
      [workOrderId],
    );
    return rows.map((r) => ReportRepository.toReport(r));
  }

  /** Append-only. 8.3.21 reads the status a report held *before* it was Actioned. */
  async appendStatusChange(
    reportId: Uuid,
    from: ReportStatus | null,
    to: ReportStatus,
    at: Date,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO report_status_change (report_id, from_status, to_status, changed_at)
       VALUES ($1, $2, $3, $4)`,
      [reportId, from, to, at],
    );
  }

  async statusHistory(
    reportId: Uuid,
  ): Promise<Array<{ from: ReportStatus | null; to: ReportStatus; at: Date }>> {
    const rows = await this.db.query(
      `SELECT from_status, to_status, changed_at FROM report_status_change
        WHERE report_id = $1 ORDER BY changed_at, id`,
      [reportId],
    );
    return rows.map((r) => ({
      from: (r.from_status as ReportStatus | null) ?? null,
      to: r.to_status as ReportStatus,
      at: r.changed_at as Date,
    }));
  }

  /**
   * 5.1.13 — one corroboration per person per report, enforced by the unique constraint rather than
   * by a read-then-write. `DO NOTHING` makes a double-tap on a slow connection a no-op instead of
   * an error the resident sees, while the count a manager reads stays honest.
   */
  async saveCorroboration(corroboration: Corroboration): Promise<void> {
    corroboration.id = corroboration.id || randomUUID();
    await this.db.query(
      `INSERT INTO corroboration (id, report_id, account_id, confirmed_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (report_id, account_id) DO NOTHING`,
      [corroboration.id, corroboration.reportId, corroboration.accountId, corroboration.confirmedAt],
    );
  }

  async hasCorroborated(reportId: Uuid, accountId: Uuid): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM corroboration WHERE report_id = $1 AND account_id = $2 LIMIT 1`,
      [reportId, accountId],
    );
    return rows.length > 0;
  }

  /** 5.1.5, 10.3.5 — the key, never the image. */
  async savePhoto(photo: ReportPhoto): Promise<void> {
    photo.id = photo.id || randomUUID();
    await this.db.query(
      `INSERT INTO report_photo (id, report_id, storage_key, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (storage_key) DO NOTHING`,
      [photo.id, photo.reportId, photo.storageKey, photo.contentType, photo.sizeBytes],
    );
  }

  async photosFor(reportId: Uuid): Promise<ReportPhoto[]> {
    const rows = await this.db.query(
      `SELECT id, report_id, storage_key, content_type, size_bytes FROM report_photo
        WHERE report_id = $1 ORDER BY id`,
      [reportId],
    );
    return rows.map((r) => {
      const photo = new ReportPhoto();
      photo.id = r.id as Uuid;
      photo.reportId = r.report_id as Uuid;
      photo.storageKey = r.storage_key as string;
      photo.contentType = r.content_type as string;
      photo.sizeBytes = Number(r.size_bytes);
      return photo;
    });
  }

  /**
   * Row to entity.
   *
   * `applyStatus` is the only way in — `Report.status` is private precisely so that nothing but
   * `ReportLifecycleController` moves it. Rehydration is the one legitimate exception, and it is
   * confined to this method rather than being made possible everywhere by a public setter.
   */
  private static toReport(row: Row): Report {
    const report = new Report();
    report.id = row.id as Uuid;
    report.reporterId = (row.reporter_id as Uuid | null) ?? null;
    report.point = ReportRepository.toPoint(row.point as string);
    report.type = row.type as ReportType;
    report.description = row.description as string;
    report.clusterId = (row.cluster_id as Uuid | null) ?? null;
    report.localityBinding = row.locality_binding as string;
    report.corroborationCount = Number(row.corroboration_count);
    report.submittedAt = row.submitted_at as Date;
    report.moderatorId = (row.moderator_id as Uuid | null) ?? null;
    report.moderatedAt = (row.moderated_at as Date | null) ?? null;
    report.moderationReason = (row.moderation_reason as string | null) ?? null;
    report.workOrderId = (row.work_order_id as Uuid | null) ?? null;
    report.applyStatus(row.status as ReportStatus);
    return report;
  }

  /** GeoJSON `Point` coordinates are [longitude, latitude] — in that order, which is not ours. */
  private static toPoint(geoJson: string): GeoPoint {
    const parsed = JSON.parse(geoJson) as { coordinates: [number, number] };
    return new GeoPoint(parsed.coordinates[1], parsed.coordinates[0]);
  }
}
