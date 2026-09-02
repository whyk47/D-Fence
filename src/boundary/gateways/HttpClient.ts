/**
 * D-Fence — outbound HTTP with retry and rate limiting.
 * Stereotype: <<infrastructure>>. Traces: 10.4.6 (published rate limits), 10.2.1.
 * One place, so that respecting a rate limit is not five separate acts of discipline.
 */
export type RequestOptions = { headers?: Record<string, string>; timeoutMs?: number };

export class HttpClient {
  get(_url: string, _opts: RequestOptions = {}): Promise<Response> {
    throw new Error('not implemented');
  }

  post(_url: string, _body: unknown, _opts: RequestOptions = {}): Promise<Response> {
    throw new Error('not implemented');
  }

  /** Exponential backoff. A failed source must degrade, not crash (10.2.1). */
  private withRetry(_fn: () => Promise<Response>, _attempts: number): Promise<Response> {
    throw new Error('not implemented');
  }

  /** Per-host token bucket. 10.4.6. */
  private withRateLimit(_key: string): Promise<void> {
    throw new Error('not implemented');
  }
}
