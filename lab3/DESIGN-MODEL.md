# DESIGN MODEL — D-Fence

Lab 3 deliverable 2. Version 0.1, 2026-09-03.

This document explains the design model. The diagrams are the deliverable; this is the reasoning a
grader or a teammate needs in order to read them, and the record of the decisions that a viva can
ask about.

**What changed from Lab 2, in one sentence.** Lab 2 produced an *analysis* model — what the system
must know and do, in the vocabulary of the problem. This is the *design* model — how it is built, in
the vocabulary of the solution: types, visibility, operations, layers, patterns, and the two
questions Bruegge ch. 7.4 says every design must answer, persistence and access control.

**Naming.** The application was renamed **D-Fence** on 2026-09-03. Verbatim AI-exercise records in
`lab1/submission/AI-CRITIQUE.md` and `lab2/AI-TECH-STACK.md` keep the old name because they are
records of what was submitted at the time; every living document uses the new one.

---

## 1. The transformation (lab §3.1, Fox pp. 341–345)

Fox gives seven heuristics for turning a conceptual model into a design class model. Each was applied
deliberately, and each is checkable against the diagrams.

| # | Fox heuristic | What we did | Where |
|---|---|---|---|
| 1 | Change actors to interface classes | The three human actors became `RouteGuard`-protected screen components; the two system actors (NEA feed, Scheduler) became gateway interfaces and a scheduler process | `class-diagram-design-boundary.puml`, `architecture.puml` |
| 2 | Add actor domain classes | `Account` already existed for all three human actors; `SourceHealth` and `IngestionRun` are the domain record of the system actors | entity diagram |
| 3 | Add a startup class | `AppConfigurator` — builds the container, registers repositories, gateways and controllers, loads configuration, restores persistent state, resumes ingestion | control diagram |
| 4 | Convert or add controllers and coordinators | The 15 analysis control classes carried over; **three coordinators added** — `DomainEventPublisher`, `WorkOrderTransitionTable`, `ServiceContainer`. The patterns below add ten more classes (4 ingestion jobs, 6 normalisation strategies), so `src/control/` holds 30 files against the analysis model's 15 control classes | control diagram |
| 5 | Add classes for data types | Four value types promoted from attributes: `GeoPoint`, `Polygon`, `PremisesMix`, `TierThresholds`. The 13 enumerations were already first-class in Lab 2 | entity diagram |
| 6 | Convert or add container classes | `ClusterRanking` (the ordered priority list, with `rank()` and `byTier()`), and the ten repositories, which are containers over persistent collections | entity diagram |
| 7 | Convert or add engineering relationships | Realization throughout: `NormalisationStrategy`, `ExternalGateway` and its four sub-interfaces, `Repository`, `DomainEventSubscriber`. Generalization for `AbstractIngestionJob` and `RouteHandler` | all three |

**Two promotions worth defending.** `GeoPoint` and `Polygon` exist because latitude and longitude
travelled together through nine classes as loose numbers. Making them a type puts `distanceTo()` and
`contains()` where they belong and removes a whole class of argument-order bug. `PremisesMix` exists
because three counts that are always read together and always summed are one concept, not three
attributes — and requirement 4.1.x scores on the mix, not on the parts.

**One thing deliberately not done.** No class was invented to satisfy a heuristic. Fox's list is a
prompt, not a checklist to be filled: `NotificationChannelFactory` would have satisfied heuristic 7
and served exactly one product, so it is absent and this sentence is the record of that choice.

---

## 2. Architecture (lab §3.1.2)

**Three tiers and a fourth process.** A React client, a Node/Express application server, and
PostgreSQL + PostGIS — plus a *separate scheduler process* running the ingestion jobs.

The scheduler being separate is the one architectural decision that is not obvious, and it is forced
by two requirements pulling in the same direction. 10.2.3 requires ingestion to resume automatically
after a restart, which is simpler when scheduling is not entangled with request serving; and 10.1.2
and 10.1.5 constrain response time under 50 concurrent users, which a 60-second scoring cycle
(10.1.3) sharing the request threads would put at risk. Both point at the same split.

**Server packages follow the stereotypes**, as lab §3.4.2 requires:

