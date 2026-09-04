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

*Database half delivered 2026-09-04, commits `ec0f5cf`, `02cc7da`, `626e811` and `7b7d64e` on `dev` —
"Wire the Postgres repositories in, and prove a restart keeps its memory". The subtask "set up the
database project and migration tooling" is now real: the build has persistent storage on **Supabase
Postgres**, and a process restart keeps what the previous process learned. `src/persistence/Database.ts`
was a stub and is now a `pg` Pool (`max: 10`) over TLS with `rejectUnauthorized: true` and an explicit
`ca` read from `src/certs/prod-ca-2021.crt` — the Supabase Root 2021 CA is **committed deliberately**,
because it is a public certificate and not a key, and because the pooler presents a chain rooted in a
private self-signed CA that Node does not trust by default. (`https://supabase.com/downloads/prod-ca-2021.crt`
is a dead 404; the certificate has to come out of the Supabase dashboard.) `transaction()` binds the
work to a `ScopedDatabase` wrapping one checked-out client, so a transaction cannot leak onto a
different connection halfway through. `src/persistence/migrations/001_initial_schema.sql` is the whole
schema, 26 tables (27 live, counting PostGIS's `spatial_ref_sys`), on three conventions: **text with
CHECK constraints rather than ENUM**, so adding a status is a migration and not a type rewrite;
**`geography` rather than `geometry`**, so a distance is metres and not degrees; and `timestamptz`
throughout. `src/tools/migrate.ts` is checksummed and transactional and **refuses to re-run a migration
whose file has been edited**; `src/tools/schema-verify.ts` exercises the schema's guarantees rather
than inspecting them; `src/tools/supabase-check.ts` diagnoses a connection without ever printing a
secret, and its `unusableBecause()` names the reserved characters in a password.
`ClusterRepository.ts` (a full `ClusterStore` plus `PostgresClusterLocator`), `RainfallRepository.ts`,
`IngestionRunRepository.ts` and `PriorityScoreRepository.ts` are the four stores now on Postgres.
`src/server.ts` chooses Postgres or in-memory purely on `DATABASE_URL` and binds **exactly one**
`ClusterLocator`; `src/tools/ingest-once.ts` is database-aware the same way, prints what the store
holds rather than what the run wrote, and closes the pool on exit — it previously printed its table and
then hung. `InMemoryClusterLocator` was widened from the concrete `InMemoryClusterStore` to the
`ClusterStore` port, which is the single change that makes the two locators swappable at all.

**Decisions worth reading before touching this.** Cluster containment uses **`ST_Covers`, not
`ST_Contains`**, so a point exactly on a boundary counts as inside (3.1.8, 5.1.7) — the resident who
lives on the edge of a cluster is the one the alert is for. Exactly **one** `ClusterLocator` is bound
per process; binding both would be the second answer that the warning on `Polygon.contains` exists to
forbid. `audit_record` has **no foreign key at all**, plus a `BEFORE UPDATE OR DELETE` trigger raising
`'audit records cannot be % (2.4.2)'` — a deleted account must not be able to erase its own trail, and
a cascade from `account` would let it. `report.reporter_id` is `ON DELETE SET NULL` (10.4.3), which is
the same dissociate-don't-delete rule US-0.4 settled, now enforced by the schema.  `corroboration`
carries `UNIQUE (report_id, account_id)` (5.1.13) in the database and not only in the controller.
`rainfall_reading`'s primary key is `(station_id, reading_at)` with `ON CONFLICT DO NOTHING`, and
`saveReadings` returns the rows **actually written**, so a backfill re-run reports 0 new instead of
thousands — a double-counted reading changes a cluster's rank, not merely a row count.
`PriorityScoreRepository.latest()` is scoped to a single `computed_at`, because "newest row per
cluster" would rank across two cycles, which ranks nothing. Postgres `numeric` is parsed through
`Number()` deliberately: `pg` hands it back as a string, and left implicit a 72-hour rainfall
accumulation would concatenate rather than add.

**Only four stores are persistent, and the boot log says so.** Accounts, sessions, reports, work
orders, saved locations, alerts, forecasts and audit are still in-memory in both modes. This is
printed openly at start-up rather than hidden, because a half-migrated system that looked fully
persistent would be a worse claim than an honestly mixed one.

Verified live, not asserted. `schema-verify` confirmed seven guarantees against the real database:
at least four GIST spatial indexes, at least four `geography` columns, an audit UPDATE refused, an
audit DELETE refused, the 5.1.13 unique constraint, `report.reporter_id` at ON DELETE SET NULL, and
audit holding zero foreign keys. Restart persistence was proved with **two separate processes**
against the live database and real NEA data: run 1 returned `SUCCESS, 15 features`; run 2, a fresh
process, returned `UNCHANGED, 0 features` — the 1.1.20 publisher stamp survived the restart — then
read all 15 clusters back out of Postgres and produced an identical ranking, with both runs appearing
in one accumulated history. That is **10.2.3**. **468 tests passing across 22 files**, `npx tsc
--noEmit` strict-clean.

**Two configuration traps.** A password containing `#` must be percent-encoded as `%23` inside
`DATABASE_URL`, since `#` starts a URL fragment; this changes only the spelling in the URL, and the
driver sends the original password unchanged. And the connection must use the Supabase **session
pooler** (IPv4, port 5432) — the direct connection is IPv6-only and the transaction pooler is on 6543.
`DATABASE_URL` lives in `src/.env`, which is gitignored; only `src/.env.example` is committed.*

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

*Partly delivered 2026-09-04, commit `e33a685`, merged to `dev` with `--no-ff`. **This story is not
done** — three of its nine requirements had no implementation at all and now do, but two of the
acceptance clauses still depend on infrastructure that does not exist yet.

**Done in this pass.** 10.4.3, deletion within seven days: `src/control/PrivacyController.ts` is new,
with `requestDeletion`, `purge`, `overdueRequests`, and an exported `PERSONAL_DATA_INVENTORY` and
`DELETION_DEADLINE_DAYS = 7`. Seven days is a **deadline, not a delay** — a request purges
immediately. The hard half of this requirement is not deleting; it is deciding what counts as the
person's own. A resident's reports are not theirs alone: a verified report is evidence a cleaning crew
was sent somewhere, it sits in the 4.1.3 driver, and 8.1.13 may link it to a work order. Deleting
them would rewrite an operational history other people acted on, and keeping them whole would ignore
the request — so reports are **dissociated, not deleted**: `reporterId` is severed and the report
survives with its content intact. Saved locations, alert subscriptions, the email address and the
Telegram chat link are destroyed outright. The email becomes a tombstone `deleted-<id>@invalid` rather
than an empty string, because `findByEmail('')` would otherwise match every deleted account and
2.1.4's duplicate check reads that index; the provider credential is disabled through an
`IdentityProvider` port. Consequences carried through: `src/entity/Report.ts` has `reporterId` as
`Uuid | null` with the reason recorded on the field; `ReportLifecycleController` makes a status change
on an ownerless report notify nobody, since 5.2.8's obligation cannot outlive the person it was owed
to; and `ReportController.statusHistory` passes `ownerId: report?.reporterId ?? undefined`, so an
ownership-scoped read of a dissociated report is refused rather than becoming readable by whoever
asks. 10.4.4, attribution: `src/config/Attribution.ts` is a new registry of four sources, each with
text, URL, licence, a `requiresCredential` flag and the list of screen ids it must appear on, so the
obligation travels with the source rather than with whoever remembers to build a footer.
`src/boundary/http/PrivacyRoutes.ts` is new — `GET /api/attribution`, deliberately
**unauthenticated**, because a licence obligation that only appears after sign-in is not discharged,
and `POST /api/account/delete`. 10.3.2, the half that is code: `ExpressApp` gains an HTTPS redirect
honouring `x-forwarded-proto` (TLS is usually terminated upstream, so `req.secure` alone reports false
for every request in that arrangement), `Strict-Transport-Security` for a year, plus
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. It is
**off by default** and switched on by `DFENCE_REQUIRE_HTTPS=true` — localhost has no certificate, and
a security control that is on in development is one somebody turns off to get work done and then
forgets. The flag is explicit rather than inferred from `NODE_ENV`, because a control that switches
itself on by guessing the environment can guess wrong. `src/server.ts` mounts the routes and reads the
flag. `tests/privacy.test.ts` is new, 16 cases (P1-P16), documented as TEST-PLAN §2.22.

**10.4.5 is not satisfied, and this is recorded rather than argued away.** The requirement says data
comes only from public sources needing no third-party authentication; OneMap needs a registered
account and an expiring token. It is a Singapore government service publishing open data, so it would
be easy to call it compliant — and that would be reading the requirement to suit us.
`Attribution.credentialedSources()` returns the exception, so it is testable, appears in the API
response, and belongs in the demo notes.

**Still gated, not forgotten.** 10.3.5's signed, non-enumerable photograph URLs need **Supabase
Storage, which does not exist yet** — `SupabaseStorageGateway.signedUrl` remains a stub and the bucket
policy is the real guarantee. 10.3.2's actual TLS needs **a deployment**; what exists is the redirect,
HSTS and the header policy, which is the half we control.

Verified live over HTTP, not only in tests: `GET /api/attribution?screenId=MapView` returned the two
sources the map draws from and no OneMap credit; `GET /api/attribution` reported all four with
`credentialedSources: ["Geocoding"]`; and a full register -> verify -> sign-in ->
`POST /api/account/delete` run erased the account, after which the sign-in was refused. **Tests: 468
passing across 22 files** (was 452 across 21), `npx tsc --noEmit` strict-clean.*

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

*Measured 2026-09-04, commit `0d5b2bc`. The two obligations that were blocked on the client existing
are now measured: **10.1.1** — the dashboard mounts with its figures in 12.3 ms and the served bundle
is 215 KB, transferring in 0.18 s at the stated 10 Mbit/s; **10.1.4** — 300 clusters mount and become
readable in 78.5 ms. Both are asserted against a third of their budget, because jsdom performs no
layout and paints nothing; the remainder belongs to a real device and is recorded as still needing
one.*

***10.1.5 was measured and does not hold.*** *Fifty real sessions, ten reads each, against the running
server and the live database: **p95 2125 ms against 10.1.2's 1000 ms budget**, with no failed
requests. It localises to `/api/ops/dashboard` — 1475 ms median under load against 179 ms at a single
user, so it is contention rather than a slow endpoint. The cause is in `DashboardController`:
`buildOverview` and `buildAttentionPanel` each compute `reportSourceHealth()` and query
`findAllOpen()`, so one response does both twice across roughly fifteen serial round trips. The fix
is contained and is **batched for Yen Kit** rather than made silently, because it changes a control
class's behaviour. **This story stays open on that one number.***

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

*Superseded 2026-09-04, commit `5d92138`: the **Data Sources screen is built** — the mockup gate was
lifted by Yen Kit ("just proceed without the design"). Applying the staleness banner to every
affected view remains outstanding, and is now US-10.5 work rather than a blocked item.*

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

*10.2.3 delivered 2026-09-04, commit `7b7d64e` (see US-0.2 for the whole change). **This story is not
done** — retry, last-good-snapshot serving and the manual trigger are covered elsewhere, but resuming
after a restart previously could not be true at all, because a restarted process began with an empty
memory and re-ingested everything as new. With clusters, rainfall, ingestion runs and priority scores
on Postgres, two separate processes were run against the live database and real NEA data: the first
returned `SUCCESS, 15 features`, the second `UNCHANGED, 0 features` — the 1.1.20 publisher stamp
survived — and both runs appear in one accumulated history rather than two fresh ones.*

*1.1.18 delivered 2026-09-04, commit `cb9076c`. The 2026-09-04 audit found the manual trigger was
**not** in fact "covered elsewhere" as the note above claimed: there was no endpoint and the Data
Sources screen had no controls at all. `IngestionController` is now implemented (it was a Lab-3
skeleton), `POST /api/ops/sources/refresh` authorises as manager-only, runs the same
`AbstractIngestionJob.run` path the scheduler runs with the MANUAL trigger, rescores through the
same `scoreAndAlert` the scheduled cycle uses, and refuses a concurrent run with 409. The screen has
the button. Proven by five controller tests, two screen tests, an API UAT check and a browser UAT
check that clicks the button against the live NEA and rainfall feeds.

**The story is still not closed, and the audit that found the trigger missing found two more gaps in
the same note.** Checking the other clauses rather than trusting the earlier claim that they were
"covered elsewhere":

- **1.1.11 — three retries "at five-minute intervals".** Three attempts exist in `HttpClient`, but
  the spacing is exponential backoff from 500 ms, not five minutes. The deviation is defensible — a
  request thread held for fifteen minutes is worse than a failed cycle that the five-minute rainfall
  schedule will retry anyway — but it is a deviation, and either the code or the requirement should
  be changed deliberately rather than left to differ quietly.
- **1.1.12 — raise an ingestion-failure event when all retries fail.** No event is raised.
  `DomainEventPublisher` is still a `not implemented` skeleton. The failure *is* recorded as a FAILED
  `IngestionRun` and surfaces on the health panel (1.4.3) and the attention panel (7.5.3), which is
  what the requirement is for; but "raise an event" is not what happens, and §1.1.12 traces to a
  class that throws.
- 1.1.13, 10.2.1–10.2.4 and 1.1.18 are met and evidenced.*

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

*Update 2026-09-04, commit `7b7d64e`: the database-level deny now exists. `audit_record` in
`001_initial_schema.sql` carries a `BEFORE UPDATE OR DELETE` trigger raising
`'audit records cannot be % (2.4.2)'`, and **no foreign key at all**, so a deleted account cannot
cascade its own trail away. Both refusals are checked live by `schema-verify`. The audit **store**
is still in-memory — the schema guarantee is real, the repository that writes into it is not yet
written.*

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

*Delivered 2026-09-04, commit `dcbdf5b`, merged to `dev` with `--no-ff`. Unblocked once the bot token
and chat id were supplied in `src/.env`. What was missing was narrower than the story reads:
`NotificationController` could already issue a link code and already claim one, and
`POST /api/alerts/link/claim` existed — but that route's only legitimate caller is the bot, and **the
bot was not listening.** Nothing read the messages residents send it, so a code could be shown on a
screen, typed into Telegram, and vanish. Same shape of gap as US-1.4's dead `heavyRainExpected`, found
the same way: by asking what **writes** a value rather than what reads it. The bot-side link handler
is now built and **verified live against the real bot, @DFenceBot, in both directions** — `getMe`
confirmed the bot, `getUpdates` read a real pending message, a real 6.1.8-composed alert was delivered
to a real phone, and the running server's poller consumed the pending message and answered it.
`src/boundary/gateways/TelegramGateway.ts` gains `getUpdates(offset, timeoutSeconds)` (long-polling,
never throws, per 10.2.1); `src/control/TelegramLinkController.ts` is new and accepts either a bare
six-digit code or Telegram's `/start <code>` deep link, replying with cause **and** remedy on refusal
(10.5.3) and with instructions for anything that is not a code — silence is the failure mode of a
linking flow, since a person cannot tell whether they mistyped or the system is broken, so they retry
the same thing. The offset advances past **every** update including ones it cannot handle, or one
sticker sent to the bot stalls the poller permanently with no error anywhere; `start()` is idempotent
and the timer is `unref`'d. `NotificationController.chatIdFor(accountId)` is new so a screen can say
"linked" rather than offer a code to somebody who already has one. `src/tools/telegram-live.ts` is a
new live tool; `tests/telegram-link.test.ts` is new, 10 cases (L1-L10), documented as TEST-PLAN §2.20.
This is a **poller, not a webhook**: a webhook needs a public URL and the project has no hosting
target yet, and the two are mutually exclusive at Telegram's end. **Still outstanding:** trace 11.2.11,
the Alert Settings screen carrying the code and instructions, is E10 work and remains gated on mockups
B3-B12 like every other screen. And the one path no test can close — a resident typing a freshly
issued code into the chat — needs a human at the other end, which is exactly the point of a single-use
code; that end-to-end run is Yen Kit's to close, with the server running.*

*Superseded in part 2026-09-04, commit `790ae61`: trace 11.2.11, the **Alert Settings screen, is
built** — the mockup gate was lifted. The harness confirms the link code is issued over HTTP. What is
still Yen Kit's to close is unchanged: a resident typing a freshly issued code into the chat.*

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

*Delivered 2026-09-03, commit `e7d9ff1`, merged to `dev` with `--no-ff`. Four of the five
visualisations did not exist. Only 7.3.2's tier distribution was computed — the one chart a dashboard
can answer from today's scores with no history at all — so "analytics" was in effect a pie chart of
this afternoon. The substance of the story is its **second** acceptance criterion: every chart result
carries `sufficient` and, when false, an `insufficientReason` sentence. The failure mode of a chart is
not a wrong number, it is a *plausible* one — a 30-day case series drawn from four hours of snapshots
is a flat line, and a flat line asserts "cases are steady", which the data does not support. Four
decisions inside it. **7.3.1** sums each cluster's *last* snapshot per day (the feed publishes current
values, so the last reading of a day is that day's answer; averaging would invent a number never
observed), includes clusters that have **since closed** (otherwise a cluster that ended last week
retroactively subtracts itself from every day it was part of), and **omits** a day with no snapshots
rather than drawing a zero — a missed ingestion cycle is not a day on which dengue stopped. **7.3.3**
counts open work orders per assignee with an unassigned bucket; unwired work orders report
*insufficient* rather than rendering an empty chart, the same argument as `DashboardOverview`
returning `null` rather than `0`. **7.3.4** returns the median with `fastestHours` and `slowestHours`
beside it, so a median of 5 hours over a 3-to-400 spread cannot be read as consistency — median
rather than mean is the requirement's own choice, since one job left open over a public holiday drags
a mean far more than a median. **7.3.5** treats a day with no reports as a **real zero**, unlike
7.3.1: nobody filing a report on a Tuesday is a fact about the world, no snapshot being taken is a
fact about the scheduler; it counts every report whatever its moderation outcome, because filtering to
verified ones would turn a demand curve into a moderation curve. Exported constants:
`ANALYTICS_WINDOW_DAYS = 30`, `MINIMUM_DAYS_FOR_A_TREND = 7` (7.1.7 already uses seven days as the
shortest interval the system will compare over), `MINIMUM_SAMPLES_FOR_A_MEDIAN = 5`. **Two entity
fields had to exist first:** 7.3.4 measures creation to verified completion and neither end was
recorded — `WorkOrder.startedAt` is 8.3.17's *work* start, a third instant and neither end of this.
`WorkOrder.createdAt` is stamped by `DispatchController.createWorkOrder`; `WorkOrder.verifiedAt` is
stamped inside `WorkOrderLifecycleController.transition` rather than in `verify()`, so any future path
into Verified records it. Deriving the pair from the audit trail was rejected — the trail is evidence,
not a reporting table. New: `src/control/AnalyticsController.ts` (exports `Chart<T>`, `DailyPoint`,
`CrewLoad`, `TurnaroundSummary`, and `buildAll(by, now)`, which authorises once per 2.3.4 and returns
all five) and `tests/analytics.test.ts` (21 cases, C1-C21). Changed: `src/entity/WorkOrder.ts`;
`src/ports/Stores.ts` (new `ClusterStore.allSnapshotsSince`, `ReportStore.submittedSince`,
`WorkOrderStore.findVerifiedSince`) and the three in-memory store files; `DispatchController` and
`WorkOrderLifecycleController`; `src/boundary/http/DashboardRoutes.ts` (new `GET /api/ops/analytics`,
optional 3rd constructor param); `src/server.ts`; `lab4/TEST-PLAN.md` (§2.19 plus a §1 summary row).
**435 tests passing across 19 files** (was 414 across 18), `npx tsc --noEmit` strict-clean. Verified
live over HTTP, not only in tests: `GET /api/ops/analytics` on a fresh deployment returned all five
charts — 7.3.1 as "1 of 7 days of cluster history — too little to read as a trend", 7.3.4 as "0 of 5
verified work orders", and 7.3.2 sufficient with the real tier split of the 15 live clusters (High 0,
Medium 1, Low 14). **Stated limitation:** 7.3.3 cannot show a crew member with zero open orders,
because this class has no account store. The charts themselves are server-side; rendering them is E10
work, gated on the mockups like every other screen.*

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

