# DEMO SCRIPT — D-Fence

Version 1.0 · 2026-09-05 · Lab 4 §3.4.1–3.4.3, against Lab 5's 20-minute structure.
Supersedes v0.1 (2026-09-03), which was written against a system whose method bodies were skeletons.

> **Status.** Every beat below is implemented, deployed and verified against
> **https://dfence-sc2006.azurewebsites.net** — not a laptop. The acceptance harness runs 55 checks
> over the deployed instance (0 failed, 1 documented skip) and the browser harness 9 (0 failed).
> `tools/demo-drive.ts` drives §3–§5 of this script through a real browser, so the script is
> executable and not merely aspirational.

---

## 0. Before the room

Run these, in this order, the morning of. Each takes under a minute except the last.

| # | Command | What it proves | If it fails |
|---|---|---|---|
| 0.1 | `curl https://dfence-sc2006.azurewebsites.net/api/health` | The instance is awake — App Service cold-starts in ~20 s | Open the site once and wait; do not start the demo on a cold container |
| 0.2 | `npm run peek` | Rows are being written where they should be | A `0` against `audit_record`, `report_photo` or `saved_location` means the deployment is on in-memory stores — check the App Settings |
| 0.3 | `npm run uat -- --base https://dfence-sc2006.azurewebsites.net --log stream.log` | 55/0/1 | Read the failing beat; every one of them names its requirement |
| 0.4 | `npm run demo:drive -- --base https://dfence-sc2006.azurewebsites.net` | The click path in §3–§5 still works in a real browser | Fix before rehearsing; the script is the source of truth for the clicks |
| 0.5 | Open the site on the presenting phone and install it (§3.0) | The home-screen icon exists before anyone is watching | Fall back to the browser; the rest of the script is unchanged |

**Accounts.** Three, and they must be the seeded ones — do not create fresh accounts in the room.

| Role | Email | Password |
|---|---|---|
| Resident | `resident@d-fence.local` | `DFENCE_SEED_RESIDENT_PASSWORD` |
| Operations Manager | the seeded manager address | `DFENCE_SEED_MANAGER_PASSWORD` |
| Cleaning Crew | created live in beat C7, or the previous run's `uat-crew-…` account | as set in C7 |

**Devices.** Two laptops (Presenter 2 and 4 share one) and one phone, all on the room's wifi, all
signed in *before* the session starts. The phone is the demonstration's centrepiece and is
Presenter 1's and Presenter 3's device in turn.

---

## 1. The 20 minutes

| Segment | Time | Presenter | Device | What it has to prove |
|---|---|---|---|---|
| A. Framing | 0:00–1:00 | 1 | laptop | The problem is real and the data is public |
| B. Resident, on a phone | 1:00–5:30 | 1 | **phone** | It is an app; live data reaches a member of the public |
| C. Operations | 5:30–10:30 | 2 | laptop | **Data processing** — the priority score, explained |
| D. Crew loop | 10:30–14:00 | 3 | **phone** | The feedback loop: work done lowers a score |
| E. Engineering | 14:00–16:30 | 4 | laptop | Stereotyped packaging, ports, table-driven state machine, tests |
| F. Traceability | 16:30–19:00 | 4 | laptop | One requirement → use case → class → code → test, both ways |
| G. Simplifications and Q&A | 19:00–20:00 | all | — | The declared limitations, said before we are asked |

Four presenters, because the individual mark is the team mark times a peer-review weight and every
member must be seen to own something.

---

## 2. Segment A — framing (60 seconds)

Laptop, one browser tab, nothing signed in.

> "NEA publishes every active dengue cluster in Singapore as open data. Today there are sixteen, and
> one of them — Countryside Road — holds 258 cases while eight others hold two each. The data says
> where the cases are. It does not say **where to send a cleaning crew tomorrow morning**. That is
> the question D-Fence answers."

