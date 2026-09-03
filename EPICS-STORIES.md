# D-Fence — Epics, User Stories and Subtasks

Version 0.3 · drafted 2026-09-02 · companion to `REQUIREMENTS.md`
Revised after adversarial review. 11 epics, 57 user stories.

Every story carries a **Traces** list citing the atomised requirement numbers it delivers. That list
is the traceability spine: requirement → story → commit → test case. The Lab 5 demo reserves 2–3
minutes for a traceability walkthrough, and this is the artefact that walkthrough reads from.

**Estimate key:** S = 1–2 days · M = 3–5 days · L = 1–2 weeks (one person, part-time student hours).
**Priority key:** P0 = the project fails without it · P1 = a graded criterion depends on it ·
P2 = build if on schedule · P3 = cut unless genuinely ahead.

---

## Epic map

| Epic | Name | Actor | Requirements | Priority | Est. |
|---|---|---|---|---|---|
| E0 | Platform foundation | — | 10.6, 10.7 | P0 | M |
| E1 | Live data acquisition | Scheduler | 1.1–1.4 | P0 | L |
| E2 | Accounts, roles and access control | All | 2.1–2.4 | P0 | M |
| E3 | Saved locations and exposure | Resident | 3.1 | P1 | M |
| E4 | Priority scoring engine | Scheduler | 4.1 | **P0 — the core** | L |
| E5 | Community reporting | Resident, Manager | 5.1–5.3 | **P0 — multi-user core** | L |
| E6 | Resident alerts | Resident | 6.1 | P1 | M |
| E7 | Operations dashboard | Manager | 7.1–7.5 | P1 | L |
| E8 | Work-order dispatch and crew execution | Manager, Crew | 8.1–8.5 | P1 | L |
| E9 | Map, trend and history | All | 9.1 | P2 | M |
| E10 | Front end, navigation and interaction | All | 11.1–11.7 | P1 | L |

E7 and E8 are the new features added 2026-09-02. What they change is discussed in §"What the new
feature costs and buys" at the foot of this document.

**How E10 relates to the other epics.** The screens themselves are built inside the feature epic that
owns them — the report form is in E5, the priority table is in E7, the crew job view is in E8. E10
owns what sits underneath and across all of them: the shell and navigation, the component library, the
dialog map, the loading, empty and error states, the form and data-presentation conventions, and the
accessibility pass. Keeping it as a separate epic is deliberate: the Lab 1 UI mockups and the Lab 2/3
dialog map are graded work products in their own right, and they need an owner.

---

# E0 — Platform foundation

*Enabler epic. No user-visible behaviour; everything else sits on it.*

### US-0.1 — Repository and branching discipline
**As** the team, **we need** a repository with an enforced branch model **so that** every lab
deliverable is traceable to an author and the supervisor can read our history.

**Traces:**
- Process requirement (lab manual §2.2); no numbered requirement.

**Acceptance:**
- `main` and `dev` exist and feature branches squash-merge into `dev`.
- Folders `lab1` through `lab5` exist in the repository.
- Every work product names its author.

**Subtasks:**
- Create the repo through the lab technician; add all members.
- Create `main`, `dev`, and the `lab1`–`lab5` folder skeleton.
- Write `CONTRIBUTING.md` with the branch and commit-message rules.
- Add a pull-request template with a "requirement numbers covered" field.
- Add an `index.md` listing every work product and its author.

### US-0.2 — Runtime skeleton and layered structure
**As** a developer, **I want** a running application skeleton with boundary, control and entity layers
separated **so that** the Lab 3 design model matches the code.

**Traces:**
- 10.6.1
- 10.7.1
- 10.7.2

**Acceptance:**
- The application builds and serves an authenticated empty page.
- Source folders map one-to-one onto the three UML stereotypes.
- The layout is usable at 360 px and at 1920 px.

**Subtasks:**
- Choose and scaffold the framework; commit the folder structure.
- Create the `boundary/`, `control/`, `entity/` packages with one placeholder class each.
- Set up the database project and migration tooling.
- Configure environment-variable loading; commit `.env.example` only.
- Deploy a hello-world build to the hosting target.

### US-0.3 — Configuration, logging and error handling
**As** a developer, **I want** central configuration and logging **so that** weights, thresholds and
failures are visible without code changes.

**Traces:**
- 10.3.4
- 10.6.2
- 10.6.4

**Acceptance:**
- Scoring weights and tier thresholds load from configuration at start-up.
- Every unhandled exception is logged with a correlation id.
- No secret appears anywhere in the repository.

**Subtasks:**
- Define the config schema and loader with validation on start-up.
- Add a structured logger and a request correlation id.
- Add a global error handler returning a user-safe message.
- Add a secret-scan step to the pull-request checks.

### US-0.4 — Meet the security and privacy obligations
**As** the system owner, **I need** the transport, storage and disclosure rules met **so that** the
system can hold residents' locations and reports without exposing them.

*Added in v0.3. All eight requirements below were previously traced by no story — they read as
forgotten rather than deferred.*

**Traces:**
- 10.3.2
- 10.3.5
- 10.3.6
- 10.4.1
- 10.4.2
- 10.4.3
- 10.4.4
- 10.4.5
- 10.4.6

**Acceptance:**
- All traffic is served over HTTPS and photograph URLs are authenticated and non-enumerable.
- Every user-supplied input is validated and sanitised before storage.
- No screen available to a Resident exposes another reporter's identity.
- An account deletion request removes personal data within seven days.
- Every government data source carries its required attribution on the screen that uses it.

**Subtasks:**
- Enforce HTTPS and configure signed, expiring photograph URLs.
- Add input validation and sanitisation at the control-layer boundary.
- Implement account deletion and its data-removal job.
- Add the attribution footer and check each source's licence terms.
- Add rate-limit respect to every external client.

### US-0.5 — Prove the performance and test obligations
**As** the team, **we need** the stated performance numbers measured rather than asserted **so that**
§10.1 is a requirement rather than a wish.

*Added in v0.3, same reason as US-0.4.*

**Traces:**
- 10.1.1
- 10.1.2
- 10.1.3
- 10.1.4
- 10.1.5
- 10.6.3

**Acceptance:**
- Dashboard first render, read-request latency, scoring-cycle duration and map render are each measured and recorded against their stated thresholds.
- A 50-user concurrent run holds the 10.1.2 latency threshold.
- Every control class has automated unit tests.

**Subtasks:**
- Seed a database with 500 clusters and 30 days of history for realistic measurement.
- Measure and record the four timing thresholds.
- Run the concurrency check and record the result.
- Add the control-class unit-test coverage check to the pull-request checks.

---

# E1 — Live data acquisition

### US-1.1 — Ingest dengue clusters on a schedule
**As** the Scheduler, **I need** to pull and store the NEA cluster feed **so that** every other feature
has current cluster data.

**Traces:**
- 1.1.1
- 1.1.2
- 1.1.3
- 1.1.4
- 1.1.5
- 1.1.6
- 1.1.14
- 1.1.17

**Acceptance:**
- A scheduled run stores a new timestamped snapshot for every valid feature.
- A feature missing a required field is skipped and logged, and the remaining features still store.
- The run record shows start time, end time, feature count and outcome.

**Subtasks:**
- Write the `Cluster` and `ClusterSnapshot` entity schema including geometry.
- Implement the HTTP fetch with timeout and user agent.
- Implement the GeoJSON parser mapping the seven fields plus geometry.
- Implement per-feature validation and the rejection log.
- Implement snapshot insert with first-seen and last-updated handling.
- Register the job on a scheduler at a 60-minute interval.
- Unit-test the parser against a saved sample payload including a malformed feature.

