/**
 * D-Fence — submitting, corroborating and following a breeding-site report.
 * Stereotype: <<control>>. Realises use cases 3.1–3.3. Traces: 5.1.1–5.1.14, 5.2.2, 5.2.9, 5.3.5.
 *
 * This class does not write `Report.status`: submission sets the initial status through
 * `ReportLifecycleController`, and every later move belongs there too. Same rule as §8, and for the
 * same reason — one owner of the state machine, or the model claims one and has two.
 */
import { ReportStatus, ReportType, Role } from '../entity/enums';
import { GeoPoint, Uuid } from '../entity/valueTypes';
import { Report, UNASSIGNED_LOCALITY } from '../entity/Report';
import { Corroboration } from '../entity/Corroboration';
import { MAX_PHOTOS_PER_REPORT, PhotoUpload, ReportPhoto } from '../entity/ReportPhoto';
import { ClusterLocator, ReportStore } from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { ReportLifecycleController } from './ReportLifecycleController';
import { Principal } from './Principal';

/** 5.1.11 — the two numbers that define a duplicate. Judgement, flagged as such in §13. */
export const DUPLICATE_RADIUS_METRES = 50;
export const DUPLICATE_WINDOW_HOURS = 24;
/** 5.1.8 */
export const NEAREST_LOCALITY_RADIUS_METRES = 1000;
/** 5.1.4 */
export const MAX_DESCRIPTION_CHARS = 500;

export interface ReportDraft {
  point: GeoPoint;
  type: ReportType;
  description: string;
  photos?: PhotoUpload[];
}

/**
 * 5.1.11, 5.1.12. Carries the existing report, because a refusal that does not offer the thing to
 * confirm instead leaves the resident with nowhere to go — and they will file the duplicate anyway
 * by moving the pin ten metres.
 */
export class DuplicateReport extends Error {
  constructor(readonly existing: Report) {
    super('a report of this type was already made nearby in the last 24 hours');
    this.name = 'DuplicateReport';
  }
}

/** A submission refused on its own contents (5.1.2–5.1.6). Separate from a duplicate: the remedy differs. */
export class ReportRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ReportRejected';
  }
}

