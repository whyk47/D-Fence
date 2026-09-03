/**
 * D-Fence — entity class `AlertSubscription`
 * Stereotype: <<entity>>. Traces: 6.1.1, 6.1.3, 6.1.4.
 *
 * One subscription per saved location, holding the switch and the threshold. 6.1.1 says alerts are
 * enabled "independently for each saved location", so the switch belongs here and not on the
 * account — a resident who wants alerts for home but not for the office is the ordinary case.
 */

import { Uuid } from './valueTypes';
import { AlertTrigger } from './enums';

/** 6.1.4 */
export const DEFAULT_GROWTH_THRESHOLD = 5;

export class AlertSubscription {
  id!: Uuid;
  savedLocationId!: Uuid;
  accountId!: Uuid;
  enabled!: boolean;
  /** 6.1.3, 6.1.4 — cases, not a percentage. Configurable per location; defaults to five. */
  growthThreshold!: number;
  /**
   * Which triggers this subscription wants. All three by default.
   *
   * 6.1.1 only requires a switch per location, and this is finer than that on purpose: the
   * heavy-rain trigger fires far more often than the other two, and a resident who mutes it would
   * otherwise have to mute everything — which means they mute everything and hear nothing.
   */
  triggers!: AlertTrigger[];

  wants(trigger: AlertTrigger): boolean {
    return this.enabled && this.triggers.includes(trigger);
  }

  static create(savedLocationId: Uuid, accountId: Uuid): AlertSubscription {
    const subscription = new AlertSubscription();
    subscription.savedLocationId = savedLocationId;
    subscription.accountId = accountId;
    subscription.enabled = true;
    subscription.growthThreshold = DEFAULT_GROWTH_THRESHOLD;
    subscription.triggers = Object.values(AlertTrigger);
    return subscription;
  }
}