### US-1.2 — Detect what changed between runs
**As** the Scheduler, **I need** to classify each cluster's change **so that** alerts and trend views
have something to fire on.

**Traces:**
- 1.1.7
- 1.1.8
- 1.1.9
- 1.1.10

**Acceptance:**
- Case delta is computed against the previous snapshot for every cluster.
- Each cluster is classified into exactly one of the five states.
- A cluster absent from two consecutive retrievals is classified CLOSED.

**Subtasks:**
- Implement the snapshot diff against the previous run.
- Implement the five-state classifier with the absence counter.
- Emit a domain event per changed cluster for E6 to consume.
- Unit-test each of the five classifications with fixtures.

### US-1.3 — Ingest rainfall and maintain accumulations
**As** the Scheduler, **I need** rolling rainfall totals per cluster **so that** the score has a live
driver that visibly moves.

**Traces:**
- 1.2.1
- 1.2.2
- 1.2.3
- 1.2.4
- 1.2.5
- 1.2.6
- 1.2.7
- 1.2.8
- 1.2.9
- 1.2.10

**Acceptance:**
- The job runs at least every five minutes.
- Readings older than 30 minutes are discarded.
- Every active cluster has a 24-hour and a 72-hour accumulation in mm to one decimal place.
- No accepted reading for 30 minutes marks the source stale.

**Subtasks:**
- Implement the fetch and parse of stations and readings.
- Implement the reading-age filter.
- Precompute the three-nearest-station mapping per cluster; recompute when clusters change.
- Implement inverse-distance weighting into a per-cycle cluster value.
- Implement the rolling 24-hour and 72-hour windows with pruning.
- Repeat the accumulation for saved locations.
- Unit-test the weighting maths and the window pruning.

### US-1.4 — Ingest the 24-hour forecast
**As** the Scheduler, **I need** a heavy-rain flag per cluster **so that** residents can be warned
before rain, not after.

**Traces:**
- 1.3.1
- 1.3.2
- 1.3.3
- 1.3.4
- 1.3.5

**Acceptance:**
- Every active cluster maps to exactly one forecast area.
- The flag is true for each of the three named forecast texts.
- The forecast validity period is stored with the derived value.

**Subtasks:**
- Implement fetch and parse of the forecast payload.
- Implement centroid-in-area mapping with nearest-centroid fallback.
- Implement the keyword rule and store the flag with validity.
- Unit-test area mapping for a cluster outside every area polygon.

*Delivered 2026-09-03, commit `dbc16bb` on `feat/us-1.4-forecast`. One correction to the story as
written: requirement 1.3.2 asks for "the region polygon containing the cluster centroid", but the
24-hour forecast endpoint **publishes no polygons** — it returns `periods[].regions.{north, south,
east, west, central}` only. The five macro-regions are therefore defined in
`src/control/ingestion/ForecastRegionMap.ts` as five axis-aligned rectangles that partition
Singapore's bounding box exactly, with no overlap and no gap, so 1.3.2's "exactly one region" is
true by construction; a nearest-region-centroid fallback catches any point outside the bounds. The
rectangles are coarser than NEA's own region shapes and must be named as a limitation in the demo.*

### US-1.5 — Watch the health of every data source
**As** an Operations Manager, **I want** to see when a feed last succeeded **so that** I do not act on
stale data without knowing it.

**Traces:**
- 1.4.1
- 1.4.2
- 1.4.3
- 1.4.4

**Acceptance:**
- Each source shows a last-success timestamp on the Data Sources screen.
- Three consecutive failed intervals raise a source-health warning.
- Any screen showing data from a stale source displays the staleness indicator.

**Subtasks:**
- Add a `SourceHealth` entity updated by every ingestion job.
- Implement the consecutive-failure counter and the warning event.
- Build the Data Sources screen.
- Build the staleness banner component and apply it to affected views.

*Delivered 2026-09-03 (server side), commit `c261bda`, merged to `dev` with `--no-ff`. The §1.4 rule
now lives in `src/control/SourceHealthController.ts`. Two corrections to what was previously built:
the panel raised a warning after **one** failed run where 1.4.3 says three consecutive scheduled
intervals, and it reported only **two** sources (clusters, rainfall) where 1.4.1 says every external
data source — the forecast and geocoding sources were simply absent, and a source missing from a
health panel does not look unhealthy, it looks fine. A warning now needs either the three most recent
settled runs all FAILED, or no success across three of the source's own configured intervals — the
second condition exists because a failure counter is structurally blind to a scheduler that has
stopped: a job that never runs writes no FAILED rows. Intervals come from `ConfigSet.ingestionIntervals`
(10.6.2) with per-source fallbacks; UNCHANGED counts as a success (1.1.21); "has not run yet" is its
own state — not a warning, but stale. Geocoding has no ingestion job (it runs on resident address
saves and a 48-hour token schedule per 3.1.15), so it self-reports a `lastSuccess` instead of writing
an IngestionRun per lookup (3.1.16), and an authentication failure warns immediately because, unlike
a 503, a lapsed token does not clear itself. `isStale` (1.4.4) is deliberately a lower bar than the
warning — one missed interval marks the data, three raise the alarm — and `DashboardOverview` now
carries `staleSources` so no screen needs a second endpoint to know whether to show the indicator.
17 new cases in `tests/source-health.test.ts` (TEST-PLAN §2.17); dashboard case D9 was **corrected** —
it asserted that a single failed run raised an attention item, which was passing and wrong, and now
asserts both sides of the 1.4.3 boundary. **The remaining two subtasks — the Data Sources screen and
applying the staleness banner to affected views — are E10 work and stay gated on mockups B3-B12,
like every other screen.** The shared stale-state component already exists in
`client/src/components/States.tsx`.*

### US-1.6 — Survive a feed outage without losing the application
**As** an Operations Manager, **I want** the system to keep working when a source fails **so that** an
NEA outage does not take the dashboard down with it.

*Added in v0.3. Requirements 1.1.11–1.1.13 and all of §10.2 were previously traced by no story — the
entire resilience path was specified and then left out of the build plan.*

**Traces:**
- 1.1.11
- 1.1.12
- 1.1.13
- 1.1.18
- 10.2.1
- 10.2.2
- 10.2.3
- 10.2.4

**Acceptance:**
- A failed retrieval retries three times at five-minute intervals, then raises an ingestion-failure event.
- The last successful snapshot continues to serve, marked stale, while a source is down.
- Scheduled ingestion resumes automatically after a process restart.
- No submitted report, work order or completion is lost during a source outage.
- An Operations Manager can trigger an ingestion run manually.

**Subtasks:**
- Implement retry with backoff and the failure event.
- Implement last-good-snapshot serving with the stale marker.
- Make the scheduler re-register its jobs on start-up.
- Build the manual ingestion trigger on the Data Sources screen.
- Test by pointing the client at an unreachable host mid-cycle.

---

# E2 — Accounts, roles and access control

### US-2.1 — Register as a resident
**As** a member of the public, **I want** to register **so that** I can save locations and report sites.

**Traces:**
- 2.1.1
- 2.1.2
- 2.1.3
- 2.1.4
- 2.1.5
- 2.1.6
- 2.2.1
- 2.2.2
- 11.2.2

**Acceptance:**
- A password under eight characters, or without a letter and a digit, is rejected with a specific message.
- A duplicate email address is rejected with a specific message.
- A verification email is sent on successful registration.
- Sign-in before verification is refused and says why.

**Subtasks:**
- Configure the auth provider and the `User` entity with a role column.
- Build the Register screen with inline validation.
- Implement password rules and duplicate-email rejection.
- Wire the verification email and the verification endpoint.
- Test registration, duplicate, weak password and unverified sign-in.

