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
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { WorkOrderStatus } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

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
  const { state, value, retry } = useLoad<ListPayload>(props.api, path, {
    isEmpty: (v) => v.workOrders.length === 0,
    emptyMessage: 'No work orders match. Raise one from the dispatch list or from a cluster.',
  });

  return (
    <section data-screen="WOList" data-requirement="11.2.25">
      <h1>Work orders</h1>
      <a href="/ops/work-orders/new" onClick={link(props, '/ops/work-orders/new')}>
        New work order
      </a>

      <label htmlFor="status-filter">Filter by status</label>
      <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All statuses</option>
        {Object.values(WorkOrderStatus).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

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
                <td>{order.assigneeId ?? 'unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </StateView>
    </section>
  );
}
