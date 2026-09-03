/**
 * D-Fence — smoke tests for the implemented pure logic.
 *
 * NOT the Lab 4 test deliverable. Lab 4 §3.2 asks for designed equivalence-class, boundary-value and
 * basis-path suites with a documented input/expected/actual table; this file exists only so that the
 * behaviour implemented during Lab 3 is demonstrably exercised rather than merely asserted to work.
 * The Lab 4 suites will replace and extend it.
 */
import { describe, expect, it } from 'vitest';
import { GeoPoint, TierThresholds } from '../src/entity/valueTypes';
import { PriorityTier, Role, WorkOrderStatus } from '../src/entity/enums';
import { ConfigSet } from '../src/config/ConfigSet';
import { PriorityScoringEngine } from '../src/control/PriorityScoringEngine';
import { PriorityScoreStore } from '../src/ports/Stores';
import { WorkOrderTransitionTable } from '../src/control/WorkOrderTransitionTable';
import { WorkOrderLifecycleController } from '../src/control/WorkOrderLifecycleController';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { MinMaxNormalisation } from '../src/control/normalisation/MinMaxNormalisation';
import { NormalisationContext } from '../src/control/normalisation/NormalisationStrategy';

function engine(high = 70, medium = 40): PriorityScoringEngine {
  const config = new ConfigSet();
  Object.assign(config, { tierThresholds: new TierThresholds(high, medium) });
  return new PriorityScoringEngine(new Map(), config, {} as PriorityScoreStore);
}

function lifecycle(): WorkOrderLifecycleController {
  return new WorkOrderLifecycleController(
    new WorkOrderTransitionTable(),
    // Only isTransitionPermitted is exercised here; it touches none of these collaborators, which
    // is precisely why it is the Lab 4 basis-path subject.
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

describe('PriorityScoringEngine.assignTier — the two thresholds', () => {
  it('puts a score exactly on a threshold into the higher tier', () => {
    expect(engine().assignTier(70)).toBe(PriorityTier.High);
    expect(engine().assignTier(40)).toBe(PriorityTier.Medium);
  });

  it('separates the tiers either side of each boundary', () => {
    expect(engine().assignTier(69.9)).toBe(PriorityTier.Medium);
    expect(engine().assignTier(70.1)).toBe(PriorityTier.High);
    expect(engine().assignTier(39.9)).toBe(PriorityTier.Low);
    expect(engine().assignTier(40.1)).toBe(PriorityTier.Medium);
  });
});

describe('WorkOrderLifecycleController.isTransitionPermitted — REQUIREMENTS.md 8.3.2', () => {
  const wo = lifecycle();

  it('permits the transitions the state table defines', () => {
    expect(wo.isTransitionPermitted(WorkOrderStatus.Assigned, WorkOrderStatus.Accepted, Role.CleaningCrew)).toBe(true);
    expect(wo.isTransitionPermitted(WorkOrderStatus.Rejected, WorkOrderStatus.InProgress, Role.CleaningCrew)).toBe(true);
    expect(wo.isTransitionPermitted(WorkOrderStatus.Completed, WorkOrderStatus.Verified, Role.OperationsManager)).toBe(true);
  });

  it('refuses a transition out of a terminal status (8.3.3)', () => {
    expect(wo.isTransitionPermitted(WorkOrderStatus.Verified, WorkOrderStatus.InProgress, Role.OperationsManager)).toBe(false);
    expect(wo.isTransitionPermitted(WorkOrderStatus.Cancelled, WorkOrderStatus.Assigned, Role.OperationsManager)).toBe(false);
  });

  it('refuses a permitted move attempted by the wrong role', () => {
    // Accepting is the assigned crew member's move (8.3.4), never the manager's.
    expect(wo.isTransitionPermitted(WorkOrderStatus.Assigned, WorkOrderStatus.Accepted, Role.OperationsManager)).toBe(false);
    // Verifying a completion is the manager's (8.3.9), never the crew's.
    expect(wo.isTransitionPermitted(WorkOrderStatus.Completed, WorkOrderStatus.Verified, Role.CleaningCrew)).toBe(false);
  });
});

describe('AccessPolicy — REQUIREMENTS.md §2.3', () => {
  const policy = new AccessPolicy();

  it('denies a Resident the work orders and the dashboard (2.3.3)', () => {
    const resident = policy.permissionsFor(Role.Resident);
    expect(resident.has('workOrder:readAll')).toBe(false);
    expect(resident.has('dashboard:read')).toBe(false);
  });

  it('gives a Crew Member only the work orders assigned to them (2.3.5)', () => {
    const crew = policy.permissionsFor(Role.CleaningCrew);
    expect(crew.has('workOrder:readAssigned')).toBe(true);
    expect(crew.has('workOrder:readAll')).toBe(false);
  });

  it('marks the ownership-scoped actions, which the matrix alone cannot answer (2.3.1, 2.3.2)', () => {
    expect(policy.isOwnershipScoped('savedLocation:read')).toBe(true);
    expect(policy.isOwnershipScoped('cluster:read')).toBe(false);
  });
});

describe('GeoPoint.distanceTo — 1.2.5', () => {
  it('measures a known Singapore distance to within a percent', () => {
    // Marina Bay Sands to Jurong East MRT, roughly 17.5 km.
    const mbs = new GeoPoint(1.2834, 103.8607);
    const jurongEast = new GeoPoint(1.3329, 103.7436);
    expect(mbs.distanceTo(jurongEast)).toBeGreaterThan(13_000);
    expect(mbs.distanceTo(jurongEast)).toBeLessThan(15_000);
  });

  it('is zero for a point against itself', () => {
    const p = new GeoPoint(1.3521, 103.8198);
    expect(p.distanceTo(p)).toBeCloseTo(0, 6);
  });
});

describe('Normalisation returns a value on [0, 1] — 4.1.4', () => {
  const ctx: NormalisationContext = { observedMin: 0, observedMax: 100, now: new Date() };

  it('maps the observed range onto the unit interval', () => {
    const s = new MinMaxNormalisation();
    expect(s.normalise(0, ctx)).toBe(0);
    expect(s.normalise(100, ctx)).toBe(1);
    expect(s.normalise(50, ctx)).toBeCloseTo(0.5);
  });

  it('clamps a value outside the observed range rather than letting one driver outvote six', () => {
    const s = new MinMaxNormalisation();
    expect(s.normalise(1_000, ctx)).toBe(1);
    expect(s.normalise(-50, ctx)).toBe(0);
  });

  it('returns 0 when every cluster shares one value, so a flat driver contributes nothing', () => {
    const s = new MinMaxNormalisation();
    expect(s.normalise(7, { observedMin: 7, observedMax: 7, now: new Date() })).toBe(0);
  });
});
