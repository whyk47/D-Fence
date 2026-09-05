/**
 * @vitest-environment jsdom
 *
 * D-Fence — Lab 4: shared queues refresh themselves (§8.2.1, §8.3.x, §5.2.x, §10.5.7).
 *
 * The independent review's item 10: `setInterval`, `EventSource` and `WebSocket` all appeared zero
 * times in the bundle, so one user's action was invisible to another until a manual reload — and
 * reloading signed them out. Multi-user interaction is the axis the project is strongest on and it
 * could only be demonstrated by pressing F5 on two laptops.
 *
 * **What is worth testing here is not that a timer fires.** It is the four ways a poll makes a
 * screen worse than not polling at all, each of which was a deliberate decision in `useLoad`:
 *
 *   P2  it must not flash the loading state, or a queue on a 20 s poll blanks itself while it is
 *       being read;
 *   P3  it must not replace good data with an error when one tick fails;
 *   P4  it must not poll a hidden tab, which is where a crew member's phone spends its day;
 *   P6  it must not stack requests when one takes longer than the interval.
 *
 * Fake timers throughout, so the suite does not spend twenty real seconds proving anything.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { ApiClient, Fetcher } from '../client/src/lib/ApiClient';
import { useLoad } from '../client/src/lib/useLoad';
import { StateView, QUEUE_REFRESH_MS } from '../client/src/components/States';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

interface Payload {
  items: string[];
}

/** A screen reduced to the part under test: one polled list. */
function Queue(props: { api: ApiClient; refreshMs?: number }): JSX.Element {
  const { state, value, retry, lastLoadedAt } = useLoad<Payload>(props.api, '/api/queue', {
    isEmpty: (v) => v.items.length === 0,
    emptyMessage: 'Nothing is waiting.',
    ...(props.refreshMs === undefined ? {} : { refreshMs: props.refreshMs }),
  });
  return (
    <section>
      <span data-testid="loaded-at">{lastLoadedAt === null ? 'never' : 'loaded'}</span>
      <StateView state={state} onRetry={retry}>
        <ul>
          {(value?.items ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </StateView>
    </section>
  );
}

/** Answers each call from the queue of responses, repeating the last one once exhausted. */
function scripted(responses: Array<{ status?: number; body: unknown }>): {
  api: ApiClient;
  count: () => number;
} {
  let index = 0;
  let calls = 0;
  const fetcher: Fetcher = async () => {
    calls += 1;
    const entry = responses[Math.min(index++, responses.length - 1)] as {
      status?: number;
      body: unknown;
    };
    const status = entry.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => entry.body } as Response;
  };
  return { api: new ApiClient('', fetcher), count: () => calls };
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('Shared queues refresh themselves — §8.2.1, §8.3.x, §10.5.7', () => {
  it('P1 — a new row appears without the user doing anything', async () => {
    const { api } = scripted([{ body: { items: ['job-1'] } }, { body: { items: ['job-1', 'job-2'] } }]);
    render(<Queue api={api} refreshMs={20_000} />);
    await waitFor(() => expect(screen.getByText('job-1')).toBeTruthy());
    expect(screen.queryByText('job-2')).toBeNull();

    // The manager assigns job-2 from their own session. The crew member touches nothing.
    await tick(20_000);
    await waitFor(() => expect(screen.getByText('job-2')).toBeTruthy());
  });

  it('P2 — a refresh never blanks the list it is refreshing', async () => {
    const { api } = scripted([{ body: { items: ['job-1'] } }, { body: { items: ['job-1'] } }]);
    render(<Queue api={api} refreshMs={20_000} />);
    await waitFor(() => expect(screen.getByText('job-1')).toBeTruthy());

    await tick(20_000);
    // Routing the poll through the initial effect would set `loading` on every tick, so a queue
    // would vanish and return three times a minute under the reader's eyes.
    expect(document.querySelector('[data-state="loading"]')).toBeNull();
    expect(screen.getByText('job-1')).toBeTruthy();
  });

  it('P3 — one failed tick is discarded rather than shown', async () => {
    const { api } = scripted([
      { body: { items: ['job-1'] } },
      { status: 500, body: { error: 'upstream', remedy: 'try again' } },
      { body: { items: ['job-1', 'job-2'] } },
    ]);
    render(<Queue api={api} refreshMs={20_000} />);
    await waitFor(() => expect(screen.getByText('job-1')).toBeTruthy());

    await tick(20_000);
    // Replacing a working queue with an error page over one dropped request is strictly worse
    // than the stale row it was trying to correct.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('job-1')).toBeTruthy();

    // And it recovers on the next tick without the user intervening.
    await tick(20_000);
    await waitFor(() => expect(screen.getByText('job-2')).toBeTruthy());
  });

  it('P4 — a hidden tab is not polled', async () => {
    const { api, count } = scripted([{ body: { items: ['job-1'] } }]);
    render(<Queue api={api} refreshMs={20_000} />);
    await waitFor(() => expect(screen.getByText('job-1')).toBeTruthy());
    const afterFirstLoad = count();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await tick(60_000);
    // A phone in a pocket is the normal state of a crew member's device. Three minutes of polling
    // it spends their battery on frames nobody sees.
    expect(count()).toBe(afterFirstLoad);
  });

  it('P5 — returning to the tab refreshes at once rather than waiting out the interval', async () => {
    const { api, count } = scripted([{ body: { items: ['job-1'] } }, { body: { items: ['job-1', 'job-2'] } }]);
    render(<Queue api={api} refreshMs={20_000} />);
    await waitFor(() => expect(screen.getByText('job-1')).toBeTruthy());

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await tick(60_000);
    const whileHidden = count();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    // The moment the user looks back at the screen is exactly when a stale row matters.
    await waitFor(() => expect(count()).toBe(whileHidden + 1));
    await waitFor(() => expect(screen.getByText('job-2')).toBeTruthy());
  });

  it('P6 — a slow request does not let ticks stack up behind it', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetcher: Fetcher = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 100_000));
      inFlight -= 1;
      return { ok: true, status: 200, json: async () => ({ items: ['job-1'] }) } as Response;
    };
    render(<Queue api={new ApiClient('', fetcher)} refreshMs={20_000} />);

    // Five intervals inside one response. Without the in-flight guard this is five concurrent
    // requests, then ten, until the queue of them outruns the tab.
    await tick(100_000);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('P7 — a screen with no refreshMs is loaded exactly once', async () => {
    const { api, count } = scripted([{ body: { items: ['job-1'] } }]);
    render(<Queue api={api} />);
    await waitFor(() => expect(screen.getByText('job-1')).toBeTruthy());
    const once = count();

    await tick(120_000);
    // A form or a detail view must not poll. Making the poll opt-in is what keeps that true.
    expect(count()).toBe(once);
  });

  it('P8 — the interval is one shared decision, not three numbers in three files', () => {
    // Twenty seconds, chosen against the §10.1 budget. Asserted so that changing it is a change to
    // the named constant rather than to whichever screen someone happened to open.
    expect(QUEUE_REFRESH_MS).toBe(20_000);
  });
});