```
src/
  boundary/    route handlers, DTO validation, and the five external gateway adapters
  control/     the 15 control classes, 3 coordinators, 4 ingestion jobs, 6 normalisation strategies
  ports/       interfaces and the data that crosses them: ExternalGateway, Repository, RawPayload
  entity/      the 23 domain classes, 15 enumerations, 4 value types
  persistence/ repository implementations, the Database wrapper, SQL migrations
  config/      AppConfigurator, ServiceContainer, ConfigSet
```

The dependency rule is one-directional and is the architecture's only hard constraint: **boundary →
control → persistence, with every layer permitted to import `ports/` and `entity/`, and nothing at
all importing `boundary/`.** Nothing in `entity/` imports from `control/`; nothing in `control/`,
`persistence/` or `ports/` imports from `boundary/`.

**The `ports/` layer exists because the first version of this rule was false.** The ingestion jobs
and the repositories imported their gateway interfaces from `boundary/gateways/`, so control did
import boundary — while this document asserted it did not. An adversarial review caught it. Moving
the *interfaces* to `ports/` and leaving the *adapters* in `boundary/` fixes the direction rather
than the sentence: the control layer depends on an abstraction of the outside world, and the concrete
gateway depends on that same abstraction. That is dependency inversion, and it is what makes 10.6.3
achievable — a control class can be tested against a fake port with no HTTP anywhere.

This is 10.6.1 made structural rather than aspirational, and it is mechanically checkable: a lint
rule can enforce it, and it is now true of the code, verified by grepping every import in `src/`.

---

## 3. Key design issues (lab §3.2, Bruegge ch. 7.4)

### 3.1 Persistent data storage

**Decision: a relational store, PostgreSQL 15 with PostGIS on Supabase, reached only through
repositories.**

Bruegge's three candidates are flat files, a relational database, and an object-oriented database.
Flat files fail immediately: 10.1.5 requires 50 concurrent users and the report and work-order flows
are concurrent writes to shared state, which is exactly what a file store handles worst. An OO store
would remove the mapping layer, but the deciding factor points the other way — three requirements
(1.2.5 nearest stations, 3.1.8 saved locations against cluster boundaries, 5.1.7 reports bound to a
containing cluster) are spatial queries, and PostGIS answers each in one indexed query where
application code would re-implement a spatial index badly.

**The mapping is hand-written, not generated.** Repositories translate between rows and entity
objects; migrations are hand-written SQL held in `persistence/migrations`. This costs more typing
than an ORM's automatic migrations and buys the thing the module grades: the entity diagram stays
the source of truth, and the schema can be read against it.

**What is persistent, and when.** Everything in the entity model except `Principal` and the derived
`ClusterRanking`. Two retention decisions matter to the design rather than to the storage layer:
`ClusterSnapshot` rows are never overwritten, because the case delta (1.1.8), the 30-day trend
(9.1.9) and the trajectory (9.1.10) all depend on the system remembering what the feed said before —
the NEA feed publishes current values only. And `PriorityScore` rows are appended rather than
updated, so a score shown in the demo can be explained afterwards.

**Photographs are not in the database.** They go to object storage, referenced by row, served only
through authenticated non-enumerable URLs (10.3.5).

### 3.2 Access control

**Decision: a role-based access matrix, held as a policy object, enforced by one service on the
server, with row-level security in the database as a second layer.**

Bruegge's three mechanisms are the global access table, the access control list (per object), and
capabilities (per subject). The requirements decide this. §2.3 states rules per *role* — a Resident
may read only their own saved locations (2.3.1), a Crew Member only work orders assigned to them
(2.3.5), a Manager all reports and work orders (2.3.4). Those are matrix cells, not per-object lists:
there are three roles and a bounded set of resource kinds, and no requirement anywhere gives one
individual object a different rule from its neighbours. A per-object ACL would model an authority
structure the problem does not have.

**Two rules are ownership-scoped, and that is the design's one subtlety.** 2.3.1 and 2.3.2 are not
"may a Resident read saved locations" but "may this Resident read *this* saved location". The matrix
cannot answer that alone, so `AccessPolicy.isOwnershipScoped(action)` marks those actions and
`AccessControlService.authorise()` additionally compares the principal's account id to the resource's
owner. Modelling ownership as a property of the *action* rather than of the *object* keeps the matrix
small and keeps the check in one place.

