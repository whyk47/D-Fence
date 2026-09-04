/**
 * D-Fence — Work Order Detail (REQUIREMENTS.md 11.2.18).
 * Stereotype: <<boundary>>. Traces: 11.2.18, 8.2.1, 8.2.5, 8.3.16, 8.3.19, 8.4.x, 11.4.6, 10.5.3.
 *
 * The manager's four actions — assign, cancel, verify a completion, reject one — each their own
 * request named for the transition. There is no "set status" control, because 8.3.x makes
 * `WorkOrderTransitionTable` the authority on what may move where, and a status dropdown on this
 * screen would quietly become a second one.
 *
 * The crew list shows each member's **open work-order count** (8.2.5) beside their name. Assigning
 * without it is assigning blind, and the count is the only thing on the screen that distinguishes
 * two otherwise identical names.
 *
 * A refused transition (8.3.16) is rendered with the state the order is actually in — "you cannot
 * verify this" is useless; "the work order is In Progress" tells the manager what to do next.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { ConfirmDialog, StateView } from '../../components/States';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, required } from '../../components/FieldValidation';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface DetailPayload {
  workOrder: {
    id: string;
    clusterId: string;
    assigneeId: string | null;
    taskType: string;
    status: string;
    scheduledDate: string;
    priority: string;
    instructions: string;
    issueFlag: boolean;
    issueReason: string | null;
    cancellationReason: string | null;
    verifiedAt: string | null;
  };
}

interface CrewPayload {
  crew: Array<{ crewId: string; email: string; isActive: boolean; openWorkOrders: number }>;
}

export function WorkOrderDetailScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const detail = useLoad<DetailPayload>(props.api, `/api/ops/work-orders/${id}`);
  const crew = useLoad<CrewPayload>(props.api, '/api/ops/work-orders/crew-workload');

  const [chosenCrew, setChosenCrew] = useState('');
  const [reason, setReason] = useState<FormField>(field());
  const [confirming, setConfirming] = useState<'cancel' | 'verify' | 'reject' | null>(null);
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reasonRules = [required('Reason')];

  async function act(action: string, body: unknown): Promise<void> {
    setConfirming(null);
    setBusy(true);
    setFailure(null);
    try {
      await props.api.post(`/api/ops/work-orders/${id}/${action}`, body);
      detail.retry();
      crew.retry();
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'that could not be done',
        // 8.3.16 — the server's remedy names the state the order is in; do not paraphrase it.
        remedy: f?.remedy ?? 'reload and try again',
      });
    } finally {
      setBusy(false);
    }
  }

  const order = detail.value?.workOrder;

  return (
    <section data-screen="WODetail" data-requirement="11.2.18">
      <a href="/ops/work-orders" onClick={link(props, '/ops/work-orders')}>
        Back to work orders
      </a>

      <StateView state={detail.state} onRetry={detail.retry}>
        {order === undefined ? null : (
          <article>
            <h1>{order.taskType}</h1>
            <p data-part="status">{order.status}</p>
            <p data-part="scheduled">Scheduled {order.scheduledDate}</p>
            <p data-part="priority">{order.priority}</p>
            <p data-part="instructions">{order.instructions}</p>
            <a href={`/ops/clusters/${order.clusterId}`} onClick={link(props, `/ops/clusters/${order.clusterId}`)}>
              View the cluster
            </a>

            {/* 8.3.8 — an issue raised by the crew is the reason this order stopped moving. */}
            {order.issueFlag ? (
              <p role="status" data-part="issue">
                Issue raised: {order.issueReason ?? 'no reason recorded'}
              </p>
            ) : null}
            {order.cancellationReason === null ? null : (
              <p data-part="cancelled">Cancelled: {order.cancellationReason}</p>
            )}
            {order.verifiedAt === null ? null : (
              <p data-part="verified">
                Verified {new Date(order.verifiedAt).toISOString().slice(0, 16).replace('T', ' ')}
              </p>
            )}

            <section data-part="assign">
              <h2>Assignment</h2>
              <p>{order.assigneeId === null ? 'Not assigned.' : `Assigned to ${order.assigneeId}.`}</p>
              <StateView state={crew.state} onRetry={crew.retry}>
                <label htmlFor="crew">Assign to</label>
                <select id="crew" value={chosenCrew} onChange={(event) => setChosenCrew(event.target.value)}>
                  <option value="">Choose a crew member</option>
                  {(crew.value?.crew ?? []).map((member) => (
                    // 8.2.5 — the load is on the option itself, where the choice is made.
                    <option key={member.crewId} value={member.crewId}>
                      {member.email} — {member.openWorkOrders} open
                      {member.isActive ? '' : ' (deactivated)'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || chosenCrew === ''}
                  onClick={() => void act('assign', { crewId: chosenCrew })}
                >
                  {order.assigneeId === null ? 'Assign' : 'Reassign'}
                </button>
              </StateView>
            </section>

            <section data-part="actions">
              <h2>Actions</h2>
              <Field
                id="reason"
                label="Reason"
                multiline
                value={reason.value}
                touched={reason.touched}
                rules={reasonRules}
                hint="Required to cancel or to reject a completion; ignored when verifying."
                onChange={(v) => setReason({ value: v, touched: reason.touched })}
              />
              <button type="button" disabled={busy} onClick={() => setConfirming('verify')}>
                Verify completion
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReason((f) => ({ ...f, touched: true }));
                  if (formIsValid([evaluate(reason.value, reasonRules)])) {
                    setConfirming('reject');
                  }
                }}
              >
                Reject completion
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReason((f) => ({ ...f, touched: true }));
                  // 8.3.19 — a cancellation without a reason is refused before it is sent.
                  if (formIsValid([evaluate(reason.value, reasonRules)])) {
                    setConfirming('cancel');
                  }
                }}
              >
                Cancel work order
              </button>
            </section>

            {failure === null ? null : (
              <div role="alert" data-part="error">
                <p>{failure.cause}</p>
                <p>{failure.remedy}</p>
              </div>
            )}
          </article>
        )}
      </StateView>

      {confirming === null ? null : (
        <ConfirmDialog
          title={
            confirming === 'verify'
              ? 'Verify this completion?'
              : confirming === 'reject'
                ? 'Reject this completion?'
                : 'Cancel this work order?'
          }
          body={
            confirming === 'verify'
              ? 'This records a treatment against the cluster, which lowers its priority in the next scoring cycle.'
              : confirming === 'reject'
                ? 'The crew member will be shown your reason and the work returns to them.'
                : 'The work order will be closed without being done. Your reason is recorded.'
          }
          confirmLabel={confirming === 'verify' ? 'Verify' : confirming === 'reject' ? 'Reject' : 'Cancel work order'}
          onConfirm={() =>
            void act(confirming, confirming === 'verify' ? {} : { reason: reason.value.trim() })
          }
          onDismiss={() => setConfirming(null)}
        />
      )}
    </section>
  );
}