| # | Action | On screen |
|---|---|---|
| A1 | Show the raw dataset in a tab for three seconds, then close it | Unstyled GeoJSON |
| A2 | Open `https://dfence-sc2006.azurewebsites.net/` | The landing screen, "Get started" |

Read the cluster count off the dashboard on the day, not off this script.

**Do not** say "real-time dengue tracking". The feed revises about twice a week and a grader may know
that. Say "hourly, and the system records that most hours nothing changed" — that is 1.1.19–1.1.21
and it is a better answer.

---

## 3. Segment B — the resident, on a phone (4½ minutes)

**Mirror the phone to the projector.** If the room has no mirroring, hold the phone to the camera
for B0 and B6 and run the rest on a phone-width browser window (390 px).

### 3.0 B0 — it is an app (§11.8) · 40 seconds

| # | Action | On screen | Requirement |
|---|---|---|---|
| B0.1 | Press the **D-Fence** icon on the phone's home screen | The app opens **with no address bar** — no browser chrome at all | 11.8.2 |
| B0.2 | Say: "one codebase, installed from the browser, no app store" | — | §13 assumption |
| B0.3 | Turn on flight mode. Press the icon again | The app still opens; a banner reads **"You are offline"** and the screens already opened still draw | 11.8.8, 11.8.9 |
| B0.4 | Turn flight mode off. Press **Retry** on the screen | Data arrives; the banner disappears | 11.8.9 |

> The point to make out loud: **it is offline-tolerant, not offline-capable.** The shell is cached;
> the data deliberately is not, because a cached cluster count shown under a heading that states how
> fresh the data is would make a true statement false (11.8.10).

### 3.1 B1–B6 — the resident journey · 3½ minutes

| # | Action (exact) | On screen | Requirement |
|---|---|---|---|
| B1 | **Sign in** → email `resident@d-fence.local`, password, press **Sign in** | The dengue map | 2.1.6, 2.1.8 |
| B2 | Bottom navigation → **My locations** → **Add a location** | The address form | 11.2.6, 11.2.7 |
| B3 | Type `560103` into **Address or postal code** → press **Search** | A candidate list — *"103 ANG MO KIO AVENUE 3 …"* | 3.1.3 |
| B4 | Press the candidate → **Name this location** = `Home`, label **Home** → **Save** | The location card: status, the cluster it is near, its case size, the **data timestamp** | 3.1.4, 3.1.6, 3.1.10 |
| B4a | Navigation → **Dengue map** | Singapore, drawn — and it opens on the block you just saved, not on the whole island. The purple dot is that location; the shaded outline is the real NEA cluster boundary | **9.1.1**, 9.1.2, 9.1.5, 9.1.15 |
| B4b | Pinch to zoom out one step, then untick **Reports** and tick it again | Continuous zoom; the layer disappears and returns. Say: *"the tier is written in the key as well as painted on the shape — colour is never the only carrier"* | 9.1.6, **9.1.11**, 11.7.5 |
| B5 | Navigation → **Report a site** → **Use my current location** | Latitude and longitude fill in from the phone's GPS | 11.6.x |
| B6 | **Add a photograph** | **The camera opens directly** — not the photo library | **11.8.13** |
| B7 | Take a photograph of anything | A thumbnail appears with a remove control; the file is uploaded as it is added | 5.1.5, 8.3.6 |
| B8 | **Describe what you saw** = `Standing water in a discarded pail behind the block.` → **Submit report** | The report detail screen, status **Submitted** | 5.1.1–5.1.5 |
| B9 | Press **Report a site** again, same place, same type → **Submit report** | Refused: *a report of this type was made near here within the hour* | **5.1.11** |
| B10 | Navigation → **Alerts** → **Request a linking code** | Six digits and a deadline | 6.1.7 |

**B6 and B7 are the beats to protect.** The camera opening is what makes "it is a mobile app"
self-evident without saying it, and the photograph really travels — §5 of this script proves it by
refusing a completion that cites a photograph which does not exist.

**B9 is the beat graders remember**, because it is the system refusing a user for a stated reason.
Read the refusal aloud: it names the rule and the remedy.

