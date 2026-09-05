/**
 * D-Fence — Lab 4: photographs are stored, and evidence is evidence (§5.1.5, §8.3.6, §8.3.7,
 * §10.3.5, §10.3.6).
 *
 * The defect these cases exist for is the most instructive one the project has produced, because
 * the acceptance harness reported the requirement as **passing** the whole time. 8.3.6 requires at
 * least one photograph and 8.3.7 says a completion carrying none is rejected; the harness checked that a completion with an empty
 * `photoKeys` was refused, and that one with a non-empty `photoKeys` succeeded. Both were true.
 * Neither had anything to do with a photograph: `SupabaseStorageGateway`'s three methods threw
 * `not implemented`, the class was instantiated nowhere, the browser sent `storageKey: file.name`,
 * and `photoKeys: ["not-a-real-file-at-all"]` closed a work order.
 *
 * So the cases here are deliberately about the *gap between a string and an object*: G-series over
 * the gateway (what it sends and what it refuses), U-series over the upload control class, and
 * E-series over the completion guard that turns `exists()` into a refusal.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  COMPLETION_EVIDENCE,
  REPORT_PHOTOS,
  SupabaseStorageGateway,
} from '../src/boundary/gateways/SupabaseStorageGateway';
import { InMemoryObjectStorage } from '../src/persistence/memory/InMemoryObjectStorage';
import { PhotoUploadController, UploadRefused } from '../src/control/PhotoUploadController';
import { AccessControlService, NotAuthorised } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { Principal } from '../src/control/Principal';
import { principalFor } from '../src/control/DashboardController';
import { InMemoryAuditStore, InMemoryClusterStore, InMemoryPriorityScoreStore } from '../src/persistence/memory/InMemoryStores';
import {
  InMemoryTreatmentRecordStore,
  InMemoryWorkOrderStore,
  RecordingNotifier,
} from '../src/persistence/memory/InMemoryWorkOrderStores';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { TransitionRefused, WorkOrderLifecycleController } from '../src/control/WorkOrderLifecycleController';
import { DispatchController } from '../src/control/DispatchController';
import { ReportController, ReportRejected } from '../src/control/ReportController';
import { ReportLifecycleController } from '../src/control/ReportLifecycleController';
import { ReportTransitionTable } from '../src/control/ReportTransitionTable';
import { InMemoryClusterLocator, InMemoryReportStore } from '../src/persistence/memory/InMemoryReportStores';
import { ReportType } from '../src/entity/enums';
import { Cluster } from '../src/entity/Cluster';
import { CompletionEvidence } from '../src/entity/CompletionEvidence';
import { GeoPoint, PremisesMix } from '../src/entity/valueTypes';
import { Role, TaskType, WorkOrderStatus } from '../src/entity/enums';

const RESIDENT = new Principal('res-1', Role.Resident, 'sess-r');
const CREW = new Principal('crew-1', Role.CleaningCrew, 'sess-c');
const MANAGER = principalFor(Role.OperationsManager, 'manager-1');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_BASE64 = Buffer.from(PNG).toString('base64');

/** Records every request and answers from a script, so the HTTP the gateway speaks is inspectable. */
function recordingFetch(
  reply: (url: string, init: RequestInit) => { status: number; body?: unknown } = () => ({ status: 200 }),
): { fetcher: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const answer = reply(String(url), init);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function ac(): AccessControlService {
  return new AccessControlService(new AccessPolicy(), new InMemoryAuditStore());
}

describe('The storage gateway — §5.1.5, §10.3.5, §10.3.6', () => {
  it('G1 — an upload PUTs the bytes and answers a key that is a UUID, not the filename', async () => {
    const { fetcher, calls } = recordingFetch();
    const stored = await new SupabaseStorageGateway('https://x.supabase.co', 'k', fetcher).upload(
      REPORT_PHOTOS,
      PNG,
      'image/png',
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://x.supabase.co/storage/v1/object/${REPORT_PHOTOS}/${stored.key}`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(stored.sizeBytes).toBe(4);
    // 10.3.5 — nothing in the key is derived from the uploader, the work order or the file, so one
    // signed URL is not a map to every other photograph.
    expect(SupabaseStorageGateway.isPlausibleKey(stored.key)).toBe(true);
    expect(stored.key.endsWith('.png')).toBe(true);
  });

  it('G2 — two uploads of the same bytes get different keys', async () => {
    const gateway = new SupabaseStorageGateway('https://x.supabase.co', 'k', recordingFetch().fetcher);
    const [a, b] = await Promise.all([
      gateway.upload(REPORT_PHOTOS, PNG, 'image/png'),
      gateway.upload(REPORT_PHOTOS, PNG, 'image/png'),
    ]);
    // A content-derived key would make one photograph's URL work for another report's copy of it.
    expect(a.key).not.toBe(b.key);
  });

  it('G3 — it refuses to overwrite: x-upsert is false', async () => {
    const { fetcher, calls } = recordingFetch();
    await new SupabaseStorageGateway('https://x.supabase.co', 'k', fetcher).upload(REPORT_PHOTOS, PNG, 'image/png');
    // Silently replacing an object is the worst available outcome for something called evidence.
    expect((calls[0]?.init.headers as Record<string, string>)['x-upsert']).toBe('false');
  });

  it('G4 — a PDF, an oversized image and an empty file are all refused before the network (10.3.6)', async () => {
    const { fetcher, calls } = recordingFetch();
    const gateway = new SupabaseStorageGateway('https://x.supabase.co', 'k', fetcher);

    await expect(gateway.upload(REPORT_PHOTOS, PNG, 'application/pdf')).rejects.toThrow(/JPEG or PNG/);
    await expect(
      gateway.upload(REPORT_PHOTOS, new Uint8Array(5 * 1024 * 1024 + 1), 'image/png'),
    ).rejects.toThrow(/5 MB/);
    // Zero bytes is the subtle one: it would satisfy `exists()` forever while being evidence of
    // nothing, which is this whole file's defect reopened one level down.
    await expect(gateway.upload(REPORT_PHOTOS, new Uint8Array(0), 'image/png')).rejects.toThrow(/empty/);
    expect(calls).toHaveLength(0);
  });

  it('G5 — an unknown bucket is refused rather than created', async () => {
    const gateway = new SupabaseStorageGateway('https://x.supabase.co', 'k', recordingFetch().fetcher);
    await expect(gateway.upload('anything-goes', PNG, 'image/png')).rejects.toThrow(/unknown bucket/);
  });

  it('G6 — exists() answers the store, and a 404 is a false rather than a throw (8.3.7)', async () => {
    const key = '11111111-2222-3333-4444-555555555555.jpg';
    const gateway = new SupabaseStorageGateway(
      'https://x.supabase.co',
      'k',
      recordingFetch((url) => ({ status: url.includes(key) ? 200 : 404 })).fetcher,
    );

    expect(await gateway.exists(COMPLETION_EVIDENCE, key)).toBe(true);
    expect(await gateway.exists(COMPLETION_EVIDENCE, '99999999-2222-3333-4444-555555555555.jpg')).toBe(false);
  });

  it('G7 — a key that this class could not have issued never reaches the network (path traversal)', async () => {
    const { fetcher, calls } = recordingFetch();
    const gateway = new SupabaseStorageGateway('https://x.supabase.co', 'k', fetcher);

    for (const key of ['../report-photos/other.jpg', 'not-a-real-file-at-all', 'a/b.jpg', '', 'IMG_4821.jpg']) {
      expect(await gateway.exists(COMPLETION_EVIDENCE, key)).toBe(false);
    }
    // A key is interpolated into a URL path, so an unchecked one is a traversal with extra steps.
    expect(calls).toHaveLength(0);
  });

  it('G8 — a signed URL is absolute and time-limited (10.3.5)', async () => {
    const { fetcher, calls } = recordingFetch(() => ({ status: 200, body: { signedURL: '/object/sign/x?token=t' } }));
    const url = await new SupabaseStorageGateway('https://x.supabase.co', 'k', fetcher).signedUrl(
      REPORT_PHOTOS,
      '11111111-2222-3333-4444-555555555555.jpg',
      300,
    );

    expect(url).toBe('https://x.supabase.co/storage/v1/object/sign/x?token=t');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ expiresIn: 300 });
  });

  it('G9 — deleting something already gone is success, so 10.4.3 survives a retry', async () => {
    const gateway = new SupabaseStorageGateway('https://x.supabase.co', 'k', recordingFetch(() => ({ status: 404 })).fetcher);
    await expect(gateway.remove(REPORT_PHOTOS, 'gone.jpg')).resolves.toBeUndefined();
  });

  it('G10 — the in-memory twin enforces the same rules, so a test cannot pass on a path production refuses', async () => {
    const storage = new InMemoryObjectStorage();
    await expect(storage.upload(REPORT_PHOTOS, PNG, 'application/pdf')).rejects.toThrow(/JPEG or PNG/);
    await expect(storage.upload(REPORT_PHOTOS, new Uint8Array(0), 'image/png')).rejects.toThrow(/empty/);

    const stored = await storage.upload(REPORT_PHOTOS, PNG, 'image/png');
    expect(await storage.exists(REPORT_PHOTOS, stored.key)).toBe(true);
    // Buckets are separate namespaces in both implementations, not a prefix convention.
    expect(await storage.exists(COMPLETION_EVIDENCE, stored.key)).toBe(false);
  });
});

