# D-Fence — TA suggestion: expanding scope beyond dengue

Version 1.1 · 2026-09-16 · status: **decided — see `PEST-PRIORITY-MODEL.md` for the adopted model**
Trigger: the TA suggested widening the app to other pest report types — cockroaches, ants, wild
boars, snakes.

---

## 1. The governing finding

**No Singapore government API publishes cockroach, ant, rat, wild boar or snake reports.** This is
not a "could not find" — the entire data.gov.sg catalogue was pulled and screened on 2026-09-16:
**all 4,615 datasets across 462 API pages**, every record's name, agency and description searched.

| Where a pest feed would have to come from | What actually exists |
|---|---|
| **Municipal Services Office / OneService** (the app every Singaporean uses to report pests) | **Publishes nothing on data.gov.sg.** MSO does not appear as an agency at all. No public API, no developer portal entry. |
| **AVS (Animal & Veterinary Service)** — takes wild boar and snake calls on 1800-476-1600 | **Publishes nothing on data.gov.sg.** Not listed as an agency. Feedback-case counts appear only as annual figures inside press releases. |
| **NParks** — 23 datasets | All parks, trees, trails, nature-reserve geometry. **No sightings, no wildlife, no encounters.** BIOME / SGBioAtlas (the citizen-sighting platform) is a web app with **no documented API**; access is by emailing `CIN@nparks.gov.sg`. |
| **NEA** — 208 datasets | Pest-related ones are **static registries**: Registered Vector Control Operators and Registered Pesticides, both last updated **2024-06-06**. Nothing on rodents or cockroaches. |
| **SFA** | Not an agency on data.gov.sg. |

Also confirmed: data.gov.sg's `?query=` parameter is ignored by the dataset API (a query for
"rodent" returns Historical Rainfall 2020), so the only reliable screen is a full catalogue pull —
which is what was done.

**Consequence:** the TA's suggestion cannot be satisfied with an authoritative government feed per
pest. It can only be satisfied by (a) the app's own resident reports, or (b) a citizen-science API.
Both are viable; one of them is verified live below.

---

## 2. The one live API that does cover these pests: iNaturalist

Free, keyless, JSON, no registration. Verified by live pull on **2026-09-16**, Singapore
(`place_id=6734`, 1,133,026 total observations).

| Pest | Taxon id | All-time SG records | Last 12 months | Latest record |
|---|---:|---:|---:|---|
| Snakes (Serpentes) | 85553 | 12,596 | 3,058 | 2026-09-15 |
| Ants (Formicidae) | 47336 | 17,648 | 5,108 | 2026-09-15 |
| Cockroaches + termites (Blattodea) | 81769 | 6,432 | 1,683 | 2026-09-15 |
| Termites alone (Termitoidae) | 118903 | 1,592 | 453 | — |
| Long-tailed macaque | 43459 | 4,293 | 856 | 2026-09-15 |
| Rats (Rattus) | 44540 | 348 | 128 | 2026-09-09 |
| Wild boar (Sus scrofa) | 42134 | 635 | **37** | 2026-08-26 |
| Mosquitoes (Culicidae) | 52134 | 661 | 170 | 2026-09-11 |

