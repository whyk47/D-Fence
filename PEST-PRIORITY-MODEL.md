# D-Fence — Generalised Cross-Pest Priority Model

Version 1.0 · 2026-09-16 · status: **PROPOSAL for team review**
Supersedes `PEST-SCOPE-EXPANSION.md` §4 "Not recommended" on Yen Kit's instruction, 2026-09-16.
Extends `SCORING-SPEC.md` — it does not replace it. Every figure verified live on 2026-09-16 (§9).

> **The decision this document implements.** D-Fence ranks *all* common household pests and all wild
> animals requiring NEA or AVS intervention on **one comparable queue**, by
> `pest priority × urgency`. The dengue scorer becomes one branch of that model, not the model.

---

## 1. The shape of the model

```
PestPriority(locality, pest, t)  =  100 × σ(pest) × U(locality, pest, t)

  σ(pest)  ∈ (0, 1]   severity multiplier — fixed per pest, config-driven      (§4)
  U(...)   ∈ [0, 1]   urgency — evidence-driven, time-varying                  (§5)
           =  Σ  w_i(pest) · n_i( x_i(locality, pest, t) )   with  Σ w_i = 1
```

Three properties make this work, and they are the argument for the design:

1. **Comparability.** `U` is always in `[0,1]` and `σ` is a constant, so scores from different pests
   with entirely different evidence are on one 0–100 scale and sort against each other honestly.
2. **Backwards compatibility is exact.** `σ(Mosquito) = 1.000` by construction (§4.3), and the
   mosquito driver set and weights are today's seven unchanged. **A dengue cluster scores in the new
   model exactly what it scores today** — existing tests, tier thresholds (40.0 / 70.0) and the
   requirement→design→code→test trace all survive. This retires the objection raised in
   `PEST-SCOPE-EXPANSION.md` §4.
3. **Graceful degradation.** Pests differ enormously in what evidence exists (§3). `U` is computed
   only over the drivers that exist for that pest, with weights renormalised to 1.0 — so a pest with
   no external feed is still scored, from the reports and treatment history the system already
   holds, rather than being excluded or scored as zero.

Linear arithmetic cannot express acute life-safety, and it should not try. That is handled by a
separate **critical override** (§6), not by inflating a severity constant.

---

## 2. The pest taxonomy

Taken from what the two responsible agencies actually publish, not from the TA's four examples.

**NEA** — `nea.gov.sg/our-services/pest-control`: mosquitoes, rats (and rat fleas), cockroaches,
flies, bed bugs. NEA states it focuses on **five main vectors**. Termites and ants are pest-control
industry work under the VCO regime but are not NEA vectors.

**AVS (NParks)** — `avs.nparks.gov.sg/wildlife/encountering-wildlife`, complete list as published:
bats · bees and wasps · box jellyfish · civets · estuarine crocodiles · hawksbill turtles · house
crows, pigeons and Javan mynas · macaques · monitor lizards · other birds · otters · pangolins ·
snakes · wild boars.

```
PestType   ::= Mosquito | Rat | Cockroach | Fly | BedBug | Flea            (NEA vectors)
             | Termite | Ant                                              (household, VCO regime)
             | Snake | WildBoar | Macaque | MonitorLizard | Otter          (AVS wildlife)
             | Civet | Bat | Pangolin | Crocodile
             | HouseCrow | Pigeon | JavanMyna                              (NEA/AVS shared: birds)
             | BeeWasp                                                     (NEA/AVS shared)
             | Other

PestClass  ::= VectorBorne | Structural | Nuisance | Wildlife    → drives dispatch authority
EvidenceTier ::= A | B | C                                       → drives the driver set
```

Marine species (box jellyfish, hawksbill turtle) are **excluded**: they are not municipal-estate
pests and D-Fence has no locality model for coastal waters. State the exclusion; do not silently
drop it.

