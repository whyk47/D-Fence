/**
 * D-Fence — entity class `ClusterRainfall`
 * Stereotype: <<entity>>. Traces: 1.2.x, 4.1.x
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class ClusterRainfall {
  clusterId!: Uuid;
  currentMm!: number;
  accum24hMm!: number;
  accum72hMm!: number;
  /** 10.2.2 */
  isStale!: boolean;

  /**
   * How many hours of the 24- and 72-hour windows actually have readings behind them.
   *
   * These exist because the accumulations alone cannot distinguish the two things a reader most
   * needs to tell apart. A 72-hour total of 0.0 mm computed over 26 hours of stored history is not
   * the same claim as one computed over 72 hours, and the system reported them identically: every
   * cluster carried `accum72hMm = 0` with `isDegraded = false`, which asserts "it has not rained
   * for three days" on the strength of one. The measurement was right; the confidence was invented.
   *
   * Measured from the oldest reading inside the window to now, not by counting readings: a station
   * that reports every five minutes and one that reports hourly give the same coverage of the same
   * span, and it is the span that decides whether a total means anything.
   */
  observed24hHours!: number;
  observed72hHours!: number;
}
