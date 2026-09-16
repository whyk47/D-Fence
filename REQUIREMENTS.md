# D-Fence — Atomised Software Requirements

Version 0.9 · drafted 2026-09-02, revised 2026-09-16 · status: DRAFT for team review
Revised after adversarial review; findings and dispositions are recorded in §14.
Project: NTU SC2006/CZ2006 team project (municipal pest prioritiser)
Product name: D-Fence.

**v0.9 widens the product from dengue to all common household pests and all wild animals requiring
NEA or AVS intervention**, on the TA's suggestion and Yen Kit's decision of 2026-09-16. The scoring
model is generalised to `pest priority x urgency` and specified in `PEST-PRIORITY-MODEL.md`. The
dengue behaviour is unchanged and numerically identical — see 4.2.5.

## How to read this document

Requirements are written to **Fox pp. 126–130**, which Lab 1 §3.2.3 makes mandatory:

- **Atomic** — one testable obligation per requirement. Anything containing "and" that could fail
  independently has been split.
- **"Shall"** — every requirement uses "shall". Never "will", "should", or present tense.
- **Verifiable** — each states an observable condition, a number, or an enumerated set, so a test case
  can pass or fail against it.
- **Hierarchically numbered** — section.subsection.item, so traceability runs requirement → use case →
  design class → code → test case in both directions. **Numbers are permanent.** If a requirement is
  removed, retire the number; do not reuse it.

Sections 1–9 are functional back-end and behavioural requirements. Section 11 is the front-end and
user-interface layer. Section 10 is non-functional. Sections 1–9 and 11 map onto SRS §3; section 10
maps onto SRS §4. Epic and user-story decomposition is in `EPICS-STORIES.md`, which traces back to
these numbers.

## Scope

The system ingests live dengue-cluster, rainfall, forecast and wildlife-observation data for
Singapore, computes a cleaning and treatment **priority score** per locality **and pest type**, lets
residents report pest sightings and breeding sites that change that score, gives an operations
manager a **dashboard** to see one ranking across all pests and **dispatch** cleaning crews against
it, refers cases outside its own authority to the responsible agency, and lets crews close work
orders in the field — which lowers the treated locality's future score. The feedback loop is the
product.

**Pest coverage.** The system covers the five vectors NEA names under pest control (mosquitoes, rats
and rat fleas, cockroaches, flies, bed bugs), the two household pests handled under the vector
control operator regime (termites, ants), and the wild animals AVS publishes guidance for (snakes,
wild boars, macaques, monitor lizards, otters, civets, bats, pangolins, estuarine crocodiles, house
crows, pigeons, Javan mynas, bees and wasps). The enumeration is fixed by 5.1.15.

Out of scope for this version: clinical or case-level data, Singpass/Myinfo integration, payments, a
public API for third parties, non-Singapore geographies, and **marine species** — AVS lists box
jellyfish and hawksbill turtles, which are excluded because they are not municipal-estate pests and
the system has no locality model for coastal waters.

## Actors

| ID | Actor | Description |
|---|---|---|
| A1 | Resident | Registered member of the public. Saves locations, receives alerts, reports breeding sites. |
| A2 | Operations Manager | Town council / environmental services planner. Reads the dashboard, creates and assigns work orders, moderates reports. |
| A3 | Cleaning Crew Member | Field officer. Receives assigned work orders, records completion with evidence. |
| A4 | Scheduler | Internal time-triggered actor. Drives ingestion and scoring cycles. |
| A5 | External Data Provider | NEA dengue clusters, rainfall and forecast APIs, NEA vector control operator registry, iNaturalist observation API, OneMap, Telegram Bot API. |
| A6 | External Dispatch Authority | An agency outside the system's own dispatch chain that receives referred cases — in this version, the NParks Animal and Veterinary Service (AVS). Receives referrals; does not use the system. |

A2 and A3 were added in v0.2. The domain reason is that a priority ranking nobody acts on is not a
system: someone must decide where crews go, and someone must do the work and report back, or the
treatment-recency driver in 4.1.15 has no source. The three actors exist because the feedback loop
needs them.

**Decision on A2 and A3 (2026-09-03, Yen Kit; consistent with the team decision recorded 2026-09-02).**
In Singapore, fogging and larviciding are NEA vector-control functions, while refuse and drain
clearance sit with town councils. The task type set in 8.1.3 spans both, and **D-Fence models both
under a single composite Operations Manager dispatching a single Cleaning Crew role.** This is a
deliberate simplification, declared here rather than engineered away, for three reasons:

1. The system's contribution is the *priority ranking*, which is authority-independent — the same
   ranked list is what either body would work from.
2. Modelling two dispatch authorities would duplicate §8 wholesale for no analytical gain, at the
   cost of a second state machine the 11-week schedule cannot absorb.
3. Narrowing A2 to town-council tasks would drop fogging and larviciding — the two interventions the
   public actually recognises — from the demo.

**What this obliges.** The SRS and the Lab 5 extensibility segment shall state the simplification and
name the extension point: A2 gains a `dispatchAuthority` attribute and 8.1.3's task types are
partitioned by it. Nothing else in the model changes. The alternative — narrowing A2 and removing
fogging and larviciding from 8.1.3 — was considered and rejected on 2026-09-03.

**Extension exercised in v0.9.** The `dispatchAuthority` extension point named above is now used, as
it was always intended to be. Widening the product to wildlife makes the authority question
unavoidable rather than optional: the system's own Cleaning Crew must not be sent to a wild boar.
§8.6 defines referral to A6, and 4.4 defines the override that forces it. A2 remains one composite
role; what is partitioned is the *destination* of a case, not the manager.

**Two pests have a genuinely shared authority and the system does not guess.** Bees and wasps, and
the three nuisance bird species, appear both on the AVS wildlife list and in NEA public-health
nuisance work. Their authority is carried in the pest profile configuration (4.2.3), not hard-coded,
and the team shall record the resolution there before the Lab 5 demo.

## Definitions used by the requirements

| Term | Definition |
|---|---|
| Active cluster | A cluster present in the most recent successful NEA retrieval. |
| Ingestion cycle | One complete retrieval-and-store pass over one external data source. |
| Scoring cycle | One complete recomputation of priority scores for all active clusters. |
| Driver | One normalised input to the priority score (e.g. rainfall 24h). |
| Verified report | A resident report an Operations Manager has set to status Verified. |
| Work order | A unit of dispatched field work against one cluster. |
| Treatment record | The dated record written when a work order is verified complete. |
| Stale | A data source with no successful retrieval within its defined staleness window. |
| Screen | A named, addressable view of the application, listed in §11.2. |
| Dialog map | The state diagram of screens and the events that move them (Fox p. 420). |
| Open report | A report whose status is Submitted, Verified or Actioned. |
| Open work order | A work order whose status is Created, Assigned, Accepted or In Progress. |
| Premises mix | The share of a cluster's premises that are public places or construction sites, defined by requirement 1.1.15. |
| Locality | The named area a cluster occupies, taken from the LOCALITY field of the NEA feed. A report may bind to a locality without binding to an active cluster. |
| Corroboration count | The number of distinct Residents who have confirmed an existing open report under 5.1.13. |
| Destructive action | Any action that deletes a stored record, cancels a work order, or rejects a report or a completion. |
| Reason | A free-text justification of at least ten characters, required wherever a requirement names one. |
| Pest type | One member of the enumeration fixed by 5.1.15. |
| Pest class | The grouping of pest types that determines dispatch authority: VectorBorne, Structural, Nuisance or Wildlife. |
| Pest profile | The stored configuration record for one pest type, holding its severity multiplier, pest class, evidence tier, driver weight set and dispatch authority. Defined by 4.2.3. |
| Severity multiplier | A fixed value in (0, 1] per pest type expressing sustained public-health and municipal burden, defined by 4.2.1. Written σ in `PEST-PRIORITY-MODEL.md`. |
| Urgency | The weighted sum of normalised drivers for one locality and pest type, in [0, 1], defined by 4.1.7. |
| Evidence tier | The classification A, B or C that determines which drivers are available for a pest type, defined by 4.3.1. |
| Observation record | A third-party wildlife or pest sighting retrieved under 1.5, distinct from a Report, which originates with a Resident. |
| Obscured observation | An observation record whose supplier has randomised its coordinates, identified by 1.5.6. |
| Critical override | A rule that forces a case to the top of the queue irrespective of its score, defined by 4.4. |
| Referral | The act of routing a case to an External Dispatch Authority instead of creating an internal work order, defined by §8.6. |
| Registered operator | A vector control operator listed in the NEA registry ingested under 1.6. |

---

# 1. Live Data Acquisition

## 1.1 Dengue cluster ingestion

