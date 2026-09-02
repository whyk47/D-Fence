# DATA DICTIONARY — D-Fence

Lab 1 deliverable 2. Version 0.1, 2026-09-02.

Companion to `REQUIREMENTS.md` v0.3 and `USE-CASE-MODEL.md`. Every entry cites the requirement
that defines it, so the dictionary is verifiable against the specification rather than asserted
alongside it. Where a requirement number appears in the **Defined by** column, that requirement is
the authority; this document restates it in data terms and adds nothing that the requirements do
not already oblige.

**Conventions.** Types are logical, not physical — `text(40)` means at most 40 characters, not a
specific column type. `PK` marks the identifier, `FK →` marks a reference to another entity. All
timestamps are stored in UTC and displayed in SGT (10.5.6). "Derived" means the value is computed,
not entered, and the computing requirement is cited.

---

## 1. Entity summary

| # | Entity | What one instance is | Source of instances |
|---|---|---|---|
| E1 | Account | One registered user of the system | Self-registration (2.1.1) or creation by a manager (2.2.3) |
| E2 | Session | One authenticated period of use | Successful authentication (2.1.8) |
| E3 | SavedLocation | One address a Resident watches | Resident entry (3.1.1) |
| E4 | Cluster | One NEA-published dengue cluster, tracked over time | NEA feed (1.1.2) |
| E5 | ClusterSnapshot | One cluster as it stood at one ingestion cycle | Every ingestion cycle (1.1.5) |
| E6 | RainfallStation | One physical rain gauge | Rainfall API (1.2.2) |
| E7 | RainfallReading | One station's measurement at one time | Rainfall API (1.2.3) |
| E8 | ClusterRainfall | One cluster's derived rainfall state | Computed (1.2.6–1.2.8) |
| E9 | RegionForecast | One 24-hour forecast for one macro-region | Forecast API (1.3.1) |
| E10 | PriorityScore | One cluster's score at one scoring cycle | Every scoring cycle (4.1.1) |
| E11 | DriverContribution | One driver's part of one PriorityScore | Every scoring cycle (4.1.10) |
| E12 | Report | One resident-submitted breeding-site report | Resident submission (5.1.1) |
| E13 | ReportPhoto | One photograph attached to a report | Resident submission (5.1.5) |
| E14 | Corroboration | One Resident's confirmation of one report | Resident confirmation (5.1.13) |
| E15 | WorkOrder | One unit of dispatched field work | Manager creation (8.1.1–8.1.2) |
| E16 | CompletionEvidence | One crew submission closing a work order | Crew completion (8.3.6) |
| E17 | TreatmentRecord | One dated, verified treatment of one cluster | Verification of a work order (8.3.12) |
| E18 | AlertSubscription | One Resident's alert settings for one location | Resident configuration (6.1.1) |
| E19 | Alert | One alert generated and dispatched | Trigger evaluation (6.1.2–6.1.5) |
| E20 | AuditRecord | One state-changing operation, recorded | Every such operation (2.4.1) |
| E21 | IngestionRun | One retrieval pass over one source | Every ingestion cycle (1.1.14) |
| E22 | SourceHealth | One external source's current health | Maintained per source (1.4.1) |
| E23 | Configuration | One tunable system parameter | Deployment configuration (10.6.2) |

---

## 2. Entity definitions

### E1 Account

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| account_id | PK | System-generated | — |
| email | text(254) | Unique across accounts; valid email form | 2.1.1, 2.1.4 |
| password_hash | text | Hash only; plaintext is never stored | 2.1.7, 10.3.1 |
| email_verified | boolean | False until the verification link is used | 2.1.5, 2.1.6 |
| role | enum | {Resident, Operations Manager, Cleaning Crew} — exactly one | 2.2.1 |
| is_active | boolean | False blocks authentication | 2.2.4, 2.2.5 |
| failed_attempts | integer | 0–5; drives lockout | 2.1.10 |
| locked_until | timestamp | Null when not locked | 2.1.10 |
| telegram_chat_id | text | Null until linked; set by single-use code | 6.1.6, 6.1.7 |
| created_at | timestamp | Set on creation | 2.4.1 |

