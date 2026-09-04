/**
 * D-Fence — Password Reset Request screen (REQUIREMENTS.md 11.2.4).
 * Stereotype: <<boundary>>. Traces: 11.2.4, 2.1.11, 2.3.7, 10.5.3.
 *
 * The confirmation is deliberately non-committal: "if that address is registered". The server
 * answers identically for a known and an unknown address (2.3.7), and a screen that said "we have
 * sent you a link" would turn that careful answer back into an account-existence oracle.
 */
import { useState } from 'react';
import { Field, field, FormField } from '../../components/Field';
import { link } from '../../components/Link';
import { emailRule, evaluate, formIsValid, required } from '../../components/FieldValidation';
import { ScreenProps } from '../ScreenProps';

export function PasswordResetRequestScreen(props: ScreenProps): JSX.Element {
  const [email, setEmail] = useState<FormField>(field());
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const rules = [required('Email'), emailRule()];
  const valid = formIsValid([evaluate(email.value, rules)]);

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setEmail((f) => ({ ...f, touched: true }));
    if (!valid || submitting) {
      return;
    }
    setSubmitting(true);
    // No catch that distinguishes outcomes: a failure and a success must look the same from here,
    // for the same reason the server's two answers are identical.
    await props.api.post('/api/auth/reset/request', { email: email.value.trim() }).catch(() => undefined);
    setSubmitting(false);
    setSent(true);
  }

  if (sent) {
    return (
      <section data-screen="ResetRequest" data-requirement="11.2.4" data-state="submitted">
        <h1>Check your email</h1>
        <p role="status">If that address is registered, a reset link is on its way.</p>
        <a href="/signin" onClick={link(props, '/signin')}>
          Back to sign in
        </a>
      </section>
    );
  }

  return (
    <section data-screen="ResetRequest" data-requirement="11.2.4">
      <h1>Reset your password</h1>
      <p>Enter your email address and we will send you a link to choose a new password.</p>
      <form onSubmit={submit} noValidate>
        <Field
          id="email"
          label="Email"
          type="email"
          value={email.value}
          touched={email.touched}
          rules={rules}
          onChange={(v) => setEmail({ value: v, touched: email.touched })}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p>
        <a href="/signin" onClick={link(props, '/signin')}>
          Back to sign in
        </a>
      </p>
    </section>
  );
}
