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
 *
 * **The history comes from the audit trail (2.4.1), not from the work order.** The entity keeps no
 * second copy of who moved it, deliberately: two records of the same fact eventually disagree, and
 * only one of them is the one that may not be edited. `WorkOrderRoutes` has documented that
 * decision since §8 was built, and until 2026-09-05 the endpoint it named did not exist — so the
 * screen showed a status with no account of how it got there.
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

interface HistoryPayload {
  entries: Array<{
    accountId: string;
    action: string;
    refused: boolean;
    targetEntity: string;
    targetId: string | null;
    occurredAt: string;
  }>;
}

interface CrewPayload {
  crew: Array<{ crewId: string; email: string; isActive: boolean; openWorkOrders: number }>;
}

export function WorkOrderDetailScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const detail = useLoad<DetailPayload>(props.api, `/api/ops/work-orders/${id}`);
  const crew = useLoad<CrewPayload>(props.api, '/api/ops/work-orders/crew-workload');
  const history = useLoad<HistoryPayload>(props.api, `/api/ops/work-orders/${id}/history`);

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
      // The action just taken is a row in the trail; re-reading it is how the manager sees that
      // their own decision was recorded, which is the only visible proof 2.4.1 is working.
      history.retry();
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

            {/*
              * 2.4.1 — who did what, and when. Rendered as a real list rather than a table: it is
              * read top to bottom, one line per event, and a table would promise columns worth
              * sorting by.
              */}
            <section data-part="history">
              <h2>History</h2>
              <StateView state={history.state} onRetry={history.retry}>
                {history.value == null ? null : history.value.entries.length === 0 ? (
                  // Not an error and not an empty-state apology: a work order raised a moment ago
                  // genuinely has no history yet.
                  <p data-part="history-empty">Nothing has been recorded against this job yet.</p>
                ) : (
                  <ol data-part="history-list">
                    {history.value.entries.map((entry) => (
                      <li key={`${entry.occurredAt}-${entry.action}`} data-refused={entry.refused}>
                        <span data-part="when">{new Date(entry.occurredAt).toLocaleString()}</span>{' '}
                        <span data-part="what">
                          {/* 2.3.8's refusals mean the opposite of the rest of the list, so they
                              say so in words rather than only in a colour or an attribute. */}
                          {entry.refused ? 'Refused: ' : ''}
                          {entry.action}
                        </span>{' '}
                        <span data-part="who">by {entry.accountId}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </StateView>
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
