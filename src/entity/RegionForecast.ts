/**
 * D-Fence — entity class `RegionForecast`
 * Stereotype: <<entity>>. Traces: 1.3.4, 1.3.5
 */

import { Uuid, IsoDate, GeoPoint, Polygon, PremisesMix } from './valueTypes';
import {
  Role, LocationLabel, ExposureStatus, AlertTrigger, ChangeClass,
  ForecastRegion, Trajectory, PriorityTier, Driver, ReportType, ReportStatus,
  TaskType, WorkOrderStatus, SourceKind, DeliveryOutcome,
} from './enums';

export class RegionForecast {
  id!: Uuid;
  region!: ForecastRegion;
  forecastText!: string;
  heavyRainExpected!: boolean;
  validFrom!: Date;
  validTo!: Date;
}