*HTTP surface delivered 2026-09-04, commit `5d92138` on `dev`. `src/boundary/http/WorkOrderRoutes.ts`
was a **declared skeleton that threw `not implemented`** — the work-order controllers existed and
there was no HTTP door to reach them by, which blocked seven of the thirteen operations and crew
screens. It is now implemented and mounted in `src/server.ts`; verified live, in that every new path
answers **403 from access control rather than 404**, which is the difference between a route that
exists and refuses and a route that is not there. Two corrections fell out of wiring it. (1)
`DispatchController.crewView` reads `findForAssignee(by.accountId)` and is therefore **scoped to the
caller** — the obvious wiring, reusing it behind a wider permission, would have shown a manager the
orders assigned to *them*, i.e. none, rendering an empty work-order list that looked entirely
correct. `managerView(by, filter)` and `managerDetail(id, by)` are new, authorise `workOrder:readAll`,
and read a new `findAll()` added to the `WorkOrderStore` port and to `InMemoryWorkOrderStore`. (2)
The client's `ApiFailure` now carries the whole response **body**: 8.1.12 returns the work order that
blocked a duplicate, and discarding it made the refusal less useful than the server intended — the
manager is now handed a link to the blocking order, which is what "the existing one is offered"
means.*

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

*HTTP surface delivered 2026-09-04, commit `5d92138` on `dev`, together with the My Jobs, Job Detail
and Job Completion screens. `src/boundary/http/CrewRoutes.ts` was, like `WorkOrderRoutes.ts`, a
**declared skeleton that threw `not implemented`** — the crew screens had controllers behind them and
no way to reach them. It is now implemented and mounted in `src/server.ts`, and verified live in that
its paths answer 403 from access control rather than 404. The end-to-end crew path — a crew member
seeing only their own job, being refused a manager screen, accepting, starting, being refused a
completion with no photograph, and completing — is exercised over real HTTP by the UAT harness (see
US-8.8).*

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

