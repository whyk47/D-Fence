/**
 * D-Fence — base class for every HTTP route handler.
 * Stereotype: <<boundary>>. Traces: 2.3.6, 2.3.7, 10.3.3, 10.5.3, 10.6.4.
 *
 * Every concrete handler extends this, and authorise() runs before any control class does. Putting
 * it in the base is how the design makes forgetting the check visible rather than silent.
 */
import { randomUUID } from 'node:crypto';
import { AccessControlService, NotAuthorised } from '../../control/AccessControlService';
import { Principal } from '../../control/Principal';
import { Role } from '../../entity/enums';

export type Request = {
  headers: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
};

export type Response = {
  status(code: number): Response;
  json(body: unknown): void;
  text(body: string, contentType?: string): void;
};

export type Schema = (value: unknown) => boolean;

export abstract class RouteHandler {
  constructor(protected readonly ac: AccessControlService) {}

  abstract handle(req: Request, res: Response): Promise<void>;
  /** Paths this handler answers with GET. */
  abstract routes(): string[];

  /**
   * Paths this handler answers with POST. Empty for a read-only handler, which is most of them.
   *
   * Separate from `routes()` rather than a method/path pair per entry, because the split is the
   * thing worth being able to read at a glance: every path listed here changes state, and 10.3.6's
   * validation obligation applies to exactly those.
   */
  writeRoutes(): string[] {
    return [];
  }

  /**
   * Derived from the session, never from a client-supplied role claim.
   *
   * **Until sessions exist (E2), this reads a development header** and refuses to do so unless
   * `DFENCE_DEV_PRINCIPAL` is set. That is deliberate: a header-derived role is exactly the hole
   * 2.3.6 warns about, so it fails closed outside development rather than becoming the permanent
   * implementation by forgetting.
   */
  protected principalOf(req: Request): Principal {
    if (process.env.DFENCE_DEV_PRINCIPAL !== 'true') {
      throw new NotAuthorised();
    }
    const claimed = req.headers['x-dev-role'];
    const role = Object.values(Role).find((r) => r === claimed) ?? Role.Resident;
    return new Principal(req.headers['x-dev-account'] ?? 'dev', role, 'dev-session');
  }

  /** 10.3.6: validate and sanitise before anything downstream sees it. */
  protected validate<T>(schema: Schema, body: unknown): T {
    if (!schema(body)) {
      throw new Error('request body failed validation');
    }
    return body as T;
  }

  /**
   * 10.5.3: every error states both cause and remedy — except a refusal, which by 2.3.7 carries no
   * detail at all, because an informative refusal is an oracle for probing what exists.
   * 10.6.4: a correlation id on every error, so a user's report can be matched to a log line.
   */
  protected fail(res: Response, error: Error): void {
    const correlationId = randomUUID();
    if (error instanceof NotAuthorised) {
      res.status(403).json({ error: 'not authorised', correlationId });
      return;
    }
    console.error(`[${correlationId}] ${error.stack ?? error.message}`);
    res.status(500).json({
      error: 'the request could not be completed',
      remedy: 'retry; if it persists, quote the correlation id',
      correlationId,
    });
  }
}