### US-2.2 — Sign in and out safely
**As** any user, **I want** a session that expires and an account that locks under attack **so that**
my account is not trivially taken over.

**Traces:**
- 2.1.7
- 2.1.8
- 2.1.9
- 2.1.10
- 2.1.11
- 2.1.12
- 2.2.5
- 10.3.1
- 11.2.3
- 11.2.4
- 11.1.9
- 11.1.10

**Acceptance:**
- A valid credential pair issues a session token.
- Twenty-four hours of inactivity expires the token.
- Five failed attempts within 15 minutes lock the account for 15 minutes.
- A deactivated account cannot sign in.
- After signing in, the user lands on the screen they originally requested.

**Subtasks:**
- Implement sign-in, sign-out and session expiry.
- Implement the failed-attempt counter and lockout window.
- Implement the single-use, 30-minute password reset link.
- Build the Sign In, Password Reset Request and Password Reset screens.
- Verify passwords are stored only as salted hashes.

### US-2.3 — Provision staff accounts
**As** an Operations Manager, **I want** to create and deactivate manager and crew accounts **so that**
only authorised staff reach operational screens.

**Traces:**
- 2.2.3
- 2.2.4
- 11.2.22

**Acceptance:**
- Only a manager can create a non-resident account.
- A deactivated account is refused at sign-in.
- Both actions appear in the audit trail.

**Subtasks:**
- Build the Staff Accounts screen with the creation form.
- Restrict the creation endpoint to the manager role.
- Implement deactivation and its effect on sign-in.

### US-2.4 — Enforce access rules on the server
**As** the system owner, **I need** authorisation enforced server-side **so that** hiding a button is
never the control.

**Traces:**
- 2.3.1
- 2.3.2
- 2.3.3
- 2.3.4
- 2.3.5
- 2.3.6
- 2.3.7
- 2.3.8
- 10.3.3
- 11.2.24

**Acceptance:**
- A resident calling a work-order endpoint receives an authorisation error and the attempt is logged.
- A crew member reading another member's work order is refused.
- An unauthorised request lands on the Not Authorised screen, not a blank page.

**Subtasks:**
- Define the role–resource permission matrix as a document and as code.
- Implement row-level rules for saved locations, reports and work orders.
- Add the authorisation-failure logger.
- Build the Not Authorised and Not Found screens.
- Write negative tests for each of the six rules in §2.3.

### US-2.5 — Record an audit trail
**As** an Operations Manager, **I want** every state change attributed **so that** dispatch decisions
can be reviewed.

**Traces:**
- 2.4.1
- 2.4.2

**Acceptance:**
- Every write records actor, action, entity and timestamp.
- No role can edit or delete an audit row.

**Subtasks:**
- Add the `AuditEntry` entity and a write hook in the control layer.
- Deny update and delete on the audit table at the database level.
- Test that a report moderation and a work-order assignment both produce entries.

*Delivered 2026-09-03, commit `2e9fecd`, merged to `dev` with `--no-ff`. §2.4 was two-thirds built:
registration, sign-in, sign-out and staff provisioning wrote audit rows, but **report moderation and
work-order assignment wrote nothing** — exactly the pair this story's acceptance criteria name, and
exactly the pair a review of a dispatch decision would ask about. A trail that covers authentication
but not operations records who logged in and not who sent a crew somewhere. The fix reuses the
pattern that already carries 5.2.8's status notification: **the single write path is the single audit
point.** The hook sits inside `ReportLifecycleController.transition` and
`WorkOrderLifecycleController.transition` — each the only class permitted to write its entity's
status — so one hook covers every present and future caller. Only changes a controller makes itself
are logged at the call site: work-order creation (8.3.15 makes Created an initial state, not a
transition), the assignee field, a cancellation reason, a report submission, a corroboration, a saved
location added or removed, an alert preference update. Two consequences were chosen deliberately.
An assignment produces **two** rows — the assignee changed and the status changed — because "who
moved this to Assigned" and "who put Ah Meng on it" are two questions. A **refused** transition writes
no action row, since 2.4.1 is about operations that change stored state and logging a refusal as
though it happened would make the log unusable as evidence; a **system-initiated** change (5.2.6
moving a linked report to Actioned when a work order is assigned) is attributed to a new
`SYSTEM_ACTOR_ID = 'system'` in `src/control/Principal.ts`, because attributing it to the nearest
human would be a lie in the one log that exists to be trusted, and a blank actor would make "nobody
did this" indistinguishable from "we did not record who did this". Two silent defects surfaced while
the tests were being written, not by running them: `InMemoryAuditStore` **accepted the target entity
id and threw it away**, so every row said what kind of thing changed without saying which one — 2.4.1
names four fields and only three were stored; and `recent()` returned the stored objects by
reference, so any caller could rewrite a record through an ordinary read, making 2.4.2 false by
accident. Both fixed: a new exported `AuditEntry` interface in `src/ports/Stores.ts` names all four
fields, and `recent()` returns copies. `src/server.ts` also held **two** `InMemoryAuditStore`
instances, one of which nothing read; a trail split across two objects is not a trail, and there is
now one, shared by `AccessControlService` and every controller that writes state. 10 new cases in
`tests/audit.test.ts` (TEST-PLAN §2.18); **414 tests passing across 18 files**, `tsc --strict` clean.
**No audit-reading HTTP route was added** — no requirement in §2.4 asks for the trail to be
displayed, and scope was not widened. The database-level deny on update and delete remains
outstanding for the same reason as everything else: the build still runs on in-memory stores.*

---

# E3 — Saved locations and exposure

### US-3.1 — Save a location by address or postal code
**As** a Resident, **I want** to save my home, workplace and my child's school **so that** the system
watches the places I care about.

**Traces:**
- 3.1.1
- 3.1.2
- 3.1.3
- 3.1.4
- 3.1.5
- 3.1.6
- 3.1.7
- 3.1.13
- 11.2.7

**Acceptance:**
- A postal code or address resolves through OneMap.
- Multiple matches are offered for confirmation before saving.
- No match is rejected with a message saying so.
- A label is mandatory and a sixth location is refused.

**Subtasks:**
- Implement the OneMap Search client with error handling and rate-limit respect.
- Build the Add Location screen with the label selector.
- Implement the candidate-match picker.
- Enforce the five-location limit server-side.
- Test: valid postal code, ambiguous address, no-result address, sixth location.

### US-3.2 — Manage saved locations
**As** a Resident, **I want** to see and delete my saved locations **so that** the list stays current.

**Traces:**
- 3.1.10
- 3.1.11
- 3.1.12
- 11.2.6

**Acceptance:**
- The list shows exposure status, cluster name, case size and data timestamp for each location.
- Deletion asks for confirmation naming the location.
- Deletion removes the location and its alert subscriptions.

**Subtasks:**
- Build the My Locations screen.
- Implement delete with confirmation and subscription cascade.

### US-3.3 — Evaluate exposure on every ingestion cycle
**As** the Scheduler, **I need** each saved location's exposure recomputed **so that** alerts and the
resident view are current.

**Traces:**
- 3.1.8
- 3.1.9

**Acceptance:**
- Every saved location carries exactly one of the three exposure statuses after each cluster ingestion.
- A location 100 m outside a boundary reads WITHIN_150M.

**Subtasks:**
- Implement point-in-polygon and buffer-distance evaluation.
- Hook the evaluation into the ingestion pipeline.
- Emit exposure-change events for E6.
- Unit-test with a point inside, a point 100 m outside and a point 2 km outside.

### US-3.4 — Keep the OneMap token alive
**As** the team, **we need** the geocoding token refreshed automatically **so that** saved locations and
the map do not silently break three days after someone last logged in.

