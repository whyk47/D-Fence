/**
 * D-Fence — Sign In screen (REQUIREMENTS.md 11.2.3).
 * Stereotype: <<boundary>>. State in lab3/dialog-map-design.puml.
 * Traces: 11.2.3, 11.1.10, 2.1.6–2.1.10, 2.3.7, 10.5.3.
 *
 * The one screen with no return path on the dialog map, and the entry point of every journey.
 *
 * Note what the failure message does **not** say. 2.1.10 locks an account after five failures, and
 * a message distinguishing "wrong password" from "account locked" from "no such account" is an
 * account-existence oracle — the same thing 2.3.7 refuses to be. The server sends one sentence for
 * all three and this screen shows it verbatim rather than helpfully elaborating.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { link } from '../../components/Link';
import { emailRule, formIsValid, evaluate, required } from '../../components/FieldValidation';
import { landingAfterSignIn } from '../../app/RouteGuard';
import { Role } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

interface SignInResponse {
  token: string;
  role: Role;
  accountId: string;
}

export function SignInScreen(props: ScreenProps): JSX.Element {
  const [email, setEmail] = useState<FormField>(field());
  const [password, setPassword] = useState<FormField>(field());
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRules = [required('Email'), emailRule()];
  const passwordRequired = [required('Password')];
  const valid = formIsValid([evaluate(email.value, emailRules), evaluate(password.value, passwordRequired)]);

  // 11.1.10 — where sign-in should land. The shell put it in the query string when it redirected.
  const returnTo = new URLSearchParams(props.params['query'] ?? location.search).get('returnTo');

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setEmail((f) => ({ ...f, touched: true }));
    setPassword((f) => ({ ...f, touched: true }));
    if (!valid || submitting) {
      return;
    }
    setSubmitting(true);
    setFailure(null);
    try {
      const result = await props.api.post<SignInResponse>('/api/auth/signin', {
        email: email.value.trim(),
        password: password.value,
      });
      props.api.setToken(result.token);
      props.onPrincipalChange?.({ accountId: result.accountId, role: result.role }, result.token);
      props.onNavigate(landingAfterSignIn(result.role, returnTo));
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'could not sign in',
        remedy: f?.remedy ?? 'check your details and try again',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section data-screen="SignIn" data-requirement="11.2.3">
      <h1>Sign in</h1>
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
          rules={passwordRequired}
          onChange={(v) => setPassword({ value: v, touched: password.touched })}
        />
        {failure === null ? null : (
          <div role="alert" data-part="error">
            {/* 10.5.3 — the server's cause and remedy, unembellished. */}
            <p>{failure.cause}</p>
            <p>{failure.remedy}</p>
          </div>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        <a href="/reset" onClick={link(props, '/reset')}>
          Forgotten your password?
        </a>
      </p>
      <p>
        <a href="/register" onClick={link(props, '/register')}>
          Create an account
        </a>
      </p>
    </section>
  );
}
