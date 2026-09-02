# Dengue Prioritiser — Feature Backlog

Written 2026-09-01. Shareable: https://claude.ai/code/artifact/9c6e5fdb-5865-465a-bfbf-d0187e191244

## Prioritisation basis: the marker is a TA

A TA marks many teams in a fixed window against a rubric with lines to tick. They will not read the
scoring function and admire it. So grade impact here = **how visibly and directly a feature satisfies
a criterion the marker is looking for**, not technical merit.

1. **Visible beats deep.** A value ticking on screen proves "live data update" better than a paragraph
   asserting it. A phone buzzing on cue proves multi-user interaction better than a class diagram.
2. **Features mapping 1:1 to a stated criterion are worth more than their effort suggests** (the marker
   is checking off a list). Quality improvements that don't change what's on screen are worth less.
3. **The demo is 13–15 min** — room for ~6–7 features shown properly. Hence a cut list, not a longer backlog.

Effort key: S = 1–2 days · M = 3–5 days · L = 1–2 weeks. Impact /5. Ratio = impact ÷ effort.

## Backlog

| ID | Feature | Criterion served | Impact | Effort | Ratio | Tier |
|---|---|---|---|---|---|---|
| F1 | Cluster ingestion + change detection | Live data | 4 | M | 1.33 | Foundation |
| F2 | Accounts and roles | Multi-user / Lab 3 access control | 4 | S | 2.00 | Foundation |
| F3 | Saved locations + geocoding | Multi-user / entity model | 4 | M | 1.33 | Foundation |
| F4 | Rainfall accumulation service | Live data | 5 | M | 1.67 | Build first |
| F5 | Priority scoring engine | **Data processing — the core** | 5 | L | 1.00 | Build first |
| F6 | Breeding-site reporting | **Multi-user — the core** | 5 | M | 1.67 | Build first |
| F7 | Geofenced resident alerts | Live data + multi-user | 5 | M | 1.67 | Build first |
| F8 | Planner work queue | Multi-user / second actor | 5 | M | 1.67 | Build first |
| F9 | Cluster map | Demo visibility | 4 | M | 1.33 | If on schedule |
| F10 | Cluster trend + history | Live-data proof over time | 4 | S | **2.00** | If on schedule |
| F11 | Report photos + moderation | Multi-user depth | 3 | M | 1.00 | If on schedule |
| F12 | Destination / route check | Marginal | 2 | M | 0.67 | Cut or defer |
| F13 | Fogging schedule scraper | Improves F5 invisibly | 2 | L | 0.40 | Cut or defer |
| F14 | Temperature breeding-rate modifier | Invisible sophistication | 1 | M | 0.33 | **Do not build** |

## Inputs / Processing / Outputs

### F1 — Cluster ingestion and change detection
- **In:** NEA Dengue Clusters GeoJSON, polled on a schedule. Verified fields: `OBJECTID, LOCALITY,
  CASE_SIZE, HOMES, PUBLIC_PLACES, CONSTRUCTION_SITES, FMEL_UPD_D` plus polygon geometry.
- **Processing:** fetch, parse, diff each cluster against the last stored snapshot; classify as
  new / grown / shrunk / closed by comparing `CASE_SIZE` and geometry; append a timestamped history
  row rather than overwriting.
- **Out:** normalised `Cluster` records with `first_seen`, `last_updated`, `case_delta`, plus a full
  history table.
- **Why this rank:** no marks alone, but everything reads from it, and the history table makes F10
  nearly free.

### F2 — Accounts and roles
- **In:** email/password via Supabase Auth; role assigned at registration (resident | planner).
- **Processing:** registration, login, session handling, row-level rules — a resident reads only their
  own saved locations; a planner reads the queue and every report.
- **Out:** authenticated sessions, `User` entity with role, enforced access boundaries.
- **Why this rank:** Lab 3 requires persistent storage and access control explicitly. Supabase gives
  both in ~1 day; hand-rolling costs a week and earns nothing extra.

### F3 — Saved locations and geocoding
- **In:** user-entered address or postal code; **OneMap Search API — the one government API call that
  satisfies the Smart Nation requirement.**
- **Processing:** geocode to lat/lon, then point-in-polygon against every active cluster to determine
  exposure. Store with a label: home, workplace, child's school.
- **Out:** `SavedLocation` records with coordinates, label, live cluster status.
- **Why this rank:** carries a lot of the Labs 1–3 marks — the entity model, persistence design and
  access-control question all become concrete here.

### F4 — Rainfall accumulation service
- **In:** rainfall real-time API (VERIFIED): `data.stations[id, name, location{latitude, longitude}],
  readings[timestamp, data[stationId, value]]`. 97 stations, 5-minute totals in mm.
- **Processing:** poll every 5 minutes; assign each cluster centroid to its nearest station (or
  interpolate across the three nearest by inverse distance); maintain rolling 24h and 72h accumulation.
- **Out:** `rainfall_24h` and `rainfall_72h` per cluster and per saved location, updating continuously.
- **Why this rank:** makes "live data update" visibly true. Show the 5-minute tick during the demo.

### F5 — Priority scoring engine *(the core)*
- **In:** cluster case size and growth delta (F1), rainfall accumulation (F4), open report counts (F6),
  days since last treatment (F13 or a seeded table), homes/public-places/construction breakdown.
- **Processing:** normalise each driver to a common scale, apply tuned weights, compute a composite
  priority score per locality, rank and tier into high/medium/low. **Retain each driver's contribution
  to the final score.**
- **Out:** ranked priority list with score, tier, and per-driver contribution breakdown.
- **Why this rank:** highest-value single feature; answers the "not a simple presentation of data" veto.
  The driver breakdown is not decoration — without it a TA sees a number and cannot tell whether any
  computation happened.

