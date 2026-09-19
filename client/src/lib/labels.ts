/**
 * D-Fence — what the enums are called in front of a person.
 * Traces: 11.7.x (the screens are read by residents), 10.5.3, 4.1.26.
 *
 * **The single most common UI defect in this application was an identifier on a screen.** A
 * resident's own report was headed `StandingWater`; the Staff table said `CleaningCrew`; the
 * dispatch list suggested `RefuseClearance`; the score breakdown listed `DaysSinceLastTreatment`,
 * `PremisesMix` and `CaseGrowthDelta` as if a town council officer should know what those are; and
 * a saved location's status read `CLEAR`. Every one of those is the TypeScript member name reaching
 * the browser because `{value}` renders whatever it is handed.
 *
 * So the mapping lives here, once, rather than as a `toLowerCase()` or a regex sprinkled through
 * twenty screens. Three rules hold throughout:
 *
 *   - **Sentence case, not Title Case.** "Standing water", not "Standing Water" — these are things,
 *     not proper nouns, and Title Case in running text reads like a product name.
 *   - **A unit belongs to its number, never to its label.** `unit()` is where "mm", "cases" and
 *     "days" are decided, so a driver row cannot show `0.526` with no idea what it measures.
 *   - **Nothing here invents meaning.** Where a name is genuinely opaque — `PremisesMix` — the
 *     label is the plain-English expansion the requirement uses, and the explanation goes in
 *     `driverHelp`, which screens show beside it rather than instead of it.
 *
 * A missing entry falls back to `spaced()`, which splits the camel case. That is deliberately not
 * an exception: a new enum member should render as "Response capacity deficit" rather than crash a
 * screen, and the fallback being *almost* right is what makes the missing entry easy to see.
 */

/** `CaseGrowthDelta` → `Case growth delta`. The floor every lookup falls back to. */
export function spaced(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^(.)(.*)$/, (_, head: string, tail: string) => head.toUpperCase() + tail.toLowerCase());
}

const LABELS: Readonly<Record<string, string>> = {
  // Roles (2.2.1). Shown on the Staff screen and in the shell.
  Resident: 'Resident',
  OperationsManager: 'Operations Manager',
  CleaningCrew: 'Cleaning Crew',

  // Report types (5.1.2).
  StandingWater: 'Standing water',
  UnclearedRefuse: 'Uncleared refuse',
  BlockedDrain: 'Blocked drain',
  OvergrownVegetation: 'Overgrown vegetation',

  // Task types (8.1.2).
  Fogging: 'Fogging',
  Larviciding: 'Larviciding',
  RefuseClearance: 'Refuse clearance',
  DrainClearance: 'Drain clearance',
  Inspection: 'Inspection',

  // Work order statuses (8.1.x). `InProgress` is the only one the split gets wrong.
  InProgress: 'In progress',

  // Exposure status (3.2.x) — the one a resident reads about their own home, so it is phrased as an
  // answer to "am I affected?" rather than as a state name.
  IN_CLUSTER: 'Inside a cluster',
  WITHIN_150M: 'Within 150 m of a cluster',
  CLEAR: 'No cluster nearby',

  // Cluster change class (1.1.x) and trajectory (4.1.x).
  NEW: 'New',
  GROWN: 'Grown',
  UNCHANGED: 'Unchanged',
  SHRUNK: 'Shrunk',
  CLOSED: 'Closed',

  // Pest types (5.1.15). Only the ones the camel-case split would mangle or under-name.
  BedBug: 'Bed bug',
  WildBoar: 'Wild boar',
  MonitorLizard: 'Monitor lizard',
  HouseCrow: 'House crow',
  JavanMyna: 'Javan myna',
  BeeWasp: 'Bee or wasp',
  Macaque: 'Long-tailed macaque',

  // Pest classes (4.2.3).
  VectorBorne: 'Vector-borne',
  Structural: 'Structural',
  Nuisance: 'Nuisance',
  Wildlife: 'Wildlife',

  // Source kinds (1.x), shown on the Data Sources screen.
  Clusters: 'Dengue clusters (NEA)',
  Rainfall: 'Rainfall readings',
  Forecast: 'Rainfall forecast',
  Geocoding: 'Address geocoding (OneMap)',
  Observations: 'Wildlife observations',
  OperatorRegistry: 'Vector control operators',
  Gravitrap: 'High-Aedes areas (Gravitrap)',

  // Alert triggers (6.1.x).
  EnteredCluster: 'A cluster reached this location',
  ClusterGrowth: 'A nearby cluster grew',
  HeavyRainForecast: 'Heavy rain forecast',
};