*Notes.* Role is single-valued by 2.2.1, so a person who is both a resident and a crew member needs
two accounts — a deliberate simplification recorded in `REQUIREMENTS.md` §13. `telegram_chat_id`
is personal data and falls under the retention and deletion obligations of §10.4.

### E2 Session

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| session_token | PK | Issued on successful authentication | 2.1.8 |
| account_id | FK → E1 | | 2.1.8 |
| issued_at | timestamp | | 2.1.8 |
| last_active_at | timestamp | Expiry is 24 h of inactivity from this value | 2.1.9 |
| terminated_at | timestamp | Set on logout | 2.1.12 |

### E3 SavedLocation

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| location_id | PK | | — |
| account_id | FK → E1 | At most five per Resident | 3.1.1 |
| input_text | text | Postal code or free-text address as entered | 3.1.2 |
| latitude, longitude | decimal | Geocoded, not entered; rejected if no match | 3.1.3, 3.1.5 |
| label | enum | {Home, Workplace, School, Other} | 3.1.6 |
| name | text(40) | Optional | 3.1.7 |
| exposure_status | enum, derived | {IN_CLUSTER, WITHIN_150M, CLEAR} | 3.1.9 |
| nearest_cluster_id | FK → E4, derived | Containing cluster, else nearest | 3.1.10 |
| rain_24h_mm, rain_72h_mm | decimal(1dp), derived | Millimetres | 1.2.9 |
| evaluated_at | timestamp | Timestamp of the data behind the status | 3.1.10 |

*Notes.* Deleting a SavedLocation cascades to its AlertSubscription (3.1.12).

### E4 Cluster

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| objectid | PK | NEA's identifier, carried through unchanged | 1.1.2 |
| locality | text | NEA `LOCALITY`; the human name used throughout | 1.1.2, definitions |
| boundary | polygon | GeoJSON geometry; required | 1.1.2, 1.1.3 |
| case_size | integer, ≥ 0 | NEA `CASE_SIZE`, current snapshot | 1.1.2 |
| homes, public_places, construction_sites | integer, ≥ 0 | NEA premises counts | 1.1.2 |
| premises_mix | decimal 0–1, derived | (public + construction) ÷ (homes + public + construction); 0 when all three are 0 | 1.1.15, 1.1.16 |
| case_delta | integer, derived | Current minus previous snapshot's case_size | 1.1.8 |
| change_class | enum, derived | {NEW, GROWN, UNCHANGED, SHRUNK, CLOSED} — exactly one per cycle | 1.1.9 |
| forecast_region | enum, derived | {north, south, east, west, central} | 1.3.2 |
| heavy_rain_expected | boolean, derived | From forecast text of the mapped region | 1.3.3 |
| trajectory | enum, derived | {Growing, Stable, Receding}, over 14 days | 9.1.10 |
| first_seen_at | timestamp | Set once, on first appearance | 1.1.6 |
| last_updated_at | timestamp | Advanced only when an attribute value changes | 1.1.7 |
| is_active | boolean, derived | False after absence from two consecutive retrievals | 1.1.10 |

*Notes.* `case_size` is authoritative NEA data and is never edited in this system. A cluster is
CLOSED, not deleted — history is retained (1.1.5).

### E5 ClusterSnapshot

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| snapshot_id | PK | | — |
| objectid | FK → E4 | | 1.1.5 |
| retrieved_at | timestamp | The ingestion cycle this snapshot belongs to | 1.1.5 |
| case_size, homes, public_places, construction_sites, boundary | as E4 | Values as retrieved | 1.1.5 |
| fmel_upd_d | date | NEA's own update date | 1.1.2 |

*Notes.* Append-only. 1.1.5 forbids overwriting a previous snapshot — this entity is what makes the
30-day trend (9.1.9) and the case delta (1.1.8) computable, and it is the reason ingestion must
start in week 1.

### E6 RainfallStation / E7 RainfallReading / E8 ClusterRainfall

