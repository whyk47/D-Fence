# ANALYSIS MODEL — D-Fence

Lab 2 deliverables 3, 4 and 5. Version 0.2, 2026-09-02. Revised after adversarial review — see §6.

The analysis model has two halves, following Bruegge ch. 5: the **object model**, expressed as class
diagrams with `<<entity>>`, `<<boundary>>` and `<<control>>` stereotypes, and the **dynamic model**,
expressed here as the dialog map. Both derive from the Lab 1 artefacts rather than restating them —
the entity classes come from the data dictionary, the boundary classes from the screen inventory,
and the dialog map states from the same inventory.

**This is the analysis model, not the design model.** Fox pp. 341–345 describes transforming a
conceptual model into a *design* class model — adding interface classes, a startup class, container
classes and engineering relationships. That is Lab 3's deliverable, and deliberately none of it is
done here.

---

## 1. Entity classes — `class-diagram-entity.puml`

23 entity classes in seven packages, with 13 enumerations drawn as first-class model elements rather
than left as prose.

| Package | Classes |
|---|---|
| People and access | Account, Session, AuditRecord |
| Locations and alerts | SavedLocation, AlertSubscription, Alert |
| Clusters and environment | Cluster, ClusterSnapshot, RainfallStation, RainfallReading, ClusterRainfall, RegionForecast |
| Scoring | PriorityScore, DriverContribution |
| Community reporting | Report, ReportPhoto, Corroboration |
| Dispatch and field work | WorkOrder, CompletionEvidence, TreatmentRecord |
| Operations support | IngestionRun, SourceHealth, Configuration |

**Three modelling decisions worth defending in a viva.**

**ClusterSnapshot is a separate class, composed into Cluster.** The NEA feed publishes current
values only. Without a snapshot history there is no case delta (1.1.8), no 30-day trend (9.1.9) and
no trajectory (9.1.10) — three requirements that all depend on the system remembering what it saw
before. Composition rather than association: a snapshot has no meaning without its cluster.

**DriverContribution is a class, not seven attributes on PriorityScore.** Requirement 4.1.10 obliges
the system to store each driver's normalised value *and* its weighted contribution for every scoring
cycle. Modelling it as a class makes the breakdown queryable, keeps the driver set open to change
without altering the score class, and is what makes 4.1.18 — show the breakdown on demand —
implementable. The `1..7` multiplicity encodes that a degraded score legitimately has fewer than
seven (4.1.12).

**TreatmentRecord is separate from CompletionEvidence.** They look redundant — both are written when
a job finishes. They are not. CompletionEvidence is what the *crew* submits and can be rejected;
TreatmentRecord is written only when a manager *verifies* (8.3.12) and is what feeds the
days-since-last-treatment driver. Collapsing them would let unverified work lower a cluster's
priority score, which is the one thing the feedback loop must not do.

**One recorded simplification.** `Account.role` carries three values and `WorkOrder.task_type` five,
spanning what are in reality two authorities — NEA runs fogging and larviciding, the town council
runs refuse and drain clearance. The team decided on 2026-09-02 to model one Operations Manager and
one Cleaning Crew. This is stated as a known simplification in the diagram note, and belongs in the
extensibility segment of the Lab 5 demo rather than being left for a marker to find.

---

## 2. Boundary and control classes — `class-diagram-boundary-control.puml`

**Boundary classes: 27 screens plus 5 external gateways.** Every screen in `REQUIREMENTS.md` §11.2
appears once. Note the arithmetic: §11.2 has 25 numbered requirements, but 11.2.4 and 11.2.24 each
define *two* screens, so the inventory is 27 screens, not 25. An earlier version of this document
said 24 and gave the Password Reset Request screen no class of its own. The five gateways — `NEAFeedGateway`, `RainfallGateway`, `ForecastGateway`,
`OneMapGateway`, `TelegramGateway` — are boundary classes in Bruegge's sense too: they are where the
system meets something outside itself. Isolating them means the four external dependencies are
touched in exactly five places, which matters because two of them (the NEA feed's update frequency,
OneMap Search) are still unverified.

**Control classes: 15.** Each was derived from the use cases rather than invented.