---

## 4. Segment C — operations (5 minutes)

Laptop, `/ops`. Presenter 2. **Sign in before the session** — do not spend demo time on a password.

| # | Action (exact) | On screen | Requirement |
|---|---|---|---|
| C1 | Open `/ops` | Overview: active clusters, active cases, open verified reports, open and overdue work orders, and **the age of the data** | 7.1.x, 7.1.9 |
| C2 | Point at the age figure. Say: "if the feed were stale, this number is where you would see it first" | — | 7.1.9 |
| C2a | Scroll to **Where the clusters are** | The sixteen clusters as real polygons over a Singapore basemap. Say: *"the boundaries are NEA's own — fifty-four points for the Lentor cluster, not a circle we drew"* | **9.1.1**, 9.1.2, 9.1.12 |
| C2b | Click a shape | The cluster detail screen for it. The map is a way into the data, not a picture beside it | 9.1.7 |
| C3 | Scroll to the **priority table** | Sixteen rows, ranked, each with score, tier and case delta | 7.2.1 |
| C4 | Click the top row | The **cluster detail** screen with the full driver breakdown | 9.2.1, **4.1.10** |
| C5 | Read the breakdown aloud, top to bottom | Seven drivers, each with raw value → normalised value → weight → contribution | 4.1.3, 4.1.10 |
| C6 | Point at any driver reading zero, and say why | e.g. rainfall 0 mm because it has not rained; growth 0 because NEA has not republished changed counts | **honesty beat** |
| C7 | Navigation → **Staff** → create a crew account (`crew-demo@d-fence.local`) | The crew member appears in the list with **0 open jobs** | 2.2.1, 8.2.5 |
| C8 | Navigation → **Moderation** → open the resident's report from B8 | The report, its photograph, its location and the cluster it falls in | 5.3.1, 11.2.15 |
| C9 | Press **Verify** | The report moves to **Verified**; the resident's own screen will show it | 5.3.2, 5.2.5, 5.2.8 |
| C10 | Navigation → **Analytics** | The five §7.3 charts, each with a sufficiency statement | **11.2.26**, 7.3.1–7.3.5 |
| C11 | Point at a chart that says it has insufficient data | "It says so rather than drawing a straight line through two points" | 7.3.x |
| C12 | Navigation → **Data sources** → **Refresh now** | Each source with its own status and last run; the run completes and the table re-ranks | 1.4.1–1.4.4, 1.1.18 |
| C13 | On the cluster you opened at C4, scroll to **Work orders** → **Raise a work order** | The work-order form, with **Cluster** already filled in from the link | 8.1.7, 8.1.8 |
| C14 | Task **Fogging**, **Scheduled date** *today*, **Instructions for the crew**, → **Create work order** | The work-order detail screen, status **Created** | 8.1.1–8.1.6 |
| C15 | Under **Assignment**, **Assign to** → the crew member from C7 (the option carries their open-job count) → **Assign** | “Assigned to …”; a notification is sent to that crew member | 8.2.1, 8.2.4, 8.2.5 |

> **If the map is blank, the tiles are the only thing missing.** The basemap is OneMap, fetched
> from `www.onemap.gov.sg` — the one external origin the client touches. On a network that blocks
> it, every cluster shape, marker, legend entry and list row is still drawn and still readable; the
> grey rectangle behind them is the only loss. Say so if it happens rather than apologising for the
> map: the data was never in the tiles.

> **Two details that decide whether C13–C15 works on stage.** Schedule the job for **today**: the
> crew screen opens on its `Today` filter, so a job dated tomorrow is real but invisible at D1 until
> someone presses `Upcoming`. And raise it on a cluster that has **no open work order** — 8.1.12
> refuses a second one and offers a link to the order that blocked it. That refusal is worth showing
> deliberately; it is not worth discovering by accident. `npm run demo:drive` walks up from the
> bottom of the priority table for exactly this reason, and because a treatment record written
> against the top-ranked cluster zeroes its `DaysSinceLastTreatment` and suppresses 15% of the score
> the demo is about.
| C16 | Scroll to **History** | Every action so far, who did it, and when — including refusals | **2.4.1**, 2.3.8 |