| Entity | Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|---|
| E6 | station_id | PK | From the API | 1.2.2 |
| E6 | name, latitude, longitude | text, decimal | | 1.2.2 |
| E7 | reading_id | PK | | — |
| E7 | station_id | FK → E6 | | 1.2.3 |
| E7 | reading_at | timestamp | Discarded if > 30 min older than retrieval | 1.2.3, 1.2.4 |
| E7 | value_mm | decimal | Millimetres | 1.2.3 |
| E8 | objectid | FK → E4 | One row per active cluster | 1.2.5 |
| E8 | station_1/2/3 | FK → E6 | The three nearest by great-circle distance from centroid | 1.2.5 |
| E8 | current_mm | decimal, derived | Inverse-distance-weighted mean of the three | 1.2.6 |
| E8 | accum_24h_mm, accum_72h_mm | decimal(1dp), derived | Rolling accumulations | 1.2.7, 1.2.8 |
| E8 | is_stale | boolean, derived | True after 30 min with no accepted reading | 1.2.10 |

### E9 RegionForecast

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| forecast_id | PK | | — |
| region | enum | {north, south, east, west, central} | 1.3.2 |
| forecast_text | text | As returned by the API | 1.3.3 |
| heavy_rain_expected | boolean, derived | True if text contains "Heavy", "Thundery Showers" or "Showers" | 1.3.3 |
| valid_from, valid_to | timestamp | The forecast's validity period | 1.3.4 |

*Notes.* Five macro-regions, not 45 named areas — the 24-hour endpoint's actual shape. Coarse
spatial resolution here is a stated limitation, not an oversight (`REQUIREMENTS.md` §1.3 note).

### E10 PriorityScore / E11 DriverContribution

| Entity | Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|---|
| E10 | score_id | PK | | — |
| E10 | objectid | FK → E4 | | 4.1.1 |
| E10 | computed_at | timestamp | One row per cluster per scoring cycle | 4.1.1, 4.1.11 |
| E10 | score | decimal(1dp) | 0.0–100.0 | 4.1.7 |
| E10 | tier | enum, derived | High ≥ 70.0; Medium 40.0–69.9; Low < 40.0 | 4.1.8 |
| E10 | is_degraded | boolean | True when any driver was excluded as stale | 4.1.12, 4.1.13 |
| E10 | excluded_drivers | list of enum | Named whenever degraded | 4.1.20 |
| E10 | rank | integer, derived | Descending score; ties by case size then locality name | 4.1.14 |
| E11 | score_id | FK → E10 | | 4.1.10 |
| E11 | driver | enum | {case size, case growth delta, rainfall 24h, rainfall 72h, verified open report count, days since last treatment, premises mix} — exactly these seven | 4.1.3 |
| E11 | raw_value | decimal | The driver's value before normalisation | 4.1.10 |
| E11 | normalised_value | decimal 0–1 | | 4.1.4 |
| E11 | weight | decimal 0–1 | Weights sum to 1.0; renormalised if a driver is excluded | 4.1.5, 4.1.6, 4.1.19 |
| E11 | contribution | decimal, derived | normalised_value × weight, on the 0–100 scale | 4.1.7, 4.1.10 |

*Notes.* E11 is what makes the score defensible rather than a black box: 4.1.18 obliges the system
to show this breakdown on demand, and the mockups render it as the driver-contribution panel.
`days since last treatment` defaults to 90 for a cluster with no TreatmentRecord (4.1.16).

### E12 Report / E13 ReportPhoto / E14 Corroboration

