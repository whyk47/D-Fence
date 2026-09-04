/**
 * D-Fence — My Jobs (REQUIREMENTS.md 11.2.19).
 * Stereotype: <<boundary>>. Traces: 11.2.19, 8.4.1, 8.4.2, 8.4.6, 2.3.5, 11.4.2, 11.6.x.
 *
 * A crew member's own work, and nothing else. The filter is sent to the server rather than applied
 * here (8.4.1): filtering in the browser would mean every crew's assignments were shipped to the
 * device and hidden by the interface, which is precisely the arrangement 2.3.6 says may never be
 * the enforcement point.
 *
 * Today first, then by priority within a date — 8.4.2's order, produced by the controller. This
 * screen re-sorts nothing; a second sort here would silently win over the one the requirement
 * names, and the two would drift.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface JobsPayload {
  filter: string;
  workOrders: Array<{
    id: string;
    taskType: string;
    status: string;
    scheduledDate: string;
    priority: string;
    issueFlag: boolean;
  }>;
}

const FILTERS = ['Today', 'Upcoming', 'Completed', 'All'] as const;

export function MyJobsScreen(props: ScreenProps): JSX.Element {
  const [filter, setFilter] = useState<string>('Today');
  const { state, value, retry } = useLoad<JobsPayload>(props.api, `/api/crew/work-orders?filter=${filter}`, {
    isEmpty: (v) => v.workOrders.length === 0,
    emptyMessage: 'Nothing here. Check Upcoming, or ask your manager if you expected work today.',
  });

  return (
    <section data-screen="MyJobs" data-requirement="11.2.19">
      <h1>My jobs</h1>

      {/* 11.6.x — large, separate controls rather than a dropdown: this screen is used one-handed,
          outdoors, on a phone. */}
      <div role="group" aria-label="Filter">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <StateView state={state} onRetry={retry}>
        <ol data-part="jobs">
          {/* Rendered in the order the server returned (8.4.2). */}
          {(value?.workOrders ?? []).map((job) => (
            <li key={job.id} data-status={job.status} data-priority={job.priority}>
              <a href={`/crew/jobs/${job.id}`} onClick={link(props, `/crew/jobs/${job.id}`)}>
                {job.taskType}
              </a>
              <p data-part="scheduled">{job.scheduledDate}</p>
              <p data-part="status">
                {job.status}
                {job.issueFlag ? ' — issue raised' : ''}
              </p>
              <p data-part="priority">{job.priority} priority</p>
            </li>
          ))}
        </ol>
      </StateView>
    </section>
  );
}