*Added in v0.3. The OneMap token expires every 3 days and OneMap Search has not been test-pulled —
this was a live dependency with no owner and no failure path.*

**Traces:**
- 3.1.14
- 3.1.15
- 3.1.16
- 3.1.17

**Acceptance:**
- A token refresh runs at least every 48 hours and stores the new token.
- A OneMap authentication failure raises a source-health warning.
- A geocoding failure that is not a no-result case says lookup is unavailable, not that no match was found.

**Subtasks:**
- Register the OneMap account and test-pull Search to confirm its response shape **in week 1**.
- Implement the token refresh job and secure token storage.
- Distinguish no-result from request-failure in the client and surface each correctly.
- Test with a deliberately invalidated token.

---

# E4 — Priority scoring engine

*This is the epic that answers the "not a simple presentation of extracted data" veto. Protect it.*

### US-4.1 — Assemble and normalise the drivers
**As** the Scheduler, **I need** each driver reduced to a comparable 0–1 value **so that** they can be
combined.

**Traces:**
- 4.1.3
- 4.1.4
- 4.1.15
- 4.1.16
- 4.1.21
- 1.1.15
- 1.1.16

**Acceptance:**
- All seven drivers produce a value within [0,1] for every active cluster.
- Premises mix is computed from the three NEA premises counts, and a cluster with all three at zero scores 0.
- A cluster with no treatment record uses the 90-day default.
- The normalisation method for each driver is documented in the SRS.

**Subtasks:**
- Write the driver specification table (source, transform, bounds) into the SRS.
- Implement the premises-mix computation in the ingestion pipeline per 1.1.15.
- Implement a `Driver` interface and one class per driver.
- Implement the treatment-recency lookup with the 90-day default.
- Unit-test each driver at its minimum, its maximum and a mid value.

### US-4.2 — Compute the composite score and tier
**As** the Scheduler, **I need** a single ranked score per cluster **so that** the dashboard has
something to sort by.

**Traces:**
- 4.1.1
- 4.1.2
- 4.1.5
- 4.1.6
- 4.1.7
- 4.1.8
- 4.1.9
- 4.1.11
- 4.1.14

**Acceptance:**
- Weights load from configuration and are rejected if they do not sum to 1.0.
- The score is expressed 0–100 to one decimal place.
- Tiers apply at the configured thresholds.
- Ties break by case size and then by locality name.
- The cycle completes within ten minutes of ingestion and is retained as history.

**Subtasks:**
- Implement the weighted-sum calculator and the tier assignment.
- Implement weight-sum validation at start-up.
- Implement ranking with the documented tie-break.
- Persist a `ScoreRun` history row per cluster per cycle.
- Schedule the cycle off the ingestion completion event.
- Unit-test known driver inputs against a hand-computed score. **This is the designated Lab 4
  equivalence-class and boundary-value test case**, and the scoring control class is the designated key
  control class. The weighted-sum-with-renormalisation-and-tie-break method is the **first** of the two
  designated basis-path methods; the work-order transition guard in US-8.6 is the second.

### US-4.3 — Show why a cluster scored what it did
**As** an Operations Manager, **I want** the contribution of each driver **so that** I can defend a
dispatch decision.

**Traces:**
- 4.1.10
- 4.1.18

**Acceptance:**
- Every score row stores each driver's normalised value and weighted contribution.
- The breakdown is retrievable for any cluster and any past cycle.
- The breakdown returns ordered by contribution, descending.

**Subtasks:**
- Extend the score schema with the per-driver breakdown.
- Expose a breakdown endpoint.
- Return the breakdown ordered by contribution.

### US-4.4 — Degrade honestly when a source is down
**As** an Operations Manager, **I want** the score to keep working and to tell me what is missing
**so that** I know how much to trust it.

**Traces:**
- 4.1.12
- 4.1.13
- 4.1.19
- 4.1.20

**Acceptance:**
- A stale driver is excluded from the score.
- Remaining weights renormalise to 1.0.
- The score is marked DEGRADED and names the excluded driver.

**Subtasks:**
- Implement staleness checks per driver against `SourceHealth`.
- Implement weight renormalisation.
- Propagate the DEGRADED flag and reason to the API and the table.
- Test with rainfall forced stale.

### US-4.5 — Let treatment lower the score
**As** an Operations Manager, **I want** a treated cluster to fall in the ranking **so that** the queue
does not repeat itself.

**Traces:**
- 4.1.17
- 8.5.3

**Acceptance:**
- With all other drivers held constant, writing a treatment record produces a lower score on the next cycle.

**Subtasks:**
- Wire the treatment record into the recency driver.
- Add the regression test that fixes all other drivers and asserts the decrease.
- Add a scoring cycle triggered by work-order verification.

---

# E5 — Community reporting

*This is the entire multi-user criterion. It is also the loop that makes the product a system.*

### US-5.1 — Report a breeding site
**As** a Resident, **I want** to report standing water near me **so that** it gets cleared.

**Traces:**
- 5.1.1
- 5.1.2
- 5.1.3
- 5.1.4
- 5.1.5
- 5.1.6
- 5.1.7
- 5.1.8
- 5.1.9
- 5.1.10
- 11.2.8

**Acceptance:**
- A report requires a location, a type from the five, and a description under 500 characters.
- Up to three JPEG or PNG photographs under 5 MB attach successfully.
- The report binds to the containing cluster, else the nearest locality within 1 km, else Unassigned.

**Subtasks:**
- Build the Report a Site screen with the map-pin picker and address entry.
- Implement photo upload with size and type validation.
- Implement cluster containment and nearest-locality fallback.
- Persist the `Report` entity with reporter id and timestamp.
- Test each rejection path and the Unassigned path.

### US-5.2 — Avoid duplicate reports and let neighbours corroborate
**As** a Resident, **I want** to confirm an existing report rather than file a second one **so that**
the queue reflects severity, not noise.

**Traces:**
- 5.1.11
- 5.1.12
- 5.1.13
- 5.1.14

**Acceptance:**
- A same-type report within 50 m and 24 hours is refused and the existing report is offered.
- Confirming increments the corroboration count.
- A resident may confirm a given report only once.

**Subtasks:**
- Implement the proximity-and-recency duplicate query.
- Build the "confirm the existing report instead" flow.
- Implement the one-confirmation-per-resident constraint.
- Test at 49 m, 51 m, 23 hours and 25 hours. This is a further boundary-value case, not the designated
  Lab 4 submission — that is US-4.2.

### US-5.3 — Follow a report through its lifecycle
**As** a Resident, **I want** to see what happened to my report **so that** reporting feels worth doing.

**Traces:**
- 5.2.1
- 5.2.2
- 5.2.8
- 5.2.9
- 11.2.9
- 11.2.10

**Acceptance:**
- Status moves only through the defined set.
- The reporter is notified on every status change.
- Other residents see the report without the reporter's identity.

**Subtasks:**
- Implement the report state machine and its guard conditions.
- Build the My Reports and Report Detail screens with status history.
- Implement the notification hook on status change.
- Implement the anonymised public projection of a report.

### US-5.4 — Moderate incoming reports
**As** an Operations Manager, **I want** a queue of unverified reports **so that** false reports never
reach the score.

**Traces:**
- 5.2.3
- 5.2.4
- 5.2.5
- 5.3.1
- 5.3.2
- 5.3.3
- 5.3.4
- 5.3.5
- 11.2.14
- 11.2.15

**Acceptance:**
- The queue lists Submitted reports oldest-first and filters by cluster and by type.
- Verifying or rejecting records moderator, timestamp and reason.
- Rejection requires a reason of at least ten characters.
- Only Verified and Actioned reports count toward the score.
- Photographs stay hidden from other residents until the report is Verified.

