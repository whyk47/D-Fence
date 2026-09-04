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
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { useLoad } from '../../lib/useLoad';
import { ConfirmDialog, StateView, Toast } from '../../components/States';
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
