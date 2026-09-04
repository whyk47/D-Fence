/**
 * D-Fence — Register screen (REQUIREMENTS.md 11.2.2).
 * Stereotype: <<boundary>>. Traces: 11.2.2, 2.1.1–2.1.5, 11.5.1–11.5.3, 10.5.3.
 *
 * The password rules are shown as a hint **before** they are enforced as an error. 2.1.2 and 2.1.3
 * are the server's rules; a form that keeps them secret until submission is a form that fails the
 * user once for something it could have said at the start.
 *
 * On success this does **not** sign the user in. 2.1.4 requires email verification first, so the
 * screen says what will arrive and where — an account that appears to work and then refuses at the
 * first sign-in is the worse outcome.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { link } from '../../components/Link';
import { emailRule, evaluate, formIsValid, passwordRules, required } from '../../components/FieldValidation';
import { ScreenProps } from '../ScreenProps';

export function RegisterScreen(props: ScreenProps): JSX.Element {
  const [email, setEmail] = useState<FormField>(field());
  const [password, setPassword] = useState<FormField>(field());
  const [confirm, setConfirm] = useState<FormField>(field());
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [registered, setRegistered] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRules = [required('Email'), emailRule()];
  const pwRules = [required('Password'), ...passwordRules()];
  // Not a server rule — the server never sees this field. It exists because a mistyped password
  // that only reveals itself at the next sign-in costs a password reset to discover.
  const confirmRules = [
    required('Confirmation'),
    { requirement: '11.5.1', check: (v: string) => (v === password.value ? null : 'the two passwords do not match') },
  ];
  const valid = formIsValid([
    evaluate(email.value, emailRules),
    evaluate(password.value, pwRules),
    evaluate(confirm.value, confirmRules),
  ]);

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setEmail((f) => ({ ...f, touched: true }));
    setPassword((f) => ({ ...f, touched: true }));
    setConfirm((f) => ({ ...f, touched: true }));
    if (!valid || submitting) {
      return;
    }
    setSubmitting(true);
    setFailure(null);
    try {
      await props.api.post('/api/auth/register', { email: email.value.trim(), password: password.value });
      setRegistered(email.value.trim());
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({ cause: f?.error ?? 'could not create the account', remedy: f?.remedy ?? 'try again shortly' });
    } finally {
      setSubmitting(false);
    }
  }

  if (registered !== null) {
    return (
      <section data-screen="Register" data-requirement="11.2.2" data-state="submitted">
        <h1>Check your email</h1>
        {/* 2.1.4 — say what has to happen next, and where. */}
        <p role="status">
          We have sent a verification link to {registered}. Open it to activate your account, then sign in.
        </p>
        <a href="/signin" onClick={link(props, '/signin')}>
          Go to sign in
        </a>
      </section>
    );
  }

  return (
    <section data-screen="Register" data-requirement="11.2.2">
      <h1>Create an account</h1>
      <form onSubmit={submit} noValidate>
        <Field
          id="email"
          label="Email"
          type="email"
          value={email.value}
          touched={email.touched}
          rules={emailRules}
          onChange={(v) => setEmail({ value: v, touched: email.touched })}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          value={password.value}
          touched={password.touched}
          rules={pwRules}
          hint="At least 8 characters, including a letter and a digit."
          onChange={(v) => setPassword({ value: v, touched: password.touched })}
        />
        <Field
          id="confirm"
          label="Confirm password"
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
          </div>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p>
        <a href="/signin" onClick={link(props, '/signin')}>
          Already have an account? Sign in
        </a>
      </p>
    </section>
  );
}
