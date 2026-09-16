# DATA DICTIONARY — v0.9 DELTA

Version 1.0 · 2026-09-16 · extends `../lab1/submission/DATA-DICTIONARY.md` (23 entities), which is
**frozen as submitted Lab 1 evidence and is not edited**.

This delta carries the four entities, four enumerations and six attributes added when the product
was widened from dengue to all common household pests and all wild animals requiring NEA or AVS
intervention. Every attribute cites the requirement that defines it, in the manner of the Lab 1
document. **Entity total after this delta: 27. Enumeration total: 17.**

---

## 1. New entities

### 1.1 PestProfile

The configuration record that generalises the scorer. One per covered pest type.

| Attribute | Type | Defined by | Notes |
|---|---|---|---|
| `pestType` | PestType | 5.1.15 | Identity of the profile |
| `pestClass` | PestClass | 4.2.3 | Determines dispatch authority |
| `evidenceTier` | EvidenceTier | 4.3.1 | Determines the driver set |
| `severityMultiplier` | decimal (0, 1] | 4.2.1, 4.2.6 | Rejected outside the range |
| `driverWeights` | map<Driver, decimal> | 4.3.7, 4.3.8 | Must sum to 1.0 and name only drivers the tier permits |
| `dispatchAuthority` | string | 4.2.3, 8.6.2 | Referral destination; unconfigured blocks referral (6.10.EX.2) |
| `authorityContactNumber` | string | 8.6.3, 11.2.27 | Published contact shown to residents and managers |
| `observationTaxonId` | integer, nullable | 1.5.2 | Required when `evidenceTier` is B, null otherwise |

**Constraint.** At least one profile must carry `severityMultiplier` = 1.0 (4.2.7). The multipliers
are normalised against the most severe pest, and the tier thresholds in 4.1.8 depend on that
normalisation holding.

### 1.2 ObservationRecord

A third-party sighting retrieved under §1.5. **Distinct from `Report`**, which originates with a
resident and carries accountability; an observation carries none.

| Attribute | Type | Defined by | Notes |
|---|---|---|---|
| `observationId` | string | 1.5.3 | Supplier's identifier; used for idempotent storage |
| `pestType` | PestType | 1.5.2 | Derived from the requested taxon |
| `observedOn` | date | 1.5.3, 1.5.4 | Rejected if absent or older than 90 days (1.5.5) |
| `latitude` | decimal | 1.5.3, 1.5.4 | Rejected if absent |
| `longitude` | decimal | 1.5.3, 1.5.4 | Rejected if absent |
| `positionalAccuracy` | integer (metres) | 1.5.7 | Rejected above 500 m |
| `qualityGrade` | string | 1.5.3 | Supplier's own confidence grade |
| `localityBinding` | Uuid | 1.5.9, 1.5.10 | Discarded when it binds to no locality |
| `retrievedAt` | timestamp | 1.5.14 | Provenance |

**Not stored:** any record whose supplier obscured its coordinates (1.5.6). Obscured coordinates are
randomised within roughly a 22 km box, so they cannot be attributed to a locality. Sampling on
2026-09-16 found macaque, otter and pangolin records **100% obscured**.

### 1.3 VectorControlOperator

One NEA-registered vector control operator, from the registry loaded at startup under §1.6.

| Attribute | Type | Defined by | Notes |
|---|---|---|---|
| `companyName` | string | 1.6.2 | |
| `blockOrHouseNo` | string | 1.6.2 | |
| `streetName` | string | 1.6.2 | |
| `postalCode` | string(6) | 1.6.3 | Rejected if not six digits |
| `telephoneNo` | string | 1.6.2 | |
| `latitude` | decimal, nullable | 1.6.4, 1.6.5 | Null when the postal code does not resolve (7.9.EX.1) |
| `longitude` | decimal, nullable | 1.6.4, 1.6.5 | As above |

**Declared limitation.** These are **registered offices**, not service areas. The driver they feed
(4.1.25) is therefore response capacity — distance to the nearest operator — and not demand. See
`../PEST-PRIORITY-MODEL.md` §5.3 for the measured distribution behind that statement.

### 1.4 Referral

Written when the system routes a case to an authority outside its own dispatch chain (§8.6).

| Attribute | Type | Defined by | Notes |
|---|---|---|---|
| `destinationAuthority` | string | 8.6.2, 8.6.4 | Read from the pest profile |
| `referredAt` | timestamp | 8.6.4 | |
| `referredBy` | Uuid | 8.6.4 | Operations Manager account |
| `reason` | string(≥10) | 8.6.4 | "Reason" per the definitions table |
| `outcome` | string, nullable | 8.6.8 | Null until recorded |
| `outcomeRecordedAt` | timestamp, nullable | 8.6.9 | Setting it closes the report |

**Relationship constraint.** A `Referral` produces **no** `TreatmentRecord` and **no** `WorkOrder`
(8.6.10, 8.6.11). The locality was not treated, and recording treatment recency the system did not
earn would corrupt the 4.1.17 feedback loop.

---

## 2. New enumerations

| Enumeration | Values | Defined by |
|---|---|---|
| `PestType` | Mosquito, Rat, Cockroach, Fly, BedBug, Flea, Termite, Ant, Snake, WildBoar, Macaque, MonitorLizard, Otter, Civet, Bat, Pangolin, Crocodile, HouseCrow, Pigeon, JavanMyna, BeeWasp, Other | 5.1.15 |
| `PestClass` | VectorBorne, Structural, Nuisance, Wildlife | 4.2.3 |
| `EvidenceTier` | A, B, C | 4.3.1 |
| `LocationContext` | Indoor, Outdoor | 5.1.16 |

---

## 3. Changed attributes on existing entities

| Entity | Attribute | Change | Defined by |
|---|---|---|---|
| `Report` | `pestType` | **Added**, mandatory | 5.1.15 |
| `Report` | `locationContext` | **Added**, mandatory when pest class is Wildlife | 5.1.16 |
| `Report` | `injuryReported` | **Added**, optional boolean | 5.1.17 |
| `Report` | `type` | **Unchanged.** Remains the condition observed, orthogonal to `pestType` | 5.1.19 |
| `WorkOrder` | `pestType` | **Added**, mandatory | 8.1.16 |
| `PriorityScore` | scored subject | **Changed** from a cluster to a (locality, pest type) pair | 4.1.1 |

---

## 4. Changed enumerations

| Enumeration | Change | Defined by |
|---|---|---|
| `PriorityTier` | **Critical** added above High | 4.4.3, 4.4.4 |
| `Driver` | **ReportVelocity, CorroborationDensity, ExternalObservationDensity, ResponseCapacityDeficit** added | 4.1.22–4.1.25 |
| `ReportType` | **Unchanged** — the five condition types stand | 5.1.19 |

---

## 5. What did not change

No Lab 1 entity was renamed, removed or renumbered. `Cluster`, `ClusterSnapshot`, `PriorityScore`,
`Report`, `WorkOrder`, `TreatmentRecord` and the rest keep their names and every existing attribute.
The generalisation is additive, which is the same property that lets 4.2.5 guarantee an unchanged
dengue score.
