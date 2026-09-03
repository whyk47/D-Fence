/**
 * D-Fence — Lab 4 §3.2: the Singapore calendar date (regression, 2026-09-04).
 *
 * **These cases exist because two real defects hid for sixteen hours a day and were found by the
 * clock, not by the suite.** Every `IsoDate` in this system is a Singapore calendar date — a
 * scheduled date is a date to a planner here, a completion date is the day the crew did the work —
 * but `Date.toISOString()` gives the *UTC* date, and between 00:00 and 08:00 SGT that is yesterday.
 *
 * Two places used the UTC one:
 *
 *  - `WorkOrder.isOverdue` compared a Singapore `scheduledDate` against a UTC today, so a work order
 *    scheduled for yesterday did **not** read as overdue during the eight hours after midnight —
 *    precisely the hours in which an overnight backlog is reviewed (8.3.14).
 *  - `TreatmentRecord.completionDate` was stamped in UTC and then read back as `+08:00`, so a job
 *    completed at 1 am was dated the previous day and read as **one day old the moment it was
 *    written**, moving the 4.1.15 recency driver by a day for free.
 *
 * The whole suite passed on both counts at 8 pm and failed on both at 1 am. Every case below
 * therefore pins an **explicit instant** rather than using the wall clock: a test that only fails
 * during office hours is not a test.
 */
import { describe, expect, it } from 'vitest';
import { singaporeDate } from '../src/entity/valueTypes';
import { WorkOrder } from '../src/entity/WorkOrder';
import { DispatchController } from '../src/control/DispatchController';
import { TrendAnalyser } from '../src/control/TrendAnalyser';
import { RainfallGateway } from '../src/boundary/gateways/RainfallGateway';
import { PriorityTier, TaskType, WorkOrderStatus } from '../src/entity/enums';

/** 01:00 in Singapore on 4 September — which is 17:00 UTC on the 3rd. The disagreeing hour. */
const ONE_AM_SGT = new Date('2026-09-04T01:00:00+08:00');
/** 20:00 in Singapore on 3 September — 12:00 UTC the same day. The agreeing hour. */
const EIGHT_PM_SGT = new Date('2026-09-03T20:00:00+08:00');

function orderScheduledFor(date: string): WorkOrder {
  const order = new WorkOrder();
  order.id = 'w-1';
  order.clusterId = 'c-1';
  order.assigneeId = null;
  order.sourceReportId = null;
  order.taskType = TaskType.Fogging;
  order.scheduledDate = date;
  order.priority = PriorityTier.High;
  order.instructions = '';
  order.startedAt = null;
  order.cancellationReason = null;
  order.issueFlag = false;
  order.issueReason = null;
  order.createdAt = EIGHT_PM_SGT;
  order.applyStatus(WorkOrderStatus.Assigned);
  return order;
}

describe('The one definition of "what day is it"', () => {
  it('S1 — after midnight SGT the Singapore date is a day ahead of the UTC date', () => {
    expect(singaporeDate(ONE_AM_SGT)).toBe('2026-09-04');
    // The value the old code used. Stated explicitly so the difference is the assertion, rather
    // than something a reader has to work out from two timezone offsets.
    expect(ONE_AM_SGT.toISOString().slice(0, 10)).toBe('2026-09-03');
  });

  it('S2 — during the day they agree, which is why this went unnoticed', () => {
    expect(singaporeDate(EIGHT_PM_SGT)).toBe('2026-09-03');
    expect(EIGHT_PM_SGT.toISOString().slice(0, 10)).toBe('2026-09-03');
  });

  it('S3 — the boundary: 07:59:59 SGT and 08:00:00 SGT sit on either side of the UTC rollover', () => {
    // 08:00 SGT is 00:00 UTC, so this is the exact instant the two definitions reconverge.
    expect(singaporeDate(new Date('2026-09-04T07:59:59+08:00'))).toBe('2026-09-04');
    expect(new Date('2026-09-04T07:59:59+08:00').toISOString().slice(0, 10)).toBe('2026-09-03');
    expect(new Date('2026-09-04T08:00:00+08:00').toISOString().slice(0, 10)).toBe('2026-09-04');
  });

  it('S4 — everything that names a Singapore date shares the one definition', () => {
    // Four helpers had been written out by hand. A duplicated definition is a defect waiting for
    // a clock, and two of the four had already become one.
    expect(DispatchController.today(ONE_AM_SGT)).toBe('2026-09-04');
    expect(TrendAnalyser.singaporeDate(ONE_AM_SGT)).toBe('2026-09-04');
    expect(RainfallGateway.singaporeDate(ONE_AM_SGT)).toBe('2026-09-04');
  });
});

describe('8.3.14 — overdue, at 1 am', () => {
  it('S5 — yesterday\'s work order IS overdue at 01:00 SGT (the defect)', () => {
    // Scheduled for 3 September, reviewed at 01:00 on the 4th. Against the UTC date this returned
    // false: '2026-09-03' < '2026-09-03' is false, and the order looked as though it still had a
    // day left. Every night, for eight hours.
    expect(orderScheduledFor('2026-09-03').isOverdue(ONE_AM_SGT)).toBe(true);
  });

  it('S6 — today\'s work order is not overdue, at either hour', () => {
    expect(orderScheduledFor('2026-09-04').isOverdue(ONE_AM_SGT)).toBe(false);
    expect(orderScheduledFor('2026-09-03').isOverdue(EIGHT_PM_SGT)).toBe(false);
  });

  it('S7 — a settled order is never overdue, whatever the hour (8.3.14)', () => {
    const order = orderScheduledFor('2026-09-01');
    order.applyStatus(WorkOrderStatus.Verified);
    expect(order.isOverdue(ONE_AM_SGT)).toBe(false);
  });
});