**Two genuinely ambiguous authorities** — declare them, do not resolve them by guessing.
Bees/wasps and the three bird species appear on the AVS list but are also NEA public-health nuisance
work. `dispatchAuthority` (already a declared extension point in `REQUIREMENTS.md` §Actors) carries
the resolution per pest, in configuration.

---

## 3. What evidence actually exists per pest

Verified live 2026-09-16. Government sources: full data.gov.sg catalogue screened (4,615 datasets,
462 API pages) — see `PEST-SCOPE-EXPANSION.md` §1 for the negative results. Third-party observation
counts: iNaturalist, Singapore (`place_id=6734`), last 12 months.

| Pest | Gov feed | iNat records / 12 mo | Obscured in sample | Tier |
|---|---|---:|---:|:--:|
| Mosquito | **NEA clusters + Gravitrap + Zika (live)** | 163 | 7/30 | **A** |
| Rat | none | 128 | 0/30 | C¹ |
| Cockroach | none | 1,683² | 7/30 | B |
| Fly | none | 6,903³ | 1/30 | B |
| Bed bug | none | **1** | 0/1 | **C** |
| Flea | none | **1** | 0/1 | **C** |
| Termite | none | 453 | 3/30 | B |
| Ant | none | 5,108 | 1/30 | B |
| Snake | none | 3,058 | 2/30 | B |
| Wild boar | none | **37** | 0/30 | C¹ |
| Macaque | none | 856 | **30/30** | **C**⁴ |
| Monitor lizard | none | 1,785 | 0/30 | B |
| Otter | none | 440 | **30/30** | **C**⁴ |
| Civet | none | 107 | 2/30 | C¹ |
| Bat | none | 481 | 0/30 | B |
| Pangolin | none | 12 | **12/12** | **C**⁴ |
| Crocodile | none | 390 | 0/30 | B |
| Bee / wasp | none | 1,480 (Vespidae) | 2/30 | B |
| House crow | none | 929 | 0/30 | B |
| Pigeon | none | 598 | 1/30 | B |
| Javan myna | none | 1,287 | 2/30 | B |

¹ Volume too thin to move a driver — wild boar is **37 records island-wide in a year**, about one
every ten days. Treated as Tier C and scored from reports.
² Blattodea, which includes termites; cockroaches alone are 1,683 − 453 = **1,230**.
³ Diptera order-wide, overwhelmingly non-pest flies. Usable only as a coarse density signal.
⁴ **Every sampled record is location-obscured.** iNaturalist randomises coordinates within a ~0.2°
box (~22 km) for species at risk of harm or where the observer set geoprivacy. At that radius the
record cannot be attributed to a locality, so these pests get **no** external observation driver
regardless of their record count.

**Tier definitions**

- **A — instrumented.** An authoritative live government feed exists. **Mosquito only.**
- **B — observed.** No government feed; a live third-party observation feed exists with usable
  coordinates (median positional accuracy 111 m; 34 of 46 sampled snake records within 500 m).
- **C — report-only.** Nothing external is usable. Scored entirely from D-Fence's own `Report`,
  `Corroboration` and `TreatmentRecord` entities — **which already exist**, so Tier C needs no new
  integration at all.

The bed bug and flea rows are the clearest evidence for the tier design: **one iNaturalist record
each in twelve months.** Indoor pests are invisible to a biodiversity platform. Any model that
required an external feed per pest would simply fail to score them — and bed bugs are a real NEA
workload.

---

## 4. Severity — `σ(pest)`

### 4.1 The rubric

Four factors, each scored 0–3, from published agency material. Disease and direct harm are weighted
×2 because this is a public-health application.

| Factor | 3 | 2 | 1 | 0 |
|---|---|---|---|---|
| **D** Disease (×2) | Notifiable vector-borne disease | Documented pathogen transmission | Incidental contamination | None |
| **H** Direct harm (×2) | Potentially fatal | Injury needing treatment | Minor | None |
| **S** Statutory duty | Agency can compel action | Regulated, complaint-driven | Advisory only | None |
| **P** Property / amenity | Structural damage | Significant hygiene impact | Minor nuisance | None |