- **1.1.1** The system shall retrieve the NEA Dengue Clusters GeoJSON feed at intervals of no more than 60 minutes.
- **1.1.2** The system shall parse each retrieved feature into the fields OBJECTID, LOCALITY, CASE_SIZE, HOMES, PUBLIC_PLACES, CONSTRUCTION_SITES, INC_CRC, FMEL_UPD_D and boundary geometry. *(INC_CRC added in v0.5: the payload carries a per-feature checksum, which 1.1.22 uses for change detection.)*
- **1.1.3** The system shall reject any feature missing OBJECTID, LOCALITY, CASE_SIZE or geometry.
- **1.1.4** The system shall log each rejected feature with the retrieval timestamp and the missing field name.
- **1.1.5** The system shall store each accepted feature as a new timestamped snapshot record without overwriting any previous snapshot.
- **1.1.6** The system shall record a first-seen timestamp when a cluster OBJECTID is stored for the first time.
- **1.1.7** The system shall update a cluster's last-updated timestamp whenever any stored attribute value differs from the previous snapshot.
- **1.1.8** The system shall compute the case delta as the current CASE_SIZE minus the CASE_SIZE of the previous snapshot for the same cluster.
- **1.1.9** The system shall classify each cluster on each ingestion cycle as exactly one of NEW, GROWN, UNCHANGED, SHRUNK or CLOSED.
- **1.1.10** The system shall classify a cluster as CLOSED when it is absent from two consecutive successful retrievals.
- **1.1.11** The system shall retry a failed retrieval up to three times at five-minute intervals.
- **1.1.12** The system shall raise an ingestion-failure event when all retries for a cycle fail.
- **1.1.13** The system shall continue to serve the most recent successful snapshot as active data when an ingestion cycle fails.
- **1.1.14** The system shall record for each ingestion run the start time, end time, feature count and outcome.
- **1.1.15** The system shall compute a premises mix value for each cluster as the count of habitat types listed in PUBLIC_PLACES plus the count listed in CONSTRUCTION_SITES, divided by the total count of habitat types listed across HOMES, PUBLIC_PLACES and CONSTRUCTION_SITES, expressed as a value between 0 and 1. *(Rewritten in v0.5. The v0.3 form divided the three fields as if they were counts. A live payload pulled on 2026-09-03 shows they are **comma-separated free text listing breeding-habitat types** — e.g. HOMES = "Domestic container, Bin, Flower pot, Vase…" — so the original arithmetic was not computable. Counting listed habitat types preserves the driver's intent: habitats found outside homes carry more transmission risk per premises.)*
- **1.1.16** The system shall set the premises mix to 0 for a cluster whose three premises fields are all empty or null. *(Rewritten in v0.5 for the field types established by 1.1.15. This is the common case, not an edge case: in the 2026-09-03 payload, 8 of 12 clusters carried no habitat text at all and CONSTRUCTION_SITES was null for 10 of 12. §13 records the consequence for the driver's weight.)*
- **1.1.17** The system shall continue processing the remaining features after a feature is rejected under 1.1.3. *(Split from 1.1.3 in v0.3 for atomicity.)*
- **1.1.18** The system shall provide a manually triggered ingestion run that an Operations Manager may invoke.
- **1.1.19** The system shall retrieve the dataset metadata resource before each scheduled cluster retrieval. *(Added in v0.5.)*
- **1.1.20** The system shall download the GeoJSON payload only when the metadata `lastUpdatedAt` value differs from the value recorded at the last successful download. *(Added in v0.5. The metadata resource is under 2 KB against a 25 KB payload, and the publisher revises the file on the order of days — see §13. This is what makes an hourly cycle honest rather than wasteful, and it is why 1.1.1's interval stands unchanged.)*
- **1.1.21** The system shall record an ingestion run with outcome UNCHANGED, without downloading the payload, when the metadata check under 1.1.20 finds no change. *(Added in v0.5. A skipped download is still evidence the source is alive, so 1.4.x must not mark a healthy source stale merely because nothing was published.)*
- **1.1.22** The system shall treat a feature whose INC_CRC value differs from the stored value for the same OBJECTID as changed, and a feature whose INC_CRC value is unchanged as unchanged. *(Added in v0.5. The publisher supplies a per-feature checksum, so change detection need not compare every attribute.)*
- **1.1.23** The system shall parse HOMES, PUBLIC_PLACES and CONSTRUCTION_SITES as comma-separated lists of habitat-type names, treating a null or empty field as an empty list. *(Added in v0.5. See 1.1.15.)*

## 1.2 Rainfall ingestion

- **1.2.1** The system shall retrieve the real-time rainfall API at intervals of no more than five minutes.
- **1.2.2** The system shall parse each station record into station id, name, latitude and longitude.
- **1.2.3** The system shall parse each reading into timestamp, station id and rainfall value in millimetres.
- **1.2.4** The system shall exclude any reading whose timestamp is more than 30 minutes older than the retrieval time.
- **1.2.5** The system shall assign to each active cluster the three nearest rainfall stations by great-circle distance from the cluster centroid.
- **1.2.6** The system shall compute a cluster rainfall value for each cycle as the inverse-distance-weighted mean of its three assigned stations.
- **1.2.7** The system shall maintain a rolling 24-hour rainfall accumulation per active cluster in millimetres to one decimal place.
- **1.2.8** The system shall maintain a rolling 72-hour rainfall accumulation per active cluster in millimetres to one decimal place.
- **1.2.9** The system shall maintain the same 24-hour and 72-hour accumulations for each saved location.
- **1.2.10** The system shall mark rainfall data as stale when no reading has been accepted for 30 minutes.

## 1.3 Forecast ingestion

- **1.3.1** The system shall retrieve the 24-hour weather forecast at intervals of no more than six hours.
- **1.3.2** The system shall map each active cluster to exactly one of the five forecast regions {north, south, east, west, central} by the region polygon containing the cluster centroid.
- **1.3.3** The system shall derive a heavy-rain-expected flag per cluster that is true when the forecast text for its mapped region contains any of "Heavy", "Thundery Showers" or "Showers".
- **1.3.4** The system shall store the forecast validity period alongside each derived value.
- **1.3.5** The system shall record the forecast region assigned to each cluster so that the flag's basis is inspectable.

> **Corrected in v0.3.** The previous 1.3.2 specified centroid containment against named forecast
> *areas* with centroids. That is the shape of the **2-hour** nowcast (45 named areas). The verified
> test pull of the **24-hour** forecast returns `periods[regions{north, south, east, west, central}]`
> — five macro-regions, no area polygons (`research/API-INVENTORY.md`, line 111). The requirement is
> now written against the shape the endpoint actually returns. The 24-hour horizon that alert
> requirement 6.1.5 depends on is preserved; the cost is coarser spatial resolution, which is
> acceptable for a rain-is-coming flag and must be stated as a limitation in the demo.

## 1.4 Source health

- **1.4.1** The system shall record the last successful retrieval timestamp for every external data source.
- **1.4.2** The system shall display each source's last successful retrieval timestamp to an Operations Manager.
- **1.4.3** The system shall raise a source-health warning when a source has had no successful retrieval for three consecutive scheduled intervals.
- **1.4.4** The system shall display a staleness indicator on any screen presenting data from a stale source.

## 1.5 Wildlife and pest observation ingestion

*(Added in v0.9. Source: iNaturalist observations API, Singapore `place_id=6734`, verified live
2026-09-16. This is the only live feed that exists for any pest other than the mosquito — see §13.)*

- **1.5.1** The system shall retrieve observation records for every pest type whose evidence tier is B at intervals of no more than 24 hours.
- **1.5.2** The system shall request observation records only for the taxon identifier recorded in the pest profile of the pest type being retrieved.
- **1.5.3** The system shall parse each retrieved observation into the fields observation id, observed date, taxon name, latitude, longitude, positional accuracy, quality grade and obscured flag.
- **1.5.4** The system shall reject any observation missing an observed date, a latitude or a longitude.
- **1.5.5** The system shall reject any observation whose observed date is more than 90 days before the retrieval date.
- **1.5.6** The system shall reject any observation whose obscured flag is true.
- **1.5.7** The system shall reject any observation whose positional accuracy exceeds 500 metres.
- **1.5.8** The system shall record the count of observations rejected under each of 1.5.4 to 1.5.7 for every ingestion run.
- **1.5.9** The system shall bind each accepted observation to the locality containing its coordinates.
- **1.5.10** The system shall discard an accepted observation that binds to no locality.
- **1.5.11** The system shall store each accepted observation without overwriting any previously stored observation.
- **1.5.12** The system shall retry a failed retrieval up to three times at five-minute intervals.
- **1.5.13** The system shall continue to serve the most recently stored observations when a retrieval cycle fails.
- **1.5.14** The system shall record for each observation ingestion run the start time, end time, pest type, accepted count, rejected count and outcome.

## 1.6 Vector control operator registry ingestion

*(Added in v0.9. Source: NEA Registered Vector Control Operator dataset
`d_0921c2daa08b8bd846d2405c934da8c6`, 290 rows, verified 2026-09-16. Static reference data, not a
live feed — see 1.6.7 and §13.)*

- **1.6.1** The system shall load the NEA registered vector control operator dataset at application startup.
- **1.6.2** The system shall parse each row into the fields company name, block or house number, street name, postal code and telephone number.
- **1.6.3** The system shall reject any row whose postal code is not a six-digit value.
- **1.6.4** The system shall resolve each accepted row's postal code to a latitude and longitude using the geocoding service.
- **1.6.5** The system shall cache every resolved coordinate and shall not re-resolve a postal code already held in the cache.
- **1.6.6** The system shall retain the most recently cached registry when a load fails.
- **1.6.7** The system shall present the registry with the publication date of its source dataset wherever it is displayed, and shall not present it as live data.
- **1.6.8** The system shall compute, for each locality, the straight-line distance to the nearest registered operator.

---

# 2. Accounts, Roles and Access Control

## 2.1 Registration and authentication

- **2.1.1** The system shall allow a member of the public to register with an email address and a password.
- **2.1.2** The system shall reject a password shorter than eight characters.
- **2.1.3** The system shall reject a password that does not contain at least one letter and one digit.
- **2.1.4** The system shall reject a registration whose email address is already registered.
- **2.1.5** The system shall send a verification link to the registered email address.
- **2.1.6** The system shall refuse to authenticate an account whose email address has not been verified.
- **2.1.7** The system shall authenticate a user against the stored email address and password hash.
- **2.1.8** The system shall issue a session token on successful authentication.
- **2.1.9** The system shall expire a session token after 24 hours of inactivity.
- **2.1.10** The system shall lock an account for 15 minutes after five consecutive failed authentication attempts within 15 minutes.
- **2.1.11** The system shall allow a user to request a password reset link that is valid for 30 minutes and usable once.
- **2.1.12** The system shall terminate the active session when a user logs out.

## 2.2 Roles

- **2.2.1** The system shall assign every account exactly one role from the set {Resident, Operations Manager, Cleaning Crew}.
- **2.2.2** The system shall assign the Resident role to every self-registered account.
- **2.2.3** The system shall allow only an Operations Manager to create an account with the Operations Manager or Cleaning Crew role.
- **2.2.4** The system shall allow an Operations Manager to deactivate any Cleaning Crew or Resident account.
- **2.2.5** The system shall refuse authentication to a deactivated account.

## 2.3 Access control

- **2.3.1** The system shall permit a Resident to read only their own saved locations.
- **2.3.2** The system shall permit a Resident to read only their own report submissions in identified form.
- **2.3.3** The system shall deny a Resident access to the operations dashboard and to all work orders.
- **2.3.4** The system shall permit an Operations Manager to read all reports, priority scores, work orders and crew records.
- **2.3.5** The system shall permit a Cleaning Crew Member to read only work orders assigned to that member.
- **2.3.6** The system shall enforce every access rule on the server, independently of any interface control.
- **2.3.7** The system shall return an authorisation error when a user requests a resource their role may not read.
- **2.3.8** The system shall log every authorisation error raised under 2.3.7 with the requesting user id, the resource and the timestamp. *(Split from 2.3.7 in v0.3 for atomicity.)*

## 2.4 Audit

- **2.4.1** The system shall record the acting user id, action, target entity id and timestamp for every operation that changes stored state.
- **2.4.2** The system shall prevent modification or deletion of an audit record by any role.

---

# 3. Saved Locations and Exposure

- **3.1.1** The system shall allow a Resident to store up to five saved locations.
- **3.1.2** The system shall accept a saved location entered as a Singapore postal code or as a free-text address.
- **3.1.3** The system shall geocode an entered location to latitude and longitude using the OneMap Search API.
- **3.1.4** The system shall present up to five candidate matches for confirmation when geocoding returns more than one result.
- **3.1.5** The system shall reject a saved location for which geocoding returns no result.
- **3.1.6** The system shall require each saved location to carry a label from the set {Home, Workplace, School, Other}.
- **3.1.7** The system shall allow a Resident to give each saved location an optional free-text name of up to 40 characters.
- **3.1.8** The system shall evaluate each saved location against every active cluster boundary on each cluster ingestion cycle.
- **3.1.9** The system shall record each saved location's exposure status as exactly one of IN_CLUSTER, WITHIN_150M or CLEAR.
- **3.1.10** The system shall display for each saved location its exposure status, the containing or nearest cluster name, that cluster's case size, and the data timestamp.
- **3.1.11** The system shall allow a Resident to delete a saved location.
- **3.1.12** The system shall delete all alert subscriptions attached to a saved location when that location is deleted.
- **3.1.13** The system shall state that no match was found when a saved location is rejected under 3.1.5. *(Split from 3.1.5 in v0.3 for atomicity.)*
- **3.1.14** The system shall obtain a OneMap API token before the stored token expires.
- **3.1.15** The system shall refresh the OneMap API token automatically at intervals of no more than 48 hours.
- **3.1.16** The system shall raise a source-health warning when a OneMap request fails with an authentication error.
- **3.1.17** The system shall state that address lookup is temporarily unavailable, rather than that no match was found, when a geocoding request fails for a reason other than no result.

> **Added in v0.3.** The OneMap token is valid for three days (`research/API-INVENTORY.md`, line 25)
> and OneMap Search has **not** been test-pulled. An 11-week project will silently lose geocoding and
> the map base layer when the token lapses, most likely at the worst moment. 3.1.14–3.1.17 make
> refresh and failure handling explicit obligations rather than something someone remembers to do.

---

# 4. Priority Scoring Engine

- **4.1.1** The system shall compute a priority score for every combination of active locality and covered pest type on each scoring cycle. *(Revised in v0.9 from "every active cluster". A cluster is a mosquito-specific construct; the general scored subject is a locality and a pest type.)*
- **4.1.2** The system shall execute a scoring cycle within ten minutes of the completion of each cluster ingestion cycle.
- **4.1.3** The system shall compute the urgency value of a locality and pest type from exactly the drivers named by the driver weight set of that pest type's evidence tier, as defined by 4.3.4 to 4.3.6. *(Revised in v0.9. The v0.8 form fixed seven drivers for every scored subject, which is computable only for the mosquito: no other pest has a case count and rainfall does not predict cockroach pressure. The seven drivers named in v0.8 are retained unchanged as the tier A set in 4.3.4, so this revision widens the rule without altering any dengue result — see 4.2.5.)*
- **4.1.4** The system shall normalise each driver to a value between 0 and 1 using the normalisation method documented for that driver in `SCORING-SPEC.md` §2. *(Revised in v0.5. The method per driver was named nowhere until `SCORING-SPEC.md` was written; the strategy classes implementing them are in `src/control/normalisation/`.)*
- **4.1.5** The system shall read driver weights from the configuration source defined by 10.6.2. *(v0.5: the default weight set and its justification are in `SCORING-SPEC.md` §3, shipped as `config/scoring.default.json`. It is a proposal to be revised against real data, not a sourced fact — see §13.)*
- **4.1.6** The system shall reject a weight configuration whose weights do not sum to 1.0.
- **4.1.7** The system shall compute the urgency value as the weighted sum of normalised drivers, expressed as a value between 0 and 1. *(Revised in v0.9. The weighted sum is now an intermediate value; 4.2.4 defines how the priority score is formed from it.)*
- **4.1.8** The system shall assign a priority tier of High when a cluster's score is 70.0 or above, Medium when it is between 40.0 and 69.9, and Low when it is below 40.0.
- **4.1.9** The system shall read the tier thresholds from the configuration source defined by 10.6.2.
- **4.1.10** The system shall store, for every scored cluster, each driver's normalised value and its weighted contribution to the final score.
- **4.1.11** The system shall retain the score, tier and driver breakdown of every scoring cycle as history.
- **4.1.12** The system shall exclude any driver whose source is stale from the score.
- **4.1.13** The system shall mark a score as DEGRADED when any driver has been excluded.
- **4.1.14** The system shall rank scored subjects in descending score order, breaking ties by severity multiplier, then by verified open report count, then by locality name. *(Revised in v0.9. The v0.8 tie-break used case size, which exists for the mosquito alone and is therefore not a general rule.)*
- **4.1.15** The system shall compute days since last treatment for a cluster from the most recent verified treatment record for that cluster.
- **4.1.16** The system shall use a default value of 90 days since last treatment for a cluster with no treatment record.
- **4.1.17** The system shall produce a lower priority score for a cluster after a treatment record is written for it, when all other driver values are unchanged.
- **4.1.18** The system shall make the driver breakdown for any cluster available to an Operations Manager on demand.
- **4.1.19** The system shall renormalise the remaining driver weights to sum to 1.0 after a driver is excluded under 4.1.12. *(Split from 4.1.12 in v0.3 for atomicity.)*
- **4.1.20** The system shall name every excluded driver alongside a score marked DEGRADED. *(Split from 4.1.13 in v0.3 for atomicity.)*
- **4.1.21** The system shall normalise the premises mix driver using the value computed by 1.1.15 without further transformation.
- **4.1.22** The system shall compute the report velocity driver as the count of verified reports of the scored pest type bound to the scored locality in the preceding 14 days. *(Added in v0.9.)*
- **4.1.23** The system shall compute the corroboration density driver as the mean corroboration count of the open verified reports of the scored pest type bound to the scored locality. *(Added in v0.9.)*
- **4.1.24** The system shall compute the external observation density driver as the count of observation records of the scored pest type bound to the scored locality in the preceding 90 days. *(Added in v0.9.)*
- **4.1.25** The system shall compute the response capacity deficit driver from the distance computed by 1.6.8 for the scored locality. *(Added in v0.9.)*
- **4.1.26** The system shall label the external observation density driver as recent wildlife activity wherever it is displayed, and shall not label it as pest pressure. *(Added in v0.9. An observation record is a naturalist's sighting, not a complaint; §13 records the consequence and `PEST-PRIORITY-MODEL.md` §5.4 the reasoning.)*

## 4.2 Pest severity

*(Added in v0.9. The severity values and the rubric behind them are in `PEST-PRIORITY-MODEL.md` §4.)*

- **4.2.1** The system shall hold a severity multiplier for every covered pest type, expressed as a value greater than 0 and no greater than 1.
- **4.2.2** The system shall read every severity multiplier from the configuration source defined by 10.6.2.
- **4.2.3** The system shall hold for every covered pest type a pest profile carrying its severity multiplier, pest class, evidence tier, driver weight set, dispatch authority and, where its evidence tier is B, its observation taxon identifier.
- **4.2.4** The system shall compute the priority score as the severity multiplier of the scored pest type multiplied by the urgency value of the scored subject, expressed on a 0–100 scale to one decimal place.
- **4.2.5** The system shall compute a priority score for the mosquito pest type that equals the weighted sum of the seven drivers named in version 0.8 of requirement 4.1.3, on the same 0–100 scale. *(Added in v0.9. This is the compatibility obligation, and it is testable: the mosquito severity multiplier is 1.000 by construction and the tier A weight set is v0.8's unchanged, so every dengue score, tier assignment and test expectation carries over. A test that fails this requirement means the generalisation has broken the existing system.)*
- **4.2.6** The system shall reject a pest profile configuration in which any severity multiplier lies outside the range permitted by 4.2.1.
- **4.2.7** The system shall reject a pest profile configuration in which no pest type carries a severity multiplier of 1.0. *(Added in v0.9. The multipliers are normalised against the most severe pest in the catalogue, which is what keeps the tier thresholds in 4.1.8 meaning what they meant in v0.8.)*
- **4.2.8** The system shall display the severity multiplier alongside the priority score wherever a score of one pest type is presented beside a score of another.

## 4.3 Evidence tiers and driver availability

*(Added in v0.9. Tier assignment per pest and the evidence behind it are in `PEST-PRIORITY-MODEL.md`
§3.)*

- **4.3.1** The system shall assign every covered pest type an evidence tier from the set {A, B, C}.
- **4.3.2** The system shall assign evidence tier A only to a pest type for which an authoritative government feed is ingested.
- **4.3.3** The system shall assign evidence tier B only to a pest type for which observation records are ingested under 1.5.
- **4.3.4** The system shall use, for a pest type of evidence tier A, the driver set {case size, case growth delta, 24-hour rainfall, 72-hour rainfall, verified open report count, days since last treatment, premises mix}.
- **4.3.5** The system shall use, for a pest type of evidence tier B, the driver set {verified open report count, report velocity, external observation density, days since last treatment, corroboration density, response capacity deficit}.
- **4.3.6** The system shall use, for a pest type of evidence tier C, the driver set {verified open report count, report velocity, days since last treatment, corroboration density, response capacity deficit}.
- **4.3.7** The system shall reject a driver weight set whose weights do not sum to 1.0.
- **4.3.8** The system shall reject a driver weight set that names a driver not available to the evidence tier of the pest type it applies to.
- **4.3.9** The system shall display the evidence tier of a scored subject alongside its priority score.
- **4.3.10** The system shall compute a priority score for a pest type of evidence tier C without requiring any external data source. *(Added in v0.9. Tier C runs on stored reports, corroborations and treatment records alone. This is what makes the model complete for bed bugs and fleas, which have no external feed of any kind — see §13.)*

## 4.4 Critical override

*(Added in v0.9. A linear weighted sum cannot express acute life-safety and this requirement set
exists so that it is not asked to — see `PEST-PRIORITY-MODEL.md` §6.)*

- **4.4.1** The system shall evaluate every verified report against the critical override rules held in configuration.
- **4.4.2** The system shall read the critical override rules from the configuration source defined by 10.6.2.
- **4.4.3** The system shall assign a priority tier of Critical to any scored subject whose verified report matches a critical override rule, irrespective of its priority score.
- **4.4.4** The system shall rank every subject in the Critical tier above every subject in the High tier.
- **4.4.5** The system shall retain and display the computed priority score of a subject raised to the Critical tier.
- **4.4.6** The system shall name the matched override rule on every subject raised to the Critical tier.
- **4.4.7** The system shall raise a report of a pest type whose pest class is Wildlife to the Critical tier when the report records an indoor location.
- **4.4.8** The system shall raise a report to the Critical tier when the report records an injury.
- **4.4.9** The system shall notify the Operations Manager within one minute of a subject being raised to the Critical tier.

---

# 5. Community Pest Reporting

## 5.1 Submission

- **5.1.1** The system shall allow an authenticated Resident to submit a breeding-site report.
- **5.1.2** The system shall require each report to carry a location given as a map pin or an address.
- **5.1.3** The system shall require each report to carry a type from the set {Standing water, Uncleared refuse, Blocked drain, Overgrown vegetation, Other}.
- **5.1.4** The system shall require each report to carry a description of no more than 500 characters.
- **5.1.5** The system shall allow up to three photographs per report.
- **5.1.6** The system shall reject a photograph larger than 5 MB or of a format other than JPEG or PNG.
- **5.1.7** The system shall associate each report with the active cluster containing its location.
- **5.1.8** The system shall associate a report whose location falls in no active cluster with the nearest locality within one kilometre.
- **5.1.9** The system shall set a report's locality binding to Unassigned when no locality lies within one kilometre. Unassigned is a value of the locality binding, not a status; the status set is defined by 5.2.1 and is unaffected.
- **5.1.10** The system shall record the submission timestamp and the reporter's user id on every report.
- **5.1.11** The system shall reject a report of the same type submitted within 50 metres of an existing open report within the preceding 24 hours.
- **5.1.12** The system shall offer the Resident the option to confirm the existing report when a submission is rejected as a duplicate.
- **5.1.13** The system shall allow a Resident to confirm any open report once.
- **5.1.14** The system shall increment a report's corroboration count on each confirmation made under 5.1.13. *(Split from 5.1.13 in v0.3 for atomicity.)*
- **5.1.15** The system shall require each report to carry exactly one pest type from the set {Mosquito, Rat, Cockroach, Fly, Bed bug, Flea, Termite, Ant, Snake, Wild boar, Macaque, Monitor lizard, Otter, Civet, Bat, Pangolin, Crocodile, House crow, Pigeon, Javan myna, Bee or wasp, Other}. *(Added in v0.9. The enumeration is NEA's five pest-control vectors, the two household pests under the vector control operator regime, and the wild animals AVS publishes guidance for. Marine species are excluded — see Scope.)*
- **5.1.16** The system shall require a report whose pest type is of pest class Wildlife to carry a location context from the set {Indoor, Outdoor}. *(Added in v0.9. 4.4.7 depends on this value.)*
- **5.1.17** The system shall allow any report to record whether an injury occurred. *(Added in v0.9. 4.4.8 depends on this value.)*
- **5.1.18** The system shall treat a report as a duplicate under 5.1.11 only when the existing open report carries the same pest type. *(Added in v0.9. Without this, a snake report within 50 metres of an open cockroach report would be refused as a duplicate.)*
- **5.1.19** The system shall retain the report type set defined by 5.1.3 as a description of the condition observed, independent of the pest type required by 5.1.15. *(Added in v0.9. The two are orthogonal: a blocked drain is a condition, a cockroach is a pest, and a report may carry both.)*

## 5.2 Lifecycle

- **5.2.1** The system shall assign every report a status from the set {Submitted, Verified, Rejected, Actioned, Closed}.
- **5.2.2** The system shall set a newly submitted report's status to Submitted.
- **5.2.3** The system shall allow only an Operations Manager to change a report's status to Verified or Rejected.
- **5.2.4** The system shall require a reason of at least ten characters when a report is set to Rejected.
- **5.2.5** The system shall include only reports with status Verified or Actioned in the open verified report count used by requirement 4.1.3.
- **5.2.6** The system shall set a report's status to Actioned when it is linked to a work order that has been assigned.
- **5.2.7** The system shall set a report's status to Closed when its linked work order is verified complete.
- **5.2.8** The system shall notify the reporting Resident on every change to their report's status.
- **5.2.9** The system shall present reports submitted by other Residents without the reporter's identity.

## 5.3 Moderation

- **5.3.1** The system shall present an Operations Manager with a moderation queue of all reports with status Submitted.
- **5.3.2** The system shall sort the moderation queue by submission time, oldest first, by default.
- **5.3.3** The system shall allow the moderation queue to be filtered by cluster and by report type.
- **5.3.4** The system shall record the moderating user id, timestamp and reason on every moderation decision, where a reason is as defined in the definitions table.
- **5.3.5** The system shall withhold a report's photographs from all Residents other than the reporter until the report is Verified.
- **5.3.6** The system shall allow the moderation queue to be filtered by pest type. *(Added in v0.9.)*
- **5.3.7** The system shall sort the moderation queue so that reports matching a critical override rule appear first, ahead of the order defined by 5.3.2. *(Added in v0.9. A verified snake-indoors report that waits its turn in an oldest-first queue defeats 4.4.)*

---

# 6. Resident Alerts

- **6.1.1** The system shall allow a Resident to enable or disable alerts independently for each saved location.
- **6.1.2** The system shall generate an alert when a saved location's exposure status changes to IN_CLUSTER.
- **6.1.3** The system shall generate an alert when the cluster containing a saved location grows by at least the configured case-growth threshold.
- **6.1.4** The system shall use a default case-growth alert threshold of five cases.
- **6.1.5** The system shall generate an alert when heavy rain is forecast within 24 hours for an active cluster containing a saved location.
- **6.1.6** The system shall deliver alerts through the Telegram Bot API to the chat linked to the Resident's account.
- **6.1.7** The system shall link a Resident's Telegram chat by means of a single-use code that expires after 15 minutes.
- **6.1.8** The system shall include in every alert the location label, the cluster name, the trigger reason, the current case size and the data timestamp.
- **6.1.9** The system shall send no more than one alert per saved location per trigger type in any 24-hour period.
- **6.1.10** The system shall log every alert with recipient, trigger type, timestamp and delivery outcome.
- **6.1.11** The system shall retry a failed alert delivery twice at five-minute intervals before recording the outcome as FAILED.

---

# 7. Operations Dashboard

*(New feature, added 2026-09-02. Serves the Operations Manager actor.)*

## 7.1 Overview panel

- **7.1.1** The system shall present the operations dashboard as the landing screen for an authenticated Operations Manager.
- **7.1.2** The dashboard shall display the count of active clusters.
- **7.1.3** The dashboard shall display the total active case count across all active clusters.
- **7.1.4** The dashboard shall display the count of clusters in the High priority tier.
- **7.1.5** The dashboard shall display the count of verified reports that are not Closed.
- **7.1.6** The dashboard shall display the count of open work orders and the count of overdue work orders.
- **7.1.7** The dashboard shall display, for each of the counts in 7.1.2 to 7.1.6, the change against the value seven days earlier.
- **7.1.8** The dashboard shall refresh its displayed values at intervals of no more than five minutes without a manual page reload.
- **7.1.9** The dashboard shall display the timestamp of the data it is presenting.

## 7.2 Priority table

- **7.2.1** The dashboard shall present all active clusters in descending priority-score order.
- **7.2.2** The priority table shall display for each cluster the rank, locality, case size, case delta, 24-hour rainfall, verified open report count, days since last treatment, priority score, priority tier and work-order status.
- **7.2.3** The system shall allow the priority table to be sorted by any displayed column.
- **7.2.4** The system shall allow the priority table to be filtered by priority tier.
- **7.2.5** The system shall allow the priority table to be filtered by work-order status.
- **7.2.6** The system shall display the full driver contribution breakdown for a cluster when its row is expanded.
- **7.2.7** The system shall open the cluster detail view when a row is selected.
- **7.2.8** The system shall mark every row whose score is DEGRADED.
- **7.2.9** The system shall name the excluded driver on every row marked under 7.2.8. *(Split from 7.2.8 in v0.3 for atomicity.)*
- **7.2.10** The priority table shall display the pest type and evidence tier of every row. *(Added in v0.9.)*
- **7.2.11** The system shall allow the priority table to be filtered by pest type. *(Added in v0.9.)*
- **7.2.12** The system shall allow the priority table to be filtered by pest class. *(Added in v0.9.)*
- **7.2.13** The system shall present rows of every pest type in one ranking by default, rather than in a separate ranking per pest type. *(Added in v0.9. One comparable queue across all pests is the purpose of the model in `PEST-PRIORITY-MODEL.md`; a per-pest view is a filter applied to it, not the default.)*
- **7.2.14** The system shall distinguish every row in the Critical tier from every other row by a visual treatment that does not rely on colour alone. *(Added in v0.9. Traces to 10.5.x and 11.7.x on accessibility.)*
- **7.2.15** The priority table shall display, for each row, only the drivers available to that row's evidence tier. *(Added in v0.9. The v0.8 column set in 7.2.2 names case size and rainfall, which are empty for every pest outside tier A.)*

## 7.3 Analytics

- **7.3.1** The dashboard shall display a time series of total active cases over the preceding 30 days.
- **7.3.2** The dashboard shall display the distribution of active clusters across the three priority tiers.
- **7.3.3** The dashboard shall display the count of open work orders per Cleaning Crew Member.
- **7.3.4** The dashboard shall display the median elapsed time from work-order creation to verified completion over the preceding 30 days.
- **7.3.5** The dashboard shall display the count of reports received per day over the preceding 30 days.

## 7.4 Working state

- **7.4.1** The system shall persist an Operations Manager's most recent table filter selections between sessions.
- **7.4.2** The system shall allow the current priority table view to be exported as a CSV file.
- **7.4.3** The exported CSV file shall contain every column and every row of the current filtered view.

## 7.5 Attention panel

- **7.5.1** The dashboard shall display every open source-health warning raised under requirement 1.4.3.
- **7.5.2** The dashboard shall display every overdue work order.
- **7.5.3** The dashboard shall display the count of reports awaiting moderation.
- **7.5.4** The system shall link each attention item to the screen on which it can be resolved.
- **7.5.5** The dashboard shall display every work order carrying an issue flag raised under requirement 8.3.8. *(Added in v0.4. Use case 6.7 surfaced issue-flagged work orders to the manager, but no requirement obliged the dashboard to show them, so a raised issue could be recorded and never seen. Found by adversarial review of the Lab 2 model.)*

---

# 8. Work-Order Dispatch and Crew Execution

*(New feature, added 2026-09-02. Replaces and extends the former "planner work queue".)*

## 8.1 Creation

- **8.1.1** The system shall allow an Operations Manager to create a work order against an active cluster.
- **8.1.2** The system shall allow an Operations Manager to create a work order against a verified report.
- **8.1.3** The system shall require each work order to carry a task type from the set {Fogging, Larviciding, Refuse clearance, Drain clearance, Inspection}.
- **8.1.4** The system shall require each work order to carry a scheduled date that is not in the past.
- **8.1.5** The system shall default a new work order's priority to the priority tier of its target cluster.
- **8.1.6** The system shall allow instructions of up to 1000 characters on a work order.
- **8.1.7** The system shall propose a daily dispatch list consisting of the highest-scoring active clusters that have no open work order.
- **8.1.8** The system shall limit the proposed dispatch list to a configurable number of clusters, defaulting to ten.
- **8.1.9** The system shall allow an Operations Manager to accept, edit or reject each item on the proposed dispatch list individually.
- **8.1.10** The system shall create work orders only for accepted dispatch-list items.
- **8.1.11** The system shall refuse to create a second open work order of the same task type for the same cluster.
- **8.1.12** The system shall offer the existing open work order when creation is refused under 8.1.11.
- **8.1.13** The system shall link every verified open report inside the target cluster to a newly created work order.
- **8.1.14** The system shall refuse to create a work order against a report whose pest type is of pest class Wildlife. *(Added in v0.9. The system's Cleaning Crew is not equipped or authorised to handle wildlife; §8.6 defines what happens instead.)*
- **8.1.15** The system shall offer the referral action defined by 8.6.1 when creation is refused under 8.1.14. *(Added in v0.9.)*
- **8.1.16** The system shall require each work order to carry the pest type of the case it addresses. *(Added in v0.9.)*
- **8.1.17** The system shall restrict the task types offered for a work order to those permitted for the work order's pest class by configuration. *(Added in v0.9. Fogging is not a response to a rat.)*

## 8.2 Assignment

- **8.2.1** The system shall allow an Operations Manager to assign a work order to exactly one Cleaning Crew Member.
- **8.2.2** The system shall display each candidate crew member's count of open work orders at the point of assignment.
- **8.2.3** The system shall refuse to assign a work order to a deactivated account.
- **8.2.4** The system shall notify the assignee within one minute of assignment.
- **8.2.5** The system shall allow an Operations Manager to reassign a work order whose status is Assigned, Accepted or In Progress. *(Corrected in v0.3: the previous wording permitted reassignment of a Verified work order, which contradicts 8.3.12, 8.5.1 and 8.5.3, all of which treat Verified as terminal.)*
- **8.2.6** The system shall notify both the previous and the new assignee on reassignment.
- **8.2.7** The system shall retain every previous assignee in the work order's audit history.

## 8.3 Lifecycle

- **8.3.1** The system shall assign every work order a status from the set {Created, Assigned, Accepted, In Progress, Completed, Verified, Rejected, Cancelled}.
- **8.3.2** The system shall permit only the state transitions defined in the work-order state table below.
- **8.3.3** The system shall reject any requested transition not permitted by 8.3.2.

**Work-order state table.** *(Added in v0.3. 8.3.2 previously cited a table that did not exist, which
made it unverifiable and left the Lab 4 basis-path test with nothing to path over.)*

| From | To | Trigger | Actor |
|---|---|---|---|
| — | Created | Work order created | Operations Manager |
| Created | Assigned | Assignment | Operations Manager |
| Created | Cancelled | Cancellation with reason | Operations Manager |
| Assigned | Accepted | Acceptance | Assigned Crew Member |
| Assigned | Assigned | Reassignment | Operations Manager |
| Assigned | Cancelled | Cancellation with reason | Operations Manager |
| Accepted | In Progress | Work started | Assigned Crew Member |
| Accepted | Assigned | Reassignment | Operations Manager |
| Accepted | Cancelled | Cancellation with reason | Operations Manager |
| In Progress | Completed | Completion with evidence | Assigned Crew Member |
| In Progress | Assigned | Reassignment | Operations Manager |
| In Progress | Cancelled | Cancellation with reason | Operations Manager |
| Completed | Verified | Completion accepted | Operations Manager |
| Completed | Rejected | Completion rejected with reason | Operations Manager |
| Rejected | In Progress | Crew member resumes work | Assigned Crew Member |
| Verified | — | Terminal | — |
| Cancelled | — | Terminal | — |
- **8.3.4** The system shall allow the assigned Cleaning Crew Member to set a work order from Assigned to Accepted.
- **8.3.5** The system shall allow the assigned Cleaning Crew Member to set an Accepted work order to In Progress.
- **8.3.6** The system shall require a completion timestamp, a task-performed confirmation, at least one photograph and free-text notes before a work order may be set to Completed.
- **8.3.7** The system shall reject a completion submission that carries no photograph.
- **8.3.8** The system shall allow a Cleaning Crew Member to raise an issue flag with a reason on a work order at any time before completion.
- **8.3.9** The system shall allow an Operations Manager to set a Completed work order to Verified or to Rejected.
- **8.3.10** The system shall require a reason when a completion is Rejected.
- **8.3.11** The system shall notify the assigned crew member when their completion is Rejected.
- **8.3.12** The system shall write a treatment record carrying the cluster, task type and completion date when a work order is set to Verified.
- **8.3.13** The system shall allow an Operations Manager to cancel a work order whose status is Created, Assigned, Accepted or In Progress.
- **8.3.14** The system shall flag a work order as overdue when its scheduled date has passed and its status is not Completed, Verified or Cancelled.
- **8.3.15** The system shall set a newly created work order's status to Created.
- **8.3.16** The system shall state the reason a transition was refused under 8.3.3. *(Split from 8.3.3 in v0.3 for atomicity.)*
- **8.3.17** The system shall record the start timestamp when a work order is set to In Progress. *(Split from 8.3.5 in v0.3 for atomicity.)*
- **8.3.18** The system shall require a reason for every cancellation made under 8.3.13. *(Split from 8.3.13 in v0.3 for atomicity.)*
- **8.3.19** The system shall retain a rejected completion in status Rejected until the assigned Cleaning Crew Member resumes work. *(Clarified in v0.3: Rejected is a resting state a screen can display, not a status the system passes through instantaneously.)*
- **8.3.20** The system shall allow the assigned Cleaning Crew Member to return a Rejected work order to In Progress.
- **8.3.21** The system shall return every report linked to a cancelled work order to the status it held before the work order was created. *(Added in v0.4. Nothing previously governed report status on cancellation, so a report linked to a cancelled work order would have remained Actioned indefinitely — invisible in the moderation queue while the breeding site still existed. Found by adversarial review of the Lab 2 model.)*

## 8.4 Crew working view

- **8.4.1** The system shall present an authenticated Cleaning Crew Member with only the work orders assigned to that member.
- **8.4.2** The crew view shall sort work orders by scheduled date ascending and then by priority tier.
- **8.4.3** The crew view shall display for each work order the locality, task type, scheduled date, priority tier and instructions.
- **8.4.4** The crew view shall display the target cluster boundary on a map.
- **8.4.5** The crew view shall display every report linked to the work order, including its description and photographs.
- **8.4.6** The system shall allow a Cleaning Crew Member to filter their work orders by Today, Upcoming and Completed.
- **8.4.7** The system shall allow a Cleaning Crew Member to add a progress note to a work order that is In Progress.

## 8.5 Closing the loop

- **8.5.1** The system shall set every report linked to a Verified work order to status Closed.
- **8.5.2** The system shall notify each reporting Resident when their report is Closed.
- **8.5.3** The system shall recompute the target cluster's priority score within one scoring cycle of a work order being Verified.
- **8.5.4** The cluster detail view shall display the priority score immediately before and immediately after the most recent verified treatment.

---

## 8.6 Referral to an external authority

*(Added in v0.9. Serves actor A6. This is the behaviour that makes widening the product to wildlife
honest rather than cosmetic: the system declines work it has no authority to do, and says who does.)*

- **8.6.1** The system shall allow an Operations Manager to refer a verified report to an External Dispatch Authority.
- **8.6.2** The system shall determine the referral destination from the dispatch authority held in the pest profile of the report's pest type.
- **8.6.3** The system shall display the referral destination's name and published contact number when a referral is offered.
- **8.6.4** The system shall record the referring user id, the destination, the timestamp and a reason on every referral.
- **8.6.5** The system shall set a referred report's status to Actioned.
- **8.6.6** The system shall notify the reporting Resident that their report has been referred, naming the destination authority.
- **8.6.7** The system shall present a referred report in the operations dashboard as referred, distinct from a report with an open work order.
- **8.6.8** The system shall allow an Operations Manager to record the outcome of a referral.
- **8.6.9** The system shall set a referred report's status to Closed when its outcome is recorded.
- **8.6.10** The system shall not create, assign or dispatch a work order to a Cleaning Crew Member as a consequence of a referral.
- **8.6.11** The system shall exclude a referred report from the days since last treatment driver, and shall not write a treatment record on referral. *(Added in v0.9. The system did not treat the locality, so claiming treatment recency would corrupt 4.1.17's feedback loop.)*

---

# 9. Map, Trend and History

- **9.1.1** The system shall display all active cluster boundaries on a map.
- **9.1.2** The system shall colour each cluster boundary according to its priority tier.
- **9.1.3** The system shall display report locations on the map as markers distinguished by report status.
- **9.1.4** The system shall display work-order locations on the map to an Operations Manager and to the assigned Cleaning Crew Member.
- **9.1.5** The system shall display a signed-in Resident's saved locations on the map.
- **9.1.6** The system shall allow each map layer to be shown or hidden independently.
- **9.1.7** The system shall open a cluster detail panel when a cluster is selected on the map.
- **9.1.8** The cluster detail panel shall display the current score, driver breakdown, open reports and work orders for that cluster.
- **9.1.9** The system shall display a 30-day case-size time series for a selected cluster.
- **9.1.10** The system shall classify each cluster's trajectory as Growing, Stable or Receding from its case sizes over the preceding 14 days.
- **9.1.11** The system shall label every cluster boundary on the map with its priority tier as text. *(Tightened in v0.3; "a means additional to colour" was unverifiable. The general rule is 11.7.5.)*
- **9.1.12** The system shall render the map over a Singapore basemap that names roads and blocks, and shall attribute that basemap in the page (10.4.5). *(Added in v0.7. §9.1 said "on a map" and was for a time answered by a list, on the argument that every fact it demands was present in text. That argument holds for the facts and not for the requirement: a cluster is a shape on the ground, and a locality string of twelve road names is not a place a person can picture.)*
- **9.1.13** The system shall support continuous zoom and pan over the map, operable by pointer, by touch and by keyboard (11.7.2).
- **9.1.14** The system shall constrain the map to Singapore, so that panning cannot leave the area the data describes.
- **9.1.15** The system shall open the Resident's map on that Resident's own saved locations when they have any, and on the extent of the active clusters otherwise. *(Added in v0.7. A resident opens this screen to ask about their block; an island-wide frame answers a question nobody asked.)*
- **9.1.16** The system shall continue to present every fact in 9.1.1 to 9.1.5 as text on the same screen, so that the information survives without the drawing. *(Added in v0.7 to make explicit what 11.7.5 already implies, because "we have a map now" is exactly the argument under which a textual record gets deleted.)*

### 11.9 The visual design

*(Added in v0.8, when the Figma screens were drawn and the build was compared against them.)*

- **11.9.1** The system shall render in the typefaces the design fixes — IBM Plex Sans for text and IBM Plex Mono for figures — served from the system's own origin. *(The stylesheet had named both families since the tokens were agreed, and neither was ever loaded, so every screen rendered in whichever system font the device happened to have. Self-hosted rather than fetched from Google Fonts because 9.4.x's CSP names no external font host and the design is not worth widening it for.)*
- **11.9.2** The system shall present the Operations Manager's screens with persistent navigation at the side, and the Resident's and Cleaning Crew's screens with persistent navigation at the foot on a phone-sized viewport. *(The two roles do different jobs on different devices: a manager scans a table of thirty clusters on a laptop, a crew member holds a phone one-handed outdoors. Navigation at the top of an 844px screen is the part of it a thumb cannot reach.)*
- **11.9.3** The system shall render every quantity in the monospaced face with tabular figures, so that a column of numbers is comparable down its length. *(A column of proportionally-spaced digits does not align, which is the whole reason to put scores in a column.)*
- **11.9.4** The system shall render each navigation destination as a glyph **and** its name; a glyph alone shall not identify a destination (11.7.5).

---

# 10. Non-Functional Requirements

## 10.1 Performance

- **10.1.1** The operations dashboard shall render its first complete view within three seconds on a 10 Mbit/s connection.
- **10.1.2** The system shall respond to 95% of read requests within one second.
- **10.1.3** The system shall complete a scoring cycle for 500 active clusters within 60 seconds.
- **10.1.4** The system shall render a map of up to 300 cluster polygons within three seconds.
- **10.1.5** The system shall support 50 concurrent authenticated users without exceeding the response time in 10.1.2.

## 10.2 Reliability and availability

- **10.2.1** The system shall remain available to all users when any single external data source is unavailable.
- **10.2.2** The system shall serve the most recent successfully retrieved data, marked as stale, when a source is unavailable.
- **10.2.3** The system shall resume scheduled ingestion automatically after a process restart.
- **10.2.4** The system shall not lose a submitted report, work order or completion record as a result of an external source failure.

## 10.3 Security

- **10.3.1** The system shall store passwords only as salted cryptographic hashes.
- **10.3.2** The system shall transmit all traffic over HTTPS.
- **10.3.3** The system shall enforce every authorisation rule on the server.
- **10.3.4** The system shall hold all credentials and API keys outside the source repository.
- **10.3.5** The system shall serve uploaded photographs only through authenticated, non-enumerable URLs.
- **10.3.6** The system shall validate and sanitise every user-supplied input before storage.

## 10.4 Privacy and legal

- **10.4.1** The system shall not expose a reporter's identity to any user other than that reporter and an Operations Manager.
- **10.4.2** The system shall store no personal data beyond email address, role and saved locations.
- **10.4.3** The system shall delete a user's personal data within seven days of an account deletion request.
- **10.4.4** The system shall display the required attribution for every government data source it uses.
- **10.4.5** The system shall retrieve data only from public sources that require no third-party authentication credentials.
- **10.4.6** The system shall respect the published rate limit of every external API it calls.

## 10.5 Usability and HCI

- **10.5.1** The system shall present the same primary navigation on every screen available to a given role.
- **10.5.2** The system shall require explicit confirmation before any destructive action, as defined in the definitions table.
- **10.5.3** The system shall state both the cause and the remedy in every error message shown to a user.
- **10.5.4** *Retired in v0.3 — non-atomic duplicate of 11.5.1 and 11.5.2, which already split the same obligation correctly. Number retained and not reused.*
- **10.5.5** The system shall present every screen at a viewport 360 pixels wide with no horizontal scrolling and no clipped or overlapping control.
- **10.5.6** The system shall allow an Operations Manager to reach work-order creation from the dashboard in no more than three interactions.
- **10.5.7** The system shall indicate progress for any operation taking longer than one second.

## 10.6 Maintainability

- **10.6.1** The system shall separate boundary, control and entity responsibilities into distinct classes.
- **10.6.2** The system shall hold all scoring weights and tier thresholds in configuration rather than in code.
- **10.6.3** The system shall provide automated unit tests for every control class.
- **10.6.4** The system shall log every unhandled exception with a correlation identifier.

## 10.7 Portability

- **10.7.1** The system shall operate in the current release of Chrome, Edge and Safari.
- **10.7.2** The system shall present every screen at viewport widths from 360 to 1920 pixels with no horizontal scrolling of the page body and no clipped or overlapping control. *(Tightened in v0.3; "usable" was unverifiable.)*

---

# 11. Front End and User Interface

*This section specifies the boundary layer: what the user sees, where they can go, and how the
interface behaves. Sections 1–9 specify what the system does; this section specifies how it is
operated. Section 11.2 is the screen inventory the dialog map (Lab 2 and Lab 3) is drawn from, and
the list the Lab 1 UI mockups must cover.*

## 11.1 Application shell and navigation

- **11.1.1** The system shall present a primary navigation menu on every screen available to an authenticated user.
- **11.1.2** The system shall present a Resident with primary navigation items for Map, My Locations, Report a Site, My Reports and Settings.
- **11.1.3** The system shall present an Operations Manager with primary navigation items for Dashboard, Map, Moderation, Work Orders and Data Sources.
- **11.1.4** The system shall present a Cleaning Crew Member with primary navigation items for My Jobs, Map and Profile.
- **11.1.5** The system shall display no navigation item that the signed-in user's role may not access.
- **11.1.6** The system shall indicate which primary navigation item corresponds to the current screen.
- **11.1.7** The system shall display the signed-in user's name and role in the application header.
- **11.1.8** The system shall present an unauthenticated visitor with only the Landing, Sign In, Register and Password Reset screens.
- **11.1.9** The system shall return a user to the screen they originally requested after a successful sign-in.
- **11.1.10** The system shall provide a sign-out control on every authenticated screen.

## 11.2 Screen inventory

- **11.2.1** The system shall provide a Landing screen describing the application to an unauthenticated visitor.
- **11.2.2** The system shall provide a Register screen.
- **11.2.3** The system shall provide a Sign In screen.
- **11.2.4** The system shall provide a Password Reset Request screen and a Password Reset screen.
- **11.2.5** The system shall provide a Resident Map screen showing clusters and the resident's saved locations.
- **11.2.6** The system shall provide a My Locations screen listing the resident's saved locations.
- **11.2.7** The system shall provide an Add Location screen supporting address or postal-code entry.
- **11.2.8** The system shall provide a Report a Site screen supporting map-pin and address entry.
- **11.2.9** The system shall provide a My Reports screen listing the resident's own reports with their statuses.
- **11.2.10** The system shall provide a Report Detail screen showing one report, its photographs and its status history.
- **11.2.11** The system shall provide an Alert Settings screen supporting Telegram linking and per-location alert toggles.
- **11.2.12** The system shall provide an Operations Dashboard screen.
- **11.2.13** The system shall provide a Cluster Detail screen showing score, drivers, trend, reports and work orders.
- **11.2.14** The system shall provide a Moderation Queue screen.
- **11.2.15** The system shall provide a Report Review screen supporting verification and rejection.
- **11.2.16** The system shall provide a Dispatch Proposal screen listing the system's proposed daily targets.
- **11.2.17** The system shall provide a Work Order Create screen.
- **11.2.18** The system shall provide a Work Order Detail screen for an Operations Manager, including assignment and verification controls.
- **11.2.19** The system shall provide a My Jobs screen for a Cleaning Crew Member.
- **11.2.20** The system shall provide a Job Detail screen for a Cleaning Crew Member, including the cluster map and linked reports.
- **11.2.21** The system shall provide a Job Completion screen supporting photograph capture and notes.
- **11.2.22** The system shall provide a Staff Accounts screen for an Operations Manager.
- **11.2.23** The system shall provide a Data Sources screen showing each source's last successful retrieval.
- **11.2.24** The system shall provide a Not Authorised screen and a Not Found screen.
- **11.2.25** The system shall provide a Work Order List screen for an Operations Manager. *(Added in v0.4. Requirement 11.1.3 mandates a Work Orders navigation item, but §11.2 defined no list screen for it to open, and 11.3.7 requires a create action to return to the list it came from. Found by adversarial review of the Lab 2 model.)*
- **11.2.26** The system shall provide an Analytics screen for an Operations Manager, presenting the five §7.3 visualisations, each carrying its own sufficiency statement. *(Added in v0.5. §7.3 says "the dashboard shall display" five charts and `AnalyticsController` builds all five, but §11.2 defined no screen to display them on and the Operations Dashboard realises §7.1 rather than §7.3 — so `GET /api/ops/analytics` answered correctly and no user could reach it. The same class of gap as 11.2.25. Found by independent review of the live deployment, 2026-09-05.)*

- **11.2.27** The system shall provide a Pest Reference screen listing every covered pest type with its responsible authority and its published contact number. *(Added in v0.9. A resident who has just seen a snake needs the AVS number faster than they need a report form.)*
- **11.2.28** The system shall provide a Referral screen for an Operations Manager, supporting referral under 8.6.1 and outcome recording under 8.6.8. *(Added in v0.9.)*

## 11.3 Dialog map and transitions

- **11.3.1** The system shall define every permitted transition between the screens in 11.2 in the dialog map.
- **11.3.2** The system shall permit no transition that is not defined in the dialog map.
- **11.3.3** The system shall provide a return path to the preceding screen from every screen except Sign In.
- **11.3.4** The system shall use a modal dialog only for a confirmation or a single-field input.
- **11.3.5** The system shall preserve unsaved form input when a modal dialog is opened and dismissed.
- **11.3.6** The system shall warn a user before navigating away from a form containing unsaved changes.
- **11.3.7** The system shall return a user to the list they came from after a create, edit or delete completes.
- **11.3.8** The system shall address every screen in 11.2 by a distinct URL.

- **11.3.20** The Report a Site screen shall require a pest type selection before the location and description fields become active. *(Added in v0.9. The pest type determines which subsequent fields 5.1.16 makes mandatory.)*
- **11.3.21** The Report Review screen shall offer the referral action, and not the work-order creation action, for a report whose pest class is Wildlife. *(Added in v0.9. Traces 8.1.14 and 8.1.15 onto the screen where the manager actually stands.)*

## 11.4 Loading, empty and error states

- **11.4.1** The system shall display a loading indicator for any screen whose data has not arrived within one second.
- **11.4.2** The system shall display no blank content area while data is loading.
- **11.4.3** The system shall display an empty state on every list that has no rows.
- **11.4.4** Every empty state shall name the action that would populate the list.
- **11.4.5** The system shall display an error state stating the cause and the remedy when a screen's data cannot be loaded.
- **11.4.6** The system shall provide a retry control on every error state caused by a failed request.
- **11.4.7** The system shall display a staleness banner on any screen presenting data from a stale source, naming the source and its last successful retrieval time.
- **11.4.8** The system shall display a connectivity message when a request fails because the device has no network connection.

## 11.5 Forms and input

- **11.5.1** The system shall validate each form field when that field loses focus.
- **11.5.2** The system shall display each validation message beside the field it concerns.
- **11.5.3** The system shall mark every required field as required before submission is attempted.
- **11.5.4** The system shall disable the submit control while a submission is in flight.
- **11.5.5** The system shall display a progress indicator while a submission is in flight.
- **11.5.6** The system shall retain every entered value when a submission fails.
- **11.5.7** The system shall display a remaining-character count on every text field with a maximum length.
- **11.5.8** The system shall display a confirmation message within one second of a successful create, update or delete.
- **11.5.9** The system shall require confirmation in a dialog naming the affected object before any delete or cancel action.
- **11.5.10** The system shall display the file name and size of each selected photograph before upload.
- **11.5.11** The system shall display upload progress for each photograph.

## 11.6 Data presentation

- **11.6.1** The system shall display every priority tier as a text label as well as a colour.
- **11.6.2** The system shall display every timestamp in Singapore time with the time zone stated.
- **11.6.3** The system shall display every timestamp in the format DD MMM YYYY HH:mm.
- **11.6.4** The system shall align numeric table columns on the decimal point.
- **11.6.5** The system shall indicate the sorted column and the sort direction on every sortable table.
- **11.6.6** The system shall paginate any table exceeding 50 rows.
- **11.6.7** The system shall display the total row count above every paginated table.
- **11.6.8** The system shall highlight on the map the cluster whose row is selected in the priority table.
- **11.6.9** The system shall select in the priority table the cluster whose boundary is selected on the map.
- **11.6.10** The system shall display "No data" rather than a zero for any value that is unavailable.
- **11.6.11** The system shall display units on every quantity it presents.

## 11.7 Accessibility and interaction

- **11.7.1** The system shall allow every interactive control to receive keyboard focus by Tab and Shift-Tab.
- **11.7.10** The system shall allow every focused interactive control to be activated by Enter or Space. *(Split from 11.7.1 in v0.3 for atomicity.)*
- **11.7.2** The system shall display a visible focus indicator on the focused control.
- **11.7.3** The system shall present text at a contrast ratio of at least 4.5:1 against its background.
- **11.7.4** The system shall provide a text label for every control whose visible content is an icon alone.
- **11.7.5** The system shall convey no information by colour alone.
- **11.7.6** The system shall suppress non-essential animation when the browser requests reduced motion.
- **11.7.7** The system shall present touch targets of at least 44 by 44 pixels on the Cleaning Crew screens.
- **11.7.8** The system shall use the terms defined in the data dictionary consistently across every screen.
- **11.7.9** The system shall provide a page title distinct to each screen in 11.2.

## 11.8 Mobile application

*Added in v0.6, 2026-09-05. §11 assumed a browser on a laptop. Two of the three roles do not work
that way: 8.4.x has a Cleaning Crew Member reading their jobs and photographing a drain in the
field, and §5–§6 have a Resident reporting a site where they are standing and receiving an alert
about where they live. Those are phone tasks, and the requirements did not say so anywhere a test
could reach.*

*The obligations below are written against an **installable web application** — one codebase,
launched from the device home screen, running without browser chrome. See §13 for why that reading
was taken rather than a second, native codebase, and what would have to change if the team decides
otherwise.*

- **11.8.1** The system shall serve a web application manifest at `/manifest.webmanifest` with the
  media type `application/manifest+json`.
- **11.8.2** The manifest shall declare `name`, `short_name`, `start_url`, `scope`, a `display`
  value of `standalone`, `theme_color` and `background_color`.
- **11.8.3** The system shall provide application icons of 192×192 and 512×512 pixels in PNG format.
- **11.8.4** The system shall declare at least one icon with a `purpose` of `maskable`, so an
  Android launcher can crop it to the device's icon shape without clipping content.
- **11.8.5** The system shall declare a viewport that adapts to the device width at an initial scale
  of 1.
- **11.8.6** The system shall permit the user to zoom the page. *(Stated as a requirement because
  the usual way to make a web page "feel native" is `user-scalable=no`, which would contradict
  §11.7's accessibility obligations. The prohibition is therefore explicit rather than implied.)*
- **11.8.7** The system shall register a service worker scoped to the whole application.
- **11.8.8** The system shall serve the application shell from the service worker's cache when the
  device has no network connection.
- **11.8.9** The system shall present the message "You are offline" and the screen's own retry
  control, rather than the browser's network error page, when a data request fails while the device
  reports itself offline.
- **11.8.10** The system shall not serve a cached response to a request under `/api/`. *(A stale
  cluster count presented as current is worse than no cluster count: §7.1.9 requires the age of the
  data to be shown, and a cached answer would make that statement false.)*
- **11.8.11** The system shall replace a cached application shell when a deployment changes it,
  without the user clearing site data.
- **11.8.12** The system shall present an install control on a device whose browser offers
  installation, and shall not present it once the application is running installed.
- **11.8.13** The system shall offer the device camera as a capture source for a photograph on the
  Report a Site screen and on the Job Completion screen.
- **11.8.14** The system shall declare an `apple-touch-icon` and `apple-mobile-web-app-capable`, so
  the application launches full-screen when added to the home screen on iOS. *(iOS ignores the
  manifest for both.)*

---

# 12. Traceability

Every requirement number above is traced forward in `EPICS-STORIES.md`, which names the epic and user
story that delivers it. Use case descriptions written in Lab 1 must cite these numbers; the dialog map
drawn in Lab 2 must cover every screen in §11.2; test cases written in Lab 4 must cite the requirement
number they verify.

Open points requiring a team decision are listed at the end of `EPICS-STORIES.md`.

**v0.9 traceability obligations.** The generalisation added requirement groups 1.5, 1.6, 4.2, 4.3,
4.4 and 8.6, and actor A6. Each must be carried forward before the Lab 5 demo:

| Artefact | What v0.9 obliges |
|---|---|
| `EPICS-STORIES.md` | **Done 2026-09-16 (v0.4).** Epic **E11 — Cross-pest generalisation**, stories US-11.1 to US-11.8, covering every number in the six new groups |
| Use case model | A6 as an actor; use cases 3.5, 5.5, 6.10, 7.8, 7.9, 7.10 and 8.5; described in `lab2/USE-CASE-DESCRIPTIONS.md` and `lab3/USE-CASE-DESCRIPTIONS.md` |
| Data dictionary | **Written: `lab3/DATA-DICTIONARY-DELTA.md`.** The Lab 1 dictionary is frozen as submitted evidence, so the delta extends it. Entities `PestProfile`, `ObservationRecord`, `VectorControlOperator`, `Referral`; attributes `Report.pestType`, `Report.locationContext`, `Report.injuryReported`, `WorkOrder.pestType`; enumerations `PestType`, `PestClass`, `EvidenceTier` |
| Analysis class diagram | **Done 2026-09-16.** The four new entity classes and four new enumerations; 27 entities, 17 enumerations |
| Design class diagram | **Done 2026-09-16**, across all three parts - control (`PestPriorityCalculator`, `UrgencyCalculator`, `CriticalOverrideEvaluator`, `ObservationIngestionJob`, `OperatorRegistryLoader`, `ReferralController`), entity (the four new entities and three new repositories) and boundary (`INaturalistGateway`, `VCORegistryGateway`, and screens 11.2.27 and 11.2.28) |
| Dialog map | Screens 11.2.27 and 11.2.28, and transitions 11.3.20 and 11.3.21 |
| Test plan | **Designed 2026-09-16 (`lab4/TEST-PLAN.md` v0.2, §6).** 4.2.5 is §6.1 cases C1–C5 and §4.4 is §6.2 cases O1–O10; 1.5, 1.6, 4.3 and 8.6 are §6.3 to §6.6. **Designed, not executed** — the code does not exist yet, and §6 carries no Actual Output column for that reason. 4.2.5 shall still be written first |

**Numbers are permanent.** No v0.8 number was reused or renumbered in v0.9. Requirements 4.1.1,
4.1.3, 4.1.7 and 4.1.14 were revised in place, each carrying a dated note stating what changed and
why, in the manner already used for 1.1.15 and 8.2.5.

---

# 13. Assumptions

*Added in v0.3. Every figure below is a design assumption, not a sourced fact. Each is defensible but
none is evidenced, and all of them are challengeable in a demo Q&A. They are collected here so a
reader of this document alone can tell assumption from requirement.*

| Requirement | Assumption | Basis | Risk if wrong |
|---|---|---|---|
| 3.1.9 | A 150 m buffer defines "near" a cluster | Judgement. **Implemented 2026-09-03**, measured to the cluster **boundary** (not its centroid) and **inclusive** at 150 m; tested at 149/150/151 m (lab4 §2.11, E2–E4) | Alert volume too high or too low |
| 5.1.11 | 50 m and 24 hours defines a duplicate report | Judgement. **Implemented 2026-09-03 with both bounds inclusive** — a report at exactly 50 m or exactly 24 hours old is a duplicate; the prose does not settle this, so the choice is recorded here and tested at 49/50/51 m and 23/25 h (lab4 §2.9, D1–D3) | Genuine reports refused, or duplicates admitted |
| 6.1.4 | Five new cases is an alert-worthy growth | Judgement. **Implemented 2026-09-03** as the default and **configurable per saved location** (6.1.3), so a resident who finds it noisy raises it rather than muting the location; tested at 4 and 5 (lab4 §2.12, T6) | Alert fatigue or missed escalation |
| 4.1.8 | Tier cut points at 70.0 and 40.0 | Judgement | Tiers cluster at one end and stop discriminating |
| 4.2.1 | The 22 severity multipliers | Judgement, from the four-factor rubric in `PEST-PRIORITY-MODEL.md` §4.2. **No outcome data was used.** Configurable per 4.2.2 | The ranking disagrees with operational intuition across pests |
| 4.3.4–4.3.6 | Three fixed weight sets rather than one per pest | Deliberate simplification: 22 bespoke weight sets are unmaintainable and unarguable. Per-pest override remains possible in configuration | One pest is systematically mis-ranked by a set tuned for its tier rather than for it |
| 4.3.5 | External observation density weighted at 0.20 | Held deliberately low: an observation is a sighting, not a complaint (4.1.26) | Nature-reserve sightings inflate the ranking of localities with no municipal problem |
| 4.1.25 | Response capacity deficit weighted at 0.05 in every tier | The VCO registry records **registered offices**, verified 2026-09-16 as concentrated on industrial streets (Bukit Batok Crescent 17, Anson Road 11 of 290). It is a response-capacity signal, not a demand signal | Used at a higher weight it would rank industrial land above the housing estates that generate the complaints |
| 1.5.7 | 500 m positional accuracy threshold | Measured: median accuracy 111 m over 50 snake records, 34 of 46 within 500 m (2026-09-16) | Too strict discards usable records; too loose binds observations to the wrong locality |
| 1.5.5 | A 90-day observation window | Judgement, chosen so a driver still has data for a low-volume pest | Too long and the driver stops responding to change |
| 4.1.16 | 90 days is the default treatment recency | Judgement | Untreated clusters over- or under-weighted |
| 1.1.1 | A 60-minute poll interval is useful | **Verified 2026-09-03** — the publisher revises on the order of days; 1.1.19–1.1.21 make the hourly cycle a cheap metadata check | See below |
| 8.1.3 | Five task types match real dispatch | **Unverified** — see the actor note in §Actors | Domain challenge in Q&A |
| 5.1.4, 5.1.5, 3.1.1 | 500 characters, three photographs, five locations | Judgement | None material |
| 4.1.5 | The default driver weights in `SCORING-SPEC.md` §3 | Judgement, argued from the live payload | Ranking reflects the team's priorities rather than measured risk |
| 4.1.4 | The normalisation method chosen per driver | Judgement, argued from the live payload | A driver saturates too early or too late and stops discriminating |
| 1.2.6 | Inverse-distance weighting over the three nearest stations | Judgement | A cluster's rainfall is over- or under-stated where stations are sparse |
| 1.2.5 | Three stations is the right number | Judgement | Too few is noisy, too many washes out local rain |
| 11.8.x | "Accessible from a mobile app" means an **installable web application**, not a second native codebase | Judgement, recorded 2026-09-05 when the requirement was raised. `lab2/AI-TECH-STACK.md` had already decided against a native app — the crew journey is three screens and a camera upload — and that decision is not reversed here so much as *satisfied differently*: an installable web application is launched from the home screen, runs without browser chrome and works offline, which is what "from a mobile app" asks for in every respect a user can observe. A native build would duplicate every screen in a second language for the same three journeys, and could not be delivered before the demonstration | If the module requires a **native** artefact — an APK, or a React Native/Flutter project — this does not satisfy it, and the gap is one deliverable rather than one feature. Nothing built for 11.8 is wasted in that case: the API, the roles and the journeys are unchanged, and only the presentation layer would be rebuilt |
| 9.1.12 | The basemap is **OneMap raster tiles** from the Singapore Land Authority, fetched from `www.onemap.gov.sg` | Judgement, recorded 2026-09-05 when the map was drawn. Three properties decided it: it needs no key or billing account, it labels roads and HDB blocks the way a Singaporean says them, and it is the same agency whose Search API already geocodes a resident's address — so the trust decision was one the system had already made. The alternative, a global provider, would add a second external dependency, a key to keep out of the repository, and a basemap on which "Blk 655" is not written anywhere | This is the **only** external origin the client fetches from, and the CSP names that host rather than relaxing `img-src`. If OneMap is unreachable, the tiles are blank and every cluster shape, marker, legend and list is still drawn and readable — the basemap is the background, not the data |
| 11.9.1 | The typefaces are **self-hosted from npm** (`@fontsource`), latin subset, five faces, 104 kB total, precached by the service worker | Judgement, recorded 2026-09-06 when the Figma screens were compared against the build. The design file loads IBM Plex from `fonts.googleapis.com`; doing the same here would need `style-src` and `font-src` widened to two more origins for a typeface. Copying five files is cheaper than a policy exception, and it is the same decision already taken for Leaflet | The installed application opened offline falls back to a system font, so the faces are part of the offline shell rather than data |
| 11.9.2 | The Operations Manager gets a side rail, the Resident and Crew a bottom bar, from **one** set of markup switched by a `data-chrome` attribute | Judgement, recorded 2026-09-06. Three arrangements of the same brand-navigation-account structure; only the layout differs, and layout is the stylesheet's job. Branching the JSX would put the same links in three places to be kept in step | The selectors must say `> header nav`: a descendant selector also matches the `<nav>` of actions a screen renders at the foot of its content, which pinned a screen's own links over the tab bar and made the navigation appear to vanish (caught 2026-09-06, guarded by M19) |
| 11.9.5 | A work order's assignee is shown as the crew member's **email address**, resolved on the client from `/api/ops/staff/crew` | Judgement, recorded 2026-09-06. The list endpoint returns `assigneeId` only, so the column showed raw UUIDs. Resolving it on the client uses a roster the manager is already authorised for and leaves the API contract alone; the id is still shown when the lookup misses | If the roster call fails the column degrades to the id — the previous behaviour — rather than to a blank cell |
| 9.1.10 | A ±10% change over the fortnight separates Growing and Receding from Stable | Judgement, added 2026-09-03 with the implementation. 9.1.10 names three classes and does not say where the lines fall; below 10% a single late-reported case would flip the label on a small cluster every other day | The trend column flickers, or a real escalation reads as Stable |

**The polling question is now answered, and the answer shaped the design.** A live pull on
2026-09-03 (dataset `d_dbfabf16158d1b0e1c420627c0819168`, 25 KB, 12 active clusters) gives:

| Observation | Value on 2026-09-03 | Consequence |
|---|---|---|
| Dataset `lastUpdatedAt` (metadata resource) | 2026-09-02T10:06:42+08:00, then 2026-09-03T10:06:44+08:00 | The file is **republished daily at about 10:06 SGT** even when its contents do not change |
| Distinct `FMEL_UPD_D` values across all 12 features | two only — 2026-08-25 15:54 and 2026-08-28 15:51 | Cluster attributes are revised roughly **twice a week**, not hourly |
| Active clusters | 12 | 10.1.3's 500-cluster performance bound is an order of magnitude of headroom, not a constraint |

So the hourly cycle in 1.1.1 is retained but **restructured around the constraint**: 1.1.19–1.1.21
poll the sub-2 KB metadata resource hourly and download the payload only when `lastUpdatedAt` moves,
and 1.1.22 uses the publisher's own per-feature `INC_CRC` checksum for change detection. An hourly
cycle that transfers 2 KB and records an UNCHANGED run is defensible; one that re-downloads and
re-parses an identical 25 KB file twelve times a day is not.

**Two stamps, two purposes, and both are needed.** `lastUpdatedAt` moves daily, so 1.1.20 alone
reduces the download from roughly twenty-four times a day to about once — a real saving, but not the
whole answer, because most of those daily republications carry identical cluster attributes.
`INC_CRC` is what answers "did *this cluster* change", and 1.1.22 is therefore what keeps 1.1.7's
last-updated timestamp and 1.1.9's change classification honest. A design that used only the dataset
stamp would mark all twelve clusters as changed every morning.

**What still carries the live-data criterion is rainfall** (verified 5-minute cadence), and the
demo mitigation is unchanged: 1.1.18's manually triggered run shows the change-detection path on
cue rather than waiting for NEA.

## Data verification status

Requirements are written against these sources. Verification status is from
`research/API-INVENTORY.md` and must not be overstated in the SRS or the demo.

| Source | Used by | Status |
|---|---|---|
| Rainfall real-time | 1.2 | **Verified 2026-09-03** — pulled and parsed field-for-field. **87 stations, not 97** (the count is not a constant, and 1.2.x must not assume one); `readingType` is "TB1 Rainfall 5 Minute Total F" and `readingUnit` "mm", so a reading is a five-minute *total* and 1.2.7's accumulation is a sum. History via `?date=YYYY-MM-DD`, newest first, **25 blocks a page** with a `paginationToken`; a rapid backfill is answered with **HTTP 429** |
| 24-hour forecast | 1.3 | **Verified** — test pull; five regions, not named areas |
| NEA dengue clusters | 1.1 | **Verified 2026-09-03** — payload downloaded and read field-for-field; dataset id `d_dbfabf16158d1b0e1c420627c0819168`; 12 features, Polygon geometry. **Three fields are not what the dataset page implies** — HOMES, PUBLIC_PLACES and CONSTRUCTION_SITES are comma-separated habitat-type text, not counts (see 1.1.15) |
| OneMap Search | 3.1.3 | **Not verified** — requires an account token; register and test-pull in week 1 |

---

# 14. Revision history and review dispositions

**v0.5 (2026-09-03)** — revised after the first live read of the NEA payload and two decisions taken
by Yen Kit. Material changes:

- **A2/A3 resolved.** The composite Operations Manager is now a stated design decision with its
  reasoning and its extension point, replacing an open question (§Actors).
- **Premises mix redefined (1.1.15, 1.1.16, 1.1.23).** The payload shows HOMES, PUBLIC_PLACES and
  CONSTRUCTION_SITES are free-text habitat lists, not counts, so the v0.3 ratio was not computable.
  It now counts listed habitat types. This is the most consequential correction in this revision:
  a driver named in 4.1.3 was specified against a field shape that does not exist.
- **Conditional ingestion added (1.1.19–1.1.22).** Hourly metadata check, payload download only on
  change, UNCHANGED run recorded either way, per-feature INC_CRC change detection.
- **Normalisation methods and default weights are now documented** (4.1.4, 4.1.5 → `SCORING-SPEC.md`).
- §13's polling assumption is replaced by measured evidence; the NEA row of the data-verification
  table moves from *partially verified* to *verified*.

**v0.9 (2026-09-16)** — the product is widened from dengue to all common household pests and all wild
animals requiring NEA or AVS intervention, on the TA's suggestion and Yen Kit's decision. Material
changes:

- Scope, Actors and Definitions restated for a multi-pest product; actor **A6 External Dispatch
  Authority** added and the `dispatchAuthority` extension point declared in v0.2 is now exercised.
- **§4.2 Pest severity**, **§4.3 Evidence tiers** and **§4.4 Critical override** added. The score
  becomes `severity multiplier x urgency`, specified in `PEST-PRIORITY-MODEL.md`.
- 4.1.1, 4.1.3, 4.1.7 and 4.1.14 revised in place: the scored subject is a locality and a pest type,
  the driver set is tier-dependent, and the tie-break no longer relies on case size, which exists for
  the mosquito alone.
- **4.2.5 is the compatibility obligation** and is testable: a mosquito score under v0.9 equals its
  v0.8 score exactly, because the mosquito severity multiplier is 1.000 by construction and the tier
  A weight set is v0.8's unchanged. The tier thresholds in 4.1.8 are untouched.
- **§1.5** wildlife observation ingestion and **§1.6** vector control operator registry ingestion
  added, both against sources verified live on 2026-09-16.
- **§8.6 Referral** added: the system refuses to dispatch its own crew against wildlife (8.1.14) and
  refers to the responsible authority instead, without writing a treatment record (8.6.11).
- 5.1.15–5.1.19 add the pest type, location context and injury fields; 5.1.18 stops a snake report
  being refused as a duplicate of a cockroach report 40 metres away.
- §13 gains seven new assumption rows, including the honest statement of what the vector control
  operator registry does and does not measure.

**Not changed by v0.9:** every dengue requirement in §1.1–1.4, §3, §6 and §9; the tier thresholds;
the work-order state table; and all 34 non-functional requirements in §10.

**v0.3 (2026-09-02)** — revised after an adversarial review by two independent reviewers. Material
changes:

- Defined the premises mix driver, which 4.1.3 named but nothing computed (1.1.15, 1.1.16, 4.1.21).
- Defined "open report", "open work order", "premises mix", "locality", "corroboration count",
  "destructive action" and "reason", all of which gated logic while undefined.
- Rewrote 1.3.2 against the forecast shape the endpoint actually returns.
- Added OneMap token refresh and authentication-failure handling (3.1.14–3.1.17).
- Added the work-order state table that 8.3.2 cited but which did not exist.
- Corrected 8.2.5, which permitted reassigning a Verified work order.
- Added the missing initial-status rule for work orders (8.3.15) and clarified Rejected as a resting
  state (8.3.19, 8.3.20).
- Disambiguated Unassigned as a locality binding rather than a sixth report status (5.1.9).
- Split twelve non-atomic requirements; retired 10.5.4 as a duplicate of 11.5.1 and 11.5.2.
- Replaced the unverifiable terms in 10.5.5, 10.7.2, 11.7.1 and 9.1.11.
- Added §13 Assumptions and the data verification table.

**Findings accepted but not yet actioned**, carried as open points in `EPICS-STORIES.md`: the
NEA/town-council actor authority question, and the reason-length floor now applied by definition
rather than by amending each requirement individually.
