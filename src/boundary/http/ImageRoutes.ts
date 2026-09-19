/**
 * D-Fence — ImageRoutes.
 * Stereotype: <<boundary>>. Traces: 5.1.5, 5.3.5, 8.3.6, 10.3.5, 10.5.3, 2.3.4, 11.2.10, 11.2.15.
 *
 * Routes:
 *   GET /api/images/report/:reportId/:key      → { url, expiresInSeconds }   (11.2.10, 11.2.15)
 *   GET /api/images/completion-evidence/:key   → { url, expiresInSeconds }   (8.3.6, 2.3.4)
 *
 * **The half of the photograph story that was never built.** `UploadRoutes` carried images in;
 * `ObjectStorage.signedUrl` was written, implemented twice and unit-tested; and no route, no
 * controller and no screen ever called it. So every photograph in the system was write-only. The
 * Report Review screen — whose own comment says "a manager sees the photographs; this is the
 * screen they exist for" — rendered `<li>{photo.filename}</li>`, a list of names a resident's
 * phone happened to choose. 5.3.4 was being reported as met by a screen showing `IMG_4821.jpg`.
 *
 * **The route answers a URL, not the bytes**, exactly as `UploadRoutes` said it would: the browser
 * fetches the image straight from object storage over a link that expires, so the application
 * never proxies five megabytes per photograph, and 10.3.5's "authenticated, non-enumerable" holds.
 *
 * **Why a report photograph is addressed by report and key, not by key alone.** Who may see a
 * report photograph is not a property of the image — it is a rule about the *report*, and there
 * are two of them:
 *
 *   - **5.3.4** gives a moderator every photograph on a report awaiting review. That is the whole
 *     point of the review: a manager decides whether standing water is really standing water by
 *     looking at the picture of it, before the report has any status but Submitted.
 *   - **5.3.5** withholds a photograph from every *other* resident until the report has been
 *     triaged, and gives the reporter their own back at any time.
 *
 * Both are already implemented, once each — 5.3.4 in `ModerationController.review`, 5.3.5 in
 * `ReportController.publicView` — and the only way to ask either is to name the report. So this
 * handler asks whichever one governs the caller, and mints a link only for a key that came back in
 * the answer. A resident who guesses another resident's key gets a 404, because the key is not in
 * *their* view of that report.
 *
 * The first version of this file asked `publicView` for everybody, which quietly applied 5.3.5 to
 * the moderator: the Report Review screen fetched a link for a photograph the server had just sent
 * it and was told the photograph was not part of the report. A screenshot is what caught it — the
 * tests pass either way, because both paths are correct code doing the wrong thing.
 *
 * Completion evidence is different and stays key-addressed: 2.3.4 gives every work order to the
 * Operations Manager, so there is no per-object rule to consult.
 */
import { RouteHandler, Request, Response } from './RouteHandler';
import { AccessControlService } from '../../control/AccessControlService';
import { ModerationController } from '../../control/ModerationController';
import { ReportController } from '../../control/ReportController';
import { Role } from '../../entity/enums';
import { ObjectStorage, COMPLETION_EVIDENCE, REPORT_PHOTOS } from '../../ports/ObjectStorage';

/**
 * Five minutes.
 *
 * Long enough for a manager to open a screen, look at four photographs and enlarge one; short
 * enough that a link pasted into a chat window is dead before anyone follows it. Screens ask again
 * on reload rather than caching the URL, so the expiry is never something a user meets.
 */
const TTL_SECONDS = 300;

/** As `ObjectStorage.upload` mints them: a UUID and an extension, one path segment, no separators. */
const KEY = /^[0-9a-f-]{36}\.(jpg|jpeg|png)$/i;

export class ImageRoutes extends RouteHandler {
  constructor(
    ac: AccessControlService,
    private readonly storage: ObjectStorage,
    private readonly reports: ReportController,
    private readonly moderation: ModerationController,
  ) {
    super(ac);
  }

  routes(): string[] {
    return ['/api/images/report/:reportId/:key', '/api/images/completion-evidence/:key'];
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const principal = await this.resolvePrincipal(req);
      const key = req.params.key ?? '';
      // Checked before anything else: this string is about to be concatenated into a storage path,
      // and `../` in a key is the one way this handler could be made to read another bucket.
      if (!KEY.test(key)) {
        res.status(400).json({ error: 'that is not an image key', remedy: 'open the screen again' });
        return;
      }

      switch (req.params.route) {
        case '/api/images/report/:reportId/:key': {
          // The rule is asked, not re-implemented. Each of these authorises for itself — a
          // Resident reaching the moderation branch would be refused by `review`, and this switch
          // is a routing decision rather than the access check.
          const reportId = req.params.reportId ?? '';
          const visible =
            principal.role === Role.OperationsManager
              ? (await this.moderation.review(reportId, principal)).photos // 5.3.4
              : (await this.reports.publicView(reportId, principal)).photos; // 5.3.5
          if (!visible.some((photo) => photo.storageKey === key)) {
            res.status(404).json({
              error: 'that photograph is not part of this report',
              remedy: 'open the report again',
            });
            return;
          }
          await this.answer(res, REPORT_PHOTOS, key);
          return;
        }

        case '/api/images/completion-evidence/:key': {
          await this.ac.authorise(principal, 'workOrder:readAll', { kind: 'photo' });
          await this.answer(res, COMPLETION_EVIDENCE, key);
          return;
        }

        default:
          res.status(404).json({ error: 'no such route', remedy: 'check the path' });
      }
    } catch (error) {
      this.fail(res, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async answer(res: Response, bucket: string, key: string): Promise<void> {
    if (!(await this.storage.exists(bucket, key))) {
      // 404 rather than 403: the caller is authorised, and the honest answer is that the object is
      // not there. A photograph whose row outlived its bytes is a real state — the in-memory store
      // does not survive a restart — and a screen can say so instead of showing a broken image
      // icon with no explanation.
      res.status(404).json({ error: 'that photograph is no longer stored', remedy: 'it may have been removed' });
      return;
    }
    res.json({ url: await this.storage.signedUrl(bucket, key, TTL_SECONDS), expiresInSeconds: TTL_SECONDS });
  }
}