`rawSeverity = 2D + 2H + S + P`, maximum 18.

### 4.2 The table

| Pest | D | H | S | P | raw | **σ** | Class | Authority |
|---|:-:|:-:|:-:|:-:|:--:|:--:|---|---|
| Mosquito | 3 | 1 | 3 | 1 | 12 | **1.00** | VectorBorne | NEA |
| Rat | 2 | 1 | 3 | 3 | 12 | **1.00** | VectorBorne | NEA |
| Macaque | 1 | 2 | 3 | 2 | 11 | **0.92** | Wildlife | AVS |
| Wild boar | 0 | 3 | 3 | 1 | 10 | **0.83** | Wildlife | AVS |
| Cockroach | 2 | 0 | 3 | 2 | 9 | **0.75** | VectorBorne | NEA |
| Fly | 2 | 0 | 3 | 2 | 9 | **0.75** | VectorBorne | NEA |
| Flea | 2 | 1 | 2 | 1 | 9 | **0.75** | VectorBorne | NEA |
| Snake | 0 | 3 | 3 | 0 | 9 | **0.75** | Wildlife | AVS |
| Crocodile | 0 | 3 | 3 | 0 | 9 | **0.75** | Wildlife | AVS |
| Bee / wasp | 0 | 3 | 2 | 1 | 9 | **0.75** | Wildlife | shared |
| House crow | 1 | 1 | 3 | 2 | 9 | **0.75** | Nuisance | shared |
| Civet | 1 | 1 | 1 | 2 | 7 | **0.58** | Wildlife | AVS |
| Bat | 1 | 1 | 1 | 2 | 7 | **0.58** | Wildlife | AVS |
| Pigeon | 1 | 0 | 3 | 2 | 7 | **0.58** | Nuisance | shared |
| Bed bug | 0 | 1 | 2 | 2 | 6 | **0.50** | Structural | NEA |
| Ant | 1 | 1 | 1 | 1 | 6 | **0.50** | Nuisance | VCO |
| Otter | 0 | 1 | 2 | 2 | 6 | **0.50** | Wildlife | AVS |
| Termite | 0 | 0 | 1 | 3 | 4 | **0.33** | Structural | VCO |
| Monitor lizard | 0 | 1 | 1 | 1 | 4 | **0.33** | Wildlife | AVS |
| Javan myna | 0 | 0 | 2 | 2 | 4 | **0.33** | Nuisance | shared |
| Pangolin | 0 | 0 | 3 | 0 | 3 | **0.25** | Wildlife | AVS |

### 4.3 Why σ is normalised, and what it buys

`σ(pest) = rawSeverity(pest) / 18 ÷ max_p(rawSeverity(p)/18)` — i.e. divided by the catalogue
maximum, which is 12/18. Mosquito and rat therefore sit at exactly **1.000**.

This is not cosmetic. Without it every score would be scaled down by a constant factor and the
existing tier thresholds at 40.0 and 70.0 would quietly stop meaning what `SCORING-SPEC.md` §4 says
they mean. With it, **the mosquito branch is numerically identical to the current system** and the
thresholds carry over untouched.

Note what σ deliberately does *not* encode: a snake at 0.75 sits below a macaque at 0.92, because σ
measures **sustained municipal and public-health burden**, and macaques generate far more incidents
in Singapore than snakes do. A venomous snake in a corridor is an acute event, and §6 handles it.
Expect this question in the demo; it has a good answer.

---

## 5. Urgency — `U(locality, pest, t)`

### 5.1 Driver catalogue

