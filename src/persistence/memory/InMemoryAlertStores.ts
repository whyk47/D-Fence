/**
 * D-Fence — in-memory alerts and subscriptions.
 * Stereotype: <<persistence>>. Traces: 6.1.1, 6.1.9, 6.1.10, 3.1.12, 10.6.3.
 */
import { randomUUID } from 'node:crypto';
import { AlertStore, AlertSubscriptionStore } from '../../ports/Stores';
import { Uuid } from '../../entity/valueTypes';
import { AlertTrigger, DeliveryOutcome } from '../../entity/enums';
import { Alert } from '../../entity/Alert';
import { AlertSubscription } from '../../entity/AlertSubscription';
import { NotificationChannel } from '../../ports/ExternalGateway';

export class InMemoryAlertSubscriptionStore implements AlertSubscriptionStore {
  private readonly byLocation = new Map<Uuid, AlertSubscription>();

  async findForLocation(locationId: Uuid): Promise<AlertSubscription | null> {
    return this.byLocation.get(locationId) ?? null;
  }

  async save(subscription: AlertSubscription): Promise<AlertSubscription> {
    subscription.id = subscription.id || randomUUID();
    this.byLocation.set(subscription.savedLocationId, subscription);
    return subscription;
  }

  /** 3.1.12 — one per location, so this removes at most one. */
  async deleteForLocation(locationId: Uuid): Promise<number> {
    return this.byLocation.delete(locationId) ? 1 : 0;
  }

  countFor(locationId: Uuid): number {
    return this.byLocation.has(locationId) ? 1 : 0;
  }
}

export class InMemoryAlertStore implements AlertStore {
  private readonly alerts = new Map<Uuid, Alert>();

  async findById(id: Uuid): Promise<Alert | null> {
    return this.alerts.get(id) ?? null;
  }

  async save(alert: Alert): Promise<Alert> {
    alert.id = alert.id || randomUUID();
    this.alerts.set(alert.id, alert);
    return alert;
  }

  async recentFor(locationId: Uuid, trigger: AlertTrigger, since: Date): Promise<Alert[]> {
    return [...this.alerts.values()].filter(
      (a) => a.savedLocationId === locationId && a.triggerType === trigger && a.sentAt.getTime() >= since.getTime(),
    );
  }

  async recent(limit: number): Promise<Alert[]> {
    return [...this.alerts.values()]
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .slice(0, Math.max(0, limit));
  }

  all(): Alert[] {
    return [...this.alerts.values()];
  }
}

/**
 * A notification channel that records instead of sending, for development without a bot token.
 *
 * `failNext` exists so 6.1.11's retry can be driven: a channel that always succeeds cannot
 * demonstrate a rule about what happens when it does not.
 */
export class RecordingChannel implements NotificationChannel {
  readonly sent: Array<{ chatId: string; text: string; at: Date }> = [];
  /** Number of upcoming sends that should fail. Decremented on each failure. */
  failNext = 0;

  async send(chatId: string, text: string): Promise<DeliveryOutcome> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return DeliveryOutcome.Failed;
    }
    this.sent.push({ chatId, text, at: new Date() });
    return DeliveryOutcome.Sent;
  }

  to(chatId: string): string[] {
    return this.sent.filter((s) => s.chatId === chatId).map((s) => s.text);
  }
}