**Subtasks:**
- Build the Moderation Queue screen with the two filters.
- Build the Report Review screen with verify and reject actions.
- Restrict the photo projection by report status.
- Wire the verified-report count into the E4 driver.

---

# E6 — Resident alerts

### US-6.1 — Link a Telegram chat
**As** a Resident, **I want** to connect Telegram **so that** alerts reach my phone.

**Traces:**
- 6.1.6
- 6.1.7
- 11.2.11

**Acceptance:**
- The application issues a single-use code valid for 15 minutes.
- Sending the code to the bot links that chat to the account.
- An expired or reused code is refused.

**Subtasks:**
- Register the bot and store the token in configuration.
- Implement code generation, expiry and the bot-side link handler.
- Build the Alert Settings screen with the code and instructions.

### US-6.2 — Choose which locations alert me
**As** a Resident, **I want** alerts per location **so that** I am not notified about places I no
longer care about.

**Traces:**
- 6.1.1

**Acceptance:**
- Each saved location has an independent alert toggle.
- The setting persists across sessions and is honoured by the trigger evaluator.

**Subtasks:**
- Add the subscription entity and the toggle control.
- Enforce the setting in the trigger evaluator.

### US-6.3 — Fire alerts on the right events, once
**As** a Resident, **I want** to be told when my area enters a cluster, when it grows, or when heavy
rain is coming — **so that** I can act, without being spammed.

**Traces:**
- 6.1.2
- 6.1.3
- 6.1.4
- 6.1.5
- 6.1.8
- 6.1.9

**Acceptance:**
- Each of the three triggers fires under its stated condition.
- The growth trigger uses the configured threshold, defaulting to five cases.
- Message content carries all five required fields.
- No more than one alert per location per trigger type in any 24 hours.

**Subtasks:**
- Implement the three trigger rules against the E1 and E3 events.
- Implement the per-location, per-type 24-hour cooldown.
- Write the message template with all five fields.
- Test that a second qualifying event inside the window sends nothing.

### US-6.4 — Deliver reliably and prove it
**As** the team, **we need** delivery logged and retried **so that** the demo does not depend on luck.

**Traces:**
- 6.1.10
- 6.1.11

**Acceptance:**
- Every attempt is logged with recipient, trigger, timestamp and outcome.
- A failure retries twice at five-minute intervals before being recorded FAILED.

**Subtasks:**
- Implement the send queue with retry and backoff.
- Persist the `AlertLog` entity.
- Add a manual "send test alert" action for demo rehearsal.

---

# E7 — Operations dashboard *(new)*

### US-7.1 — See the state of the outbreak at a glance
**As** an Operations Manager, **I want** headline numbers on landing **so that** I know within seconds
whether today is worse than last week.

**Traces:**
- 7.1.1
- 7.1.2
- 7.1.3
- 7.1.4
- 7.1.5
- 7.1.6
- 7.1.7
- 7.1.8
- 7.1.9
- 11.2.12

**Acceptance:**
- The dashboard is the manager's landing screen after sign-in.
- All five counts display, each with its seven-day change.
- Values refresh at least every five minutes without a page reload.
- The data timestamp is shown.

**Subtasks:**
- Implement the aggregate queries behind the five tiles.
- Implement the seven-day comparison from score and snapshot history.
- Build the tile component with value, delta and direction.
- Implement the polling or subscription refresh and the timestamp line.
- Test the seven-day delta against a seeded history fixture.

### US-7.2 — Work the ranked priority table
**As** an Operations Manager, **I want** every cluster ranked with its drivers **so that** I can decide
where crews go today.

**Traces:**
- 7.2.1
- 7.2.2
- 7.2.3
- 7.2.4
- 7.2.5
- 7.2.6
- 7.2.7
- 7.2.8
- 7.2.9
- 11.6.4
- 11.6.5
- 11.6.6

**Acceptance:**
- All active clusters list in descending score order with the ten specified columns.
- Sorting works on every column and indicates the sorted column and direction.
- Tier and work-order-status filters apply, including in combination.
- Expanding a row shows the driver breakdown.
- A DEGRADED row is marked and names the excluded driver.

**Subtasks:**
- Build the table component with server-side sort and filter.
- Implement the expandable row rendering the E4 breakdown.
- Implement the DEGRADED marker and its tooltip.
- Link row selection to the Cluster Detail screen.
- Test sort stability and filter combination.

### US-7.3 — Read the trend, not just today
**As** an Operations Manager, **I want** charts of cases, tiers, workload and turnaround **so that** I
can tell whether our response is working.

**Traces:**
- 7.3.1
- 7.3.2
- 7.3.3
- 7.3.4
- 7.3.5

**Acceptance:**
- All five visualisations render from stored history.
- Each shows an explicit insufficient-data state before enough history exists.

**Subtasks:**
- Implement the 30-day aggregation queries.
- Build the case time series, tier distribution, crew workload and turnaround charts.
- Build the reports-per-day chart.
- Implement empty and insufficient-data states.

### US-7.4 — Keep my working context and take the data away
**As** an Operations Manager, **I want** my filters remembered and a CSV export **so that** I can pick
up where I left off and share the list.

**Traces:**
- 7.4.1
- 7.4.2
- 7.4.3

**Acceptance:**
- Filters restore on the next sign-in.
- The export contains exactly the current filtered view — all columns, all rows.

**Subtasks:**
- Persist filter state per user.
- Implement CSV generation from the current query, not from the rendered page.
- Test that a filtered export excludes filtered-out rows.

### US-7.5 — Be told what needs attention
**As** an Operations Manager, **I want** warnings surfaced **so that** stale feeds and overdue jobs do
not go unnoticed.

**Traces:**
- 7.5.1
- 7.5.2
- 7.5.3
- 7.5.4

**Acceptance:**
- Open source-health warnings, overdue work orders and the moderation backlog count all appear.
- Each item links to the screen that resolves it.

**Subtasks:**
- Build the attention panel aggregating the three sources.
- Implement deep links to the moderation queue and work-order views.

---

# E8 — Work-order dispatch and crew execution *(new)*

### US-8.1 — Get a proposed dispatch list each day
**As** an Operations Manager, **I want** the system to propose today's targets **so that** I am not
building the list by hand from the table.

**Traces:**
- 8.1.7
- 8.1.8
- 8.1.9
- 8.1.10
- 11.2.16

**Acceptance:**
- The list contains the highest-scoring active clusters with no open work order, capped at the configured number.
- Each item can be accepted, edited or rejected individually.
- Work orders are created only for accepted items.

**Subtasks:**
- Implement the candidate query excluding clusters with open work orders.
- Build the Dispatch Proposal screen with per-row accept, edit and reject.
- Implement bulk creation from accepted rows.
- Record rejected proposals with the manager id for the audit trail.

### US-8.2 — Create a work order
**As** an Operations Manager, **I want** to raise a job against a cluster or a verified report **so
that** the work is tracked rather than remembered.

**Traces:**
- 8.1.1
- 8.1.2
- 8.1.3
- 8.1.4
- 8.1.5
- 8.1.6
- 8.1.11
- 8.1.12
- 8.1.13
- 11.2.17

**Acceptance:**
- Task type is one of the five and the scheduled date cannot be in the past.
- Priority defaults from the target cluster's tier.
- A duplicate open work order of the same task type is refused and the existing one is offered.
- Verified open reports inside the cluster link automatically.

**Subtasks:**
- Define the `WorkOrder` entity and its relationships to Cluster and Report.
- Build the Work Order Create screen with validation.
- Implement the duplicate-type guard and the "open the existing one" path.
- Implement automatic linking of verified reports.
- Test past-date rejection and duplicate refusal.