**Enforcement is on the server, and the design makes that structural.** 2.3.6 and 10.3.3 both require
it. `RouteHandler` is abstract and every concrete route handler inherits from it; `authorise()` is
called before any control class runs. Row-level security in Postgres is the second layer, not the
first — it protects against a bug in the server, but the requirement is about the server, so the
server is where the answer lives.

**Refusals are logged.** 2.3.8 requires every authorisation error to be recorded with the requesting
user, the resource and the timestamp; `denyAndLog()` is the only path to a refusal, so the log cannot
be skipped by forgetting to call it.

### 3.3 Authentication provider

**Decision, 2026-09-03: Supabase Auth.** This restores the choice `lab2/AI-TECH-STACK.md` §5 and
`BACKLOG.md` F2 had already made. The first Lab 3 skeleton had drifted away from it — hand-rolling
registration, sign-in and a stored password hash — not by decision but because the design was written
straight from the requirements. An adversarial review caught the divergence and the team settled it.

**Why.** The graded engineering in this project is the scoring engine and the work-order lifecycle,
not password hashing, and the schedule is the binding constraint: 10.3.1 salted hashes, 2.1.5
verification email, 2.1.11 single-use 30-minute reset links and 2.1.8/2.1.9 session issuance and
expiry are roughly a week of undifferentiated work that a provider gives us on day one. The module
constraint on hand-coded implementation is satisfied elsewhere and by a wide margin; authentication
is peripheral infrastructure, which is exactly the category where a managed service is defensible.

**What the provider owns, and what stayed ours.** This is the part worth defending in a viva, because
the split is not clean:

| Requirement | Owner | Why |
|---|---|---|
| 10.3.1 salted hash, 2.1.7 authenticate against it | Supabase | Stored in the `auth` schema of the *same* PostgreSQL database. The hash still exists and is still ours to point at — what changed is which schema owns it and who wrote the hashing code |
| 2.1.5 verification email, 2.1.11 reset link | Supabase | Deliverability and single-use token handling, neither of which we should be writing |
| 2.1.8, 2.1.9 session issue and 24-hour expiry | Supabase | Configured, and the configured value is recorded in `ConfigSet` so it is checkable rather than assumed |
| **2.1.2, 2.1.3 password rules** | **Ours** | Checked before the provider is called, so the error can name the rule that failed (10.5.3) |
| **2.1.10 lock-out** | **Ours** | Specified precisely — five consecutive failures within fifteen minutes, locking for fifteen — and no provider setting expresses exactly that. `failedAttempts` and `lockedUntil` stay on `Account` |
| **2.2.1 role, and all of §2.3** | **Ours** | Supabase answers *who is this*; `AccessControlService` answers *may they*. §2.3 is written per role, and the role is ours |

**What changed in the model.** `Account` loses `passwordHash` and gains `authUserId`: the row is now a
profile joined to the provider identity, not a credential store. `AuthenticationController` keeps its
signatures unchanged and delegates through a new `AuthProvider` port, so the class diagram did not
have to move. Photographs go to Supabase Storage behind an `ObjectStorage` port, private buckets
only, read through expiring signed URLs (10.3.5).

**Why a port at all, when the provider is chosen.** Not for provider-independence in the abstract —
that argument is usually a fiction. Two concrete reasons: a control class must be unit-testable with
no network (10.6.3), and the ownership split in the table above needs somewhere to be visible.
`AuthProvider` is where the boundary between their responsibility and ours is written down.

**One operational rule that follows.** Supabase issues two keys. The service-role key bypasses
row-level security and is server-side only; the browser gets the anon key. Both stay out of the
repository (10.3.4). A service key in the client bundle would silently undo every §2.3 rule.

---

## 4. Design patterns (lab §3.2.2)

Five patterns are in the detailed class diagrams. Each is there because a specific requirement made
it earn its place — a pattern applied for its own sake is a liability in a viva.

