/**
 * D-Fence — deciding which alerts should exist.
 * Stereotype: <<control>>. Realises use case 7.6. Traces: 6.1.1–6.1.5, 6.1.8, 6.1.9.
 *
 * Deciding is all it does. Sending belongs to `NotificationController`, and the split is what makes
 * 6.1.9's daily cap testable without a bot token: this class answers "what should be sent", and the
 * answer is a list of `Alert` objects that nothing has tried to deliver yet.
 *
 * **The cap is applied here, before delivery, not at the gateway.** A cluster that grows every hour
 * would otherwise produce an hourly message that the gateway politely swallows — and a suppressed
 * send still costs a request, still logs a delivery, and is one bad configuration away from
 * actually going out.
 */
import { AlertTrigger, ChangeClass, DeliveryOutcome } from '../entity/enums';
import { Uuid } from '../entity/valueTypes';
import { Alert, AlertFacts } from '../entity/Alert';
import { Cluster } from '../entity/Cluster';
import { SavedLocation } from '../entity/SavedLocation';
import { ExposureStatus } from '../entity/enums';
import { AlertStore, AlertSubscriptionStore, ClusterLocator, SavedLocationStore } from '../ports/Stores';

/** 6.1.9 */
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** What a cycle changed, handed in rather than re-derived. */
export interface CycleChanges {
  /** From `SavedLocationController.evaluateExposure` — the locations whose status moved. */
  exposureChanges: Array<{ location: SavedLocation; from: ExposureStatus }>;
  /** Clusters whose case size moved this cycle, with the delta the feed reported. */
  changedClusters: Cluster[];
}

export class AlertTriggerEvaluator {
  constructor(
    private readonly locations: SavedLocationStore,
    private readonly subscriptions: AlertSubscriptionStore,
    private readonly alerts: AlertStore,
    private readonly locator: ClusterLocator,
  ) {}

  /**
   * 6.1.2, 6.1.3, 6.1.5 — the three triggers, plus 6.1.1's switch and 6.1.9's cap.
   *
   * @returns alerts that should be delivered, already capped and already worded
   */
  async evaluate(changes: CycleChanges, now = new Date()): Promise<Alert[]> {
    const candidates: Alert[] = [];

    // 6.1.2 — a location that has just become IN_CLUSTER. Only the transition, never the state:
    // alerting on the state would re-alert every cycle for as long as the cluster exists.
    for (const change of changes.exposureChanges) {
      if (change.location.exposureStatus === ExposureStatus.IN_CLUSTER && change.from !== ExposureStatus.IN_CLUSTER) {
        const cluster = await this.clusterFor(change.location);
        candidates.push(await this.build(change.location, AlertTrigger.EnteredCluster, cluster));
      }
    }

    // 6.1.3, 6.1.5 — growth and rain are properties of a cluster, so they are evaluated per
    // cluster and then fanned out to the locations inside it.
    for (const cluster of changes.changedClusters) {
      for (const location of await this.locationsIn(cluster)) {
        const subscription = await this.subscriptions.findForLocation(location.id);
        const threshold = subscription?.growthThreshold ?? Number.POSITIVE_INFINITY;
        if (cluster.changeClass === ChangeClass.GROWN && cluster.caseDelta >= threshold) {
          candidates.push(await this.build(location, AlertTrigger.ClusterGrowth, cluster));
        }
        if (cluster.heavyRainExpected) {
          candidates.push(await this.build(location, AlertTrigger.HeavyRainForecast, cluster));
        }
      }
    }

    return this.applyDailyCap(await this.filterBySubscription(candidates), now);
  }

  /** 6.1.1 — a location with alerts switched off, or without that trigger, produces nothing. */
  private async filterBySubscription(candidates: Alert[]): Promise<Alert[]> {
    const kept: Alert[] = [];
    for (const alert of candidates) {
      const subscription = await this.subscriptions.findForLocation(alert.savedLocationId);
      // No subscription means no alerts. Defaulting an absent subscription to "on" would send
      // messages to a resident who never asked for them, which is the wrong direction to fail.
      if (subscription?.wants(alert.triggerType) === true) {
        kept.push(alert);
      }
    }
    return kept;
  }

  /**
   * 6.1.9 — at most one alert per location per trigger type in any 24 hours.
   *
   * Two things are checked, and both matter: what has already been **sent** (the store), and what
   * this same batch already contains. A cluster can trigger growth twice in one evaluation when
   * two locations sit inside it; without the in-batch check, the cap would be applied per alert
   * against a store that has not been written yet, and both would go out.
   */
  async applyDailyCap(candidates: Alert[], now = new Date()): Promise<Alert[]> {
    const since = new Date(now.getTime() - ALERT_COOLDOWN_MS);
    const kept: Alert[] = [];
    for (const alert of candidates) {
      if (kept.some((k) => k.collidesWith(alert))) {
        continue;
      }
      const recent = await this.alerts.recentFor(alert.savedLocationId, alert.triggerType, since);
      // A FAILED delivery does not consume the day's allowance: 6.1.9 caps what a resident
      // receives, and they received nothing.
      if (recent.some((r) => r.outcome === DeliveryOutcome.Sent)) {
        continue;
      }
      kept.push(alert);
    }
    return kept;
  }

  /** The cluster a location is in or nearest to, for the facts in 6.1.8. */
  private async clusterFor(location: SavedLocation): Promise<Cluster | null> {
    const nearest = await this.locator.nearestWithin(location.point, 2000);
    return nearest?.cluster ?? null;
  }

  /** Locations whose stored exposure names this cluster. Cheaper than re-running the geometry. */
  private async locationsIn(cluster: Cluster): Promise<SavedLocation[]> {
    return (await this.locations.all()).filter(
      (l) => l.exposure?.clusterId === cluster.id && l.exposureStatus === ExposureStatus.IN_CLUSTER,
    );
  }

  private async build(location: SavedLocation, trigger: AlertTrigger, cluster: Cluster | null): Promise<Alert> {
    const facts: AlertFacts = {
      locationLabel: location.label,
      locationName: location.name,
      clusterName: cluster?.locality ?? 'an active cluster',
      caseSize: cluster?.caseSize ?? 0,
      dataTimestamp: cluster?.lastUpdatedAt ?? null,
    };
    const alert = new Alert();
    alert.savedLocationId = location.id;
    alert.accountId = location.accountId;
    alert.triggerType = trigger;
    alert.facts = facts;
    alert.payload = Alert.compose(trigger, facts); // 6.1.8
    alert.attempts = 0;
    alert.outcome = DeliveryOutcome.Suppressed; // until delivery says otherwise
    alert.sentAt = new Date();
    return alert;
  }

  /** 6.1.1 — the switch a resident flips, and 6.1.4's threshold. */
  async subscriptionFor(locationId: Uuid): Promise<ReturnType<AlertSubscriptionStore['findForLocation']>> {
    return this.subscriptions.findForLocation(locationId);
  }
}