| Entity | Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|---|
| E12 | report_id | PK | | — |
| E12 | reporter_account_id | FK → E1 | Withheld from other Residents | 5.1.10, 5.2.9 |
| E12 | latitude, longitude | decimal | Map pin or geocoded address | 5.1.2 |
| E12 | type | enum | {Standing water, Uncleared refuse, Blocked drain, Overgrown vegetation, Other} | 5.1.3 |
| E12 | description | text(500) | | 5.1.4 |
| E12 | objectid | FK → E4 | The active cluster containing the location, if any | 5.1.7 |
| E12 | locality_binding | text | Nearest locality within 1 km, else `Unassigned` | 5.1.8, 5.1.9 |
| E12 | status | enum | {Submitted, Verified, Rejected, Actioned, Closed} | 5.2.1 |
| E12 | corroboration_count | integer, derived | Distinct confirming Residents | 5.1.14 |
| E12 | submitted_at | timestamp | | 5.1.10 |
| E12 | moderated_by, moderated_at, moderation_reason | FK → E1, timestamp, text(≥10) | Reason mandatory on Rejected | 5.2.4, 5.3.4 |
| E12 | work_order_id | FK → E15 | Set when linked to a work order | 8.1.13 |
| E13 | photo_id | PK | At most three per report | 5.1.5 |
| E13 | report_id | FK → E12 | | 5.1.5 |
| E13 | file | binary | ≤ 5 MB; JPEG or PNG only | 5.1.6 |
| E13 | visibility | derived | Hidden from other Residents until the report is Verified | 5.3.5 |
| E14 | report_id + account_id | PK (composite) | One confirmation per Resident per report | 5.1.13 |
| E14 | confirmed_at | timestamp | | 5.1.13 |

*Notes.* **`Unassigned` is a value of `locality_binding`, not a status** (5.1.9) — the status set is
closed by 5.2.1. This distinction was added after the adversarial review found the two conflated.

### E15 WorkOrder / E16 CompletionEvidence

| Entity | Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|---|
| E15 | work_order_id | PK | | — |
| E15 | objectid | FK → E4 | The target cluster | 8.1.1 |
| E15 | source_report_id | FK → E12 | Null when raised against a cluster rather than a report | 8.1.2 |
| E15 | task_type | enum | {Fogging, Larviciding, Refuse clearance, Drain clearance, Inspection} | 8.1.3 |
| E15 | scheduled_date | date | Not in the past at creation | 8.1.4 |
| E15 | priority | enum | Defaults to the target cluster's tier | 8.1.5 |
| E15 | instructions | text(1000) | Optional | 8.1.6 |
| E15 | status | enum | {Created, Assigned, Accepted, In Progress, Completed, Verified, Rejected, Cancelled} | 8.3.1 |
| E15 | assignee_account_id | FK → E1 | Exactly one crew member; must be active | 8.2.1, 8.2.3 |
| E15 | started_at | timestamp | Recorded on transition to In Progress | 8.3.17 |
| E15 | is_overdue | boolean, derived | Scheduled date passed and status not Completed/Verified/Cancelled | 8.3.14 |
| E15 | cancellation_reason | text(≥10) | Mandatory on Cancelled | 8.3.18 |
| E15 | issue_flag, issue_reason | boolean, text | Raisable any time before completion | 8.3.8 |
| E16 | work_order_id | FK → E15 | | 8.3.6 |
| E16 | completed_at | timestamp | | 8.3.6 |
| E16 | task_performed | boolean | Explicit confirmation | 8.3.6 |
| E16 | photos | binary, ≥ 1 | A completion with no photograph is rejected | 8.3.6, 8.3.7 |
| E16 | notes | text | Free text, required | 8.3.6 |
| E16 | rejection_reason | text(≥10) | Mandatory when the completion is Rejected | 8.3.10 |

*Notes.* Permitted transitions are exhaustively listed in the **work-order state table** in
`REQUIREMENTS.md` §8.3; nothing outside that table is legal (8.3.2, 8.3.3). Verified and Cancelled
are terminal. Rejected is a resting state, not a moment (8.3.19). This state table is the intended
subject of the Lab 4 basis-path tests.

### E17 TreatmentRecord

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| treatment_id | PK | | — |
| objectid | FK → E4 | | 8.3.12 |
| work_order_id | FK → E15 | The work order whose verification wrote this record | 8.3.12 |
| task_type | enum | As E15 | 8.3.12 |
| completion_date | date | | 8.3.12 |

