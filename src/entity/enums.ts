/**
 * D-Fence — the entity model's enumerations: the 13 from the data dictionary, the four added by the
 * v0.9 cross-pest generalisation, plus SourceKind and DeliveryOutcome, which are design-level and
 * marked as such below.
 * Stereotype: <<entity>>. Traces: lab1/submission/DATA-DICTIONARY.md §5,
 * lab3/DATA-DICTIONARY-DELTA.md §2.
 */

// One file, because these are a single reference: the data dictionary lists all closed
// value sets in one place and the model should not scatter them across 17 files.

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

/**
 * 4.1.8, and 4.4.3/4.4.4 for Critical.
 *
 * Critical is NOT a fourth band of the score. It is assigned by the override evaluator irrespective
 * of score (4.4.3) and ranks above every High (4.4.4). The computed score is retained alongside it
 * (4.4.5) — the override says the case is dangerous, it does not claim the evidence is stronger.
 */
export enum PriorityTier {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low',
}

/**
 * 4.1.3, 4.1.22-4.1.25.
 *
 * The first seven are the v0.8 set and are exactly the tier A set of 4.3.4 — unchanged, because
 * 4.2.5 obliges the mosquito score to be what it was. The last four were added in v0.9 for tiers B
 * and C, which have neither a case count nor a rainfall signal to work from.
 *
 * **Never iterate this enum to decide what a score should contain.** Which drivers apply is a
 * property of the scored subject's evidence tier (`PestProfile.drivers()`), not of the enum. A
 * tier C pest that reported CaseSize missing would be degraded on every cycle for a driver it can
 * never have.
 */
export enum Driver {
  CaseSize = 'CaseSize',
  CaseGrowthDelta = 'CaseGrowthDelta',
  Rainfall24h = 'Rainfall24h',
  Rainfall72h = 'Rainfall72h',
  VerifiedOpenReportCount = 'VerifiedOpenReportCount',
  DaysSinceLastTreatment = 'DaysSinceLastTreatment',
  PremisesMix = 'PremisesMix',
  /** 4.1.22 — verified reports of this pest in this locality over the preceding 14 days. */
  ReportVelocity = 'ReportVelocity',
  /** 4.1.23 — mean corroboration count of the open verified reports. */
  CorroborationDensity = 'CorroborationDensity',
  /** 4.1.24 — third-party observation records over 90 days. Tier B only. 4.1.26 forbids labelling
   *  this as pest pressure anywhere it is shown: it is a naturalist's sighting, not a complaint. */
  ExternalObservationDensity = 'ExternalObservationDensity',
  /** 4.1.25 — distance to the nearest registered vector control operator (1.6.8). */
  ResponseCapacityDeficit = 'ResponseCapacityDeficit',
}

/**
 * 5.1.15 — the covered pests. NEA's five vectors, the two household pests under the VCO regime, and
 * the wild animals AVS publishes guidance for. Marine species (box jellyfish, hawksbill turtle) are
 * deliberately excluded: they are not municipal-estate pests and there is no locality model for
 * coastal waters. See PEST-PRIORITY-MODEL.md §2.
 */
export enum PestType {
  Mosquito = 'Mosquito',
  Rat = 'Rat',
  Cockroach = 'Cockroach',
  Fly = 'Fly',
  BedBug = 'BedBug',
  Flea = 'Flea',
  Termite = 'Termite',
  Ant = 'Ant',
  Snake = 'Snake',
  WildBoar = 'WildBoar',
  Macaque = 'Macaque',
  MonitorLizard = 'MonitorLizard',
  Otter = 'Otter',
  Civet = 'Civet',
  Bat = 'Bat',
  Pangolin = 'Pangolin',
  Crocodile = 'Crocodile',
  HouseCrow = 'HouseCrow',
  Pigeon = 'Pigeon',
  JavanMyna = 'JavanMyna',
  BeeWasp = 'BeeWasp',
  Other = 'Other',
}

/** 4.2.3 — determines the dispatch authority, and with it whether 8.1.14 refuses a work order. */
export enum PestClass {
  VectorBorne = 'VectorBorne',
  Structural = 'Structural',
  Nuisance = 'Nuisance',
  Wildlife = 'Wildlife',
}

/**
 * 4.3.1 — how much evidence exists for a pest, which decides its driver set (4.3.4-4.3.6).
 * A: an authoritative government feed (mosquito only). B: a third-party observation feed with
 * usable coordinates. C: nothing external — scored from D-Fence's own reports alone (4.3.10).
 */
export enum EvidenceTier {
  A = 'A',
  B = 'B',
  C = 'C',
}

/** 5.1.16 — mandatory on a wildlife report, because 4.4.7 turns on it. */
export enum LocationContext {
  Indoor = 'Indoor',
  Outdoor = 'Outdoor',
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
  /** 1.5 — third-party wildlife observations. */
  Observations = 'Observations',
  /** 1.6 — the NEA registered vector control operator registry. Static reference data (1.6.7). */
  OperatorRegistry = 'OperatorRegistry',
}

/** Outcome of an outbound notification (6.1.11). Design-level, not in the data dictionary. */
export enum DeliveryOutcome {
  Sent = 'Sent',
  Failed = 'Failed',
  Suppressed = 'Suppressed',
}
