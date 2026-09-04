/**
 * D-Fence — Job Detail (REQUIREMENTS.md 11.2.20).
 * Stereotype: <<boundary>>. Traces: 11.2.20, 8.3.3, 8.3.4, 8.3.8, 8.3.9, 8.3.16, 8.4.1, 11.6.x.
 *
 * The crew member's four moves — accept, start, raise an issue, resume — each a request named for
 * the transition. Which of them are *offered* follows from the current status, but which of them
 * are *permitted* is the server's answer, and the two are kept apart deliberately: the buttons here
 * are a convenience, and a refusal (8.3.16) is rendered in full rather than treated as impossible.
 * A screen that only ever showed legal actions would fail silently the moment its idea of the state
 * machine drifted from `WorkOrderTransitionTable`.
 *
 * Raising an issue requires a reason (8.3.8): the reason is what the manager acts on, and an issue
 * with no reason stops the work without telling anyone why.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, required } from '../../components/FieldValidation';
import { link } from '../../components/Link';
import { WorkOrderStatus } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

interface JobPayload {
  workOrder: {
    id: string;
    clusterId: string;
    taskType: string;
    status: string;
    scheduledDate: string;
    priority: string;
    instructions: string;
    startedAt: string | null;
    issueFlag: boolean;
    issueReason: string | null;
  };
}

export function JobDetailScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const { state, value, retry } = useLoad<JobPayload>(props.api, `/api/crew/work-orders/${id}`);
  const [reason, setReason] = useState<FormField>(field());
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reasonRules = [required('Reason')];

  async function act(action: string, body: unknown = {}): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      await props.api.post(`/api/crew/work-orders/${id}/${action}`, body);
      retry();
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'that could not be done',
        // 8.3.16 — the server names the state the job is actually in. A crew member standing at a
        // roadside needs that, not "cannot start".
        remedy: f?.remedy ?? 'reload and try again',
      });
    } finally {
      setBusy(false);
    }
  }

  const job = value?.workOrder;
  const status = job?.status;

  return (
    <section data-screen="JobDetail" data-requirement="11.2.20">
      <a href="/crew" onClick={link(props, '/crew')}>
        Back to my jobs
      </a>

      <StateView state={state} onRetry={retry}>
        {job === undefined ? null : (
          <article>
            <h1>{job.taskType}</h1>
            <p data-part="status">{job.status}</p>
            <p data-part="scheduled">Scheduled {job.scheduledDate}</p>
            <p data-part="priority">{job.priority} priority</p>
            <p data-part="instructions">{job.instructions}</p>
            {job.startedAt === null ? null : (
              <p data-part="started">
                Started {new Date(job.startedAt).toISOString().slice(0, 16).replace('T', ' ')}
              </p>
            )}
            {job.issueFlag ? (
              <p role="status" data-part="issue">
                Issue raised: {job.issueReason ?? 'no reason recorded'}
              </p>
            ) : null}

            <div data-part="actions">
              {status === WorkOrderStatus.Assigned ? (
                <button type="button" disabled={busy} onClick={() => void act('accept')}>
                  Accept this job
                </button>
              ) : null}
              {status === WorkOrderStatus.Accepted ? (
                <button type="button" disabled={busy} onClick={() => void act('start')}>
                  Start work
                </button>
              ) : null}
              {status === WorkOrderStatus.InProgress ? (
                <a href={`/crew/jobs/${id}/complete`} onClick={link(props, `/crew/jobs/${id}/complete`)}>
                  Record completion
                </a>
              ) : null}
              {job.issueFlag ? (
                <button type="button" disabled={busy} onClick={() => void act('resume')}>
                  Resume work
                </button>
              ) : null}
            </div>

            <section data-part="issue-form">
              <h2>Blocked?</h2>
              <Field
                id="reason"
                label="What is stopping you?"
                multiline
                value={reason.value}
                touched={reason.touched}
                rules={reasonRules}
                hint="Your manager sees this and decides what happens next."
                onChange={(v) => setReason({ value: v, touched: reason.touched })}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReason((f) => ({ ...f, touched: true }));
                  // 8.3.8 — an issue with no reason stops the work and tells nobody why.
                  if (formIsValid([evaluate(reason.value, reasonRules)])) {
                    void act('issue', { reason: reason.value.trim() });
                  }
                }}
              >
                Raise an issue
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
    </section>
  );
}