*Notes.* This is the entity that closes the loop. It is written only on verification, it supplies
the `days since last treatment` driver (4.1.15), and by 4.1.17 its existence must measurably lower
the cluster's next score. That causal chain — crew photo → manager verification → treatment record
→ lower score — is the single most demonstrable thing in the system.

### E18 AlertSubscription / E19 Alert

| Entity | Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|---|
| E18 | location_id | FK → E3 | One subscription per saved location | 6.1.1 |
| E18 | enabled | boolean | Independently settable per location | 6.1.1 |
| E18 | growth_threshold | integer | Default 5 cases | 6.1.3, 6.1.4 |
| E19 | alert_id | PK | | — |
| E19 | location_id | FK → E3 | | 6.1.8 |
| E19 | trigger_type | enum | {entered cluster, cluster growth, heavy rain forecast} | 6.1.2–6.1.5 |
| E19 | sent_at | timestamp | At most one per location per trigger type per 24 h | 6.1.9 |
| E19 | outcome | enum | {DELIVERED, FAILED} after two retries | 6.1.10, 6.1.11 |
| E19 | payload | text | Carries location label, cluster name, trigger reason, case size, data timestamp | 6.1.8 |

### E20 AuditRecord

| Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|
| audit_id | PK | | — |
| actor_account_id | FK → E1 | | 2.4.1 |
| action | text | | 2.4.1 |
| target_entity, target_id | text, text | | 2.4.1 |
| occurred_at | timestamp | | 2.4.1 |

*Notes.* Append-only and immutable to every role, including Operations Manager (2.4.2). Authorisation
failures are logged here too (2.3.8).

### E21 IngestionRun / E22 SourceHealth / E23 Configuration

| Entity | Attribute | Type | Domain / constraint | Defined by |
|---|---|---|---|---|
| E21 | run_id | PK | | — |
| E21 | source | enum | {NEA clusters, rainfall, forecast, OneMap} | 1.1.14, 1.4.1 |
| E21 | started_at, ended_at | timestamp | | 1.1.14 |
| E21 | feature_count | integer | | 1.1.14 |
| E21 | outcome | enum | {SUCCESS, FAILED} after up to three retries | 1.1.11, 1.1.14 |
| E21 | trigger | enum | {scheduled, manual} — manual runs are manager-invoked | 1.1.18 |
| E22 | source | PK | As E21 | 1.4.1 |
| E22 | last_success_at | timestamp | Displayed to the Operations Manager | 1.4.1, 1.4.2 |
| E22 | is_warning | boolean, derived | True after three consecutive missed intervals | 1.4.3 |
| E23 | key | PK | Driver weights, tier thresholds, dispatch-list size, alert threshold | 4.1.5, 4.1.9, 8.1.8 |
| E23 | value | text | Weight sets are rejected unless they sum to 1.0 | 4.1.6 |

---

## 3. Relationships

| From | Cardinality | To | Meaning | Defined by |
|---|---|---|---|---|
| Account | 1 : 0..5 | SavedLocation | A Resident watches up to five addresses | 3.1.1 |
| Account | 1 : 0..* | Report | A Resident submits reports | 5.1.1, 5.1.10 |
| Account | 1 : 0..* | WorkOrder | A crew member is assigned work orders | 8.2.1 |
| Cluster | 1 : 1..* | ClusterSnapshot | A cluster accumulates snapshots over time | 1.1.5 |
| Cluster | 1 : 0..* | PriorityScore | One score per scoring cycle, retained as history | 4.1.11 |
| PriorityScore | 1 : 7 | DriverContribution | Exactly the seven drivers, less any excluded | 4.1.3, 4.1.12 |
| Cluster | 1 : 0..3 | ClusterRainfall → RainfallStation | Three nearest stations, inverse-distance weighted | 1.2.5, 1.2.6 |
| Cluster | 1 : 0..* | Report | Reports bind to the containing cluster, else to a locality | 5.1.7, 5.1.8 |
| Report | 1 : 0..3 | ReportPhoto | | 5.1.5 |
| Report | 1 : 0..* | Corroboration | One per confirming Resident | 5.1.13 |
| Cluster | 1 : 0..* | WorkOrder | At most one **open** work order per task type per cluster | 8.1.1, 8.1.11 |
| WorkOrder | 1 : 0..* | Report | Verified open reports in the cluster link on creation | 8.1.13 |
| WorkOrder | 1 : 0..1 | CompletionEvidence | | 8.3.6 |
| WorkOrder | 1 : 0..1 | TreatmentRecord | Written on verification only | 8.3.12 |
| Cluster | 1 : 0..* | TreatmentRecord | Supplies days-since-last-treatment | 4.1.15 |
| Cluster | 0..* : 0..1 | RegionForecast | Carries the forecast text and validity the heavy-rain flag was derived from | 1.3.4, 1.3.5 |
| WorkOrder | 0..* : 0..1 | Report | The report a work order was *raised from* — distinct from the reports linked to it on creation | 8.1.2 |
| SavedLocation | 1 : 0..1 | AlertSubscription | Deleted with the location | 3.1.12 |
| SavedLocation | 1 : 0..* | Alert | | 6.1.8 |

