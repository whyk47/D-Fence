# DEMO SCRIPT — D-Fence

Version 0.1 · 2026-09-03 · Lab 4 §3.4.1–3.4.3, rehearsed against Lab 5's 20-minute structure.

> **Honest status.** This is the *script*, which Lab 4 asks for. It is written against the system as
> designed, and most method bodies are still skeleton. §6 lists exactly what must be implemented
> before each beat can be shown, in the order that unblocks the most of the script per week of work.
> Do not rehearse this in front of the class until §6's "must work" column is green.

---

## 1. The 20 minutes

| Segment | Time | Who | What it has to prove |
|---|---|---|---|
| A. Framing | 0:00–1:00 | Presenter 1 | The problem is real and the data is public |
| B. Resident journey | 1:00–5:30 | Presenter 1 | Multi-user interaction, live data reaching a member of the public |
| C. Operations journey | 5:30–10:30 | Presenter 2 | **Data processing** — the priority score, explained |
| D. Crew loop closing | 10:30–14:00 | Presenter 3 | The feedback loop: work done lowers a score |
| E. SE practices and architecture | 14:00–16:30 | Presenter 4 | Stereotyped packaging, ports, table-driven state machine, tests |
| F. Traceability walkthrough | 16:30–19:00 | Presenter 4 | One requirement → use case → class → code → test, both directions |
| G. Extensibility and Q&A buffer | 19:00–20:00 | All | The declared simplifications, said before we are asked |

Four presenters, because the individual mark is the team mark times a peer-review weight and every
member must be seen to own something.

---

## 2. Segment A — framing (60 seconds)

> "NEA publishes every active dengue cluster in Singapore as open data. This morning there were
> fifteen, and one of them — Countryside Road — held 258 cases while eight others held two each. The
> data says where the cases are. It does not say **where to send a cleaning crew tomorrow morning**.
> That is the question D-Fence answers."

Read the cluster count off the dashboard on the day rather than from this script: it was twelve on
2 September and fifteen on 3 September.

Show: the raw GeoJSON in a browser tab for three seconds, then close it. The point is that the input
is public and unglamorous, and the output is a decision.

**Do not** say "real-time dengue tracking". The feed revises about twice a week and a grader may
know that.

---

## 3. Segment B — resident journey (4½ minutes)

| Beat | Action | Requirement shown |
|---|---|---|
| B1 | Register, sign in | 2.1.x |
| B2 | Add a saved location by address — OneMap geocoding resolves it | 3.1.3 |
| B3 | The map shows the containing cluster, its case size, its tier and the data timestamp | 2.4, 3.1.10 |
| B4 | Submit a breeding-site report with a photograph, from a phone-width window | 5.1.x |
| B5 | The duplicate check refuses a second report 20 m away within the hour | 5.1.11 |
| B6 | A Telegram alert arrives on the presenter's actual phone | 6.x |

**B6 is the beat to protect.** A message landing on a real phone in the room is the single most
convincing thing in the twenty minutes. Rehearse it on the room's network, not on a hotspot, and
have a screenshot ready as a fallback.

**B5 exists to show a rule, not a feature.** Anyone can accept a form; refusing a duplicate shows
there is logic behind it.

---

## 4. Segment C — operations journey (5 minutes)

This is the segment the "data processing" criterion is judged on. Spend the time here.

| Beat | Action | Requirement shown |
|---|---|---|
| C1 | Sign in as the Operations Manager — the same URL, a different application | 2.2, 2.3 |
| C2 | The dashboard: every active cluster ranked, tiers coloured *and* worded | 7.1, 7.2 |
| C3 | Open Countryside Road → **the driver breakdown**: seven drivers, each with its raw value, its normalised value, its weight and its contribution | 4.1.10, 4.1.18 |
| C4 | Say the sentence in §4.1 below | 4.1.3–4.1.8 |
| C5 | Trigger an ingestion run by hand; a cluster's case delta and trajectory update | 1.1.18, 9.1.9 |
| C6 | Kill the rainfall feed in configuration → the score shows **DEGRADED**, names the excluded driver, and the remaining weights renormalise | 4.1.12, 4.1.13, 4.1.19, 4.1.20 |

### 4.1 The one paragraph everybody on the team must be able to say

> "The score is a weighted sum of seven normalised drivers. Case size and growth carry half of it
> because they are the only measured health outcome; rainfall carries a fifth, weighted towards the
> 72-hour window because standing water has to persist for eggs to reach adults; days since last
> treatment carries fifteen percent, which is what makes a completed job visibly lower the score;
> verified public reports carry ten; premises mix carries five, and only five, because two-thirds of
> the clusters publish no habitat data at all. The weights are configuration, they sum to one, and
> we did not fit them to outcome data — they encode domain reasoning, and they are the first thing
> we would revise against a season of real scores."

