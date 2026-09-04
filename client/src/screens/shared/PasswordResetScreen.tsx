/**
 * D-Fence — Password Reset form (REQUIREMENTS.md 11.2.4).
 * Stereotype: <<boundary>>. Traces: 11.2.4, 2.1.11, 2.1.2, 2.1.3, 10.5.3.
 *
 * Reachable without a session, because the emailed token *is* the credential — which is also why
 * 2.1.11 makes it single-use. The screen therefore treats a rejected token as a normal, expected
 * outcome with a route out of it (request another link), not as an error the user must decipher.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { link } from '../../components/Link';
import { evaluate, formIsValid, passwordRules, required } from '../../components/FieldValidation';
import { ScreenProps } from '../ScreenProps';

export function PasswordResetScreen(props: ScreenProps): JSX.Element {
  const [password, setPassword] = useState<FormField>(field());
  const [confirm, setConfirm] = useState<FormField>(field());
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const token = props.params['token'] ?? '';
  const pwRules = [required('Password'), ...passwordRules()];
  const confirmRules = [
    required('Confirmation'),
    { requirement: '11.5.1', check: (v: string) => (v === password.value ? null : 'the two passwords do not match') },
  ];
  const valid = formIsValid([evaluate(password.value, pwRules), evaluate(confirm.value, confirmRules)]);

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setPassword((f) => ({ ...f, touched: true }));
    setConfirm((f) => ({ ...f, touched: true }));
    if (!valid || submitting) {
      return;
    }
    setSubmitting(true);
    setFailure(null);
    try {
      await props.api.post('/api/auth/reset/complete', { token, password: password.value });
      setDone(true);
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'that reset link is no longer valid',
        // 2.1.11 — single-use and time-limited, so the remedy is a fresh link, not a retry.
        remedy: f?.remedy ?? 'request a new reset link and use the most recent email',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section data-screen="ResetForm" data-requirement="11.2.4" data-state="submitted">
        <h1>Password changed</h1>
        <p role="status">Sign in with your new password.</p>
        <a href="/signin" onClick={link(props, '/signin')}>
          Go to sign in
        </a>
      </section>
    );
  }

  return (
    <section data-screen="ResetForm" data-requirement="11.2.4">
      <h1>Choose a new password</h1>
      <form onSubmit={submit} noValidate>
        <Field
          id="password"
          label="New password"
          type="password"
          value={password.value}
          touched={password.touched}
          rules={pwRules}
          hint="At least 8 characters, including a letter and a digit."
          onChange={(v) => setPassword({ value: v, touched: password.touched })}
        />
        <Field
          id="confirm"
          label="Confirm new password"
          type="password"
          value={confirm.value}
          touched={confirm.touched}
          rules={confirmRules}
          onChange={(v) => setConfirm({ value: v, touched: confirm.touched })}
        />
        {failure === null ? null : (
          <div role="alert" data-part="error">
            <p>{failure.cause}</p>
            <p>{failure.remedy}</p>
            <a href="/reset" onClick={link(props, '/reset')}>
              Request a new link
            </a>
          </div>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </section>
  );
}