*The chain is now driven automatically, 2026-09-04, commit `3a92978` on `dev`. `src/tools/uat.ts`
(`npm run uat -- --base <url> --log <server log>`) drives the **running** server over real HTTP as
four real accounts through the four segments of `lab4/DEMO-SCRIPT.md`: **31 checks, all passing**,
against live Supabase, live NEA cluster data and live OneMap. Segment D walks the whole loop —
create a crew account, raise a work order, see 8.1.12 refuse a duplicate **naming the blocker**, read
crew workload, assign, sign in as the crew member, confirm they see only their own job and are
refused a manager screen, accept and start, have a completion with no photograph refused, record the
completion, and have the manager verify it into a `TreatmentRecord`. Three design points worth
keeping. (1) 2.1.4 will not let a new account sign in unverified, and the verification token stands
in for an email: it is printed to the **server console** and deliberately **not** returned from
`/api/auth/register`, because returning it would make verification decorative — so the harness reads
the server log, which is exactly what a human tester does with an inbox. (2) Without `--log`, segment
B reports **SKIPPED with the reason**, not FAILED. (3) A step blocked by an earlier failure is
SKIPPED rather than failed — one broken sign-in should not present as fourteen broken features. The
harness found a real defect no unit test could: `LandingScreen` read `sources[].name/publisher` while
`/api/attribution` returns `attributions[].source/text`, so the credits list rendered **empty** — a
10.4.5 obligation silently unmet on the one screen an unauthenticated visitor sees. The screen test
and the route test each agreed with themselves; only the seam between them was wrong.*

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