### US-8.3 — Assign and reassign crews
**As** an Operations Manager, **I want** to assign a job to a named crew member with their load visible
**so that** work is distributed sensibly.

**Traces:**
- 8.2.1
- 8.2.2
- 8.2.3
- 8.2.4
- 8.2.5
- 8.2.6
- 8.2.7
- 11.2.18

**Acceptance:**
- Assignment picks exactly one active crew member and shows each candidate's open count.
- A deactivated account is refused.
- The assignee is notified within one minute.
- Reassignment notifies both parties and preserves the previous assignee in the audit history.

**Subtasks:**
- Build the assignment control with the open-count column.
- Implement the notification on assignment and reassignment.
- Implement the deactivated-account guard.
- Persist the assignment history.

### US-8.4 — Accept and start a job in the field
**As** a Cleaning Crew Member, **I want** my jobs on my phone in the order I should do them **so that**
I can work from the app rather than a printed list.

**Traces:**
- 8.3.4
- 8.3.5
- 8.3.17
- 8.4.1
- 8.4.2
- 8.4.3
- 8.4.4
- 8.4.5
- 8.4.6
- 8.4.7
- 10.5.5
- 11.2.19
- 11.2.20
- 11.7.7

**Acceptance:**
- A crew member sees only their own work orders, sorted by scheduled date then tier.
- Each item shows locality, task type, date, tier, instructions, the cluster boundary on a map, and linked reports with photographs.
- Today, Upcoming and Completed filters work.
- Accept and In Progress transitions record their timestamps.
- The view is usable at 360 px with touch targets of at least 44 px.

**Subtasks:**
- Build the My Jobs screen with the three filters.
- Build the Job Detail screen with map and linked reports.
- Implement Accept and In Progress transitions with timestamps.
- Implement progress notes.
- Verify the layout and touch targets on a 360 px viewport.

### US-8.5 — Record completion with evidence
**As** a Cleaning Crew Member, **I want** to close a job with a photo and notes **so that** the work is
provable.

**Traces:**
- 8.3.6
- 8.3.7
- 8.3.8
- 8.3.12
- 11.2.21
- 11.5.10
- 11.5.11

**Acceptance:**
- Completion requires a timestamp, a task-performed confirmation, at least one photograph and notes.
- A submission without a photograph is refused with a message saying why.
- An issue flag with a reason can be raised at any point before completion.

**Subtasks:**
- Build the Job Completion screen with camera and file capture.
- Implement server-side validation of the four required elements.
- Implement the issue flag and its surfacing on the dashboard.
- Test refusal of a photograph-less completion.

### US-8.6 — Verify or reject completed work
**As** an Operations Manager, **I want** to check completions **so that** a treatment record only exists
for work that was actually done.

**Traces:**
- 8.3.1
- 8.3.2
- 8.3.3
- 8.3.9
- 8.3.10
- 8.3.11
- 8.3.12
- 8.3.13
- 8.3.15
- 8.3.16
- 8.3.18
- 8.3.19
- 8.3.20
- 11.2.18

**Acceptance:**
- A newly created work order has status Created.
- Only transitions in the work-order state table are permitted; an invalid one is refused and states the reason.
- A rejected completion rests in status Rejected and is visible as such until the crew member resumes work.
- Verified writes a treatment record carrying cluster, task type and completion date.
- Rejection requires a reason, returns the order to In Progress and notifies the crew member.
- Cancellation requires a reason.

**Subtasks:**
- Implement the work-order state table (now in `REQUIREMENTS.md` §8.3) as a guarded transition
  function. **This is the second of the two designated Lab 4 basis-path methods**; the first is the
  scoring method in US-4.2.
- Build the verification view showing the completion evidence.
- Implement treatment-record creation on Verified.
- Implement rejection, cancellation and their notifications.
- Basis-path test the transition function.

### US-8.7 — Catch work that is slipping
**As** an Operations Manager, **I want** overdue jobs flagged **so that** nothing sits unworked.

**Traces:**
- 8.3.14
- 7.5.2

**Acceptance:**
- A work order past its scheduled date and not Completed, Verified or Cancelled is flagged overdue.
- The flag appears in the priority table, the crew view and the attention panel.

**Subtasks:**
- Implement the overdue evaluation on a daily job.
- Surface the flag in all three views.

### US-8.8 — Close the loop end to end
**As** the team, **we need** report → priority → dispatch → treatment → recalculated priority to run in
one continuous chain **so that** the demo can show the whole system in ninety seconds.

**Traces:**
- 8.5.1
- 8.5.2
- 8.5.3
- 8.5.4
- 5.2.6
- 5.2.7
- 4.1.17

**Acceptance:**
- Verifying a work order closes every linked report and notifies each reporter.
- Verification triggers a scoring cycle.
- The Cluster Detail screen shows the score before and after the treatment.

**Subtasks:**
- Implement the cascade from verification to report closure and notification.
- Trigger the scoring cycle on verification.
- Build the before/after score display in the Cluster Detail screen.
- Write and rehearse the end-to-end demo script against this chain.

---

# E9 — Map, trend and history

### US-9.1 — See clusters, reports and jobs on one map
**As** any user, **I want** a map with layers **so that** the situation is spatial, not tabular.

**Traces:**
- 9.1.1
- 9.1.2
- 9.1.3
- 9.1.4
- 9.1.5
- 9.1.6
- 9.1.11
- 11.2.5

**Acceptance:**
- Cluster polygons render coloured by tier, with a second visual cue besides colour.
- Report and work-order markers render by status, filtered by the viewer's role.
- A resident sees their own saved locations.
- Each layer toggles independently.

**Subtasks:**
- Integrate the map library with the OneMap base layer.
- Render cluster polygons with the tier style and a pattern or label.
- Render report, work-order and saved-location layers with role filtering.
- Build the layer toggle control.

### US-9.2 — Open a cluster and see everything about it
**As** an Operations Manager, **I want** one panel per cluster **so that** I do not have to assemble the
picture from four screens.

**Traces:**
- 9.1.7
- 9.1.8
- 8.5.4
- 11.2.13
- 11.6.8
- 11.6.9

**Acceptance:**
- Selecting a cluster on the map or in the table opens the same detail view.
- The panel shows score, driver breakdown, open reports, work orders and the before/after treatment score.
- Map and table selection stay in sync.

**Subtasks:**
- Build the Cluster Detail screen composing the E4, E5 and E8 views.
- Wire selection from both the map and the priority table.

### US-9.3 — Show that the data really moves
**As** an Operations Manager, **I want** a 30-day case series and a trajectory label **so that** I can
see direction, not just level.

**Traces:**
- 9.1.9
- 9.1.10

**Acceptance:**
- The series renders from stored snapshots.
- Trajectory is one of Growing, Stable or Receding, computed from the last 14 days by the documented rule.

**Subtasks:**
- Implement the per-cluster time-series query.
- Implement and document the trajectory rule.
- Build the sparkline and the trajectory tag.
- Unit-test the rule at its two boundaries.

---

# E10 — Front end, navigation and interaction

*Cross-cutting. The screens live in their feature epics; this epic owns the shell they sit in, the
patterns they share, and the two graded artefacts that describe them — the Lab 1 UI mockups and the
Lab 2/3 dialog map.*

### US-10.1 — Mock up every screen before building it
**As** the team, **we need** a mockup of each screen with HCI principles applied **so that** Lab 1 has
its deliverable and we design the interface before we code it.

**Traces:**
- 11.2.1 through 11.2.24 (the screen inventory)
- 10.5.1
- 11.7.8

**Acceptance:**
- Every screen in §11.2 has a mockup.
- Each mockup is annotated with the HCI principle it applies and the requirement numbers it satisfies.
- The mockups use the terms in the data dictionary, not invented synonyms.

