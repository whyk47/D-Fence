/**
 * D-Fence — outbound HTTP with retry and rate limiting.
 * Stereotype: <<infrastructure>>. Traces: 10.2.1, 10.4.6 (published rate limits), 1.1.11.
 * One place, so that respecting a rate limit is not five separate acts of discipline.
 */
export type RequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** 1.1.11 allows three retries; other callers get one attempt unless they ask for more. */
  attempts?: number;
};

export class HttpClient {
  /**
   * @param minIntervalMs minimum spacing between requests to the same host. 10.4.6 obliges us to
   *   respect published limits; data.gov.sg publishes none, so this is politeness with a number.
   * @param backoffBaseMs first retry delay; doubles per attempt. Injectable so tests do not sleep.
   */
  constructor(
    private readonly minIntervalMs = 200,
    private readonly backoffBaseMs = 500,
  ) {}

  private readonly lastRequestAt = new Map<string, number>();

  async get(url: string, opts: RequestOptions = {}): Promise<Response> {
    return this.send(url, { method: 'GET', headers: opts.headers }, opts);
  }

  async post(url: string, body: unknown, opts: RequestOptions = {}): Promise<Response> {
    return this.send(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
        body: JSON.stringify(body),
      },
      opts,
    );
  }

  /** Convenience for the JSON APIs; throws on a non-2xx so a caller cannot parse an error page. */
  async getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.get(url, opts);
    if (!res.ok) {
      throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  private async send(url: string, init: RequestInit, opts: RequestOptions): Promise<Response> {
    await this.withRateLimit(new URL(url).host);
    return this.withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }, opts.attempts ?? 1);
  }

  /**
   * Exponential backoff. A failed source must degrade, not crash (10.2.1).
   *
   * A 4xx is not retried: the request is wrong and repeating it wastes the source's quota and our
   * cycle. Only transport failures and 5xx get another attempt.
   */
  private async withRetry(fn: () => Promise<Response>, attempts: number): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
      try {
        const res = await fn();
        if (res.status < 500 || attempt === attempts - 1) {
          return res;
        }
        lastError = new Error(`upstream ${res.status}`);
      } catch (error) {
        lastError = error;
      }
      await HttpClient.sleep(this.backoffBaseMs * 2 ** attempt);
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Per-host spacing. 10.4.6. */
  private async withRateLimit(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host);
    const now = Date.now();
    if (last !== undefined) {
      const wait = this.minIntervalMs - (now - last);
      if (wait > 0) {
        await HttpClient.sleep(wait);
      }
    }
    this.lastRequestAt.set(host, Date.now());
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