### F6 — Breeding-site reporting *(the multi-user core)*
- **In:** resident report — location, type (standing water / uncleared refuse / blocked drain),
  description, optional photo.
- **Processing:** geocode or accept a map pin; attach to the enclosing cluster or nearest locality;
  validate; run a status lifecycle (submitted → verified → actioned → closed); feed the open-report
  count back into F5 as a scoring driver.
- **Out:** `Report` records visible to other residents and the planner queue; adjusted priority score.
- **Why this rank:** this is the entire multi-user criterion, and the loop that makes it a system.

### F7 — Geofenced resident alerts
- **In:** SavedLocation coords (F3), active cluster polygons (F1), 24-hr forecast API, cluster growth events.
- **Processing:** evaluate trigger rules each ingestion cycle — location has entered an active cluster,
  its cluster has grown, or heavy rain is forecast within 24h for an already-active cluster. Dedupe and
  apply a cooldown so one event doesn't fire repeatedly.
- **Out:** push notification via Telegram Bot API (free, no metering).
- **Why this rank:** the best ten seconds of the demo. A TA watching a phone buzz on cue remembers it
  far longer than an architecture slide. Cheap to build, disproportionately rewarded.

### F8 — Planner work queue
- **In:** ranked priorities (F5), open reports (F6).
- **Processing:** filter and sort the queue, assign to an officer, mark actioned — which writes back a
  treatment date that re-enters F5 as `days_since_last_treatment`, lowering that locality's future score.
- **Out:** operational queue view, action log with audit history.
- **Why this rank:** creates the second actor the use case model needs and closes the feedback loop.
  Demonstrating report → priority → action → recalculated priority in 90 seconds is the strongest thing
  you can show.

### F9 — Cluster map
- **In:** cluster polygons, priority tiers, report pins, saved locations.
- **Processing:** layered render — choropleth by priority tier, report markers, user locations overlaid;
  client-side filtering by tier and report status.
- **Out:** interactive map, the primary interface for both actors.
- **Why this rank:** high visibility and TAs respond to maps — but it is presentation, not processing,
  and must not eat the schedule F5 needs.

### F10 — Cluster trend and history *(best ratio in the backlog)*
- **In:** the cluster history table F1 already writes.
- **Processing:** per-locality time series of case counts, growth rate, trajectory classification
  (growing / stable / receding).
- **Out:** sparkline per locality plus a trajectory tag.
- **Why this rank:** nearly free once F1 stores history, and the clearest possible evidence that the
  data genuinely updates — you can show weeks of movement rather than asserting it.

### F11 — Report photos and moderation
- **In:** image upload from the reporting form; planner moderation actions.
- **Processing:** store to Supabase storage, attach to the report, planner confirms or rejects;
  rejected reports stop contributing to the priority score.
- **Out:** photo-backed reports, moderation audit trail.
- **Why this rank:** deepens the multi-user story and adds genuine states to the dialog map. Worth doing
  once F5–F8 are stable.

### F12 — Destination and route check
- **In:** destination address, OneMap routing.
- **Processing:** geocode the destination, find clusters within a buffer of the destination or route
  corridor, summarise risk.
- **Out:** pre-travel advisory.
- **Why this rank:** overlaps heavily with F3 and F7 — a TA will read it as the same capability twice.
  Cut unless genuinely ahead.

### F13 — Fogging schedule ingestion
- **In:** town council public pages, scraped. Public and unauthenticated, so it clears both the FAQ bar
  and the grader's.
- **Processing:** scrape, parse dates and block ranges from inconsistent layouts, normalise, compute
  days since last treatment per locality.
- **Out:** treatment history table feeding F5.
- **Why this rank:** **the classic over-investment trap.** Every town council formats its pages
  differently, so it is genuinely a week of fiddly work — and the TA cannot see any of it, because the
  output is one input to a score. **Seed the table manually first**; F5 behaves identically.

### F14 — Temperature breeding-rate modifier
- **In:** air temperature API (VERIFIED live, 18 stations).
- **Processing:** degree-day accumulation to estimate the Aedes larval development window, applied as a
  modifier to the F5 score.
- **Out:** refined priority score.
- **Why this rank:** epidemiologically the most defensible item on this list, and the least rewarded —
  a TA marking against a rubric has no line for it. **Do not build it; say it** in the extensibility
  segment and in Q&A. A sentence instead of a week.

## Build order (7 weeks across Labs 3–4)

1. **Weeks 1–2 — Foundation: F1, F2, F3.** Nothing is demonstrable yet, and that is correct. Resist
   building the map first — everything reads from F1's history table, and starting it late costs you
   F10 entirely.
2. **Weeks 3–4 — The three criteria: F4, F5, F6.** By end of week 4 you should be able to say *and show*
   that the system ingests live data, computes a ranked priority from it, and lets residents change that
   ranking. That sentence is the project.
3. **Week 5 — Close the loop: F7, F8.** Turns a set of features into a system; the demo script starts to
   write itself.
4. **Weeks 6–7 — Visible polish: F9, F10, F11.** Stop here.
5. **Only if genuinely ahead — F12, F13.** And even then, seed the fogging table by hand first.

## The two decisions that matter most

- **Do not build F14, and do not build F13 properly.** Between them they are close to three weeks of work
  a TA cannot see. Say both in the extensibility segment instead — a sentence buys what a fortnight of
  building would not.
- **Protect F5.** It is the only large item in the first two tiers and the feature that answers the
  "not a simple presentation of data" veto. The common failure is spending week 3 on the map because it
  is satisfying to see, then arriving at week 6 with a scoring function that is three `if` statements.
  **Build the ugly version of the map and the good version of the score.**
