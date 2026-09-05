/**
 * D-Fence — Moderation Queue (REQUIREMENTS.md 11.2.14).
 * Stereotype: <<boundary>>. Traces: 11.2.14, 5.3.1–5.3.5, 2.3.4, 11.4.2.
 *
 * Oldest first (5.3.1), because the queue's failure mode is not being long — it is being long in
 * one corner while the rest is worked. `waitingHours` is shown on every row for the same reason: a
 * queue of forty is fine; a queue of forty where the oldest has waited nine days is not, and only
 * the second number says so.
 *
 * Both filters are query parameters handed to the server. Filtering in the browser would mean
 * shipping every pending report — photographs included — to a client that 5.3.5 says must not
 * have them, and then relying on the interface to hide them.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { Freshness, QUEUE_REFRESH_MS, StateView } from '../../components/States';
import { link } from '../../components/Link';
import { ReportType } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

interface QueuePayload {
  queue: Array<{
    reportId: string;
    type: string;
    description: string;
    localityBinding: string;
    clusterId: string | null;
    corroborationCount: number;
    submittedAt: string;
    photoCount: number;
    waitingHours: number;
  }>;
}

export function ModerationQueueScreen(props: ScreenProps): JSX.Element {
  const [type, setType] = useState<string>('');
  const path = type === '' ? '/api/ops/moderation' : `/api/ops/moderation?type=${encodeURIComponent(type)}`;
  const { state, value, retry, lastLoadedAt } = useLoad<QueuePayload>(props.api, path, {
    isEmpty: (v) => v.queue.length === 0,
    emptyMessage: 'Nothing is waiting for review.',
    // 5.2.x — residents file reports continuously and this is the screen that answers them. A
    // queue that only changes when the manager reloads understates how much is waiting, which is
    // precisely the number the screen exists to report.
    refreshMs: QUEUE_REFRESH_MS,
  });

  return (
    <section data-screen="ModQueue" data-requirement="11.2.14">
      <h1>Moderation</h1>
      <Freshness at={lastLoadedAt} everyMs={QUEUE_REFRESH_MS} onRefresh={retry} />

      <label htmlFor="type-filter">Filter by type</label>
      <select id="type-filter" value={type} onChange={(event) => setType(event.target.value)}>
        <option value="">All types</option>
        {Object.values(ReportType).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <StateView state={state} onRetry={retry}>
        <ol data-part="queue">
          {(value?.queue ?? []).map((row) => (
            <li key={row.reportId}>
              <a href={`/ops/moderation/${row.reportId}`} onClick={link(props, `/ops/moderation/${row.reportId}`)}>
                {row.type} — {row.localityBinding}
              </a>
              <p data-part="description">{row.description}</p>
              {/* The number that makes a stale corner of the queue visible (5.3.1). */}
              <p data-part="waiting">
                Waiting {row.waitingHours < 24
                  ? `${Math.round(row.waitingHours)} hour(s)`
                  : `${Math.floor(row.waitingHours / 24)} day(s)`}
              </p>
              <p data-part="meta">
                {row.photoCount} photograph(s)
                {row.corroborationCount > 0 ? `, ${row.corroborationCount} corroboration(s)` : ''}
                {row.clusterId === null ? ', outside every cluster' : ''}
              </p>
            </li>
          ))}
        </ol>
      </StateView>
    </section>
  );
}
