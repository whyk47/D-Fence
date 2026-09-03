/**
 * D-Fence — the resident's alert switch.
 * Stereotype: <<control>>. Traces: 6.1.1, 6.1.3, 6.1.4, 2.3.1, 3.1.12.
 *
 * Small on purpose. `AlertTriggerEvaluator` reads subscriptions and must not also write them:
 * evaluating a trigger and changing a preference are different operations with different access
 * rules, and one class doing both is one class a route can call for the wrong reason.
 */
import { AlertTrigger } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { AlertSubscription, DEFAULT_GROWTH_THRESHOLD } from '../entity/AlertSubscription';
import { AlertSubscriptionStore, SavedLocationStore } from '../ports/Stores';
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';

export class AlertPreferenceRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'AlertPreferenceRejected';
  }
}

export interface AlertPreferenceUpdate {
  enabled?: boolean;
  growthThreshold?: number;
  triggers?: string[];
}

export class AlertPreferenceController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly subscriptions: AlertSubscriptionStore,
    private readonly locations: SavedLocationStore,
  ) {}

  /**
   * 6.1.1, 6.1.3. Creates the subscription on first use, then applies the change.
   *
   * Creating on demand rather than alongside the location is deliberate: 6.1.1 says a resident may
   * *enable* alerts per location, so the absence of a subscription means "not asked for", and a
   * subscription created automatically and enabled by default would send messages to somebody who
   * never opted in.
   */
  async update(locationId: Uuid, change: AlertPreferenceUpdate, by: Principal): Promise<AlertSubscription> {
    const location = await this.locations.findById(locationId);
    await this.ac.authorise(by, 'alert:configure', {
      kind: 'alertSubscription',
      id: locationId,
      ownerId: location?.accountId,
    });
    // Ownership is settled by `authorise` above: `alert:configure` is ownership-scoped in
    // AccessPolicy, so a location belonging to somebody else — or no location at all, which
    // supplies no owner — has already been refused by the time execution reaches here.
    if (location === null) {
      throw new AlertPreferenceRejected('no such saved location');
    }

    const subscription =
      (await this.subscriptions.findForLocation(locationId)) ?? AlertSubscription.create(locationId, by.accountId);

    if (change.enabled !== undefined) {
      subscription.enabled = change.enabled;
    }
    if (change.growthThreshold !== undefined) {
      if (!Number.isInteger(change.growthThreshold) || change.growthThreshold < 1) {
        // A threshold of zero would alert on every cycle in which the cluster did not shrink,
        // which is 6.1.3 turned into noise.
        throw new AlertPreferenceRejected('the case-growth threshold must be a whole number of at least 1 (6.1.3)');
      }
      subscription.growthThreshold = change.growthThreshold;
    }
    if (change.triggers !== undefined) {
      const wanted = change.triggers.filter((t): t is AlertTrigger =>
        Object.values(AlertTrigger).includes(t as AlertTrigger),
      );
      if (wanted.length === 0) {
        throw new AlertPreferenceRejected('choose at least one trigger, or disable alerts for this location');
      }
      subscription.triggers = wanted;
    }
    return this.subscriptions.save(subscription);
  }

  /** 2.3.1 — the subscription for a location the caller owns, or null when they never enabled one. */
  async forLocation(locationId: Uuid, by: Principal): Promise<AlertSubscription | null> {
    const location = await this.locations.findById(locationId);
    await this.ac.authorise(by, 'alert:configure', {
      kind: 'alertSubscription',
      id: locationId,
      ownerId: location?.accountId,
    });
    return this.subscriptions.findForLocation(locationId);
  }

  /** 6.1.4, restated where a reader looks for it; the entity holds the value. */
  static defaultThreshold(): number {
    return DEFAULT_GROWTH_THRESHOLD;
  }
}