| Driver | Source | Normalisation | A | B | C |
|---|---|---|:-:|:-:|:-:|
| `CaseSize` | NEA cluster feed | log, ref 300 | ✓ | — | — |
| `CaseGrowthDelta` | NEA cluster feed | log, ref 40 | ✓ | — | — |
| `Rainfall72h` | NEA rainfall | capped linear, 120 mm | ✓ | — | — |
| `Rainfall24h` | NEA rainfall | capped linear, 50 mm | ✓ | — | — |
| `PremisesMix` | NEA cluster feed | pass-through | ✓ | — | — |
| `VerifiedOpenReportCount` | own `Report` | capped linear, 5 | ✓ | ✓ | ✓ |
| `ReportVelocity` | own `Report` | capped linear, 4 / 14 days | — | ✓ | ✓ |
| `CorroborationDensity` | own `Corroboration` | capped linear, 3 | — | ✓ | ✓ |
| `ExternalObservationDensity` | iNaturalist | log, ref 20 / 90 days | — | ✓ | — |
| `DaysSinceLastTreatment` | own `TreatmentRecord` | recency decay, 60 d | ✓ | ✓ | ✓ |
| `ResponseCapacityDeficit` | **NEA VCO registry** | capped linear, 8 km | — | ✓ | ✓ |

> **Corrected 2026-09-17.** The `A` column for `ResponseCapacityDeficit` read ✓ and was wrong. It
> contradicted §5.2 immediately below — which states in words that the driver is *not* added to the
> mosquito set — and it contradicted 4.2.5, since an eighth tier A driver moves every dengue score.
> The code was right; the table was not. Worth noting because this is the same mistake step 9 would
> make, written down as though it were already settled.

Every normalisation method is one of the four Strategy classes already implemented in
`src/control/normalisation/` — `LogScaleNormalisation`, `CappedLinearNormalisation`,
`RecencyDecayNormalisation`, `MinMaxNormalisation`. **No new normalisation code.**

### 5.2 Weight sets

**Tier A — unchanged from `SCORING-SPEC.md` §3.** `ResponseCapacityDeficit` is *not* added to the
mosquito set, precisely so backwards compatibility stays exact.

```json
{ "CaseSize": 0.30, "CaseGrowthDelta": 0.20, "DaysSinceLastTreatment": 0.15,
  "Rainfall72h": 0.12, "Rainfall24h": 0.08, "VerifiedOpenReportCount": 0.10,
  "PremisesMix": 0.05 }
```

**Tier B — observed**

```json
{ "VerifiedOpenReportCount": 0.30, "ReportVelocity": 0.20,
  "ExternalObservationDensity": 0.20, "DaysSinceLastTreatment": 0.15,
  "CorroborationDensity": 0.10, "ResponseCapacityDeficit": 0.05 }
```

**Tier C — report-only**

```json
{ "VerifiedOpenReportCount": 0.35, "ReportVelocity": 0.25,
  "DaysSinceLastTreatment": 0.20, "CorroborationDensity": 0.15,
  "ResponseCapacityDeficit": 0.05 }
```

Each sums to 1.000, as requirement 4.1.6 demands. The reasoning behind the shape: resident reports
dominate outside Tier A because **they are the only direct evidence that exists** — the inverse of
the Tier A argument, where reports are held at 0.10 precisely because NEA's own measured case counts
outrank them. `ExternalObservationDensity` is capped at 0.20 because of the caveat in §5.4.

### 5.3 The VCO driver — the proxy, used honestly

`ResponseCapacityDeficit` is built from **Registered Vector Control Operators**
(`d_0921c2daa08b8bd846d2405c934da8c6`): **290 licensed operators, every one carrying a full address
and a valid postal code**, verified by download today. Geocoding is free and **keyless** — OneMap's
search endpoint needs no token (verified: `528844` → `1.34140, 103.94327`), contrary to what
`research/API-INVENTORY.md` records for OneMap generally.

Distribution: the 290 operators fall across **54 of Singapore's 80 postal sectors**, with the top
five sectors holding 28.6% — spread, not clustered into one corner.