**C6 is the sleeper.** Most teams demo the happy path. Showing a source failure degrade gracefully —
and *naming* what was lost rather than silently scoring the cluster as dry — is a two-minute
argument for the whole architecture.

---

## 5. Segments D–G

### D. Crew loop (3½ minutes)
Dispatch a work order from the C3 cluster → sign in as the crew member → accept → complete with a
photograph → manager verifies → **return to the dashboard and show the cluster has moved down the
ranking**. That last step is the demo: 4.1.17 says a verified treatment must lower the score, and
here is the score, lower. Traces: 8.1–8.5, 4.1.15–4.1.17.

### E. SE practices (2½ minutes)
Four things, thirty seconds each: packaging by stereotype (`boundary` / `control` / `entity`) with
the ports layer that keeps control classes testable without a network; the **table-driven** work-order
machine and why the GoF State pattern was rejected; `main`/`dev` branching with squash merges; and
`npm test` run live — 120 cases, six files, green.

### F. Traceability (2½ minutes)
Walk **one** requirement end to end, both directions, on screen:
`4.1.8` → use case 7.2 → `PriorityScoringEngine.assignTier` → `tests/priority-scoring.test.ts` case
BV5 → back to 4.1.8 in `REQUIREMENTS.md`. Then invert it: open a test, ask "which requirement is
this?", answer from the docstring. One requirement done properly beats five done vaguely.

### G. Extensibility and the declared simplifications (1 minute)
Say these before the Q&A can ask:
1. **One Operations Manager** covers what is really NEA vector control *and* town-council cleaning.
   Deliberate; the extension point is a `dispatchAuthority` attribute on the actor.
2. **The weights are not fitted.** Domain reasoning, not regression.
3. **Fogging schedules are seeded by hand.** The scraper is designed, not built, and we would rather
   say so than imply a data source we do not have.
4. **A temperature-driven breeding model** is the obvious next driver and is deliberately not built.

---

## 6. What must work before each beat can be rehearsed

| Beat | Must be implemented | Currently |
|---|---|---|
| B1–B3 | `AuthenticationController`, `SavedLocationController`, `GeocodingController` | Skeleton. **OneMap is registered and verified live (2026-09-03)** — `OneMapGateway.search` works; the token expires 2026-09-06, after which the account credentials must be in `src/.env` |
| B4–B5 | `ReportController`, object storage, duplicate rule 5.1.11 | Skeleton; Supabase Storage gateway written |
| B6 | `NotificationController`, `TelegramGateway`, a bot token | Skeleton |
| C2–C3 | `ClusterIngestionJob`, `PriorityScoringEngine.computeScores`/`scoreOne`/`buildBreakdown`, `DashboardController` | **Scoring is DONE 2026-09-03** — `npm run ingest` prints the ranked table with driver breakdowns from live NEA and rainfall data. Only `DashboardController` and the screen remain |
| C5 | `AbstractIngestionJob.run` template, `IngestionController` | **Template DONE 2026-09-03** (both jobs run through it, manual trigger included); `IngestionController` scheduling remains |
| C6 | Source-health staleness marking (1.4.x) | **Half done** — the engine excludes stale drivers, names them and renormalises, proved by tests S3 and by the live run; 1.4.x's health *display* remains |
| D | `DispatchController`, `WorkOrderLifecycleController.transition` | `isTransitionPermitted` done and tested; `transition` is not |
| E–F | Nothing — these are true today | Ready |

**Build order, revised 2026-09-03.** The first two steps are done: ingestion (clusters and rainfall)
and the scoring orchestration both run against live data, so C2–C6 are blocked only on the
`DashboardController` and one screen. What remains, in the order that unblocks the most demo per week:
`DashboardController` + the dashboard screen (C2, C3) → work-order `transition` (D) → accounts and
the resident screens (B1–B5) → notifications (B6).
Segments E and F need no further code, which is worth remembering if the build runs late: a team that
demos less product but proves traceability still collects two of the three rubric segments.

---

## 7. Rehearsal rules

- **Seeded data, not live data, for the rehearsal.** The feed moves twice a week; a rehearsal that
  depends on NEA publishing that morning will fail.
- **One browser profile per role**, opened before the demo starts. Signing in and out on stage costs
  ninety seconds and looks like a fault.
- **Every number on screen carries a unit and a timestamp** (11.5.x). A grader asking "is that
  today's data?" mid-demo is a lost minute.
- **Time-box the Q&A answers to two sentences.** The buffer is one minute, not five.
