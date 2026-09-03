/**
 * D-Fence — delivering alerts and notifications.
 * Stereotype: <<control>>. Realises use cases 4.3, 4.4. Traces: 6.1.6, 6.1.7, 6.1.10, 6.1.11,
 * 8.2.4, 8.3.11, 10.2.1.
 *
 * `AlertTriggerEvaluator` decides what should be sent; this class sends it, retries it, and logs
 * the outcome. It also implements the `Notifier` port, so the work-order notifications in 8.2.4 and
 * 8.3.11 travel the same road as resident alerts rather than growing a second delivery path.
 *
 * **Nothing here throws on a delivery failure.** 10.2.1 requires the system to stay available when
 * one external service is down, and an unsent alert must not take an ingestion cycle with it.
 */
import { randomInt } from 'node:crypto';
import { AlertTrigger, DeliveryOutcome } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Alert } from '../entity/Alert';
import { NotificationChannel } from '../ports/ExternalGateway';
import { AccountStore, AlertStore, Notifier } from '../ports/Stores';

/** 6.1.11 — two retries at five-minute intervals, so three attempts in all. */
export const MAX_DELIVERY_ATTEMPTS = 3;
export const RETRY_INTERVAL_MS = 5 * 60 * 1000;
/** 6.1.7 */
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

/**
 * When to run a retry. A port so 6.1.11's five minutes can be asserted in a test that finishes in
 * milliseconds — a suite that actually waits fifteen minutes is a suite nobody runs.
 */
export interface RetryScheduler {
  after(delayMs: number, run: () => Promise<void>): void;
}

/** The default: real time, and deliberately not awaited by the caller. */
export const realScheduler: RetryScheduler = {
  after(delayMs, run) {
    setTimeout(() => void run().catch(() => undefined), delayMs).unref?.();
  },
};

export class NotificationController implements Notifier {
  /** 6.1.7 — single-use codes, held until claimed or expired. */
  private readonly linkCodes = new Map<string, { accountId: Uuid; expiresAt: Date }>();

  constructor(
    private readonly channel: NotificationChannel,
    private readonly accounts: AccountStore,
    private readonly alerts: AlertStore,
    private readonly scheduler: RetryScheduler = realScheduler,
  ) {}

  /**
   * 6.1.6, 6.1.10, 6.1.11. Delivers one alert to the resident's linked chat, retrying twice.
   *
   * The alert is **logged whatever happens** — Sent, Failed or Suppressed — because 6.1.10 is a
   * record of every alert, not of every successful one, and a failed alert nobody can see is
   * indistinguishable from an alert that was never triggered.
   */
  async notifyResident(alert: Alert, now = new Date()): Promise<DeliveryOutcome> {
    const account = await this.accounts.findById(alert.accountId);
    if (account?.telegramChatId == null) {
      // 6.1.6 needs a linked chat. Suppressed, not Failed: nothing went wrong, there is simply
      // nowhere to send it, and the two must be distinguishable in 6.1.10's log.
      alert.outcome = DeliveryOutcome.Suppressed;
      alert.sentAt = now;
      return (await this.alerts.save(alert)).outcome;
    }

    alert.attempts += 1;
    alert.sentAt = now;
    const outcome = await this.channel.send(account.telegramChatId, alert.payload);

    if (outcome === DeliveryOutcome.Sent || alert.attempts >= MAX_DELIVERY_ATTEMPTS) {
      // 6.1.11 — FAILED is recorded only after the third attempt, not on the first.
      alert.outcome = outcome;
      await this.alerts.save(alert);
      return outcome;
    }

    // Still retrying: the record exists so the log shows an alert in flight rather than a gap.
    alert.outcome = DeliveryOutcome.Failed;
    const saved = await this.alerts.save(alert);
    this.scheduler.after(RETRY_INTERVAL_MS, async () => {
      await this.retryDelivery(saved.id);
    });
    return DeliveryOutcome.Failed;
  }

  /** 6.1.11 — one further attempt, scheduling the next if this one also fails. */
  async retryDelivery(alertId: Uuid, now = new Date()): Promise<DeliveryOutcome> {
    const alert = await this.alerts.findById(alertId);
    if (alert === null || alert.outcome === DeliveryOutcome.Sent) {
      return DeliveryOutcome.Sent;
    }
    return this.notifyResident(alert, now);
  }

  /** 8.2.4, 8.3.11. The `Notifier` port: a crew member's message, same channel, same logging. */
  async notify(accountId: Uuid, message: string): Promise<void> {
    await this.notifyCrewMember(accountId, message);
  }

  /**
   * Use case 4.4 — added after the Lab 1 critique found 8.2.4, 8.2.6 and 8.3.11 unrepresented.
   *
   * Not retried: a work-order notification that fails is visible in the dashboard the crew member
   * is already looking at, whereas a resident alert is the only thing that reaches them at all.
   */
  async notifyCrewMember(accountId: Uuid, text: string): Promise<DeliveryOutcome> {
    const account = await this.accounts.findById(accountId);
    if (account?.telegramChatId == null) {
      return DeliveryOutcome.Suppressed;
    }
    return this.channel.send(account.telegramChatId, text);
  }

  /**
   * 6.1.7 — a single-use code, valid for fifteen minutes, that the resident sends to the bot.
   *
   * Six digits rather than a uuid because a person types this into Telegram by hand, and it is
   * safe at that length precisely because of the two limits: one use, fifteen minutes.
   */
  issueLinkCode(accountId: Uuid, now = new Date()): { code: string; expiresAt: Date } {
    const code = String(randomInt(100_000, 1_000_000));
    const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
    this.linkCodes.set(code, { accountId, expiresAt });
    return { code, expiresAt };
  }

  /**
   * 6.1.7 — the bot presents the code and the chat it came from. Consumes the code either way:
   * a code that survives a failed attempt is a code that can be brute-forced.
   *
   * @returns the account now linked, or null when the code is unknown or expired
   */
  async claimLinkCode(code: string, chatId: string, now = new Date()): Promise<Uuid | null> {
    const entry = this.linkCodes.get(code);
    this.linkCodes.delete(code);
    if (entry === undefined || entry.expiresAt.getTime() < now.getTime()) {
      return null;
    }
    const account = await this.accounts.findById(entry.accountId);
    if (account === null) {
      return null;
    }
    account.telegramChatId = chatId;
    await this.accounts.save(account);
    return account.id;
  }

  /** 6.1.10 — the delivery log, newest first. */
  async recentDeliveries(limit = 50): Promise<Alert[]> {
    return this.alerts.recent(limit);
  }

  /** Convenience for the cycle: deliver a batch and report how each one went. */
  async deliverAll(alerts: Alert[], now = new Date()): Promise<Record<DeliveryOutcome, number>> {
    const tally: Record<DeliveryOutcome, number> = {
      [DeliveryOutcome.Sent]: 0,
      [DeliveryOutcome.Failed]: 0,
      [DeliveryOutcome.Suppressed]: 0,
    };
    for (const alert of alerts) {
      tally[await this.notifyResident(alert, now)] += 1;
    }
    return tally;
  }

  /** Exposed for the dashboard and tests: which trigger types have fired recently. */
  static triggersOf(alerts: Alert[]): AlertTrigger[] {
    return [...new Set(alerts.map((a) => a.triggerType))];
  }
}