| Control class | Realises use cases | Note |
|---|---|---|
| AuthenticationController | 1.1, 1.2, 1.3, 1.5 | |
| StaffAccountController | 1.4 | |
| AccessControlService | 2.3 requirements | Cross-cutting; consulted by every controller |
| SavedLocationController | 2.1, 2.2, 2.3, 2.4 | Also computes exposure status |
| GeocodingController | 8.1, 7.7 | Owns the OneMap token lifecycle |
| ReportController | 3.1, 3.2, 3.3 | Includes duplicate detection |
| ModerationController | 3.4 | |
| IngestionController | 7.1, 7.2, 7.3, 7.4 | Four sources, one lifecycle |
| PriorityScoringEngine | 7.5, 8.2 | The computational core |
| AlertTriggerEvaluator | 7.6 | |
| AlertSubscriptionController | 4.1, 4.2 | Telegram linking and per-location alert settings |
| NotificationController | 4.3, 4.4 | Both audiences, one delivery path |
| DashboardController | 5.1, 5.2, 5.3, 5.4 | |
| DispatchController | 6.1, 6.2, 6.3, 6.9, 8.3 | Creation and assignment |
| WorkOrderLifecycleController | 6.5, 6.6, 6.7, 6.8, 8.4 | Owns the eight-state machine |

**Why dispatch is split across two controllers.** `DispatchController` decides *what work should
exist and who does it*; `WorkOrderLifecycleController` governs *how a work order moves between
states*. Requirement 8.3.2 says only the transitions in the state table are permitted, and that rule
is easier to enforce and to test when the transition is validated in exactly one place. This split is
also what makes the Lab 4 basis-path test tractable: `isTransitionPermitted()` is one method with a
well-defined branch structure.

**The delegation is explicit, because assignment and cancellation are themselves status changes.**
`DispatchController.assign()`, `reassign()` and `cancel()` all move a work order between states, so
they do not write `WorkOrder.status` directly — they call `WorkOrderLifecycleController`. Without
that dependency the model would claim one owner of the state machine while drawing two.

### Which are the "key" classes

The lab manual asks for *key* boundary and control classes. The full set is given above because the
model has to be complete to be checkable, but the team's answer to "which are key" is this — and
these are the ones Lab 3 should turn into skeleton code first:

| Key control classes | Why |
|---|---|
| `PriorityScoringEngine` | The computational core; the thing the module's "data processing" criterion is judged on |
| `WorkOrderLifecycleController` | Owns the eight-state machine; the only class that may change `WorkOrder.status` |
| `DispatchController` | Where the score becomes action; the manager's half of the multi-user loop |
| `ReportController` | The resident's half of the multi-user loop |
| `IngestionController` | The "live data update" criterion lives here |

| Key boundary classes | Why |
|---|---|
| `ResidentMapUI`, `ReportSiteUI` | The resident path in the demo |
| `OperationsDashboardUI`, `ClusterDetailUI`, `WorkOrderDetailUI` | The manager path, and where the driver breakdown is shown |
| `MyJobsUI`, `JobCompletionUI` | The crew path that closes the loop |
| `NEAFeedGateway`, `OneMapGateway` | The two unverified external dependencies — isolated deliberately |

The remaining nine control classes and the other boundary classes are real and stay in the model,
but they are supporting structure, not the spine.

**Two classes are the designated Lab 4 test subjects**, and both are marked on the diagram:
`PriorityScoringEngine` for equivalence-class and boundary-value testing — the tier thresholds at
40.0 and 70.0 give natural boundaries — and `WorkOrderLifecycleController.isTransitionPermitted()`
for basis-path testing.

**AccessControlService is drawn as a control class, not as a property of the boundary layer**,
because requirement 2.3.6 requires access rules to be enforced on the server independently of any
interface control. Modelling it inside the boundary layer would put the model at odds with the
requirement.

---

## 3. Dialog map — `dialog-map.puml`

A state diagram whose nodes are user-interface states (Fox p. 420). The 27 screens of §11.2 are the
states; the transitions are the events §11.3 permits, and by 11.3.2 no transition exists that is not
drawn.

**Structure.** An unauthenticated region (Landing, Register, Sign In, the two password-reset
screens) leads by role into one of three composite states — Resident, Operations Manager, Cleaning
Crew. Sign-out returns any region to Landing; an authorisation refusal from any region reaches Not
Authorised. Drawing the three roles as composite states rather than one flat graph is what keeps the
map legible, and it also makes the access-control boundary visible: there is no transition from one
role's region into another's.

**One modelling defect found and fixed while drawing it.** The first version had Password Reset
Request transition straight to Sign In on `linkSent`, which left the Password Reset screen itself
with no incoming transition — an unreachable state. Corrected to `openResetLink`, matching use case
1.3's actual flow. This is exactly what a dialog map is for: an unreachable screen is invisible in a
screen list and obvious in a state diagram.

**Modal usage.** Only one modal appears — Duplicate Detected, over Report a Site. Requirement 11.3.4
restricts modals to a confirmation or a single-field input, and 11.3.5 requires unsaved input on the
underlying form to survive it. Both are annotated on the diagram.