| Pattern | Where | The requirement that forced it |
|---|---|---|
| **Strategy** | `NormalisationStrategy` and its five implementations | 4.1.4 obliges a normalisation method per driver and names none. This was **open item 1 carried out of Lab 2**; the design closes it |
| **Template Method** | `AbstractIngestionJob` → cluster / rainfall / forecast jobs | 10.2.2 stale-marking, 10.2.3 resume-after-restart and 10.2.4 no-data-loss are identical across three sources. Written once, not three times |
| **Observer** | `DomainEventPublisher`, subscribers `PriorityScoringEngine` and `AlertTriggerEvaluator` | Ingestion must trigger rescoring and alert evaluation without the jobs knowing who listens |
| **Adapter** | Five gateways behind `ExternalGateway` and its sub-interfaces | 10.4.6 rate limits and retry in one place; unit-testable control classes (10.6.3); and the two still-unverified sources isolated to one file each |
| **Repository** | Ten repositories over `Database` | Spatial predicates stay in the database; control classes test against in-memory fakes |

**One pattern was considered and rejected, which is the more interesting answer.** The work-order
lifecycle is an eight-state machine, and the GoF **State** pattern is the textbook fit. We chose a
**table-driven** machine instead: `WorkOrderTransitionTable` holds `TransitionRule` rows, each naming
the target status, the role permitted to make the move, a guard, and the requirement it comes from.

The reason is 8.3.2 — only the transitions in the state table are permitted. Under State, that rule
is true of the set of eight classes and visible in none of them; a reviewer must read all eight to
confirm it, and a ninth state added later can quietly violate it. Under a table, the rule *is* the
table. It is also what keeps `isTransitionPermitted()` a single method with a bounded branch
structure, which is what makes it the Lab 4 basis-path test subject. Pattern choice here follows from
what must be verified, not from what is idiomatic.

**Encapsulation, coupling, cohesion (lab §2.3).** `WorkOrder.status` is private with no public
setter — the only way to change it is `applyStatus()`, called only by the lifecycle controller after
validation. That is 8.3.2 enforced by encapsulation rather than by convention, and it is the
concrete answer to "where did you apply information hiding". Coupling is reduced by the interfaces
in the table above (control classes depend on `ClusterSource`, not on `NEAFeedGateway`); cohesion is
what the `DispatchController` / `WorkOrderLifecycleController` split is about — deciding what work
should exist and governing how a work order moves are two responsibilities, and merging them was the
defect the Lab 2 adversarial review found.

---

## 5. Refined dialog map

`dialog-map-design.puml` adds three things to the Lab 2 map:

1. **The client route for every state** — `/ops/work-orders/:id` and so on. This makes the map
   checkable against the router: a route in the code with no state on the map is a defect in one of
   the two.
2. **The control operation each transition invokes.** A transition that names no operation is either
   pure navigation or an unimplemented requirement, and the distinction is now visible.
3. **Self-transitions.** Accepting a job, starting it, raising an issue, verifying a completion —
   these change entity state without changing screen. Lab 2's map omitted them, which understated
   how much of the work-order flow happens on one screen. Every one routes to
   `WorkOrderLifecycleController`, including the three `DispatchController` initiates.

The §11.4 loading / empty / error / stale sub-states remain declared rather than drawn, and are now
implemented as a single `LoadState` value per screen component rather than four booleans — an
impossible combination cannot be represented.

---

## 6. Traceability (lab §2.5)

| Lab 2 artefact | Becomes | Lab 3 artefact |
|---|---|---|
| 23 entity classes | typed, with operations, plus 4 value types | `class-diagram-design-entity.puml` |
| 15 control classes | full signatures, plus 3 coordinators and a startup class | `class-diagram-design-control.puml` |
| 27 screens + 5 gateways | React components behind `RouteGuard`; gateways behind interfaces | `class-diagram-design-boundary.puml` |
| Dialog map, 27 states | routes and operations added; self-transitions drawn | `dialog-map-design.puml` |
| §2.3 access control | `AccessControlService` + `AccessPolicy` + ownership scoping | §3.2 above |
| §8.3 state table | `WorkOrderTransitionTable`, one `TransitionRule` per row, each citing its requirement | control diagram |