describe('Uploading a photograph — §5.1.5, §8.3.6, §2.3.x, §10.3.6', () => {
  let storage: InMemoryObjectStorage;
  let uploads: PhotoUploadController;

  beforeEach(() => {
    storage = new InMemoryObjectStorage();
    uploads = new PhotoUploadController(ac(), storage, new InMemoryAuditStore());
  });

  it('U1 — a resident uploads a report photograph and the bytes are really there', async () => {
    const stored = await uploads.upload('report', 'image/png', PNG_BASE64, RESIDENT);
    expect(storage.size).toBe(1);
    expect(await storage.exists(REPORT_PHOTOS, stored.key)).toBe(true);
    expect(stored.sizeBytes).toBe(4);
  });

  it('U2 — a data: URL from FileReader is accepted, because that is what a browser produces', async () => {
    const stored = await uploads.upload('report', 'image/png', `data:image/png;base64,${PNG_BASE64}`, RESIDENT);
    expect(await storage.exists(REPORT_PHOTOS, stored.key)).toBe(true);
  });

  it('U3 — the bucket is derived from the purpose, never supplied by the caller (2.3.x)', async () => {
    const stored = await uploads.upload('completion', 'image/png', PNG_BASE64, CREW);
    // A crew member's evidence cannot land in the reports bucket, and vice versa, because there is
    // no request field that says which — the path decides, and the path decides the permission.
    expect(await storage.exists(COMPLETION_EVIDENCE, stored.key)).toBe(true);
    expect(await storage.exists(REPORT_PHOTOS, stored.key)).toBe(false);
  });

  it('U4 — a crew member may not upload a report photograph, and a resident may not upload evidence', async () => {
    await expect(uploads.upload('report', 'image/png', PNG_BASE64, CREW)).rejects.toBeInstanceOf(NotAuthorised);
    await expect(uploads.upload('completion', 'image/png', PNG_BASE64, RESIDENT)).rejects.toBeInstanceOf(NotAuthorised);
    expect(storage.size).toBe(0);
  });

  it('U5 — authorisation runs before the image is even decoded', async () => {
    // Otherwise an unauthorised caller can still make the server base64-decode five megabytes for
    // them, which is a denial-of-service with a 403 on the end of it.
    await expect(uploads.upload('completion', 'application/pdf', 'not base64 at all', RESIDENT)).rejects.toBeInstanceOf(
      NotAuthorised,
    );
  });

  it('U6 — rubbish that is not base64 is refused rather than stored as an empty object', async () => {
    // `Buffer.from(s, 'base64')` ignores what it does not recognise, so without the re-encode check
    // this arrives at the store as a zero-byte "photograph" that satisfies exists() forever.
    const refused = await uploads.upload('report', 'image/png', '!!!!', RESIDENT).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(UploadRefused);
    expect(storage.size).toBe(0);
  });

  it('U7 — a HEIC and an oversized photograph are refused with a remedy, not a stack trace (10.5.3)', async () => {
    const type = (await uploads
      .upload('report', 'image/heic', PNG_BASE64, RESIDENT)
      .catch((e: unknown) => e)) as UploadRefused;
    expect(type.reason).toContain('image/heic');
    expect(type.remedy).toContain('JPEG or PNG');

    const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    const size = (await uploads
      .upload('report', 'image/png', big, RESIDENT)
      .catch((e: unknown) => e)) as UploadRefused;
    expect(size.reason).toContain('5.0 MB');
    expect(size.remedy).toContain('5 MB');
    expect(storage.size).toBe(0);
  });

  it('U8 — the upload is audited by key, so an evidence dispute has a record (2.4.1)', async () => {
    const audit = new InMemoryAuditStore();
    const stored = await new PhotoUploadController(ac(), storage, audit).upload(
      'completion',
      'image/png',
      PNG_BASE64,
      CREW,
    );
    const entries = await audit.recent(10);
    expect(entries.some((e) => e.action === 'photo:upload' && e.targetId === stored.key)).toBe(true);
  });
});