### 4.1 The paragraph everybody on the team must be able to say

> "The score is a weighted sum of seven drivers. Each is normalised to 0–1 by a method chosen for
> its shape — case size is logarithmic because the difference between 2 and 20 cases matters more
> than between 240 and 258; rainfall is capped-linear because past 50 mm more rain does not mean
> more mosquitoes. The weights are ours, they are in `config/scoring.default.json`, and
> `SCORING-SPEC.md` argues each one. When a driver has no data, we exclude it and redistribute its
> weight rather than treating missing as zero — and the row says it is degraded. Nothing here is
> fitted to observed outcomes and we do not claim it is."

---

## 5. Segment D — the crew loop, on the phone (3½ minutes)

Presenter 3, on the phone, signed in as the crew account from C7.

| # | Action (exact) | On screen | Requirement |
|---|---|---|---|
| D1 | Open the installed app; sign in as the crew member | **My jobs** — and *only* their own jobs | 8.4.1, **2.3.5** |
| D2 | In the URL bar of a browser tab, try `/ops` as this account | **Not authorised** — no detail about what exists | 2.3.3, **2.3.7** |
| D3 | Back in the app, press the job → **Accept this job** | Status **Accepted** | 8.3.3 |
| D4 | **Start work** | Status **In Progress** | 8.3.5, 8.3.17 |
| D5 | **Record completion** → **What did you do?** = `Fogged the void deck; cleared two trays.` | The completion form; the submit control is disabled | 8.3.6 |
| D6 | Press **Submit completion** *without* a photograph | Refused before it is sent: *"At least one photograph is required."* | **8.3.7** |
| D7 | **Add a photograph** → camera → take one | "Uploading the photograph…", then a thumbnail | 8.3.6, 11.8.13 |
| D8 | **Submit completion** | Status **Completed** | 8.3.6 |
| D9 | Presenter 2's laptop, `/ops/work-orders/{id}` → **Verify completion** → **Verify** | Status **Verified**; a treatment record is written | 8.3.9, 8.3.12 |
| D10 | Presenter 2 opens the cluster detail again | **`DaysSinceLastTreatment` has reset to 0 and the score has fallen** | **4.1.17**, 8.5.3 |
| D11 | Say the sentence below | — | — |

> "That is the loop. A resident's report raised the score, the score raised the job, the job was
> done, and the completed work lowered the score. Nothing in that chain was typed twice."

**D10 is the single most important beat in the twenty minutes.** It is the one that shows this is a
system and not four screens. If time is short, cut C10–C12, never D9–D10.

---

## 6. Segment E — engineering (2½ minutes)

Presenter 4, editor and terminal on the projector. No slides.

| # | Show | Say |
|---|---|---|
| E1 | `src/` — `boundary/`, `control/`, `entity/`, `persistence/`, `ports/` | "Every class carries its UML stereotype and the requirement numbers it implements, in its header." |
| E2 | `src/control/WorkOrderTransitionTable.ts` | "The state machine is a **table**, not a switch. Adding a transition is a row. `WorkOrder.status` has no public setter, so there is exactly one write path." |
| E3 | `src/ports/Stores.ts` | "Ports, so the control layer cannot tell Postgres from an in-memory double — which is how the whole system is testable without credentials." |
| E4 | `npm test` running | "686 tests across 33 files. Seventeen of them run against live Postgres, because some guarantees are the database's — including that an audit row cannot be updated or deleted." |
| E5 | `.github/workflows/deploy.yml` | "Typecheck, test, build, verify the package, deploy, then poll the health endpoint. It refuses to ship anything that does not pass." |

