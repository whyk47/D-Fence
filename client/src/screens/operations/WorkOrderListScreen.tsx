/**
 * D-Fence — Work Order List (REQUIREMENTS.md 11.2.25).
 * Stereotype: <<boundary>>. Traces: 11.2.25, 8.2.x, 8.3.14, 2.3.4, 11.4.2.
 *
 * Every work order, terminal ones included — which is why this reads the manager endpoint rather
 * than the crew one. The two answer different questions: a crew member's list is "what is assigned
 * to me", a manager's is "what is the state of the work". Cancelled and verified orders belong in
 * the second and not the first.
 *
 * Both filters are query parameters, so the server does the filtering. That matters less here than
 * on the moderation queue, but keeping the convention means there is one place where "which orders
 * may this person see" is decided.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { Freshness, QUEUE_REFRESH_MS, StateView } from '../../components/States';
import { link } from '../../components/Link';
import { WorkOrderStatus } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

/** 11.2.22 — the crew accounts a manager may assign to, used here only to put a name to an id. */
interface CrewPayload {
  crew: Array<{ accountId: string; email: string }>;
}

interface ListPayload {
  workOrders: Array<{
    id: string;
    clusterId: string;
    assigneeId: string | null;
    taskType: string;
    status: string;
    scheduledDate: string;
    priority: string;
    issueFlag: boolean;
  }>;
}

export function WorkOrderListScreen(props: ScreenProps): JSX.Element {
  const [status, setStatus] = useState('');
  const path = status === '' ? '/api/ops/work-orders' : `/api/ops/work-orders?status=${encodeURIComponent(status)}`;
  const { state, value, retry, lastLoadedAt } = useLoad<ListPayload>(props.api, path, {
    isEmpty: (v) => v.workOrders.length === 0,
    emptyMessage: 'No work orders match. Raise one from the dispatch list or from a cluster.',
    // 8.3.x — the crew move orders through the state table from their own devices. Without the
    // poll a manager watching this list sees Assigned long after the job was completed, and the
    // first they learn of it is when they go looking for something to verify.
    refreshMs: QUEUE_REFRESH_MS,
  });

  /*
   * The Assigned column read `assigneeId`, so a manager scanning this list was shown a column of
   * raw UUIDs — "282c0058-ce23-4556-a2f3-033aa2938f49" — which answers the question "is it
   * assigned" and nothing else. The crew roster is a list the manager is already authorised for
   * and already loads on the dispatch screen, so it is read here too and used to put an address
   * against the id.
   *
   * Not polled: a crew roster changes when someone is hired, and the id is still shown when the
   * lookup misses, so a stale roster degrades to exactly the previous behaviour rather than to a
   * blank cell.
   */
  const roster = useLoad<CrewPayload>(props.api, '/api/ops/staff/crew');
  const crewById = new Map((roster.value?.crew ?? []).map((member) => [member.accountId, member.email]));

  return (
    <section data-screen="WOList" data-requirement="11.2.25">
      <h1>Work orders</h1>
      <Freshness at={lastLoadedAt} everyMs={QUEUE_REFRESH_MS} onRefresh={retry} />
      {/* The action and the filter were adjacent inline elements with no separator, so they ran
          together as "New work orderFilter by status". They are now a toolbar row. */}
      <div data-part="toolbar">
        <a href="/ops/work-orders/new" data-variant="primary" onClick={link(props, '/ops/work-orders/new')}>
          New work order
        </a>

        <div data-component="field" data-part="filter">
          <label htmlFor="status-filter">Filter by status</label>
          <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {Object.values(WorkOrderStatus).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <StateView state={state} onRetry={retry}>
        <table>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Status</th>
              <th scope="col">Scheduled</th>
              <th scope="col">Priority</th>
              <th scope="col">Assigned</th>
            </tr>
          </thead>
          <tbody>
            {(value?.workOrders ?? []).map((order) => (
              <tr key={order.id} data-status={order.status} data-issue={order.issueFlag}>
                <td>
                  <a href={`/ops/work-orders/${order.id}`} onClick={link(props, `/ops/work-orders/${order.id}`)}>
                    {order.taskType}
                  </a>
                </td>
                <td>
                  {order.status}
                  {/* 8.3.8 — a raised issue is the thing a manager most needs to spot in a list,
                      so it is words in the status cell rather than a marker beside the row. */}
                  {order.issueFlag ? ' — issue raised' : ''}
                </td>
                <td>{order.scheduledDate}</td>
                <td>{order.priority}</td>
                <td>
                  {order.assigneeId === null
                    ? 'unassigned'
                    : crewById.get(order.assigneeId) ?? order.assigneeId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StateView>
    </section>
  );
}