describe('A completion carries photographs, not strings — §8.3.6, §8.3.7', () => {
  let storage: InMemoryObjectStorage;
  let workOrders: InMemoryWorkOrderStore;
  let lifecycle: WorkOrderLifecycleController;
  let dispatch: DispatchController;
  let clusterId: string;

  beforeEach(async () => {
    const clusters = new InMemoryClusterStore();
    const cluster = new Cluster();
    cluster.objectId = 'c-1';
    cluster.locality = 'Countryside Rd';
    cluster.caseSize = 12;
    cluster.caseDelta = 0;
    cluster.isActive = true;
    cluster.premisesMix = new PremisesMix(['Bin'], [], []);
    await clusters.upsertFromFeed({ retrievedAt: new Date(), records: [cluster] });
    clusterId = ((await clusters.findActive())[0] as Cluster).id;

    storage = new InMemoryObjectStorage();
    workOrders = new InMemoryWorkOrderStore();
    const notifier = new RecordingNotifier();
    lifecycle = new WorkOrderLifecycleController(
      new WorkOrderTransitionTable(),
      workOrders,
      new InMemoryTreatmentRecordStore(),
      notifier,
      null,
      null,
      null,
      storage,
    );
    dispatch = new DispatchController(
      ac(),
      lifecycle,
      workOrders,
      clusters,
      new InMemoryPriorityScoreStore(),
      notifier,
    );
  });

  async function inProgress(): Promise<string> {
    const date = new Date(Date.now() + 8 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
    const wo = await dispatch.createWorkOrder({ clusterId, taskType: TaskType.Fogging, scheduledDate: date }, MANAGER);
    await dispatch.assign(wo.id, CREW.accountId, MANAGER);
    await lifecycle.accept(wo.id, CREW);
    await lifecycle.start(wo.id, CREW);
    return wo.id;
  }

  function evidenceFor(id: string, keys: string[]): CompletionEvidence {
    const e = new CompletionEvidence();
    e.workOrderId = id;
    e.completedAt = new Date();
    e.taskPerformed = TaskType.Fogging;
    e.notes = 'Fogged the void deck.';
    e.photoKeys = keys;
    e.rejectionReason = null;
    return e;
  }

  it('E1 — a key naming nothing is refused, and the work order stays In Progress', async () => {
    const id = await inProgress();
    // The literal request that used to return 200 and close the job.
    const refused = (await lifecycle
      .complete(id, evidenceFor(id, ['not-a-real-file-at-all']), CREW)
      .catch((e: unknown) => e)) as TransitionRefused;

    expect(refused).toBeInstanceOf(TransitionRefused);
    expect(refused.reason).toContain('was not received');
    expect(refused.from).toBe(WorkOrderStatus.InProgress);
  });

  it('E2 — an uploaded photograph completes the job', async () => {
    const id = await inProgress();
    const stored = await storage.upload(COMPLETION_EVIDENCE, PNG, 'image/png');
    const done = await lifecycle.complete(id, evidenceFor(id, [stored.key]), CREW);
    expect(done.currentStatus()).toBe(WorkOrderStatus.Completed);
  });

  it('E3 — three photographs of which one failed says so, rather than "invalid evidence"', async () => {
    const id = await inProgress();
    const a = await storage.upload(COMPLETION_EVIDENCE, PNG, 'image/png');
    const b = await storage.upload(COMPLETION_EVIDENCE, PNG, 'image/png');
    const refused = (await lifecycle
      .complete(id, evidenceFor(id, [a.key, 'lost.jpg', b.key]), CREW)
      .catch((e: unknown) => e)) as TransitionRefused;

    // A crew member standing in a stairwell needs to know how many to take again, and which.
    expect(refused.reason).toContain('1 of 3');
  });

  it('E4 — a photograph in the reports bucket is not evidence for a work order', async () => {
    const id = await inProgress();
    const stored = await storage.upload(REPORT_PHOTOS, PNG, 'image/png');
    // Same key, wrong bucket: the guard asks the bucket the evidence is supposed to be in, so a
    // resident's photograph of the site cannot be passed off as the crew's photograph of the work.
    await expect(lifecycle.complete(id, evidenceFor(id, [stored.key]), CREW)).rejects.toBeInstanceOf(TransitionRefused);
  });

  it('E5 — nothing is written before the refusal: no evidence row survives a rejected completion', async () => {
    const id = await inProgress();
    await lifecycle.complete(id, evidenceFor(id, ['lost.jpg']), CREW).catch(() => undefined);
    // Saving first and checking after would leave a row citing keys that name nothing, on a job no
    // screen renders honestly and nobody can clear.
    expect(await workOrders.latestEvidence(id)).toBeNull();
  });
});

describe('A report carries photographs, not strings — §5.1.5, §10.3.6', () => {
  /** The resident half of the same gate. Built here rather than in `report.test.ts` because what
   *  is under test is storage, not moderation. */
  async function submit(keys: string[], storage: InMemoryObjectStorage): Promise<unknown> {
    const reports = new InMemoryReportStore();
    const controller = new ReportController(
      ac(),
      reports,
      new InMemoryClusterLocator(new InMemoryClusterStore()),
      new ReportLifecycleController(new ReportTransitionTable(), reports, null),
      null,
      storage,
    );
    return controller.submitReport(
      {
        point: new GeoPoint(1.3521, 103.8198),
        type: ReportType.StandingWater,
        description: 'Standing water in a discarded pail behind the block.',
        photos: keys.map((storageKey) => ({
          filename: 'site.png',
          contentType: 'image/png',
          sizeBytes: 4,
          storageKey,
        })),
      },
      RESIDENT,
    );
  }

  it('R1 — a report citing a photograph nobody uploaded is refused', async () => {
    const storage = new InMemoryObjectStorage();
    const refused = (await submit(['IMG_4821.jpg'], storage).catch((e: unknown) => e)) as ReportRejected;
    // What the screen used to send on every submission: the filename, as though it were a key.
    expect(refused).toBeInstanceOf(ReportRejected);
    expect(refused.message).toContain('was not received');
  });

  it('R2 — a report citing an uploaded photograph is accepted', async () => {
    const storage = new InMemoryObjectStorage();
    const stored = await storage.upload(REPORT_PHOTOS, PNG, 'image/png');
    await expect(submit([stored.key], storage)).resolves.toBeDefined();
  });

  it('R3 — a report with no photographs at all is still accepted (5.1.5 makes them optional)', async () => {
    await expect(submit([], new InMemoryObjectStorage())).resolves.toBeDefined();
  });
});