**Subtasks:**
- Assign screens across team members so each person owns a coherent flow.
- Produce mockups for the resident flow, the manager flow and the crew flow.
- Annotate each with HCI principles and requirement numbers.
- Review as a team against §11.2 for missing screens.
- Commit to `lab1/mockups/` with an author per file.

### US-10.2 — Build the shared component library
**As** a developer, **I want** one set of components for tables, forms, states and tiles **so that**
the interface is consistent and the boundary layer is not rewritten per screen.

**Traces:**
- 11.4.1
- 11.4.2
- 11.4.3
- 11.4.4
- 11.4.5
- 11.4.6
- 11.5.1
- 11.5.2
- 11.5.3
- 11.5.7
- 10.6.1

**Acceptance:**
- Components exist for table, form field, empty state, error state, loading state, confirmation dialog, toast and stat tile.
- Each component covers its loading, empty and error variants.
- Field validation and character counting are handled by the field component, not per screen.

**Subtasks:**
- Define the type scale, spacing scale and colour tokens including the tier colours.
- Build the form-field component with inline validation and character count.
- Build the table component with sorting, filtering and pagination.
- Build the empty, loading and error state components with a retry control.
- Build the confirmation dialog and the toast.
- Document each component with an example.

### US-10.3 — Navigate by role without dead ends
**As** any signed-in user, **I want** navigation that shows only what I can use **so that** I never
land on a screen I am not allowed to open.

**Traces:**
- 11.1.1
- 11.1.2
- 11.1.3
- 11.1.4
- 11.1.5
- 11.1.6
- 11.1.7
- 11.1.8
- 11.1.9
- 11.1.10
- 10.5.1
- 10.5.6

**Acceptance:**
- Each of the three roles sees its own navigation set and nothing more.
- The current screen is indicated in the navigation.
- The header shows the signed-in user's name and role, and a sign-out control appears on every authenticated screen.
- An unauthenticated visitor reaches only the four public screens.
- A manager reaches work-order creation from the dashboard in no more than three interactions.

**Subtasks:**
- Build the application shell with a role-driven navigation configuration.
- Implement the route guard that redirects an unauthorised request to Not Authorised.
- Implement post-sign-in return to the originally requested screen.
- Test each role's navigation set and the three-interaction path.

### US-10.4 — Draw and enforce the dialog map
**As** the team, **we need** the dialog map drawn and implemented **so that** navigation is designed
rather than accumulated, and Lab 2 and Lab 3 have their artefact.

**Traces:**
- 11.3.1
- 11.3.2
- 11.3.3
- 11.3.4
- 11.3.5
- 11.3.6
- 11.3.7
- 11.3.8

**Acceptance:**
- The dialog map covers every screen in §11.2 and every transition between them.
- The implemented routes match the map, with no undrawn transition reachable.
- Each screen has a distinct URL and a return path except Sign In.
- A form with unsaved changes warns before navigation, and a dismissed modal preserves input.

**Subtasks:**
- Draw the dialog map as a UML state diagram, screens as states and user events as transitions.
- Define the URL for each screen.
- Implement the router to match the map.
- Implement the unsaved-changes guard and the modal input preservation.
- Review the implemented routes against the map before Lab 3.

### US-10.5 — Never show a blank or silent screen
**As** any user, **I want** the interface to tell me what is happening **so that** I can tell waiting
apart from broken.

**Traces:**
- 11.4.1
- 11.4.2
- 11.4.7
- 11.4.8
- 11.5.4
- 11.5.5
- 11.5.6
- 11.5.8
- 11.5.9
- 10.5.2
- 10.5.3
- 10.5.7

**Acceptance:**
- Any screen whose data has not arrived within one second shows a loading indicator, never a blank area.
- A failed load shows cause, remedy and a retry control.
- A stale source shows a banner naming the source and its last successful retrieval time.
- A submission disables its control, shows progress, retains input on failure and confirms within one second on success.
- Every delete or cancel asks for confirmation naming the object.

**Subtasks:**
- Apply the state components from US-10.2 to every screen.
- Implement the staleness banner binding to `SourceHealth`.
- Implement the offline-request message.
- Implement submission progress, input retention and the success toast.
- Walk every screen and confirm all four states render.

### US-10.6 — Present data consistently
**As** an Operations Manager, **I want** numbers, times and tiers presented the same way everywhere
**so that** I can read a screen without decoding it.

**Traces:**
- 11.6.1
- 11.6.2
- 11.6.3
- 11.6.4
- 11.6.5
- 11.6.6
- 11.6.7
- 11.6.10
- 11.6.11

**Acceptance:**
- Priority tier appears as a text label as well as a colour.
- Timestamps use DD MMM YYYY HH:mm in Singapore time with the zone stated.
- Numeric columns align on the decimal point and units are shown on every quantity.
- Tables over 50 rows paginate and show the total row count.
- An unavailable value reads "No data", not zero.

**Subtasks:**
- Write formatting helpers for date, number and unit rendering.
- Apply the tier label-plus-colour treatment across table, map and detail views.
- Implement pagination and the row-count line in the table component.
- Implement the "No data" rendering rule.

### US-10.7 — Make it usable by keyboard, on a phone, and in bright sun
**As** a Cleaning Crew Member working outdoors, **I want** large targets and high contrast **so that**
I can use the app one-handed in the field.

**Traces:**
- 11.7.1
- 11.7.2
- 11.7.3
- 11.7.4
- 11.7.5
- 11.7.6
- 11.7.7
- 11.7.9
- 11.7.10
- 10.5.5
- 10.7.2

**Acceptance:**
- Every interactive control is reachable and operable by keyboard with a visible focus indicator.
- Text meets a 4.5:1 contrast ratio and no information is carried by colour alone.
- Icon-only controls carry text labels.
- Crew touch targets are at least 44 by 44 pixels.
- Non-essential animation is suppressed under reduced-motion.
- Each screen has a distinct page title.

**Subtasks:**
- Audit every screen by keyboard and fix the focus order.
- Check contrast for text, tier colours and chart series.
- Add labels to icon-only controls and set page titles.
- Enlarge crew touch targets and re-verify at 360 px.
- Add the reduced-motion media query.

### US-10.8 — Compile the data dictionary
**As** the team, **we need** a real data dictionary **so that** Lab 1 has its fourth deliverable and
every requirement means the same thing to every member.

*Added in v0.3. Lab 1 §3.2.4 requires a data dictionary "defining key terms, attributes, and
relationships" as a deliverable in its own right. The definitions table in `REQUIREMENTS.md` defines
terms only, and does not satisfy it.*

**Traces:**
- Lab 1 §3.2.4 deliverable; supports every requirement that uses a defined term.

**Acceptance:**
- Every entity has its attributes, types, permitted values and relationships recorded.
- Every noun used in two or more requirements appears in the dictionary.
- Each enumerated set in the requirements — report status, work-order status, exposure status, task type, report type, role — appears with its permitted values.

**Subtasks:**
- Extract every entity and attribute from `REQUIREMENTS.md` sections 1 to 9.
- Record types, units, permitted values, optionality and relationships.
- Cross-check against the entity class diagram so the two cannot drift.
- Commit to `lab1/data-dictionary.md` with an author.

---

# Build order

Seven working weeks across Labs 3–4, assuming Lab 1 and Lab 2 produce the models and mockups rather
than code.

**Read the capacity check below before believing this table.** The previous version scheduled every
story and simultaneously claimed the two-week cost of E7 and E8 would come "from E9 and from anything
optional in E7" — while still scheduling all of E9 and all of E7. That contradiction is resolved here
by actually removing the work.