*All 27 §11.2 screens built 2026-09-04, commits `790ae61` (shared components and the seven
shared/auth plus seven resident screens) and `5d92138` (the ten operations and three crew screens),
on `dev`. **Built without Figma mockups, on Yen Kit's explicit authorisation** — "The figma will not
be in for awhile. can just proceed without the design" — so US-10.1 is no longer a gate on anything
downstream, and every earlier note saying a screen "stays gated on mockups B3-B12" is superseded.
What was built is structure and behaviour only: no visual or CSS layer exists on any screen, and a
visual layer can be laid over these without changing what they do. shared/auth (7): Landing,
Register, SignIn, PasswordResetRequest, PasswordReset, NotAuthorised, NotFound. resident (7):
ResidentMap, MyLocations, AddLocation, ReportSite, MyReports, ReportDetail, AlertSettings.
operations (10): OperationsDashboard, ClusterDetail, ModerationQueue, ReportReview,
DispatchProposal, WorkOrderCreate, WorkOrderList, WorkOrderDetail, StaffAccounts, DataSources.
crew (3): MyJobs, JobDetail, JobCompletion. `ResidentMapScreen` bundles **no map library** and
renders the layer data as an accessible list — a declared limitation stated in the file itself,
defensible because 9.1.11 requires the priority tier as a **label**, not as a colour. New render
tests: `tests/client-screens-shared.test.tsx` (17), `tests/client-screens-resident.test.tsx` (21),
`tests/client-screens-ops.test.tsx` (24). React render testing is new to this project —
`@testing-library/react` ^16, `@testing-library/dom` ^10 and `jsdom` ^25 were added as
devDependencies, and each test file carries a `@vitest-environment jsdom` docblock rather than a
vitest config file being introduced. **530 tests across 25 files**, `npx tsc --noEmit` strict-clean.*

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