**The §11.4 states are declared, not omitted.** Loading, empty, error and stale are sub-states of
almost every screen; drawing them on all 27 states would quadruple the diagram for no analytical
gain. They are therefore declared in a note on the diagram itself as applying to every state.

This matters for a reason beyond tidiness. Requirement 11.3.2 says no transition exists that is not
in the dialog map, and the Lab 3 acceptance criterion in `EPICS-STORIES.md` US-10.4 requires the
implemented routes to match the map with no undrawn transition reachable. Had the §11.4 states been
silently left out, the map would have been stale the moment they were built. Declaring them keeps
the claim true: entering a loading or error sub-state is not a navigation transition and does not
change which screen the user is on.

---

## 4. Traceability

| Lab 1 artefact | Feeds | Lab 2 artefact |
|---|---|---|
| Data dictionary, 23 entities | → | Entity class diagram, 23 classes, same names |
| Screen inventory §11.2, 27 screens | → | 27 boundary classes; 27 dialog-map states |
| Use case model, 41 use cases | → | 15 control classes |
| Transition rules §11.3 | → | Dialog map transitions |
| §2.3 access control | → | AccessControlService |
| §8.3 work-order state table | → | WorkOrderLifecycleController |

Nothing in the analysis model is un-sourced: every class traces to a requirement or a use case, and
the entity names match the data dictionary exactly so the two documents can be checked against each
other by name.

---

## 5. Open items carried into Lab 3

1. **Normalisation method per driver** — 4.1.4 obliges one and none is documented. Needed before the
   scoring engine is implemented, not before it is modelled.
2. **Driver weights** — 4.1.5 defers them to configuration; 4.1.6 only requires them to sum to 1.0.
3. **NEA feed update frequency** — still unverified and load-bearing for the demo.
4. **OneMap Search** — still not test-pulled.

---

## 6. Adversarial review, 2026-09-02

Two independent critics were run on disjoint axes — internal modelling correctness, and external
lab-compliance and risk. Every claim was verified against the source files before being accepted.
The findings that changed the model:

| Finding | Disposition |
|---|---|
| `DispatchController` and `WorkOrderLifecycleController` both changed `WorkOrder.status`, while the diagram's own note claimed only one could | **Fixed.** Delegation made explicit; note rewritten |
| The dialog map let an unauthenticated visitor reach the Resident Map, contradicting 11.1.8 | **Fixed** in both the map and use case 2.4, whose alternative flow made the same mistake |
| `NotFound` had no incoming transition — the same unreachable-state defect claimed to have been caught for Password Reset | **Fixed.** Reachable from every region on an unknown route |
| Password Reset had no return path, contradicting 11.3.3 | **Fixed** |
| One `PasswordResetUI` class covered two screens; the "24 screens" count was wrong | **Fixed.** Split; count corrected to 27 |
| Use cases 4.1 and 4.2 were realised by no control class | **Fixed.** `AlertSubscriptionController` added |
| 11.1.3 mandates a Work Orders nav item, but §11.2 defined no list screen for it to open | **Fixed.** Requirement **11.2.25** added; state, boundary class and 11.3.7 return path drawn |
| Use case 6.9 `<<extend>>` 6.3 was wrong — a work order is cancellable from `Created`, before any assignment | **Fixed.** Extend removed; 6.9 is a direct association |
| Use case 6.9's postcondition invented report-reversion behaviour no requirement obliged | **Fixed.** Requirement **8.3.21** added and cited |
| Two Traces lines cited `7.5.x` and `8.2.x` — tokens that do not exist | **Fixed**, and the first concealed a real gap: no requirement obliged the dashboard to display issue-flagged work orders. Requirement **7.5.5** added |
| `WorkOrder.source_report_id` (8.1.2) had no association in the entity diagram | **Fixed.** Added, and recorded in the data dictionary |
| The `Cluster`–`RegionForecast` association was absent from the data dictionary | **Fixed.** Added there, and annotated on the diagram |

**Three requirements were added to `REQUIREMENTS.md` as a result** — 7.5.5, 8.3.21, 11.2.25 — taking
it to v0.4. Each carries a note saying what the review found. Requirements are added rather than
edited, and numbers are never reused.

**Not accepted.** The reviewers also objected that four use case diagrams were produced where the
manual said one, and that the `PostGIS` evaluation exceeded "2–3 sentences" on a strict reading.
The first is additional work, not a defect — the master diagram the manual asks for exists. The
second was trimmed anyway.
