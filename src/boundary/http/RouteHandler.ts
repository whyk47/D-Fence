/**
 * D-Fence — base class for every HTTP route handler.
 * Stereotype: <<boundary>>. Traces: 2.3.6, 2.3.7, 10.3.3, 10.3.6, 10.5.3.
 *
 * Every concrete handler extends this, and authorise() is called before any control class runs.
 * Putting it in the base is how the design makes forgetting the check visible rather than silent.
 */
import { AccessControlService } from '../../control/AccessControlService';
import { Principal } from '../../control/Principal';

export type Request = { headers: Record<string, string>; params: Record<string, string>; body: unknown };
export type Response = { status(code: number): Response; json(body: unknown): void };
export type Schema = unknown;

export abstract class RouteHandler {
  constructor(protected readonly ac: AccessControlService) {}

  abstract handle(req: Request, res: Response): Promise<void>;

  /** Derived from the session, never from a client-supplied role claim. */
  protected principalOf(_req: Request): Principal {
    throw new Error('not implemented');
  }

  /** 10.3.6: validate and sanitise before anything downstream sees it. */
  protected validate<T>(_schema: Schema, _body: unknown): T {
    throw new Error('not implemented');
  }

  /** 10.5.3: every error states both cause and remedy. 2.3.7 refusals carry no detail. */
  protected fail(_res: Response, _error: Error): void {
    throw new Error('not implemented');
  }
}