*Not delivered, and no longer blocking. On 2026-09-04 Yen Kit authorised building the 27 screens
without the mockups ("The figma will not be in for awhile. can just proceed without the design"), so
this story now owes only its **graded artefact** — the annotated mockups for Lab 1 — and not the
design input the build was waiting on. The built screens can serve as the reference the mockups are
drawn against, which reverses the intended order and should be said plainly rather than hidden.*

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

*Delivered 2026-09-04, commit `790ae61` on `dev`. `client/src/components/Field.tsx` is the field
component this story names, and it is where the acceptance criterion "field validation and character
counting are handled by the field component, not per screen" is actually enforced — the screens have
no validation code of their own. Two accessibility obligations are carried centrally by the same
component for the same reason: a real `<label htmlFor>` (11.7.2 — a placeholder is not a label, and
disappears exactly when the user needs it), and errors rendered as text inside `role="alert"` with
`aria-invalid` (11.7.5 — never colour alone). It validates only **after first blur** (11.5.3), so a
half-typed email is not marked wrong while it is still being typed. `client/src/lib/useLoad.ts` turns
a GET into a `LoadState` and owns three things no screen should re-decide: the initial loading render,
the 11.4.4 retry, and a guard against a late response landing in a screen the user has already left.
`client/src/components/Link.tsx` renders a real `<a href>` and calls `preventDefault` — middle-click,
copy-link and the browser status bar all keep working, which they do not with a `<div onClick>`.
`client/src/screens/ScreenProps.ts` is the single props shape for all 27 screens and deliberately
carries **no permission booleans**: a screen branching on a client-side permission is a screen
deciding, and 2.3.6 puts that decision on the server. `client/src/app/ScreenRegistry.tsx` maps a
route's `screenId` to its component — before it existed, `AppShell` took `renderScreen` from "the
router" and no router had ever been written, so the screens existed and nothing rendered them.*

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

*Partly delivered 2026-09-04, commits `790ae61` and `5d92138`. `client/src/app/ScreenRegistry.tsx`
is what makes "the implemented routes match the map" checkable at all, and two invariants are now
**asserted in tests** rather than reviewed by eye, because both fail silently. (1)
`screensWithoutComponent()` — a route the map draws and the router serves, with no component behind
it, renders a **blank page** (11.3.1); its only symptom is empty space, which no error surfaces. (2)
**Route registration order** — Express matches in registration order, so
`/api/ops/work-orders/crew-workload` registered after `/api/ops/work-orders/:id` is swallowed by it
and answers "no such work order" forever. **This story is not done:** the unsaved-changes guard and
the modal input preservation are still outstanding.*

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
