/**
 * D-Fence — Job Completion (REQUIREMENTS.md 11.2.21).
 * Stereotype: <<boundary>>. Traces: 11.2.21, 8.3.6, 8.3.7, 8.3.10, 8.3.16, 11.5.x, 11.6.x, 10.5.3.
 *
 * 8.3.10 requires at least one photograph, and the submit button says so before it is pressed
 * rather than after. This is the screen used standing in a drain in the rain, on a phone, and a
 * form that accepted the notes and then refused for a reason it knew about from the start is the
 * form that costs someone a second trip.
 *
 * The task performed is **not** a field. The server takes it from the work order (8.3.7), so a
 * crew member cannot record having done something nobody asked for. Showing it read-only here says
 * what is being recorded without inviting a change that would be ignored.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, maxLength, required } from '../../components/FieldValidation';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

const NOTES_MAX = 500;

interface JobPayload {
  workOrder: { id: string; taskType: string; status: string; instructions: string };
}

export function JobCompletionScreen(props: ScreenProps): JSX.Element {
  const id = props.params['id'] ?? '';
  const { state, value, retry } = useLoad<JobPayload>(props.api, `/api/crew/work-orders/${id}`);
  const [notes, setNotes] = useState<FormField>(field());
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const notesRules = [required('Notes'), maxLength(NOTES_MAX, '8.3.6')];
  // 8.3.10 — at least one photograph. Held as a form rule so the reason is stated in one place.
  const hasPhoto = photoKeys.length > 0;
  const valid = formIsValid([evaluate(notes.value, notesRules)]) && hasPhoto;

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setNotes((f) => ({ ...f, touched: true }));
    if (!valid || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await props.api.post(`/api/crew/work-orders/${id}/complete`, {
        notes: notes.value.trim(),
        photoKeys,
      });
      props.onNavigate(`/crew/jobs/${id}`);
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'the completion could not be recorded',
        remedy: f?.remedy ?? 'check the details and try again',
      });
    } finally {
      setBusy(false);
    }
  }

  const job = value?.workOrder;

  return (
    <section data-screen="JobCompletion" data-requirement="11.2.21">
      <a href={`/crew/jobs/${id}`} onClick={link(props, `/crew/jobs/${id}`)}>
        Back to the job
      </a>

      <StateView state={state} onRetry={retry}>
        {job === undefined ? null : (
          <form onSubmit={submit} noValidate>
            <h1>Record completion</h1>
            {/* 8.3.7 — read-only: the server takes this from the order, not from the request. */}
            <p data-part="task">Task performed: {job.taskType}</p>

            <Field
              id="notes"
              label="What did you do?"
              multiline
              value={notes.value}
              touched={notes.touched}
              rules={notesRules}
              max={NOTES_MAX}
              onChange={(v) => setNotes({ value: v, touched: notes.touched })}
            />

            <fieldset data-part="photos">
              <legend>Photographs</legend>
              {/* Stated before the button is pressed, not discovered by pressing it. */}
              <p data-part="requirement">At least one photograph is required.</p>
              <label htmlFor="photo">Add a photograph</label>
              <input
                id="photo"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) {
                    setPhotoKeys([...photoKeys, file.name]);
                  }
                }}
              />
              <ul>
                {photoKeys.map((key, index) => (
                  <li key={key}>
                    {key}
                    <button type="button" onClick={() => setPhotoKeys(photoKeys.filter((_, i) => i !== index))}>
                      Remove {key}
                    </button>
                  </li>
                ))}
              </ul>
              {!hasPhoto ? (
                <p role="status" data-part="photo-missing">
                  Add a photograph before submitting.
                </p>
              ) : null}
            </fieldset>

            {failure === null ? null : (
              <div role="alert" data-part="error">
                <p>{failure.cause}</p>
                <p>{failure.remedy}</p>
              </div>
            )}

            <button type="submit" disabled={busy}>
              {busy ? 'Recording…' : 'Submit completion'}
            </button>
          </form>
        )}
      </StateView>
    </section>
  );
}