| Week | Stories | State at the end of the week |
|---|---|---|
| Labs 1–2 | US-10.1, US-10.8, US-10.4 (draw only) | Mockups, data dictionary and dialog map exist as graded artefacts before any screen is coded. |
| 1 | US-0.1 to US-0.3, US-1.1, US-2.1, US-2.2, US-3.4 (register and test-pull OneMap) | Nothing demonstrable. Correct — cluster history starts accumulating on day one, which is what makes US-9.3 nearly free later. |
| 2 | US-1.2, US-1.3, US-10.2, US-10.3 | Live data lands and the component library exists on a framework that is now stable. |
| 3 | US-3.1 to US-3.3, US-2.4, US-4.1 to US-4.3 | A resident can save a location and see exposure; scores exist with a visible breakdown. |
| 4 | US-5.1 to US-5.4, US-4.4, US-4.5, US-10.4 (implement) | The multi-user loop into the score is closed. **This is the halfway proof point: ingest, compute, be changed by users.** |
| 5 | US-7.1, US-7.2, US-8.1 to US-8.3 | The manager can see the ranking and dispatch against it. |
| 6 | US-8.4 to US-8.6, US-8.8, US-8.7 | The full loop runs end to end. |
| 7 | US-6.1 to US-6.4, US-9.1, US-9.2, US-1.6, US-10.5 | The phone buzzes, the map works, the system survives a feed outage. Stop here. |

**Cut from the schedule in v0.3** to pay for E7 and E8, as the cost note said should happen and the
previous table did not do: US-7.3 (analytics charts) reduced from five charts to two, and moved out of
the build weeks; US-9.3 (trend and trajectory); US-7.5 (attention panel); US-10.6 and US-10.7 reduced
to component-level defaults rather than a per-screen audit.

Deferred unless genuinely ahead: US-7.4, US-2.3 (seed the two staff accounts by hand until then),
US-2.5, US-0.5, US-9.3, US-7.5.

## Capacity check

Sum the epic estimates — E0 M, E1 L, E2 M, E3 M, E4 L, E5 L, E6 M, E7 L, E8 L, E9 M, E10 L — and the
plan runs to roughly 65–90 person-days. A team of five with four other modules each realistically
contributes one to two focused days a week, which over seven weeks is 35–70 person-days. **The plan
sits at or above the ceiling of realistic capacity**, before a new stack, integration or debugging
live third-party APIs. Treat the table as an ordering, not a promise, and expect to land somewhere in
the descope list below.

## If you are behind, cut in this order

The single most common failure is discovering in week 6 that you are two weeks behind and cutting
whatever is nearest. Cut in this order instead, top first:

1. US-9.3 — trend and trajectory.
2. US-7.3 — analytics charts, all of them.
3. US-7.5 — attention panel.
4. US-10.7 — accessibility beyond component defaults.
5. US-10.6 — presentation conventions beyond what the components already do.
6. Photograph handling in US-5.1 and US-5.4 — accept reports without photographs and drop the
   status-dependent photo projection.
7. US-9.1 — reduce the map to cluster polygons only, no layer toggles.

**Never cut, in any circumstance:** US-1.1, US-1.3 (live data), US-4.1 to US-4.3 (the processing the
whole concept rests on), US-5.1 to US-5.4 (the multi-user loop), US-8.8 (the demo). Those five lines
are the three stated grading criteria. Everything else is negotiable.

---

# What the new feature costs and buys

**Cost.** E7 and E8 together are about two weeks more than the single "planner work queue" they
replace. That has to come from somewhere, and the honest answer is from E9 and from anything optional
in E7.

**Buys.** Three things the earlier plan did not have:

1. **A third actor, and the loop it closes.** Without a crew role, nothing writes the treatment record
   that requirement 4.1.15 reads, so the priority score can never fall and the ranking repeats itself
   forever. The crew exists because the model needs it; that it also makes the use case model richer
   for Labs 1 to 3 is a consequence, not the reason. The actor-authority question in open point 1 was
   resolved on 2026-09-02 in favour of a declared composite actor.
2. **A state machine worth diagramming.** The eight-state work order in 8.3 is a real state machine
   diagram, which is one of the eight listed individual work-product types in `grading.md`. The report
   lifecycle in 5.2 is a second one.
3. **A demo that closes.** US-8.8 is ninety seconds that shows every stated grading criterion at once:
   live data updating, a computed priority, two users changing shared state, and the score moving
   because of it.

**What this does not change.** The two standing calls hold. Do not build the fogging scraper properly
— seed the treatment table by hand and let 8.3.12 populate it going forward. Do not build the
temperature breeding model at all; say it in the extensibility segment. And protect E4: the failure
mode is spending week 3 on the map and arriving at week 6 with three `if` statements where the scoring
engine should be.

---

# Open points needing a team decision

1. **Who actually receives the dispatch (8.1.3, actors A2 and A3).** **RESOLVED 2026-09-02.** In
   Singapore, fogging and larviciding are NEA vector-control functions; refuse and drain clearance sit
   with town councils. The team decided to keep **one Operations Manager and one Cleaning Crew**, and
   to take the second of the two options that were offered: A2 is a **deliberate composite actor**,
   stated out loud rather than left for a grader to find. It is recorded as a declared simplification
   in the entity class diagram note, in `lab2/ANALYSIS-MODEL.md` §1, and belongs in the extensibility
   segment of the Lab 5 demo. Requirement 8.1.3 keeps all five task types unchanged.
2. **NEA update frequency.** *Unverified and load-bearing.* Nobody has established how often the dengue
   cluster feed actually changes. If it is daily or weekly, the hourly poll in 1.1.1 fetches identical
   data almost every cycle and the cluster ranking may not visibly move during the demo. Check in week 1.
   Requirement 1.1.18 (manual ingestion trigger) is the mitigation, not the fix.
3. **Driver weights (4.1.5).** **PROPOSED 2026-09-03**, on Yen Kit's instruction — `SCORING-SPEC.md`
   §3 and `config/scoring.default.json`, with a per-driver justification written to be said out loud
   in the demo. Still needs one round of team review; they are a proposal, not a measurement.
4. **Normalisation method per driver (4.1.4).** **RESOLVED 2026-09-03** — a method per driver is
   documented in `SCORING-SPEC.md` §2 and implemented as a Strategy per driver, bound by
   `NormalisationFactory`. The comparability trap flagged here was real and applies to log as much as
   to min-max: both log drivers now normalise against a **fixed reference ceiling** (300 cases, 40
   new cases), not against the observed maximum, so a score means the same thing tomorrow as today.
   Test case F6 in `tests/cluster-feed.test.ts` locks that in.
5. **Crew teams versus individuals (8.2.1).** Currently one assignee per work order. Teams would be
   more realistic and more work.
6. **Notification channel for staff (8.2.4).** Telegram is already built for residents; reusing it for
   crew is nearly free. Confirm.
7. **Screen count (§11.2).** Twenty-four screens is a lot to mock up for Lab 1. Cut Staff Accounts
   (11.2.22, seed accounts by hand) and Data Sources (11.2.23, fold into the dashboard) if the mockup
   work runs long — but both are cheap, and screen count is visible work.
8. **Every figure in `REQUIREMENTS.md` §13 Assumptions.** The 150 m buffer, the 50 m / 24 h duplicate
   window, the five-case alert threshold, the 90-day treatment default and the 70/40 tier cut points
   are all judgement, not evidence. They are now collected in one table rather than scattered through
   the requirements as unmarked "shall" statements. Someone must be able to defend each in Q&A.
9. **Whether to commit at all.** These documents specify a concept the team has not agreed to. Do not
   let their completeness become the argument — the concept decision should be made on the evidence
   pack, not on how much specification already exists.
