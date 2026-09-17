/**
 * D-Fence — 4.4.9's notification.
 * Stereotype: <<control>>. Traces: 4.4.9, 4.4.3, 4.4.6, 10.2.1.
 *
 * "The system shall notify the Operations Manager within one minute of a subject being raised to
 * the Critical tier." Three words in that sentence decide the whole design.
 *
 * **"raised to"** — a transition, not a state. A subject that has been Critical for six cycles is
 * not being raised; it was raised once. Announcing the state every cycle would send a manager the
 * same snake every fifteen minutes until someone dealt with it, and a notification stream that
 * repeats is one a manager learns to ignore — which defeats the requirement rather than meeting it.
 * So this class remembers which subjects it has already announced, and a subject that falls back
 * out of Critical is forgotten, so a genuine second escalation is announced again.
 *
 * **"within one minute"** — this is called inline, in the scoring cycle, immediately after the
 * scores are computed. There is no queue and no scheduler, because both would introduce a delay
 * budget nobody is measuring. The only latency left is delivery, which `NotificationController`
 * owns.
 *
 * **"the Operations Manager"** — every account holding that role, read at announce time rather than
 * cached, because staff are provisioned and deactivated (2.2.3, 2.2.4) and a cached list would
 * quietly keep notifying someone who left.
 *
 * Nothing here throws. 10.2.1: a notification channel that is down must not take a scoring cycle
 * with it, and a score that was computed and saved is still worth having when the message failed.
 */
import { PriorityScore } from '../entity/PriorityScore';
import { PriorityTier, Role } from '../entity/enums';
import { AccountStore, Notifier } from '../ports/Stores';

/** One subject, as 4.4.3 means it: a (locality, pest) pair. */
function subjectKey(score: PriorityScore): string {
  return `${score.localityId}|${score.pestType}`;
}

export class CriticalEscalationNotifier {
  /** Subjects already announced and still Critical. */
  private readonly announced = new Set<string>();

  constructor(
    private readonly accounts: AccountStore,
    private readonly notifier: Notifier | null,
  ) {}

  /**
   * @param scored every score this cycle produced, with the locality's name — the name is not on
   *   `PriorityScore` and a message reading "subject 11111111-1111-…" is not a notification.
   * @returns the subjects announced this call, for the cycle log and for the tests.
   */
  async announce(scored: Array<{ score: PriorityScore; locality: string }>): Promise<string[]> {
    const critical = new Set<string>();
    const fresh: Array<{ score: PriorityScore; locality: string }> = [];

    for (const entry of scored) {
      if (entry.score.tier !== PriorityTier.Critical) {
        continue;
      }
      const key = subjectKey(entry.score);
      critical.add(key);
      if (!this.announced.has(key)) {
        fresh.push(entry);
      }
    }

    // Forget subjects that are no longer Critical *before* recording this cycle's, so a subject
    // that drops out and comes back is announced both times.
    for (const key of [...this.announced]) {
      if (!critical.has(key)) {
        this.announced.delete(key);
      }
    }
    for (const key of critical) {
      this.announced.add(key);
    }

    if (fresh.length === 0 || this.notifier === null) {
      return fresh.map((f) => subjectKey(f.score));
    }

    const managers = await this.accounts.findByRole(Role.OperationsManager);
    for (const entry of fresh) {
      const message = CriticalEscalationNotifier.message(entry.score, entry.locality);
      for (const manager of managers) {
        // Sequential and individually guarded: one manager with a broken chat must not stop the
        // next one being told.
        await this.notifier.notify(manager.id, message).catch(() => undefined);
      }
    }
    return fresh.map((f) => subjectKey(f.score));
  }

  /**
   * 4.4.6 — the message names the rule that fired, not merely the tier.
   *
   * "Critical" alone tells a manager to look; the rule tells them what they are looking at, and
   * whether it is the kind of thing that needs a call to AVS tonight or a visit tomorrow.
   */
  static message(score: PriorityScore, locality: string): string {
    const reason = score.overrideRuleName ?? 'a critical override rule';
    return (
      `CRITICAL: ${score.pestType} at ${locality} has been raised to Critical — ${reason}. ` +
      `Priority score ${score.score.toFixed(1)} (4.4.9)`
    );
  }
}