---

## 4. Enumerations (single reference)

| Enumeration | Values | Defined by |
|---|---|---|
| Role | Resident · Operations Manager · Cleaning Crew | 2.2.1 |
| Exposure status | IN_CLUSTER · WITHIN_150M · CLEAR | 3.1.9 |
| Location label | Home · Workplace · School · Other | 3.1.6 |
| Cluster change class | NEW · GROWN · UNCHANGED · SHRUNK · CLOSED | 1.1.9 |
| Trajectory | Growing · Stable · Receding | 9.1.10 |
| Forecast region | north · south · east · west · central | 1.3.2 |
| Priority tier | High (≥ 70.0) · Medium (40.0–69.9) · Low (< 40.0) | 4.1.8 |
| Driver | case size · case growth delta · rainfall 24h · rainfall 72h · verified open report count · days since last treatment · premises mix | 4.1.3 |
| Report type | Standing water · Uncleared refuse · Blocked drain · Overgrown vegetation · Other | 5.1.3 |
| Report status | Submitted · Verified · Rejected · Actioned · Closed | 5.2.1 |
| Task type | Fogging · Larviciding · Refuse clearance · Drain clearance · Inspection | 8.1.3 |
| Work-order status | Created · Assigned · Accepted · In Progress · Completed · Verified · Rejected · Cancelled | 8.3.1 |
| Alert trigger | entered cluster · cluster growth · heavy rain forecast | 6.1.2–6.1.5 |

---

## 5. Terms of art

Restated from `REQUIREMENTS.md` §"Definitions used by the requirements", which remains authoritative.

| Term | Definition |
|---|---|
| Active cluster | A cluster present in the most recent successful NEA retrieval. |
| Ingestion cycle | One complete retrieval-and-store pass over one external data source. |
| Scoring cycle | One complete recomputation of priority scores for all active clusters. |
| Driver | One normalised input to the priority score. |
| Open report | A report whose status is Submitted, Verified or Actioned. |
| Open work order | A work order whose status is Created, Assigned, Accepted or In Progress. |
| Verified report | A report an Operations Manager has set to status Verified. |
| Treatment record | The dated record written when a work order is verified complete. |
| Premises mix | The share of a cluster's premises that are public places or construction sites (1.1.15). |
| Locality | The named area a cluster occupies, from the NEA `LOCALITY` field. A report may bind to a locality without binding to an active cluster. |
| Corroboration count | The number of distinct Residents who have confirmed an existing open report (5.1.13). |
| Stale | A source with no successful retrieval within its defined staleness window. |
| Degraded score | A score computed with one or more drivers excluded as stale (4.1.13). |
| Destructive action | Any action that deletes a record, cancels a work order, or rejects a report or completion. |
| Reason | A free-text justification of at least ten characters, required wherever a requirement names one. |
| Screen | A named, addressable view of the application, listed in `REQUIREMENTS.md` §11.2. |
| Dialog map | The state diagram of screens and the events that move between them (Fox p. 420). |

---