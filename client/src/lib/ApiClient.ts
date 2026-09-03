/**
 * D-Fence — the client's single door to the server.
 * Stereotype: <<boundary>>. Traces: 2.3.6, 2.3.7, 10.5.3, 10.6.4, 11.4.3.
 *
 * One class, so that three things happen in one place rather than in thirty screens: the bearer
 * token is attached, a 403 sends the user to Not Authorised, and a failure becomes a `LoadState`
 * with a cause and a remedy instead of an exception a screen has to remember to catch.
 *
 * **The interface displays, it never decides.** A 403 here is not the client concluding the user
 * lacks permission — the server concluded that (2.3.6) — it is the client showing the answer.
 */
import { LoadState } from './LoadState';

export interface ApiFailure {
  status: number;
  error: string;
  remedy: string;
  /** 10.6.4 — quoted to the user so a support request can be matched to a log line. */
  correlationId: string | null;
}

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.error);
    this.name = 'ApiError';
  }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class ApiClient {
  private token: string | null = null;

  constructor(
    private readonly baseUrl = '',
    private readonly fetcher: Fetcher = globalThis.fetch?.bind(globalThis),
    /** Called on a 403 so the shell can route to Not Authorised (11.2.24). */
    private readonly onForbidden: () => void = () => undefined,
  ) {}

  /** 2.1.8 — the session token, held in memory only. */
  setToken(token: string | null): void {
    this.token = token;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token === null ? {} : { Authorization: `Bearer ${this.token}` }),
        },
      });
    } catch (cause) {
      // The network, not the server. 10.5.3 wants a cause and a remedy, and "check your
      // connection" is the only honest remedy here.
      throw new ApiError({
        status: 0,
        error: 'could not reach D-Fence',
        remedy: 'check your connection and try again',
        correlationId: null,
      });
    }

    if (response.status === 403) {
      this.onForbidden();
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Partial<ApiFailure>;
      throw new ApiError({
        status: response.status,
        error: body.error ?? 'the request could not be completed',
        remedy: body.remedy ?? 'try again shortly',
        correlationId: body.correlationId ?? null,
      });
    }
    return (await response.json()) as T;
  }

  /**
   * 11.4.1–11.4.3 — a fetch as a `LoadState`, so a screen renders one branch instead of juggling
   * a try/catch, a null and a boolean.
   *
   * `isEmpty` is the caller's, because emptiness is domain-specific: an empty priority table and
   * an empty report list say different things and deserve different sentences (11.4.2).
   */
  async load<T>(
    path: string,
    isEmpty: (value: T) => boolean = () => false,
    emptyMessage = 'There is nothing to show yet.',
  ): Promise<{ state: LoadState; value: T | null }> {
    try {
      const value = await this.get<T>(path);
      return isEmpty(value)
        ? { state: { kind: 'empty', message: emptyMessage }, value }
        : { state: { kind: 'ready' }, value };
    } catch (error) {
      const failure = error instanceof ApiError ? error.failure : null;
      return {
        state: {
          kind: 'error',
          cause: failure?.error ?? 'something went wrong',
          remedy: failure?.remedy ?? 'try again shortly',
        },
        value: null,
      };
    }
  }
}
