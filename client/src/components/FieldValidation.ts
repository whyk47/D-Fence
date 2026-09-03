/**
 * D-Fence — form-field validation, as data.
 * Traces: 11.5.1, 11.5.2, 11.5.3, 11.5.7, 10.5.3, 5.1.4, 3.1.7, 2.1.2, 2.1.3.
 *
 * The rules live here, not in the field component and not in each screen, for the reason US-10.2
 * gives: "field validation and character counting are handled by the field component, not per
 * screen". Keeping them as **pure functions** goes one step further — they are testable without a
 * DOM, and the same rule that validates the form is the one the server enforces, quoted from the
 * same requirement number.
 */

export interface FieldRule {
  /** @returns null when the value is acceptable, otherwise the message to show inline. */
  check: (value: string) => string | null;
  /** The requirement the rule comes from, rendered in a title attribute for the marker. */
  requirement: string;
}

export interface FieldState {
  value: string;
  /** 11.5.2 — shown as `n / max` beneath the field. Null when the field has no limit. */
  count: { used: number; max: number } | null;
  /** 11.5.1, 11.5.3 — the first failure, or null. */
  error: string | null;
}

export function required(what: string): FieldRule {
  return {
    requirement: '11.5.1',
    check: (value) => (value.trim() === '' ? `${what} is required` : null),
  };
}

/** 5.1.4, 3.1.7 — an upper bound the counter also displays. */
export function maxLength(max: number, requirement: string): FieldRule {
  return {
    requirement,
    check: (value) =>
      value.trim().length > max ? `${value.trim().length} characters; the limit is ${max}` : null,
  };
}

/** 2.1.2, 2.1.3 — the password rules, worded as the server words them (10.5.3). */
export function passwordRules(): FieldRule[] {
  return [
    { requirement: '2.1.2', check: (v) => (v.length < 8 ? 'a password must be at least 8 characters' : null) },
    {
      requirement: '2.1.3',
      check: (v) =>
        /[A-Za-z]/.test(v) && /[0-9]/.test(v) ? null : 'a password must contain at least one letter and one digit',
    },
  ];
}

export function emailRule(): FieldRule {
  return {
    requirement: '2.1.1',
    // Deliberately loose. The server and the mail provider are the real check; a clever regular
    // expression here rejects valid addresses and teaches users the form is broken.
    check: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? null : 'enter a valid email address'),
  };
}

/**
 * 11.5.1, 11.5.2 — evaluate a field.
 *
 * Rules run in order and the **first** failure is shown. Listing three problems at once on one
 * field is a wall of red that says less than one sentence does, and the user fixes them one at a
 * time regardless.
 */
export function evaluate(value: string, rules: FieldRule[], max: number | null = null): FieldState {
  const error = rules.map((r) => r.check(value)).find((message) => message !== null) ?? null;
  return {
    value,
    count: max === null ? null : { used: value.trim().length, max },
    error,
  };
}

/**
 * 11.5.7 — whether the form may be submitted.
 *
 * A form is submittable when every field passes. Note what this does **not** do: disable the
 * button while a required field is untouched. A control that is disabled for a reason the user
 * cannot see is worse than one that explains itself when pressed.
 */
export function formIsValid(fields: FieldState[]): boolean {
  return fields.every((f) => f.error === null);
}

/** 11.3.6 — whether navigating away should warn. */
export function hasUnsavedChanges(fields: FieldState[], initial: string[]): boolean {
  return fields.some((f, i) => f.value !== (initial[i] ?? ''));
}
