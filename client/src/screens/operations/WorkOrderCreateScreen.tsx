/**
 * D-Fence — Work Order Create (REQUIREMENTS.md 11.2.17).
 * Stereotype: <<boundary>>. Traces: 11.2.17, 8.1.1–8.1.6, 8.1.11, 8.1.12, 11.5.x, 10.5.3.
 *
 * 8.1.12 is the requirement that shapes this screen. A duplicate is refused because an open work
 * order of the same type already exists on that cluster, and the server hands back **that order**
 * rather than only refusing. The manager's next action is to open it, so the refusal renders as a
 * link to it — a 409 that said "duplicate" and stopped would send them to search a list for
 * something the system already had in its hand.
 *
 * The form is pre-fillable from the query string, which is how the dispatch proposal and the
 * cluster detail hand a suggestion over (8.1.8) without either of them creating anything.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, maxLength, required } from '../../components/FieldValidation';
import { link } from '../../components/Link';
import { TaskType } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

const INSTRUCTIONS_MAX = 500;

interface Duplicate {
  id: string;
  taskType: string;
  status: string;
  scheduledDate: string;
}

export function WorkOrderCreateScreen(props: ScreenProps): JSX.Element {
  const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const [clusterId, setClusterId] = useState<FormField>(field(query.get('clusterId') ?? ''));
  const [taskType, setTaskType] = useState<string>(query.get('taskType') ?? TaskType.Fogging);
  const [scheduledDate, setScheduledDate] = useState<FormField>(field(query.get('date') ?? ''));
  const [instructions, setInstructions] = useState<FormField>(field());
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [busy, setBusy] = useState(false);

  const clusterRules = [required('Cluster')];
  const dateRules = [required('Scheduled date')];
  const instructionRules = [maxLength(INSTRUCTIONS_MAX, '8.1.5')];
  const valid = formIsValid([
    evaluate(clusterId.value, clusterRules),
    evaluate(scheduledDate.value, dateRules),
    evaluate(instructions.value, instructionRules),
  ]);

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setClusterId((f) => ({ ...f, touched: true }));
    setScheduledDate((f) => ({ ...f, touched: true }));
    if (!valid || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    setDuplicate(null);
    try {
      const created = await props.api.post<{ id: string }>('/api/ops/work-orders', {
        clusterId: clusterId.value.trim(),
        taskType,
        scheduledDate: scheduledDate.value,
        instructions: instructions.value.trim(),
        ...(query.get('sourceReportId') === null ? {} : { sourceReportId: query.get('sourceReportId') }),
      });
      props.onNavigate(`/ops/work-orders/${created.id}`);
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      // 8.1.12 — the blocking order travels with the refusal, so offer it rather than describe it.
      const existing = f?.body.existing as Duplicate | undefined;
      if (f?.status === 409 && existing !== undefined) {
        setDuplicate(existing);
      }
      setFailure({
        cause: f?.error ?? 'the work order could not be created',
        remedy: f?.remedy ?? 'correct the details and try again',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-screen="WOCreate" data-requirement="11.2.17">
      <h1>New work order</h1>
      <form onSubmit={submit} noValidate>
        <Field
          id="clusterId"
          label="Cluster"
          value={clusterId.value}
          touched={clusterId.touched}
          rules={clusterRules}
          hint="Pre-filled when you arrive from the dispatch list or a cluster."
          onChange={(v) => setClusterId({ value: v, touched: clusterId.touched })}
        />

        <label htmlFor="taskType">Task</label>
        <select id="taskType" value={taskType} onChange={(event) => setTaskType(event.target.value)}>
          {Object.values(TaskType).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <Field
          id="scheduledDate"
          label="Scheduled date"
          type="date"
          value={scheduledDate.value}
          touched={scheduledDate.touched}
          rules={dateRules}
          onChange={(v) => setScheduledDate({ value: v, touched: scheduledDate.touched })}
        />

        <Field
          id="instructions"
          label="Instructions for the crew"
          multiline
          value={instructions.value}
          touched={instructions.touched}
          rules={instructionRules}
          max={INSTRUCTIONS_MAX}
          onChange={(v) => setInstructions({ value: v, touched: instructions.touched })}
        />

        {failure === null ? null : (
          <div role="alert" data-part="error">
            <p>{failure.cause}</p>
            <p>{failure.remedy}</p>
            {duplicate === null ? null : (
              <p data-part="duplicate">
                <a
                  href={`/ops/work-orders/${duplicate.id}`}
                  onClick={link(props, `/ops/work-orders/${duplicate.id}`)}
                >
                  Open the existing {duplicate.taskType} order ({duplicate.status}, scheduled{' '}
                  {duplicate.scheduledDate})
                </a>
              </p>
            )}
          </div>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create work order'}
        </button>
      </form>
    </section>
  );
}