If asked *"did you write this or did an AI?"* — the honest answer is in `lab2/AI-TECH-STACK.md`:
recommendations were taken, each was evaluated against the requirements, and two were rejected with
reasons. That document is a deliverable, not a defence.

---

## 7. Segment F — traceability (2½ minutes)

One requirement, followed in both directions, live. Use **8.3.7** — it is the one with the best story.

| # | Open | Shows |
|---|---|---|
| F1 | `REQUIREMENTS.md` → 8.3.7 | *"The system shall reject a completion submission that carries no photograph."* |
| F2 | `EPICS-STORIES.md` → US-8.5 | The user story, its acceptance criteria and its completion note |
| F3 | `lab3/DESIGN-MODEL.md` → `WorkOrderLifecycleController` | The control class that owns the transition |
| F4 | `src/control/WorkOrderLifecycleController.ts` → `complete()` | The guard, and `completionEvidenceRefused` above it |
| F5 | `tests/photo-storage.test.ts` → E1 | The test that fails if a fabricated key is accepted |
| F6 | `lab4/TEST-PLAN.md` §2.27 | The case table, and **why this requirement passed for weeks while being unmet** |

> F6 is worth thirty seconds of the two and a half minutes. "Our own harness reported this
> requirement as passing while nothing was ever stored — it checked that an empty photo list was
> refused and never that a key referred to anything. We found it, wrote the test that catches it,
> and the acceptance run now uploads a real photograph. A green suite is evidence, not proof."

Then run it backwards: pick `tests/rainfall.test.ts` W6 and land on 4.1.12.

---

## 8. Segment G — declared simplifications (1 minute)

Say these before anyone asks. Each is defensible; being asked first is not.

- **Email is not sent.** 2.1.4's verification token goes to the server log. A resident registering
  on the deployment needs someone to read it. Everything else about §2 is real: salted scrypt
  hashes, the five-failure lock-out, the 24-hour inactivity window.
- **The auth provider is ours, not Supabase Auth.** 10.3.1 gives credential handling to the
  provider and that is still the design; the local one persists its hashes so an account survives
  a restart.
- **The scoring weights are a team proposal**, argued in `SCORING-SPEC.md` from one day's live
  payload. They are not fitted to outcomes and nothing in the documents claims otherwise.
- **10.4.5 is not satisfied**, and we say so in the attribution endpoint: OneMap needs a registered
  account, so one of our four sources is credentialed. It would have been easy to call a government
  service "public" and move on.
- **The dashboard misses 10.1.5 under fifty concurrent users** — 2,125 ms against a 1,000 ms
  budget — and `lab4/TEST-PLAN.md` §2.26 diagnoses exactly why (fifteen serial round trips, two of
  them computed twice). Single-user it answers in 0.18 s.
- **The mobile app is an installable web application**, not a native build. §13 of the requirements
  records the reading and what would change if the module wants an APK.

---

## 9. Failure drills

| If this fails | Do this |
|---|---|
| The site is slow on first load | It is a cold container. Open it during Segment A's dataset tab |
| Telegram does not deliver | Show the alert log on the Alerts screen — the delivery attempt and its outcome are recorded (6.1.10) |
| OneMap search returns nothing | Its token has lapsed. Use the saved location that already exists and say the geocoder reports itself unhealthy on the Data sources screen (3.1.17) |
| The camera does not open | Use the photo library; say the attribute is a hint browsers may ignore |
| A work order will not raise | An earlier run left one open on that cluster (8.1.11). Cancel it from **Work orders** — it demonstrates 8.3.18 on the way past |
| Anything else | Take the failure to the audit trail on screen and say what it recorded. A system that says what went wrong is the point |

---

## 10. Rehearsal rules

1. Rehearse **on the room's wifi**, not a hotspot.
2. Rehearse the **hand-offs**, not the clicks — every changeover is a place to lose ten seconds.
3. Run `npm run demo:drive` before every rehearsal. If the script and the software disagree, the
   software is right and this file gets updated.
4. Nobody reads this document aloud. The tables are click paths, not a narration.