The chain the module asks for is requirement → design → code → test. `TransitionRule.requirement` is
that chain made literal: every permitted transition carries the requirement number that permits it,
so the Lab 4 basis-path tests can be named after requirements rather than after line numbers.

---

## 7. Open items carried into Lab 4

1. **Driver weights are still unset.** 4.1.5 defers them to configuration and 4.1.6 only requires
   them to sum to 1.0. The design puts them in `ConfigSet`; the *values* are a team decision and
   should be made against real cluster data, not invented.
2. **NEA feed update frequency — still unverified**, and still load-bearing for the "live data"
   criterion. Carried from Lab 2 unchanged.
3. **OneMap Search — still not test-pulled.**
4. **The AI project-initialisation exercise (§3.3) is not done** — see `lab3/README.md` for why it
   has to be run in a fresh session and what it needs from the team.

---

## 8. Adversarial review, 2026-09-03

Two critics on disjoint axes — internal modelling correctness, and lab compliance and risk. Every
claim was verified against source before it was accepted. What changed:

| Finding | Disposition |
|---|---|
| The stated dependency rule was false: `control/` and `persistence/` imported gateway interfaces from `boundary/` | **Fixed structurally.** New `ports/` layer; the rule is now true of the code, not only of this document |
| `AlertTriggerEvaluator` was drawn as an Observer subscriber and implemented none of the interface | **Fixed.** `handles()` and `on()` added |
| Four transition rules cited `8.2.x`, which is not a requirement number, contradicting this document's claim that every rule carries one | **Fixed.** 8.2.1 for assignment, 8.2.5 for reassignment |
| The Completed to Rejected rule had no guard, so 8.3.10's required reason was unenforced | **Fixed.** `HAS_REJECTION_REASON` added |
| `Cluster.daysSinceLastTreatment` cited 4.1.17 (the score must fall) instead of 4.1.15 and 4.1.16 (how the value is computed) | **Fixed** in both places it appeared |
| `NotificationController.retryDelivery` cited 10.2.4; the requirement that actually governs retry is 6.1.11, which was cited nowhere | **Fixed** |
| The dialog map had no Rejected to In Progress transition, though 8.3.20 and the transition table both have it — an 11.3.1 violation | **Fixed** on the map, and `resume()` added to the controller |
| Moderation Queue had no return path to the dashboard (11.3.3) — inherited from Lab 2 and missed by the first refinement pass | **Fixed** |
| Work Order Create returned to Cluster Detail from all three of its entry points (11.3.3) | **Fixed.** It now returns to whichever screen opened it |
| Not Authorised and Not Found were annotated "any route" against 11.3.8's distinct-URL rule | **Fixed.** `/403` and `/404` |
| `enums.ts` claimed 13 enumerations and defined 15 | **Fixed.** The two design-level additions are marked as such |
| "15 control classes" undercounted `src/control/`, which holds 30 files | **Fixed.** The heuristic table now accounts for the pattern hierarchies |
| `REQUIREMENTS.md` headers said Version 0.3 while carrying v0.4 additions | **Fixed** in the root and Lab 1 copies |
| `BACKLOG.md` still assumed two roles and Supabase Auth, with no supersession note | **Fixed.** Note added — and the auth divergence it exposed was then settled in favour of Supabase (§3.3) |
| `AI-TECH-STACK.md` claimed `REQUIREMENTS.md` names Supabase — it does not | **Fixed**, with the correction dated in place |
| Zero implemented behaviour, against §3.4.1's "start implementing behaviour" | **Partly fixed.** The pure core is implemented: haversine distance, all five normalisation strategies, tier assignment, weighted scoring with degradation, ranking, the access matrix, weight validation, and the overdue and terminal predicates |

**Not accepted.** The reviewer objected that `architecture.puml` draws control to gateways. It does,
and that is correct at the architectural level: the control layer does call out to external services.
The finding was really about *where the interfaces live in the source tree*, which the `ports/` layer
now settles. The architecture diagram is unchanged because the runtime relationship it depicts was
never in doubt.

**One finding could not be fixed here, and is passed to the team.** The repository has a single
commit by a single author. The module's individual mark is team mark times peer-review weight, and a
supervisor reads commit history as evidence of who did what. Nothing in this document repairs that;
only the team committing their own work under their own names will.
