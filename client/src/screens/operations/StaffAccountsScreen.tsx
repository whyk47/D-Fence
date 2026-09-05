/**
 * D-Fence — Staff Accounts (REQUIREMENTS.md 11.2.22).
 * Stereotype: <<boundary>>. Traces: 11.2.22, 2.2.1–2.2.6, 2.3.4, 11.4.6, 10.5.3.
 *
 * Deactivation is confirmed and its consequence is stated, because 2.2.5 ends every one of that
 * account's sessions immediately — the person may be halfway through recording a completion. The
 * dialog says so, and the toast afterwards reports how many sessions actually ended, which is the
 * only way the manager learns whether they just interrupted somebody.
 *
 * Deactivation is not deletion. 2.2.6 keeps the account so the work orders it touched still name a
 * real person; a deactivated crew member therefore stays in this list, marked, rather than
 * vanishing from it.
 *
 * **The creation form was missing until 2026-09-05**, and its absence is the same defect as the
 * one that produced 11.2.26: `POST /api/ops/staff` enforced 2.2.3 correctly, and no screen in the
 * application could reach it — so the only way to create the crew member who does the work was
 * `curl`. A rule nobody can invoke is not a feature, and 2.3.4 gives this screen to the one role
 * entitled to invoke it.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { ConfirmDialog, StateView, Toast } from '../../components/States';
import { Field, field, FormField } from '../../components/Field';
import { emailRule, evaluate, formIsValid, passwordRules, required } from '../../components/FieldValidation';
import { Role } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

interface StaffPayload {
  staff: Array<{ id: string; email: string; role: string; isActive: boolean }>;
}

export function StaffAccountsScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<StaffPayload>(props.api, '/api/ops/staff', {
    isEmpty: (v) => v.staff.length === 0,
    emptyMessage: 'No staff accounts exist yet.',
  });
  const [pending, setPending] = useState<{ id: string; email: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<FormField>(field());
  const [password, setPassword] = useState<FormField>(field());
  // 2.2.3 — the two roles a manager may create. Resident is deliberately absent: 2.2.2 says a
  // Resident account is self-registered, and offering it here would be a second way to make one.
  const [role, setRole] = useState<Role>(Role.CleaningCrew);
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);

  const emailRules = [required('Email'), emailRule()];
  // The same rules the register form applies (2.1.2, 2.1.3). A staff password created here is a
  // real credential and gets no weaker treatment for having been typed by a manager.
  const pwRules = [required('Password'), ...passwordRules()];
  const canCreate = formIsValid([evaluate(email.value, emailRules), evaluate(password.value, pwRules)]);

  async function create(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setEmail((f) => ({ ...f, touched: true }));
    setPassword((f) => ({ ...f, touched: true }));
    if (!canCreate || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await props.api.post('/api/ops/staff', {
        email: email.value.trim(),
        role,
        password: password.value,
      });
      setToast(`${email.value.trim()} created as ${role === Role.CleaningCrew ? 'Cleaning Crew' : 'Operations Manager'}.`);
      setEmail(field());
      setPassword(field());
      retry();
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'the account could not be created',
        remedy: f?.remedy ?? 'check the details and try again',
      });
    } finally {
      setBusy(false);
    }
  }

  async function change(id: string, action: 'deactivate' | 'reactivate', email: string): Promise<void> {
    setPending(null);
    setBusy(true);
    try {
      const result = await props.api.post<{ sessionsEnded?: number }>(`/api/ops/staff/${id}/${action}`, {});
      setToast(
        action === 'reactivate'
          ? `${email} reactivated.`
          : // 2.2.5 — report what actually happened, not what was requested.
            `${email} deactivated; ${result.sessionsEnded ?? 0} session(s) ended.`,
      );
      retry();
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setToast(`${f?.error ?? 'that could not be done'} — ${f?.remedy ?? 'try again shortly'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-screen="StaffAccounts" data-requirement="11.2.22">
      <h1>Staff</h1>

      <StateView state={state} onRetry={retry}>
        <table>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {(value?.staff ?? []).map((member) => (
              <tr key={member.id} data-active={member.isActive}>
                <td>{member.email}</td>
                <td>{member.role}</td>
                {/* 11.7.5, 2.2.6 — a deactivated account stays listed and says so in words. */}
                <td>{member.isActive ? 'Active' : 'Deactivated'}</td>
                <td>
                  {member.isActive ? (
                    <button type="button" disabled={busy} onClick={() => setPending({ id: member.id, email: member.email })}>
                      Deactivate {member.email}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change(member.id, 'reactivate', member.email)}
                    >
                      Reactivate {member.email}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </StateView>

      {/* 2.2.3, 11.2.22 — creating the account, on the screen that lists them. */}
      <form onSubmit={create} noValidate data-part="create">
        <h2>Add a staff account</h2>
        <Field
          id="staff-email"
          label="Email"
          type="email"
          value={email.value}
          touched={email.touched}
          rules={emailRules}
          onChange={(v) => setEmail({ value: v, touched: email.touched })}
        />
        <label htmlFor="staff-role">Role</label>
        <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value={Role.CleaningCrew}>Cleaning Crew</option>
          <option value={Role.OperationsManager}>Operations Manager</option>
        </select>
        <Field
          id="staff-password"
          label="Temporary password"
          type="password"
          value={password.value}
          touched={password.touched}
          rules={pwRules}
          onChange={(v) => setPassword({ value: v, touched: password.touched })}
        />
        {failure === null ? null : (
          <div role="alert" data-part="error">
            <p>{failure.cause}</p>
            <p>{failure.remedy}</p>
          </div>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {pending === null ? null : (
        <ConfirmDialog
          title={`Deactivate ${pending.email}?`}
          // The consequence the manager cannot see from the row.
          body="They will be signed out immediately, on every device, even if they are recording work right now. Their past work orders are kept."
          confirmLabel="Deactivate"
          onConfirm={() => void change(pending.id, 'deactivate', pending.email)}
          onDismiss={() => setPending(null)}
        />
      )}
      {toast === null ? null : <Toast message={toast} />}
    </section>
  );
}
