/**
 * D-Fence — entity class `Alert`
 * Stereotype: <<entity>>. Traces: 6.1.2, 6.1.3, 6.1.5, 6.1.8–6.1.11.
 */

import { Uuid } from './valueTypes';
import { AlertTrigger, DeliveryOutcome, LocationLabel } from './enums';

/** 6.1.8 — everything an alert must carry, gathered before the message is worded. */
export interface AlertFacts {
  locationLabel: LocationLabel | string;
  locationName: string;
  clusterName: string;
  caseSize: number;
  /** The feed's timestamp, not ours: an alert that implies fresher data than we have is a lie. */
  dataTimestamp: Date | null;
}

export class Alert {
  id!: Uuid;
  savedLocationId!: Uuid;
  /** Denormalised so 6.1.10's log resolves a recipient without joining through a deleted location. */
  accountId!: Uuid;
  triggerType!: AlertTrigger;
  sentAt!: Date;
  outcome!: DeliveryOutcome;
  /** 6.1.11 — 0, 1 or 2. Three attempts in total before FAILED is recorded. */
  attempts!: number;
  payload!: string;
  facts!: AlertFacts;

  /**
   * 6.1.8 — the message body. All five required elements, in the order a person reads them:
   * what changed, where, how bad, and how fresh the information is.
   *
   * Composed on the entity rather than in the gateway so that a second channel — email, in-app —
   * sends the same words. A message assembled per channel is a message that diverges per channel,
   * and 6.1.8 is a rule about the alert, not about Telegram.
   */
  static compose(trigger: AlertTrigger, facts: AlertFacts): string {
    const reason: Record<AlertTrigger, string> = {
      [AlertTrigger.EnteredCluster]: 'is now inside an active dengue cluster',
      [AlertTrigger.ClusterGrowth]: 'is in a cluster that has grown',
      [AlertTrigger.HeavyRainForecast]: 'is in a cluster with heavy rain forecast in the next 24 hours',
    };
    const stamp =
      facts.dataTimestamp === null
        ? 'timestamp unavailable'
        : `NEA data as at ${facts.dataTimestamp.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
    return (
      `D-Fence: your ${facts.locationLabel} (${facts.locationName}) ${reason[trigger]}. ` +
      `Cluster: ${facts.clusterName}. Cases: ${facts.caseSize}. ${stamp}. ` +
      'Cover water containers and clear stagnant water around your home.'
    );
  }

  /** 6.1.9 — two alerts collide when they share a location AND a trigger type. */
  collidesWith(other: { savedLocationId: Uuid; triggerType: AlertTrigger }): boolean {
    return this.savedLocationId === other.savedLocationId && this.triggerType === other.triggerType;
  }
}