**What it measures, stated plainly:** the driver is `capped-linear distance from the locality to the
nearest registered operator, cap 8 km`. That is a **response-capacity** signal — how far help has to
come — and it is defensible as such.

**What it does not measure:** pest pressure. A VCO address is a *registered office*, and the top
streets in the file are Bukit Batok Crescent (17), Anson Road (11), Woodlands Industrial Park E5 (8)
and Toh Guan Road East (7) — industrial estates and the CBD, i.e. where pest-control firms rent
offices, not where pests are. Used as a demand proxy it would systematically rank industrial land
above the housing estates that generate the actual complaints.

It therefore carries **weight 0.05 in every tier** — present, honest, and too small to distort a
ranking. The dataset is also static (`lastUpdatedAt` 2024-06-06), so it must never be presented as a
live feed; it is reference data loaded once and cached.

**Note for the demo:** OpenStreetMap was checked as a richer alternative and returned **zero**
pest-control businesses tagged in Singapore. The VCO registry is not the lazy option; it is the only
one.

### 5.4 Three caveats that belong in the SRS, not in the demo Q&A

1. **Obscured coordinates must be dropped at ingestion.** Records with `obscured=true` carry a
   randomised position. Macaque, otter and pangolin were 100% obscured in sampling and get no
   external driver at all (§3).
2. **An iNaturalist record is a sighting, not a complaint.** A naturalist photographing a snake in a
   nature reserve is close to the opposite of a nuisance report. The field is therefore surfaced to
   the Operations Manager as **"recent wildlife activity"**, never as "pest pressure", and is capped
   at 0.20 weight.
3. **Taxon breadth is uneven.** `Diptera` is the whole fly order and mostly non-pest; `Blattodea`
   includes termites. Genus- and family-level counts are coarse density signals, not censuses.

---

## 6. Critical override

Certain reports must not be ranked by arithmetic. When a **verified** report matches an override
rule, its work order is forced to tier `Critical`, placed above the ranked queue, and — for wildlife
— routed to AVS with dispatch of D-Fence's own cleaning crew **suppressed**.

| Rule | Condition |
|---|---|
| Venomous snake indoors | `pest ∈ {Snake}` ∧ `context = Indoor` |
| Crocodile, any location | `pest = Crocodile` |
| Wild boar in a residential or school zone | `pest = WildBoar` ∧ `landUse ∈ {Residential, Education}` |
| Bee or wasp nest at a school, childcare or eldercare site | `pest = BeeWasp` ∧ `landUse ∈ {Education, Healthcare}` |
| Macaque entering a dwelling | `pest = Macaque` ∧ `context = Indoor` |
| Any pest with an injury reported | `injuryReported = true` |

This is the design's answer to "why is a snake only 0.75". It is also the single most demonstrable
feature in the whole expansion: **the app declines to send its own crew to a wild boar and routes to
AVS on 1800-476-1600 instead.** That shows domain understanding in a way no extra data source does.

---

## 7. Worked example — one mixed queue

The point of the model is that these four rows sort against each other meaningfully.

| Locality | Pest | Tier | σ | U | **Score** | Band |
|---|---|:--:|--:|--:|--:|---|
| Blk 112 Lor 1 Toa Payoh | Rat | C | 1.00 | 0.710 | **71.0** | High |
| Kampong Ubi | Mosquito | A | 1.00 | 0.549 | **54.9** | Medium |
| Bukit Timah fringe | Snake | B | 0.75 | 0.515 | **38.6** | Low → **Critical** by override |
| Blk 54 Sims Drive | Ant | C | 0.50 | 0.745 | **37.3** | Low |

Read the four rows in order, because each makes a separate point:

- **The rat outranks the dengue cluster**, on reports alone and with no external feed. That is the
  generalisation working: a Tier C pest with strong local evidence beats a Tier A pest with moderate
  evidence, because σ is equal and urgency decides.