export class ReportController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly reports: ReportStore,
    private readonly locator: ClusterLocator,
    private readonly lifecycle: ReportLifecycleController,
  ) {}

  /**
   * 5.1.1–5.1.10. Validates the contents, refuses a duplicate, binds the location, then persists.
   *
   * The order matters: the duplicate check runs **before** anything is written, so a refused
   * submission leaves no report behind for the corroboration in 5.1.12 to be confused with.
   *
   * @throws ReportRejected on contents; DuplicateReport carrying what to confirm instead
   */
  async submitReport(draft: ReportDraft, by: Principal, now = new Date()): Promise<Report> {
    await this.ac.authorise(by, 'report:create', { kind: 'report' });

    // 5.1.3 — a type from the five. An unknown string reaching the store would make 5.1.11's
    // same-type comparison meaningless, so it is refused here rather than coerced to Other.
    if (!Object.values(ReportType).includes(draft.type)) {
      throw new ReportRejected(`${String(draft.type)} is not one of the five report types (5.1.3)`);
    }
    // 5.1.4 — at most 500 characters. Measured after trimming, because trailing whitespace is not
    // description and refusing on it would be an unexplainable rejection to the resident.
    const description = draft.description.trim();
    if (description.length > MAX_DESCRIPTION_CHARS) {
      throw new ReportRejected(
        `the description is ${description.length} characters; the limit is ${MAX_DESCRIPTION_CHARS} (5.1.4)`,
      );
    }
    const photos = draft.photos ?? [];
    if (photos.length > MAX_PHOTOS_PER_REPORT) {
      throw new ReportRejected(`${photos.length} photographs were attached; at most three are accepted (5.1.5)`);
    }
    for (const upload of photos) {
      const reason = ReportPhoto.rejectionReasonFor(upload); // 5.1.6
      if (reason !== null) {
        throw new ReportRejected(reason);
      }
    }

    const existing = await this.detectDuplicate(draft.point, draft.type, now);
    if (existing.length > 0) {
      throw new DuplicateReport(existing[0] as Report); // 5.1.11, 5.1.12
    }

    const report = new Report();
    report.reporterId = by.accountId; // 5.1.10
    report.point = draft.point; // 5.1.2
    report.type = draft.type;
    report.description = description;
    report.corroborationCount = 0;
    report.submittedAt = now; // 5.1.10
    report.moderatorId = null;
    report.moderatedAt = null;
    report.moderationReason = null;
    report.workOrderId = null;
    Object.assign(report, await this.bindLocation(draft.point));
    report.applyStatus(ReportStatus.Submitted); // 5.2.2 — creation is not a transition

    const saved = await this.reports.save(report);
    await this.reports.appendStatusChange(saved.id, null, ReportStatus.Submitted, now);
    for (const upload of photos) {
      const photo = new ReportPhoto();
      photo.reportId = saved.id;
      photo.storageKey = upload.storageKey;
      photo.contentType = upload.contentType;
      photo.sizeBytes = upload.sizeBytes;
      await this.reports.savePhoto(photo);
    }
    return saved;
  }

  /**
   * 5.1.7, 5.1.8, 5.1.9 — the three-step binding, in order: the containing active cluster, else the
   * nearest locality within a kilometre, else Unassigned.
   *
   * Note that `clusterId` is set **only** by containment. A report a kilometre from a cluster is
   * near it, not in it, and letting the nearest-locality fallback set a cluster id would put that
   * report into 4.1.3's driver for a cluster whose boundary it is nowhere near.
   */
  private async bindLocation(point: GeoPoint): Promise<{ clusterId: Uuid | null; localityBinding: string }> {
    const containing = await this.locator.containing(point);
    if (containing !== null) {
      return { clusterId: containing.id, localityBinding: containing.locality }; // 5.1.7
    }
    const nearest = await this.locator.nearestWithin(point, NEAREST_LOCALITY_RADIUS_METRES);
    // 5.1.9 — Unassigned is the value of the binding, and the status stays Submitted regardless.
    // Note the cluster id stays null even when a cluster is found: 5.1.8 binds the *locality*, and
    // a report a kilometre from a boundary must not enter that cluster's 4.1.3 count.
    return { clusterId: null, localityBinding: nearest?.cluster.locality ?? UNASSIGNED_LOCALITY }; // 5.1.8
  }

  /**
   * 5.1.11 — open reports of the same type within 50 m of the point in the preceding 24 hours,
   * nearest first, so 5.1.12 offers the most plausible one to confirm.
   */
  async detectDuplicate(point: GeoPoint, type: ReportType, now = new Date()): Promise<Report[]> {
    const since = new Date(now.getTime() - DUPLICATE_WINDOW_HOURS * 3_600_000);
    const nearby = await this.reports.findNearbyOpen(point, type, DUPLICATE_RADIUS_METRES, since);
    return nearby.sort((a, b) => point.distanceTo(a.point) - point.distanceTo(b.point));
  }

  /**
   * 5.1.13, 5.1.14 — confirm an existing open report instead of filing a second one. A resident may
   * confirm a given report once; a second attempt is refused rather than silently ignored, because
   * the screen has to be able to say the confirmation is already recorded.
   */
  async confirmExisting(reportId: Uuid, by: Principal): Promise<Report> {
    await this.ac.authorise(by, 'report:confirm', { kind: 'report', id: reportId });
    const report = await this.reports.findById(reportId);
    if (report === null) {
      throw new ReportRejected(`no report ${reportId}`);
    }
    if (!report.isOpen()) {
      throw new ReportRejected('this report is already settled and cannot be confirmed (5.1.13)');
    }
    if (report.reporterId === by.accountId) {
      // Not stated by 5.1.13, and deliberately added: a reporter corroborating their own report
      // would let one resident raise the corroboration count alone, which is the number a manager
      // reads as "several neighbours saw this".
      throw new ReportRejected('you cannot confirm your own report');
    }
    if (await this.reports.hasCorroborated(reportId, by.accountId)) {
      throw new ReportRejected('you have already confirmed this report (5.1.13)');
    }

    const corroboration = new Corroboration();
    corroboration.reportId = reportId;
    corroboration.accountId = by.accountId;
    corroboration.confirmedAt = new Date();
    await this.reports.saveCorroboration(corroboration);

    report.corroborationCount += 1; // 5.1.14
    return this.reports.save(report);
  }

  /** 2.3.2 — a Resident sees only their own reports, with full detail and their own photographs. */
  async listOwnReports(by: Principal): Promise<Report[]> {
    await this.ac.authorise(by, 'report:readIdentified', { kind: 'report', ownerId: by.accountId });
    return (await this.reports.findByReporter(by.accountId)).sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    );
  }

  /** 5.2.1, 5.2.8 — the status history a resident sees on the Report Detail screen. */
  async statusHistory(reportId: Uuid, by: Principal): Promise<Array<{ from: ReportStatus | null; to: ReportStatus; at: Date }>> {
    const report = await this.reports.findById(reportId);
    await this.ac.authorise(by, 'report:readIdentified', {
      kind: 'report',
      id: reportId,
      ownerId: report?.reporterId,
    });
    return this.reports.statusHistory(reportId);
  }

  /**
   * 5.2.9, 5.3.5 — what a resident may see of somebody else's report: no reporter identity, and no
   * photographs until it has been verified.
   *
   * The reporter themselves gets the identified view through `listOwnReports`; this method is the
   * only other way a report leaves the system towards a resident, which is what makes the rule
   * enforceable rather than a note on a screen design.
   */
  async publicView(reportId: Uuid, by: Principal): Promise<{ report: ReturnType<Report['publicProjection']>; photos: ReportPhoto[] }> {
    await this.ac.authorise(by, by.role === Role.Resident ? 'report:create' : 'report:readAll', { kind: 'report', id: reportId });
    const report = await this.reports.findById(reportId);
    if (report === null) {
      throw new ReportRejected(`no report ${reportId}`);
    }
    const projection = report.publicProjection();
    const isReporter = report.reporterId === by.accountId;
    const photos = projection.photosVisible || isReporter ? await this.reports.photosFor(reportId) : [];
    return { report: projection, photos };
  }

  /** Exposed so routes and tests reach moderation and lifecycle through one object graph. */
  lifecycleController(): ReportLifecycleController {
    return this.lifecycle;
  }
}