/** The human name for any enum member the screens show. */
export function label(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return LABELS[value] ?? spaced(value);
}

/**
 * The seven-to-eleven priority drivers (4.1.3, 4.1.22–4.1.25), named as a town council officer
 * would say them.
 *
 * These get their own table rather than joining `LABELS` because a driver is the one thing on the
 * screen a manager is being asked to *trust*, and the raw member names are the least readable
 * strings in the system. 4.1.26 is binding on one of them: `ExternalObservationDensity` may not be
 * called pest pressure anywhere, so it is not called that here.
 */
const DRIVERS: Readonly<Record<string, { name: string; unit: string; help: string }>> = {
  CaseSize: { name: 'Case size', unit: 'cases', help: 'Confirmed dengue cases NEA reports in this cluster.' },
  CaseGrowthDelta: { name: 'Case growth', unit: 'cases', help: 'Change in case count since the previous cluster snapshot.' },
  Rainfall24h: { name: 'Rainfall, last 24 h', unit: 'mm', help: 'Total at the nearest station in the preceding 24 hours.' },
  Rainfall72h: { name: 'Rainfall, last 72 h', unit: 'mm', help: 'Total at the nearest station in the preceding 72 hours.' },
  VerifiedOpenReportCount: { name: 'Open verified reports', unit: 'reports', help: 'Resident reports a manager has verified and nobody has closed.' },
  DaysSinceLastTreatment: { name: 'Days since last treatment', unit: 'days', help: 'Since the last verified work order here. Longer means more overdue.' },
  PremisesMix: { name: 'Premises mix', unit: '', help: 'The share of the cluster that is residential, from NEA’s breakdown.' },
  ReportVelocity: { name: 'Report velocity', unit: 'reports / 14 days', help: 'Verified reports of this pest here over the preceding fortnight.' },
  CorroborationDensity: { name: 'Corroboration density', unit: 'per report', help: 'How many neighbours confirmed each open verified report, on average.' },
  // 4.1.26 — a naturalist’s sighting record, and it must never be labelled pest pressure.
  ExternalObservationDensity: { name: 'Recorded sightings nearby', unit: 'records / 90 days', help: 'Third-party naturalist observation records. A sighting is not a complaint.' },
  ResponseCapacityDeficit: { name: 'Distance to nearest operator', unit: 'km', help: 'To the nearest registered vector control operator (1.6.8).' },
};

export function driverLabel(driver: string): string {
  return DRIVERS[driver]?.name ?? spaced(driver);
}

export function driverUnit(driver: string): string {
  return DRIVERS[driver]?.unit ?? '';
}

export function driverHelp(driver: string): string {
  return DRIVERS[driver]?.help ?? '';
}

/**
 * A raw driver value with its unit attached, at the precision the unit deserves.
 *
 * Millimetres to one decimal because that is how the station reports them; counts as integers
 * because 3.4 reports is not a thing; the dimensionless ones to three, because `PremisesMix`
 * is a ratio and rounding it to 0.5 throws away the difference between two clusters.
 */
export function withUnit(driver: string, raw: number): string {
  const unit = driverUnit(driver);
  if (unit === '') {
    return raw.toFixed(3);
  }
  const rounded = unit === 'mm' || unit === 'km' || unit.includes('per') ? raw.toFixed(1) : String(Math.round(raw));
  return `${rounded} ${unit}`;
}