- **The mosquito row is 54.9, exactly what today's scorer returns** for the same inputs
  (0.30·0.723 + 0.20·0.591 + 0.15·0.500 + 0.12·0.333 + 0.08·0.240 + 0.10·0.600 + 0.05·0.400).
  Nothing about dengue changed.
- **The ant row has the highest urgency in the table (0.745) and still finishes last**, because
  σ = 0.50 holds it down. Severity is doing real work: a flood of ant reports cannot outrank a rat
  problem.
- **The snake row scores 38.6 and still goes to the top of the queue**, via the override. Arithmetic
  and life-safety are kept in separate mechanisms, which is the whole argument of §1.

---

## 8. Implementation

Ordered so each step is independently demonstrable. Estimate assumes the existing code structure.

> **Status 2026-09-16: steps 1 to 8 are built.** Step 9 is not, and that is a decision rather than
> a remainder — see the note below the table. Test results are in
> `lab4/TEST-PLAN.md` §6; story-level status is in `EPICS-STORIES.md` E11.

| # | Change | Files | Size | Built |
|---|---|---|---|---|
| 1 | `PestType`, `PestClass`, `EvidenceTier` enums | `src/entity/enums.ts` | XS | **yes** — plus `LocationContext`, and `PriorityTier.Critical` |
| 2 | `pestType` on `Report`; moderation-queue filter (5.3.3 already filters by report type) | `entity/Report.ts`, `control/ReportController.ts`, `boundary/http/ReportRoutes.ts` | S | **yes** — plus 5.1.16, 5.1.17 and 5.1.18's pest-aware duplicate window, and the form (11.3.20) |
| 3 | `PestProfile` entity + `config/pests.default.json` — σ, class, tier, driver weights, authority, override rules, all configuration per 10.6.2 | `entity/PestProfile.ts`, `config/` | S | **yes** — 22 profiles; contact numbers verified against the agencies' own pages |
| 4 | Split the scorer: today's calculator becomes `UrgencyCalculator`; `PestPriorityCalculator` applies σ. `PriorityScore` keyed by (locality, pest) | `control/scoring/` | M | **yes** — and `ClusterRanking` became `PriorityRanking` with 4.1.14's new keys |
| 5 | Weight renormalisation when a driver is unavailable, + the existing `DriverContribution` breakdown extended per pest (4.1.10) | `control/scoring/` | S | **yes** — and the exclusion set is now the tier's drivers, not the whole enum. See `lab4/TEST-PLAN.md` §6.1 C1b |
| 6 | Critical override evaluator + AVS routing with crew dispatch suppressed | `control/WorkOrderController.ts` | M | **yes** — `CriticalOverrideEvaluator`, `ReferralController`, 8.1.14's refusal, both screens. **Wired 2026-09-17:** `CriticalEscalationNotifier` (4.4.9) and the resident referral notice (8.6.6). The override itself was reached by no production caller until then — `CrossPestScoringService` now evaluates it in the cycle |
| 7 | `VCORegistryGateway` — one-off CSV load, OneMap keyless geocode of 290 postal codes, cached to disk | `boundary/gateways/` | S | **yes** — plus `OperatorRegistryLoader`, the cache keyed by postal code, and 1.6.8's nearest-operator distance |
| 8 | `INaturalistGateway` + `ObservationIngestionJob` on the `ClusterIngestionJob` pattern, dropping `obscured=true` | `boundary/gateways/`, `control/ingestion/` | M | **yes** — one job per tier B pest; admissibility applied at the boundary, counted per rule |
| 9 | NEA Gravitrap feed `d_5d060d8b7838a15e8906fb22c50dbf51` as an eighth Tier A driver | `control/ingestion/` | S | **no — deliberately. See below** |

**Why step 9 is not built, and what it would take.**

It is the only step on this list that is not a generalisation. Steps 1 to 8 widen the model to more
pests without changing what a dengue score means; step 9 adds an eighth driver to tier A, which
changes every dengue score there is. Three things follow, and none of them is a reason not to do it
— only a reason not to do it quietly, as the last item of an unrelated pass:

