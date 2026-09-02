/**
 * D-Fence — the 13 enumerations of the entity model
 * Stereotype: <<entity>>. Traces: lab1/submission/DATA-DICTIONARY.md §5
 */

// One file, because these are a single reference: the data dictionary lists all closed
// value sets in one place and the model should not scatter them across 13 files.

export enum Role {
  Resident = 'Resident',
  OperationsManager = 'OperationsManager',
  CleaningCrew = 'CleaningCrew',
}

export enum LocationLabel {
  Home = 'Home',
  Workplace = 'Workplace',
  School = 'School',
  Other = 'Other',
}

export enum ExposureStatus {
  IN_CLUSTER = 'IN_CLUSTER',
  WITHIN_150M = 'WITHIN_150M',
  CLEAR = 'CLEAR',
}

export enum AlertTrigger {
  EnteredCluster = 'EnteredCluster',
  ClusterGrowth = 'ClusterGrowth',
  HeavyRainForecast = 'HeavyRainForecast',
}

export enum ChangeClass {
  NEW = 'NEW',
  GROWN = 'GROWN',
  UNCHANGED = 'UNCHANGED',
  SHRUNK = 'SHRUNK',
  CLOSED = 'CLOSED',
}

export enum ForecastRegion {
  north = 'north',
  south = 'south',
  east = 'east',
  west = 'west',
  central = 'central',
}

export enum Trajectory {
  Growing = 'Growing',
  Stable = 'Stable',
  Receding = 'Receding',
}

export enum PriorityTier {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

export enum Driver {
  CaseSize = 'CaseSize',
  CaseGrowthDelta = 'CaseGrowthDelta',
  Rainfall24h = 'Rainfall24h',
  Rainfall72h = 'Rainfall72h',
  VerifiedOpenReportCount = 'VerifiedOpenReportCount',
  DaysSinceLastTreatment = 'DaysSinceLastTreatment',
  PremisesMix = 'PremisesMix',
}

export enum ReportType {
  StandingWater = 'StandingWater',
  UnclearedRefuse = 'UnclearedRefuse',
  BlockedDrain = 'BlockedDrain',
  OvergrownVegetation = 'OvergrownVegetation',
  Other = 'Other',
}

export enum ReportStatus {
  Submitted = 'Submitted',
  Verified = 'Verified',
  Rejected = 'Rejected',
  Actioned = 'Actioned',
  Closed = 'Closed',
}

export enum TaskType {
  Fogging = 'Fogging',
  Larviciding = 'Larviciding',
  RefuseClearance = 'RefuseClearance',
  DrainClearance = 'DrainClearance',
  Inspection = 'Inspection',
}

export enum WorkOrderStatus {
  Created = 'Created',
  Assigned = 'Assigned',
  Accepted = 'Accepted',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Verified = 'Verified',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

/** Kinds of external source the ingestion layer knows about. Design-level, not in the
 * analysis model: introduced so AbstractIngestionJob can key its subclasses. */
export enum SourceKind {
  Clusters = 'Clusters',
  Rainfall = 'Rainfall',
  Forecast = 'Forecast',
  Geocoding = 'Geocoding',
}

/** Outcome of an outbound notification (4.3, 4.4). */
export enum DeliveryOutcome {
  Sent = 'Sent',
  Failed = 'Failed',
  Suppressed = 'Suppressed',
}