Endpoint shape (single hop, unlike the NEA feed's two-hop signed-S3 dance):

```
GET https://api.inaturalist.org/v1/observations
      ?place_id=6734&taxon_id=85553&d1=2025-09-16&per_page=200
```

Returns `observed_on`, `geojson` Point coordinates, `taxon.name`, `quality_grade`,
`public_positional_accuracy`, `place_guess`, photos.

**Positional quality (50 snake records, last 12 months):** median accuracy **111 m**; 34 of 46
records with a stated accuracy are within 500 m; 5 exceed 5 km. Good enough to aggregate to a
locality, not good enough to aim a crew at a block.

**Three caveats that must be stated in the SRS, not discovered in the demo:**

1. **Location obscuring.** iNaturalist randomises coordinates within a ~0.2° box for species at risk
   of harm or where the observer set geoprivacy. Sampled rates: snakes 3/50, cockroaches 7/30, wild
   boar 0/30, **long-tailed macaque 30/30 — every single record obscured.** Macaques are therefore
   unusable for location-based ranking. Any ingestion must drop `obscured=true` records, and the
   driver must be defined over the survivors.
2. **Wild boar volume is too thin for a live driver** — 37 records in twelve months across the whole
   island, roughly one every ten days. It cannot move a score. It can populate a map layer and an
   advisory.
3. **This is biodiversity observation, not complaint.** An iNaturalist snake record is a naturalist
   photographing a snake in a nature reserve, which is close to the *opposite* of a nuisance report.
   Presenting it as "pest pressure" is a claim the TA could puncture in the demo. Present it as
   **"recent wildlife activity in this locality"** and the claim survives.

GBIF was checked as an alternative (`api.gbif.org`, 441 SG boar records, 11,309 SG Serpentes records
2025–26) — but its SG records are **re-published iNaturalist data** (dataset key
`50c9509d-22c7-4a22-a47d-8c48425ef4a7`), with worse latency. No reason to prefer it.

---

## 3. What the existing architecture can and cannot absorb

The scorer is anchored to dengue in a way that is easy to underestimate. `SCORING-SPEC.md` §2 sets
seven drivers, four of which have **no analogue for any other pest**: case size (log, ceiling 300
cases), case growth delta, and the two rainfall drivers calibrated to *Aedes* larval development.
A cockroach has no CASE_SIZE, and 72-hour rainfall does not predict cockroach pressure.

The **report layer, however, is already pest-neutral in everything but its enum.** `ReportType` in
`src/entity/enums.ts` is `StandingWater | UnclearedRefuse | BlockedDrain | OvergrownVegetation |
Other` — habitat conditions, not diseases. Moderation, corroboration, photo upload, work-order
dispatch and the audit trail neither know nor care what is being reported.

So the split is clean, and it is the whole basis of the ranking below: **widen the report layer,
leave the scorer alone.**

---

## 4. Prioritised list of additions

Ranked by grade impact per unit of effort, against the grader's stated criteria — live data update ·
data processing · multi-user interaction · ≥1 government API — and against the fact that
**traceability is separately marked in the Lab 5 demo**, so every addition costs requirement,
use-case, data-dictionary and test updates, not just code.

### P1 — Widen the resident report taxonomy to a pest dimension
**Effort: S. Impact: high. External dependency: none.**

Add a `PestType` enum (`Mosquito | Cockroach | Rodent | Ant | Termite | Snake | WildBoar |
Macaque | Other`) alongside the existing `ReportType`, and a `pestType` field on `Report`. One new
field, one new filter on the moderation queue (5.3.3 already filters by report type), one new facet
on the dashboard.

This is what the TA is actually asking for, it answers him in one sentence in the demo, and it
touches nothing the scorer depends on. Do this first regardless of what else is chosen.

### P2 — Authority routing on dispatch
**Effort: S–M. Impact: high (it is the intellectually honest part of the expansion).**

A cockroach report and a snake report do not go to the same place. `REQUIREMENTS.md` §Actors already
declares `dispatchAuthority` as the extension point for exactly this, so the hook exists and is
already documented as deliberate — it just has to be exercised:

| Pest | Authority | Note |
|---|---|---|
| Mosquito | NEA vector control | current path, unchanged |
| Cockroach, rodent, ant, termite | Town council / NEA (premises-dependent) | — |
| Snake, wild boar, macaque | **NParks AVS, 1800-476-1600** | advisory-only: the app must NOT dispatch a cleaning crew to a wild boar |

Making the app *decline* to dispatch its own crew for wildlife, and route to AVS instead, is a
stronger demo moment than any additional data source — it shows the domain was thought about.

### P3 — NEA "Areas with High Aedes Population" (Gravitrap) as a second live NEA feed
**Effort: S. Impact: high. Dataset `d_5d060d8b7838a15e8906fb22c50dbf51`, GEOJSON, last updated
2026-08-29.**

Not a scope expansion — a free win found during this screen. It is Gravitrap-measured *mosquito
population*, which is a leading indicator, where Dengue Clusters is confirmed *human cases*, a
lagging one. Same two-hop poll-download pattern already implemented in `NEAFeedGateway`, same
refresh cadence. It adds a genuine second live government feed and a defensible eighth driver.

Related and also live, same cadence, same pattern, near-zero marginal cost once one is wired:
Zika Cluster (`d_a3c783f11d79ff7feb8856f762ccf2c5`) and the five regional Aedes Breeding Habitat
layers.

### P4 — iNaturalist wildlife-activity layer
**Effort: M. Impact: medium.**

A second ingestion job (`WildlifeIngestionJob`) on the pattern of `ClusterIngestionJob`, filtered to
snakes, boars, macaques, cockroaches, ants; `obscured=true` dropped; aggregated to locality; surfaced
as a **map layer and a locality advisory, not a scoring driver.**

Why not a driver: §2's caveat 3. Why worth doing anyway: it is a genuinely live, genuinely
multi-species, genuinely geospatial third feed, it makes the pest expansion look data-backed rather
than cosmetic, and the ingestion code is a near-copy of what exists.

### P5 — Static pest registries as reference data
**Effort: XS. Impact: low.**

Registered Vector Control Operators (`d_0921c2daa08b8bd846d2405c934da8c6`) and Cleaning Contractors
with location of work (`d_8383572bdfd37d3586933c3ff5ec1922`) can populate a dispatch directory.
Both were **last updated 2024-06-06** — static. Do not present either as a live feed; the grader
filters hardest on "live data update" and a stale dataset invites the question.

### ~~Not recommended~~ — SUPERSEDED 2026-09-16: generalising the scorer to per-pest driver sets
**Effort: L. Impact: negative before the demo.**

Replacing the seven fixed drivers with a per-pest driver set means re-deriving normalisation and
weights for pests with no case-count data at all, re-writing `SCORING-SPEC.md` §1–3, and breaking
the requirement→design→code→test trace that Lab 5 marks directly. The scoring model is dengue's
because dengue is the only pest Singapore publishes quantified data for. **Say that out loud in the
demo** — "we widened reporting to all pests, and kept quantified prioritisation where quantified
data exists" — and the limitation becomes a finding rather than a gap.


> **SUPERSEDED — Yen Kit's decision, 2026-09-16.** The generalisation is adopted: D-Fence
> scores all common household pests and all wild animals requiring NEA/AVS intervention on one
> queue, as `pest priority x urgency`. The objection recorded above — that it breaks the
> requirement->design->code->test trace — **does not hold** under the model actually designed:
> normalising the severity multiplier to the catalogue maximum gives `sigma(Mosquito) = 1.000`,
> so the dengue branch is numerically identical to the current scorer and the trace survives
> intact. See **`PEST-PRIORITY-MODEL.md`**, which replaces this section.

---

## 5. Recommendation

Take **P1 + P2** as the answer to the TA: they are small, they land in the report and dispatch layers
that are already pest-neutral, and together they make the app a **municipal pest reporting and
prioritisation system** rather than a dengue tool — which is the framing the TA is reaching for.

Add **P3** independently of the TA's suggestion; it is the cheapest live-data upgrade available and
it strengthens the dengue core that the rest of the deliverables trace to.

Treat **P4** as the stretch item, conditional on Lab 3 being closed.

Decline the scorer generalisation, explicitly and with the reason stated in the SRS.

---

## 6. Verification log

All figures in this document come from live pulls made on **2026-09-16**:

- data.gov.sg dataset API, pages 1–462, 4,615 records — full catalogue screened by name, agency,
  description.
- `api-production.data.gov.sg/.../datasets/<id>/metadata` for each candidate dataset's
  `lastUpdatedAt`.
- `api.inaturalist.org/v1/observations` — per-taxon counts, 12-month counts, latest observation
  dates, obscuring rates, positional accuracy distribution.
- `api.gbif.org/v1/occurrence/search` — SG boar and Serpentes counts, publishing dataset identified.

Nothing in §1 or §2 is inferred from documentation alone.