1. **It contradicts 4.2.5 as currently written.** The compatibility test pins five v0.8 goldens, and
   an eighth tier A driver moves all five. Either the requirement gains a clause saying the freeze
   covers the *generalisation* and not later model revisions, or the goldens are re-cut against a
   new baseline. That is a requirements decision, not an implementation one.
2. **There are no requirements for it.** Groups 1.5 and 1.6 were written before their code; a
   Gravitrap feed has no group, no story and no acceptance criteria. Writing the code first would
   invert the order every other feed in this project followed.
3. **The weights would have to be re-derived.** 4.1.6 requires the tier A set to sum to 1.000, so an
   eighth driver is not an addition — it is a redistribution across all eight, and the current seven
   were argued for individually in §5.2.

The gateway itself is a day's work. The decision in front of it belongs to the team.

**Steps 1–6 deliver the entire generalised model with no new external dependency**, because Tier C
runs on entities that already exist. Steps 7–9 add evidence, not capability. If time runs short,
stop after 6 and the model is still complete and demonstrable.

**Documentation that must move with the code**, since traceability is separately marked in Lab 5:
`REQUIREMENTS.md` §4.1 (the scoring requirements are written against seven fixed drivers and must be
restated against the general form), the data dictionary (`PestProfile`, `pestType`, the enums), the
use case model (AVS as an actor; the override path as an extension), and `SCORING-SPEC.md` §1 (add a
pointer to this document rather than rewriting it).

---

## 9. What a reviewer should attack

- **σ is judgement, not measurement.** Twenty-two numbers derived from a four-factor rubric, with no
  outcome data behind them. Same honest position as `SCORING-SPEC.md` §3.1 — say it before being
  asked. They live in configuration and the team can change any of them without touching code.
- **Tier weight sets are three fixed profiles, not per-pest.** A deliberate simplification: 22 pests
  × bespoke weights is unmaintainable and unarguable. Per-pest overrides are possible in
  configuration if one pest genuinely needs it.
- **The rat is Tier C on iNaturalist grounds, but rats are the one pest where a government feed
  plausibly should exist.** NEA runs rodent surveillance and publishes none of it. Worth one
  sentence in the demo as a data-availability finding.
- **σ(Mosquito) = σ(Rat) = 1.00 means the two top pests are indistinguishable by severity.** Correct
  under the rubric, and arguably right, but it is the first place a grader will push.
- **`ExternalObservationDensity` mixes a naturalist's hobby with a municipal complaint stream.** The
  0.20 cap and the "recent wildlife activity" label are the mitigation, not a fix.

---

## 10. Verification log

Every figure in this document comes from a live pull on **2026-09-16**:

- data.gov.sg dataset API, pages 1–462, **4,615 datasets** screened by name, agency and description.
- `d_0921c2daa08b8bd846d2405c934da8c6` downloaded via `poll-download` → **290 VCO rows**, 290 with
  valid postal codes, 54 distinct postal sectors, top-5 concentration 28.6%, top streets counted.
- `d_8383572bdfd37d3586933c3ff5ec1922` (cleaning contractors) → **5 rows**, zone-level only.
- `api.inaturalist.org/v1/observations` — 22 taxa, all-time and 12-month counts, obscuring rates,
  positional accuracy (median 111 m over 50 snake records).
- OneMap `common/elastic/search` — **keyless geocoding confirmed working**, postal 528844 resolved.
- OpenStreetMap Overpass — `craft/shop/office=pest_control` and name matches in Singapore:
  **0 elements**.
- `nea.gov.sg/our-services/pest-control/overview` and
  `avs.nparks.gov.sg/wildlife/encountering-wildlife` — pest and wildlife taxonomies.

Nothing in §2, §3 or §5.3 is inferred from documentation alone.
