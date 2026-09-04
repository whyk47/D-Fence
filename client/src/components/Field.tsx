/**
 * D-Fence — the form field.
 * Stereotype: <<boundary>>. Traces: 11.5.1–11.5.7, 10.5.3, 11.7.2, 11.7.5.
 *
 * US-10.2: "field validation and character counting are handled by the field component, not per
 * screen". This is that component. The rules themselves stay in `FieldValidation` as pure
 * functions — this file owns only how a rule's verdict is *shown*.
 *
 * Two accessibility obligations are met here rather than in each screen, which is the whole point
 * of there being one field:
 *   - 11.7.2 — every input has a real `<label>` bound by `htmlFor`, not a placeholder pretending
 *     to be one. A placeholder vanishes the moment the user types, which is exactly when a
 *     screen-reader user needs it.
 *   - 11.7.5 — an error is never signalled by colour alone. It is text, in `role="alert"`, and
 *     `aria-invalid` marks the input itself.
 */
import { FieldRule, FieldState, evaluate } from './FieldValidation';

export interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rules?: FieldRule[];
  /** 11.5.2 — when set, an `n / max` counter is shown beneath the field. */
  max?: number;
  type?: 'text' | 'email' | 'password' | 'number' | 'date';
  /** Renders a `<textarea>` instead of an `<input>`. */
  multiline?: boolean;
  /**
   * 11.5.3 — validate only after the user has left the field once.
   *
   * Marking a field invalid while it is still being typed into tells someone their half-written
   * email address is wrong, which it is, because they are half way through writing it.
   */
  touched?: boolean;
  hint?: string;
}

export function Field(props: FieldProps): JSX.Element {
  const state = evaluate(props.value, props.rules ?? [], props.max ?? null);
  const showError = (props.touched ?? true) && state.error !== null;
  const errorId = `${props.id}-error`;
  const hintId = `${props.id}-hint`;

  const shared = {
    id: props.id,
    value: props.value,
    'aria-invalid': showError,
    'aria-describedby': [props.hint === undefined ? null : hintId, showError ? errorId : null]
      .filter((v) => v !== null)
      .join(' ')
      .trim() || undefined,
    onChange: (event: { target: { value: string } }) => props.onChange(event.target.value),
  };

  return (
    <div data-component="field" data-field={props.id}>
      {/* 11.7.2 — a label element, always, even where a design would show none. */}
      <label htmlFor={props.id}>{props.label}</label>
      {props.multiline === true ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input {...shared} type={props.type ?? 'text'} />
      )}
      {props.hint === undefined ? null : (
        <p id={hintId} data-part="hint">
          {props.hint}
        </p>
      )}
      {/* 11.5.2 — the counter is shown from the first keystroke, not only once the limit is
          passed. A counter that appears at the moment of failure is a warning, not a guide. */}
      {state.count === null ? null : (
        <p data-part="count" aria-live="polite">
          {state.count.used} / {state.count.max}
        </p>
      )}
      {showError ? (
        <p id={errorId} role="alert" data-part="error">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The state a form keeps per field: its value and whether it has been left once (11.5.3).
 *
 * Kept as a plain shape rather than a hook so a screen can hold several in one `useState` object
 * and a test can construct one without rendering anything.
 */
export interface FormField {
  value: string;
  touched: boolean;
}

export function field(value = ''): FormField {
  return { value, touched: false };
}

/** 11.5.7 — the submit gate. Every rule is re-run, including on fields never touched. */
export function formErrors(entries: Array<{ value: string; rules: FieldRule[]; max?: number }>): FieldState[] {
  return entries.map((e) => evaluate(e.value, e.rules, e.max ?? null));
}
