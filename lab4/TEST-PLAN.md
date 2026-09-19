# TEST PLAN — D-Fence

Lab 4 deliverable 3, started early. Version 0.3, 2026-09-16.

**Status.** This covers lab §3.2.1–3.2.4 for the parts of the system that are implemented. It is
started ahead of Lab 4 because the two subjects the lab asks for were *chosen at design time* rather
than found afterwards, and both are now real code that runs. What is not here is anything requiring a
database, an HTTP call or a browser — those tests follow the implementation.

**Everything in §2 to §4 has been executed.** Those Actual Output columns are transcribed from a real
run, not predicted: `npx vitest run`, 55 tests, 3 files, all passing.

**§6 was designed before the code, and is now partly executed.** v0.2 added the test design for the
cross-pest generalisation in `REQUIREMENTS.md` v0.9. v0.3 records what happened when it was built:
**§6.1 to §6.4 are executed and passing** — `tests/pest-compatibility.test.ts` (16 cases) and
`tests/pest-scoring.test.ts` (25 cases). §6.5 and §6.6 remain designed and not executed, because the
two external gateways they test are build steps 7 and 8 and are not written.

**The whole suite: `npx vitest run`, 804 tests in 39 files, 804 passing** — including
`tests/repository.test.ts`, which runs against live PostGIS and is the suite that caught the missing
schema described in §6.8. One case,
`rainfall.test.ts` J2, was failing when this pass began; it predated the v0.9 work and has since been
fixed. What it was is worth reading in §5, because it was not the defect it appeared to be.

---

## 1. What the lab asks for, and what is done

| Lab requirement | State |
|---|---|
| §3.2.1 Equivalence-class and boundary-value cases for **1 key control class** | **Done.** `PriorityScoringEngine`, 27 cases — `tests/priority-scoring.test.ts` |
| §3.2.1 (extension) EC/BV cases for the feed parser and driver bindings | **Done 2026-09-03.** `ClusterFeedParser` and `NormalisationFactory`, 32 cases — `tests/cluster-feed.test.ts`, designed in §2.5 |
| §3.2 (extension) Ingestion template + full scoring cycle, no network, no database | **Done 2026-09-03.** 20 cases — `tests/ingestion.test.ts`, designed in §2.6. Five added 2026-09-04 for 1.1.18's manual trigger |
| §3.2 (extension) The rainfall path — parsing, station assignment, accumulation, staleness | **Done 2026-09-03.** 18 cases — `tests/rainfall.test.ts`, designed in §2.7 |
| §3.2 (extension) The work-order lifecycle driven end to end | **Done 2026-09-03.** 27 cases — `tests/work-order.test.ts`, designed in §2.8 |
| §3.2 (extension) Community reporting, its boundaries and its join to §8 | **Done 2026-09-03.** 42 cases — `tests/report.test.ts`, designed in §2.9 |
| §3.2 (extension) Accounts, sessions, lock-out and staff provisioning | **Done 2026-09-03.** 38 cases — `tests/account.test.ts`, designed in §2.10 |
| §3.2 (extension) Saved locations, geocoding failure modes and the exposure band | **Done 2026-09-03.** 27 cases — `tests/location.test.ts`, designed in §2.11 |
| §3.2 (extension) Resident alerts: triggers, the daily cap, delivery and retries | **Done 2026-09-03.** 29 cases — `tests/alert.test.ts`, designed in §2.12 |
| §3.2 (extension) Map layers as an access surface, and the trend classification | **Done 2026-09-03.** 24 cases — `tests/map-trend.test.ts`, designed in §2.13 |
| §3.2 (extension) Dialog-map conformance, the route guard, navigation and field rules | **Done 2026-09-03.** 31 cases — `tests/client-navigation.test.ts`, designed in §2.14 |
| US-0.5 (§10.1) Performance obligations measured rather than asserted | **Done 2026-09-04.** 6 cases — `tests/performance.test.ts`, designed in §2.15; 4 more in `tests/performance-client.test.tsx` and a load run in `src/tools/load-check.ts`, designed in §2.26. **10.1.5 does not hold** — see §2.26 |
| US-1.4 (§1.3) The 24-hour forecast, region mapping and the heavy-rain flag | **Done 2026-09-03.** 26 cases — `tests/forecast.test.ts`, designed in §2.16 |
| US-1.5 (§1.4) Source health: the three-interval rule and the staleness marker | **Done 2026-09-03.** 17 cases — `tests/source-health.test.ts`, designed in §2.17 |
| US-2.5 (§2.4) The audit trail across the operational write paths | **Done 2026-09-03.** 10 cases — `tests/audit.test.ts`, designed in §2.18 |
| US-7.3 (§7.3) The five dashboard visualisations and their insufficient-data states | **Done 2026-09-03.** 21 cases — `tests/analytics.test.ts`, designed in §2.19 |
| US-6.1 (§6.1.6, §6.1.7) Linking a Telegram chat, and real delivery | **Done 2026-09-04.** 10 cases — `tests/telegram-link.test.ts`, designed in §2.20 |
| Regression (§8.3.14, §4.1.15) The Singapore calendar date, found by the clock | **Done 2026-09-04.** 7 cases — `tests/singapore-date.test.ts`, designed in §2.21 |
| US-0.4 (§10.3, §10.4) Deletion, the personal-data inventory and attribution | **Partly done 2026-09-04.** 16 cases — `tests/privacy.test.ts`, designed in §2.22 |
| US-10.x (§11) The twenty-seven screens, by audience | **Done 2026-09-04.** 64 cases — `tests/client-screens-{shared,resident,ops}.test.tsx`, designed in §2.23 |
| §3.2 (extension) The four Postgres repositories, against live PostGIS | **Done 2026-09-04.** 11 cases — `tests/repository.test.ts`, designed in §2.24 |
| §3.2.4 (extension) Acceptance runs over HTTP and through the served bundle | **Done 2026-09-04.** 49 + 9 checks — `src/tools/uat.ts`, `src/tools/client-uat.ts`, designed in §2.25 |
| §3.2.2 Basis-path cases for **2 methods with complex logic** | **Done.** `isTransitionPermitted` and `ClusterRanking.rank`, 15 cases — `tests/basis-path.test.ts`. The class is renamed `PriorityRanking` in the v0.9 design; the results in §3.2 predate the rename and the rename is an E11 build step, not a re-test |
| **4.2.5 the compatibility obligation** | **Done 2026-09-16.** 16 cases — `tests/pest-compatibility.test.ts`, designed in §6.1. Written first, before any other E11 code, as US-11.2 requires. Five v0.8 goldens reproduced bit-identically |
| **§4.4 the critical override, §4.3 evidence tiers, §8.6 referral** | **Done 2026-09-16.** 25 cases — `tests/pest-scoring.test.ts`, designed in §6.2 to §6.4 |
| §1.5, §1.6 — observation ingestion and the operator registry | **Designed 2026-09-16, not executed** — §6.5 and §6.6. The gateways are build steps 7 and 8 and are not written |
| §3.2.3 Minimise redundant cases while keeping coverage | Applied — see §4 |
| §3.2.4 Execute and document `Test Input / Expected / Actual` | **Done** for the above — §2.4 and §3.3 |
| Integration and end-to-end tests | **Done 2026-09-04.** The §2.6, §2.8 and §2.9 suites are integration tests in all but name — several controllers, real stores, no fakes below the gateway. Above them, §2.25's two harnesses run against a live server and a live database: the API path end to end, and the served bundle driven in jsdom. What remains untested is rendering, which needs a real browser and a human — see §5 |

**Why these two subjects.** `PriorityScoringEngine` is the computational core — the class the
module's "data processing" criterion is judged on — and requirement 4.1.8 states its thresholds
precisely enough to test *at* the boundary rather than around it. `isTransitionPermitted` is a single
method with a bounded branch structure *because* the work-order machine was built table-driven
instead of as a GoF State hierarchy; that design choice is what makes this test tractable, and it is
recorded in `lab3/DESIGN-MODEL.md` §4.

---

## 2. Equivalence-class and boundary-value design — `PriorityScoringEngine`

### 2.1 Equivalence classes for `assignTier`

Requirement 4.1.8 partitions the score domain itself, so the classes are read off the requirement
rather than invented — which is the point of writing requirements the way §2 of this project does.

| Class | Range | Expected tier | Valid? |
|---|---|---|---|
| EC1 | score < 40.0 | Low | valid |
| EC2 | 40.0 ≤ score ≤ 69.9 | Medium | valid |
| EC3 | score ≥ 70.0 | High | valid |
| EC4 | score < 0 | — | invalid; 4.1.7 bounds the scale at 0 |
| EC5 | score > 100 | — | invalid; 4.1.7 bounds the scale at 100 |

EC4 and EC5 are deliberately **not** given test cases. They cannot be produced by `applyWeights`,
whose output is a weighted mean of values on [0, 1] scaled by 100. Testing them would assert
behaviour no requirement defines. This is §3.2.3 — a case that cannot fail is not coverage.

### 2.2 Boundary values

Three cases per threshold: just below, exactly on, just above. **The "exactly on" cases are the ones
that carry the weight.** 4.1.8 says "70.0 or above" and "between 40.0 and 69.9", so 40.0 is Medium
and 70.0 is High. An implementation written with `>` instead of `>=` passes every equivalence-class
case in §2.1 and fails exactly here — which is the definition of a boundary defect.

### 2.3 Normalisation strategies

4.1.4 requires every driver on [0, 1]. Per strategy the classes are below range, in range, above
range, plus the degenerate case where the observed range has zero width. The weighted sum in 4.1.7
assumes normalised inputs, so a driver escaping [0, 1] would silently outvote the other six — that is
the failure these cases exist to catch.

### 2.4 Executed results

| # | Method | Test input | Expected output | Actual output |
|---|---|---|---|---|
| EC1 | `assignTier` | 12.3 | Low | Low ✓ |
| EC2 | `assignTier` | 55.0 | Medium | Medium ✓ |
| EC3 | `assignTier` | 88.8 | High | High ✓ |
| BV1 | `assignTier` | 39.9 | Low | Low ✓ |
| **BV2** | `assignTier` | **40.0** | **Medium** | Medium ✓ |
| BV3 | `assignTier` | 40.1 | Medium | Medium ✓ |
| BV4 | `assignTier` | 69.9 | Medium | Medium ✓ |
| **BV5** | `assignTier` | **70.0** | **High** | High ✓ |
| BV6 | `assignTier` | 70.1 | High | High ✓ |
| BV7 | `assignTier` | 0 / 100 | Low / High | Low / High ✓ |
| BV8 | `assignTier` | 75, thresholds configured 90/50 | Medium | Medium ✓ |
| N1 | `MinMaxNormalisation` | 0, 50, 100, 10000, −1 over range [0,100] | 0, 0.5, 1, 1, 0 | as expected ✓ |
| N2 | `MinMaxNormalisation` | 7 over range [7,7] | 0 | 0 ✓ |
| N3 | `LogScaleNormalisation` | −5, 40 over range [0,40] | 0, ≈1 | 0, ≈1 ✓ |
| N4 | `LogScaleNormalisation` | 10 vs 20 | f(20) > f(10) and f(20) < 2·f(10) | holds ✓ |
| N5 | `CappedLinearNormalisation` | 0, 25, 50, 200 mm | 0, 0.5, 1, 1 | as expected ✓ |
| N6 | `RecencyDecayNormalisation` | 0, 30, 60, 90 days | 0, 0.5, 1, 1 | as expected ✓ |
| N7 | `RecencyDecayNormalisation` | 0 vs 45 days | f(0) < f(45) | holds ✓ |
| N8 | `PremisesMixNormalisation` | 0.42, 0, 1 | 0.42, 0, 1 unchanged | unchanged ✓ |
| N9 | `PremisesMixNormalisation` | 1.5, −0.1 | throws | throws ✓ |
| N10 | all five strategies | `driver()` | the seven drivers of 4.1.3 | as expected ✓ |
| W1 | `ConfigSet.validate` | weights 0.5 + 0.5 | accepted | accepted ✓ |
| W2 | `ConfigSet.validate` | weights summing 0.9 | rejected | rejected ✓ |
| W3 | `ConfigSet.validate` | weights summing 1.4 | rejected | rejected ✓ |
| W4 | `ConfigSet.validate` | no weights | rejected | rejected ✓ |
| W5 | `ConfigSet.validate` | seven realistic weights summing 1.0 in floating point | accepted | accepted ✓ |
| W6 | `ConfigSet.validate` | thresholds 40 high / 70 medium | rejected | rejected ✓ |

**BV8 and W5 are the two cases worth pointing at in a viva.** BV8 changes the configured thresholds
and expects a different tier for the same score — a hard-coded `70` passes every other tier case and
fails only this one, so it is what actually tests 4.1.9. W5 sums seven realistic weights in binary
floating point, where `0.3 + 0.2 + 0.15 + 0.1 + 0.1 + 0.1 + 0.05` does not land exactly on 1.0; a
strict equality check would reject a correct configuration, so the tolerance is tested, not assumed.

### 2.5 Second EC/BV subject — `ClusterFeedParser` and the driver bindings

Added 2026-09-03, after the NEA payload was read field-for-field for the first time. The lab asks for
one key control class and `PriorityScoringEngine` remains that subject; this suite exists because the
*feed's real shape* decides behaviour in two places the engine tests cannot reach, and because
writing it caught a defect that had survived three reviews.

**The defect it caught.** Requirement 4.1.3 names seven drivers. Only five had a normalisation
strategy: `Rainfall72h` and `VerifiedOpenReportCount` were bound to nothing, so a full scoring cycle
would have thrown at run time rather than at wiring time. `NormalisationFactory.build()` now asserts
completeness at startup, and case **F1** is the test that fails if a driver is ever added to 4.1.3
without a method.

**Equivalence classes, by requirement.**

| Requirement | Classes |
|---|---|
| 1.1.23 habitat lists | populated text · empty string · null/undefined · trailing-comma text |
| 1.1.15 premises mix | all habitats in homes (0) · all outside homes (1) · mixed · none listed |
| 1.1.3 rejection | one invalid class per required field: OBJECTID, LOCALITY, CASE_SIZE, geometry |
| 1.1.20 conditional download | unchanged stamp · moved stamp · no recorded stamp · unreadable stamp |
| 1.1.22 change detection | equal checksum · different checksum · unseen feature · absent checksum |

Fixtures are the values NEA actually published on 2026-09-03 — the 258-case Countryside Rd cluster
with habitat text in all three fields, and the 2-case Punggol Dr cluster with none — so a failure
means either the code broke or the publisher changed the contract. Both are worth knowing.

#### 2.5.1 Executed results

| # | Method | Test input | Expected output | Actual output |
|---|---|---|---|---|
| H1 | `parseHabitatList` | `"Domestic container, Bin, Flower pot"` | 3 named habitats | 3 ✓ |
| H2 | `parseHabitatList` | `null` / `undefined` | `[]` | `[]` ✓ |
| H3 | `parseHabitatList` | `"Bin, Vase, "` | 2, not 3 | 2 ✓ |
| H4 | `parseHabitatList` | `""` | `[]` | `[]` ✓ |
| **P1** | `computePremisesMix` | 2 home, 0 public, 0 construction | **0** | 0 ✓ |
| **P2** | `computePremisesMix` | 0 home, 1 public, 1 construction | **1** | 1 ✓ |
| P3 | `computePremisesMix` | 2 home, 1 public, 1 construction | 0.5 | 0.5 ✓ |
| **P4** | `computePremisesMix` | all fields empty | **0**, no division by zero | 0 ✓ |
| P5 | `parseFeature` | real Countryside Rd feature | mix 0.5, cases 258 | as expected ✓ |
| P6 | `parseFeature` | real Punggol Dr feature (no habitat text) | mix 0 | 0 ✓ |
| R1–R4 | `parseFeature` | each required field removed in turn | rejected, naming that field | as expected ✓ |
| R5 | `parseFeature` | `CASE_SIZE: 0` | accepted — 0 is data, not absence | accepted ✓ |
| D1 | `shouldDownload` | stamp equal to the recorded one | `false` | `false` ✓ |
| D2 | `shouldDownload` | stamp later than the recorded one | `true` | `true` ✓ |
| D3 | `shouldDownload` | nothing recorded (restart) | `true` | `true` ✓ |
| **D4** | `shouldDownload` | metadata stamp null / empty | **`true`** — fail towards fetching | `true` ✓ |
| C1 | `featureChanged` | identical INC_CRC | `false` | `false` ✓ |
| C2 | `featureChanged` | different INC_CRC | `true` | `true` ✓ |
| C3 | `featureChanged` | feature never seen | `true` | `true` ✓ |
| **C4** | `featureChanged` | checksum absent from payload | **`true`** — unknown is not unchanged | `true` ✓ |
| T1 | `parseFeedTimestamp` | `"20260828155154"` | 2026-08-28T07:51:54Z | as expected ✓ |
| T2 | `parseFeedTimestamp` | `"28-08-2026"` / `null` | `null`, not Invalid Date | `null` ✓ |
| **F1** | `NormalisationFactory.build` | — | all 7 drivers of 4.1.3 bound | 7 bound ✓ |
| F2 | factory bindings | 60 mm on each rainfall driver | 1.0 (24 h) and 0.5 (72 h) | as expected ✓ |
| F3 | factory bindings | 61 cases over an observed max of 258 | ≈0.743 (log, not 0.230 min-max) | 0.743 ✓ |
| F4 | factory bindings | 90 days untreated (4.1.16 default) | 1.0, saturated | 1.0 ✓ |
| F5 | factory bindings | cap reconfigured to 25 mm | 25 mm now saturates | saturates ✓ |
| **F6** | factory bindings | 61 cases, observed max 258 today vs 500 tomorrow | **the same value both days** | identical ✓ |
| F7 | factory bindings | 300 and 900 cases against a 300 reference | 1.0, saturated | 1.0 ✓ |

**F6 is the case that encodes a design decision.** Both log drivers normalise against a *fixed*
reference ceiling rather than the day's observed maximum, because 4.1.11 stores every score as
history and 4.1.17 compares scores across cycles — a ceiling that moved with today's cluster
population would make yesterday's score mean something different. F6 fails the moment someone
"simplifies" the strategy back to using `ctx.observedMax`.

**D4 and C4 are the two cases worth pointing at in a viva.** Both encode the same rule: an unknown
state must never be recorded as "unchanged". A parser that returned `false` in either case would pass
every happy-path test and silently freeze the cluster data the first time a metadata field went
missing — a failure with no error message anywhere.

**Execution.** `npm test` — 6 files, **120 cases, all passing**, `tsc --strict` clean (2026-09-03).

### 2.7 Fourth subject — the rainfall path (`tests/rainfall.test.ts`)

Added 2026-09-03 with the implementation of 1.2.x. **Every case runs against a fixture, and that is
the point:** Singapore was dry on 1–3 September 2026 — three sampled days returned zero across every
station and every five-minute block — so a test that asked the live API to prove the accumulation
works would have passed while proving nothing. The fixture carries rain; reality currently does not.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| R1 | A station without coordinates is dropped, not defaulted to (0, 0) | 1.2.2 | ✓ |
| **R3** | A missing `value` is skipped — "did not report" is not "reported no rain" | 1.2.3 | ✓ |
| R4 | A reading older than 30 minutes is discarded | 1.2.4 | ✓ |
| A1 | Exactly the three nearest stations, nearest first, ties broken by id | 1.2.5 | ✓ |
| **A2** | The nearest station dominates the weighted mean (an unweighted mean would give 3.33) | 1.2.6 | ✓ |
| A3 | A station at the centroid takes the value outright rather than dividing by zero | 1.2.6 | ✓ |
| A4 | No reading from any assigned station gives **null**, never 0 | 4.1.12 | ✓ |
| W1 | 24-hour and 72-hour windows sum only what falls inside them | 1.2.7, 1.2.8 | ✓ |
| W2 | A reading exactly on the 24-hour boundary is inside the window | 1.2.7 | ✓ |
| **W3** | Windows are measured from the cycle time, so a stopped feed shows a *falling* total | 1.2.7 | ✓ |
| W4 | Nothing accepted for 30 minutes marks rainfall stale | 1.2.10 | ✓ |
| W5 | The observed all-dry case scores 0 and is **not** stale — 0 is a measurement | 1.2.10 | ✓ |
| J1 | The job stores stations and fresh readings and reports what it discarded | 1.2.2–1.2.4 | ✓ |
| **J2** | An overlapping backfill page cannot double-count a reading | 1.2.7 | ✓ |
| J3 | The API's `date` is a Singapore calendar date, not a UTC one | 1.2.x | ✓ |
| H1–H2 | `Retry-After` is honoured and capped; absent falls back to backoff | 10.4.6 | ✓ |

**W3, J2 and A4 are the three to point at.** W3 is the difference between "no rain fell" and "we
stopped hearing" — measuring the window from the newest *reading* would freeze the accumulation at
its last value forever. J2 protects an accumulation from a re-run backfill, which would otherwise
inflate a scoring driver silently. A4 is the same principle as D4 and C4 elsewhere in this plan:
an unknown is never a zero.

### 2.6 Third subject — the ingestion template and a full scoring cycle (`tests/ingestion.test.ts`)

Added 2026-09-03 with the implementation. These are the cases that only exist once the pieces run
together, and they run with **no network and no database** — against a fake `ClusterSource` and the
in-memory stores. That is the claim the ports layer was built to make true (10.6.3), demonstrated
rather than asserted.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| I1 | First cycle downloads, stores two features, rejects the third **by name** | 1.1.3, 1.1.4, 1.1.17 | ✓ |
| **I2** | Second cycle with an unmoved stamp records UNCHANGED and **does not download** | 1.1.20, 1.1.21 | ✓ |
| I3 | A moved stamp downloads again; case delta 42, class GROWN | 1.1.8, 1.1.9 | ✓ |
| I4 | A failed fetch marks the source stale and **keeps the stored data** | 10.2.2, 10.2.4 | ✓ |
| **I5** | The publisher stamp is saved only after a successful store, so a failed cycle retries | 1.1.20 | ✓ |
| S1 | The 258-case cluster outranks the 2-case cluster; rank starts at 1 | 4.1.14 | ✓ |
| S2 | All seven drivers present → not degraded, breakdown has 7 entries | 4.1.10, 4.1.13 | ✓ |
| **S3** | A stale rainfall feed degrades, names the drivers, renormalises the rest | 4.1.12, 4.1.19, 4.1.20 | ✓ |
| S4 | A treatment lowers the score, all else equal | 4.1.17 | ✓ |
| S5 | Every cycle is kept as history; the top score explains itself | 4.1.11, 4.1.18 | ✓ |
| S6 | A cluster with no habitat text still scores, premises mix 0 | 1.1.16 | ✓ |
| C1 | `.env` parsing keeps a JWT intact, ignores comments and blanks | 10.3.4 | ✓ |
| C2 | The shipped default configuration is valid and complete | 4.1.3, 4.1.6 | ✓ |
| C3–C4 | A missing or unknown driver is rejected **at startup** | 4.1.3, 4.1.5 | ✓ |

**I5 and S3 are the two worth pointing at.** I5 encodes an ordering that is easy to get wrong: save
the publisher stamp before the data is stored and a failed cycle is never retried, because the next
cycle thinks it already has that version. S3 is the graceful-degradation argument in one case.

**S5 caught a real defect while it was being written.** `InMemoryPriorityScoreStore.latest()`
grouped the newest cycle by `computedAt` equality; two cycles that run inside the same millisecond
share a timestamp, so it returned both and the dashboard would have shown every cluster twice. The
store now keeps scores **by cycle**. The note matters beyond the fake: the Postgres implementation
must key on a cycle id for the same reason, not on `MAX(computed_at)`.

#### 2.6.1 The manual ingestion trigger (added 2026-09-04)

1.1.18 was traced by US-1.6 and implemented by nothing: there was no endpoint, and the Data Sources
screen had no controls. `IngestionController` had been a `not implemented` skeleton since Lab 3.

The five cases use a fake job rather than a real one, because what is under test is the
controller's contract — who may run it, what trigger it records, that scoring follows, and that a
second concurrent run is refused — none of which depend on any source's parsing.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| M1 | Every source runs, recorded as **MANUAL**, and scoring follows **once** — not once per source | 1.1.18 | ✓ |
| **M2** | A Resident is refused, and **no source is touched** — the refusal precedes the work | 2.3.4, 2.3.7 | ✓ |
| M3 | One named source runs alone, so checking a recovering feed costs only that feed | 1.1.18 | ✓ |
| **M4** | A failed rainfall run marks its drivers stale rather than scoring them as zero | 10.2.2, 4.1.12 | ✓ |
| M5 | A second run started while the first is in flight is refused, not queued — and the guard clears | 1.1.18 | ✓ |

**M2 is the case that would be easy to write backwards.** Authorising *after* doing the work still
returns a refusal to the caller, and still spends the department's quota against three public APIs
on behalf of someone who was not allowed to ask. The assertion is therefore on the jobs, not only
on the exception.

**M5's second half matters as much as its first.** The guard is released in a `finally`, so a job
that throws past its own catch does not jam the trigger for the life of the process; the case runs
a third time after the first completes to prove it.

### 2.8 Fourth subject - the work-order lifecycle (`tests/work-order.test.ts`)

Added 2026-09-03 with the implementation. The basis-path suite (§3) already paths over
`isTransitionPermitted` as a pure predicate; these are the cases that appear only once the machine
is **driven** — the guards, the assignee restriction, and the loop the demo is built around.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| C1 | A new work order starts Created; creation is not a transition | 8.3.15 | ✓ |
| C2–C4 | A past scheduled date, over-long instructions and an unknown cluster are refused | 8.1.1, 8.1.4, 8.1.6 | ✓ |
| **C5** | A second open order of the same task type is refused **and hands back the one that blocked it** | 8.1.11, 8.1.12 | ✓ |
| C6 | A different task type on the same cluster is allowed | 8.1.11 | ✓ |
| **D1** | The daily list excludes clusters that already have an open order | 8.1.7 | ✓ |
| **L2** | A crew member who is not the assignee cannot complete the job — the role check passes and the move is still refused | 8.3.4, 8.3.20 | ✓ |
| L3–L6 | Completion without evidence, rejection without a reason, cancellation without a reason, and a move out of a terminal state are each refused **before anything is written** | 8.3.6, 8.3.10, 8.3.16, 8.3.18 | ✓ |
| **E1** | The treatment record is dated to the **completion**, not the verification | 8.3.12 | ✓ |
| E2 | The recency driver moves off its 90-day default once a record exists | 4.1.15, 4.1.16 | ✓ |
| **E3** | The cluster scores **lower** after treatment — US-8.8 end to end | 4.1.17 | ✓ |

**L2 and E3 are the two to point at.** L2 is a rule a role matrix cannot express: `OTHER_CREW`
holds every permission `CREW` holds, so without the `assigneeOnly` rule one crew member completes
another's job and the audit trail says it was legitimate. E3 is the ninety seconds of the demo,
asserted rather than described.

**A design consequence recorded here because a test forced it.** A completion can be rejected,
resumed and re-submitted, so the rejection reason belongs to the *attempt* — an append-only
`CompletionEvidence` — not to the work order. Held on the work order, the second rejection would
overwrite the first one's history, which is exactly the record a disputed refusal needs.

### 2.9 Fifth subject - community reporting (`tests/report.test.ts`)

Added 2026-09-03 with the implementation. This suite carries the two judgement numbers flagged in
`REQUIREMENTS.md` §13 — **50 metres and 24 hours** — and the join between §5 and §8.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| S1–S2 | A valid report is Submitted, with reporter, timestamp, and an initial history entry | 5.1.10, 5.2.2 | ✓ |
| **S3** | A 500-character description is accepted; 501 is refused | 5.1.4 (BV) | ✓ |
| **S4** | Three photographs accepted, a fourth refused | 5.1.5 (BV) | ✓ |
| **S5** | Exactly 5 MB accepted; 5 MB + 1 byte and a GIF refused | 5.1.6 (BV) | ✓ |
| S6 | A type outside the five is refused, not coerced to Other | 5.1.3 | ✓ |
| S7 | A crew member has no `report:create` and is refused | 2.3.5 | ✓ |
| L1 | A point inside an active cluster binds to that cluster | 5.1.7 | ✓ |
| **L2** | A point 600 m away takes the **locality** and leaves `clusterId` null | 5.1.8 | ✓ |
| L3 | No locality within 1 km gives Unassigned, and the status is still Submitted | 5.1.9 | ✓ |
| **D1** | 49 m is a duplicate; 51 m is not | 5.1.11 (BV) | ✓ |
| **D2** | Exactly 50 m **is** a duplicate — the radius is inclusive | 5.1.11 (BV) | ✓ |
| **D3** | 23 hours is a duplicate; 25 hours is not | 5.1.11 (BV) | ✓ |
| D4–D5 | A different type, or a settled report, is not a duplicate | 5.1.11 | ✓ |
| D6 | The refusal carries the existing report, which is what 5.1.12 offers | 5.1.12 | ✓ |
| **D7** | Confirming increments once per resident; a second attempt is refused | 5.1.13, 5.1.14 | ✓ |
| D8–D9 | A reporter cannot confirm their own report; a settled report cannot be confirmed | 5.1.13 | ✓ |
| M1–M2 | The queue is oldest-first and filters by cluster and by type, server-side | 5.3.1–5.3.3 | ✓ |
| M3 | Verifying records moderator id and timestamp | 5.3.4 | ✓ |
| **M4** | A nine-character rejection reason is refused **and the status is untouched**; ten is accepted | 5.2.4 (BV) | ✓ |
| M5–M6 | A Resident cannot moderate; a settled report has no outgoing move | 5.2.3, 5.2.1 | ✓ |
| **C1–C2** | Submitted and Rejected reports do **not** reach the score; Verified does | 5.2.5 | ✓ |
| **C3** | Every active cluster appears in the count map, with 0 rather than absent | 4.1.12 | ✓ |
| C4 | A locality-bound report enters no cluster's count | 5.1.8 | ✓ |
| **V1–V2** | Photographs are withheld from other residents until Verified; the reporter sees their own | 5.3.5 | ✓ |
| V3–V4 | The public projection carries no reporter identity; a resident lists only their own | 5.2.9, 2.3.2 | ✓ |
| N1–N2 | Every status change notifies the reporter and nobody else, with the moderator's reason | 5.2.8 | ✓ |
| **J1–J2** | Assigning the work order moves linked reports to Actioned, and they still count | 5.2.6, 5.2.5 | ✓ |
| **J3** | Verifying it closes them, tells the residents, and removes them from the driver | 5.2.7, 8.5.1, 8.5.2 | ✓ |
| **J4** | Cancelling it restores each report to the status it held before | 8.3.21 | ✓ |
| J5 | Only verified reports may be linked to a work order | 8.1.13 | ✓ |
| B1–B2 | The dashboard raises the moderation backlog with its age, and counts verified reports | 7.5.3 | ✓ |

**C1, D2 and J4 are the three to point at.** C1 is the reason moderation exists at all: the
community driver is the only path by which a member of the public can move an operational
decision, and the test states exactly which statuses may take it. D2 records a decision the prose
leaves open — "within 50 metres" is read as inclusive — so the boundary is a choice on the record
rather than an accident of a comparison operator. J4 is the requirement that could most easily
have been faked: 8.3.21 says a cancelled work order returns its reports to their **prior** status,
and the implementation reads that from the append-only history rather than assuming Verified,
because a report can be actioned, restored and actioned again.

### 2.10 Sixth subject - accounts, sessions and lock-out (`tests/account.test.ts`)

Added 2026-09-03 with the implementation. §2.1 states four numbers — eight characters, five
attempts, fifteen minutes, twenty-four hours — and every one of them is tested at its edge. The
other half of the suite is about **what a refusal says**, because 2.3.7 (a refusal carries no
detail) and 10.5.3 (an error states cause and remedy) pull in opposite directions at a sign-in form.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| R1 | A self-registered account is a Resident, unverified, active | 2.2.2, 2.1.6 | ✓ |
| **R2** | Seven characters refused, eight accepted | 2.1.2 (BV) | ✓ |
| R3 | Letters-only and digits-only passwords refused | 2.1.3 | ✓ |
| R4–R5 | A duplicate address is refused, and case does not evade the check | 2.1.4 | ✓ |
| R6–R7 | A verification token is issued; the password never reaches the account row | 2.1.5, 10.3.1 | ✓ |
| A1 | An unverified account cannot sign in, and is told why | 2.1.6 | ✓ |
| A2 | A verified account gets a session token | 2.1.7, 2.1.8 | ✓ |
| **A3** | An unknown address and a wrong password give the **same** message | 2.3.7 | ✓ |
| **A4** | The fifth failure locks the account; the fourth does not | 2.1.10 (BV) | ✓ |
| **A5** | A locked account is refused **even with the right password** | 2.1.10 | ✓ |
| **A6** | The lock expires at fifteen minutes, not before | 2.1.10 (BV) | ✓ |
| **A7** | Failures more than fifteen minutes apart are not consecutive | 2.1.10 (BV) | ✓ |
| A8–A9 | Success clears the run; a deactivated account cannot sign in | 2.1.10, 2.2.5 | ✓ |
| S1–S2 | A token resolves to its account; an unknown token resolves to **null**, never a default role | 2.1.8, 2.3.6 | ✓ |
| **S3** | Twenty-four hours of inactivity expires a session; a moment less does not | 2.1.9 (BV) | ✓ |
| **S4** | Using a session extends it — 2.1.9 is inactivity, not age | 2.1.9 | ✓ |
| S5 | Signing out ends the session immediately | 2.1.12 | ✓ |
| **S6** | Deactivation invalidates a **live** session on the next request | 2.2.5 | ✓ |
| S7–S8 | An expired session is not revived; terminated and expired are distinguishable | 2.1.9, 2.1.12 | ✓ |
| P1 | A reset request for an unknown address succeeds silently | 2.1.11 | ✓ |
| P2–P4 | The link is single-use, the new password obeys 2.1.2/2.1.3, and the old one stops working | 2.1.11 | ✓ |
| T1 | A manager-created staff account is already verified and can sign in | 2.2.3 | ✓ |
| T2–T3 | Only a manager provisions staff; a Resident cannot be created this way | 2.2.3, 2.2.2 | ✓ |
| T4 | Deactivation ends live sessions and reports how many | 2.2.4, 2.2.5 | ✓ |
| **T5** | A manager cannot deactivate themselves | — (added) | ✓ |
| **T6** | Reactivation restores sign-in | 2.2.4 | ✓ |
| T7 | The assignable crew list excludes deactivated members | 8.2.2, 8.2.3 | ✓ |
| U1–U3 | Creation, sign-in and deactivation are audited; a refusal is distinguishable; the log is append-only from outside | 2.4.1, 2.3.8, 2.4.2 | ✓ |

**A3, A5 and S6 are the three to point at.** A3 is where the two error requirements were reconciled:
a wrong password and an unknown address must say the same thing, or the sign-in form becomes a
directory of who has registered — while a locked, unverified or deactivated account, which the
caller has already proved they can reach, is told exactly what is wrong. A5 is the lock-out being
worth having: five wrong guesses that still leave the door open to a sixth right one is not a
lock. S6 is the difference between deactivation taking effect now and taking effect tomorrow —
sessions are terminated in the same call, so a crew member deactivated at noon cannot keep working
from an open tab.

**Two defects were found by writing these cases.**

1. **`reactivateAccount` never re-enabled the provider identity** (T6). Deactivation disables the
   account row *and* the provider user; reactivation restored only the row, so a reinstated account
   read as active and failed every sign-in. `AuthProvider` had no `enableUser` at all — the port
   was missing the inverse of an operation it already had, which is the kind of asymmetry that is
   invisible until something exercises the round trip.
2. **The first version of S3 tested the wrong thing.** Checking just inside the twenty-four-hour
   window *extended* the session, so the check just outside it was measuring a two-second-old
   session and passed for the wrong reason. Two separate sessions are needed to test the two edges
   — which is the requirement (2.1.9 is inactivity, not age) demonstrating itself.

### 2.11 Seventh subject - saved locations, geocoding and exposure (`tests/location.test.ts`)

Added 2026-09-03 with the implementation. Two things carry this suite.

**The 150 m band (3.1.9) is measured to a cluster boundary, not to its centre.** The cases build a
square cluster 400 m on a side and check 149, 150 and 151 metres from its *edge*. That is only a
meaningful test because the distance is computed the way the requirement means it — measured from
the centroid, a home a hundred metres outside a large cluster reads as three hundred metres away
and is told it is CLEAR.

**The two geocoding failures must not be the same sentence.** 3.1.13 says "no match was found" and
3.1.17 says "temporarily unavailable", and collapsing them is the easiest defect in the system to
write by accident: it tells a resident their home does not exist every time a token lapses.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| G1 | Candidates carry an address a person can recognise, not bare coordinates | 3.1.3, 3.1.4 | ✓ |
| **G2** | At most five candidates are presented | 3.1.4 (BV) | ✓ |
| G3 | No result raises "no match was found" | 3.1.5, 3.1.13 | ✓ |
| **G4** | A failed lookup says **unavailable**, and is not an AddressNotFound | 3.1.17 | ✓ |
| G5–G7 | An auth failure raises a source-health warning; a good refresh clears it; a failed one does not | 3.1.14–3.1.16 | ✓ |
| L1 | The typed text and the confirmed address are both kept | 3.1.2, 3.1.4 | ✓ |
| **L2–L3** | Five locations allowed, a sixth refused, and the limit is per resident | 3.1.1 (BV) | ✓ |
| L4 | A label outside the four is refused | 3.1.6 | ✓ |
| **L5–L6** | 40 characters accepted, 41 refused; an omitted name falls back to the label | 3.1.7 (BV) | ✓ |
| L7–L8 | A resident sees only their own; a crew member has none at all | 2.3.1, 2.3.5 | ✓ |
| **L9** | Deleting a location deletes its alert subscriptions | 3.1.11, 3.1.12 | ✓ |
| L10 | One resident cannot delete another's location | 2.3.1 | ✓ |
| E1 | Inside a boundary is IN_CLUSTER at distance 0 | 3.1.9 | ✓ |
| **E2–E3** | 149 m is WITHIN_150M, 151 m is CLEAR, and exactly 150 m is **inside** the band | 3.1.9 (BV) | ✓ |
| **E4** | Distance is measured to the boundary, not the centroid | 3.1.9 | ✓ |
| E5 | A CLEAR location still reports the nearest cluster and its case size | 3.1.10 | ✓ |
| **E6–E7** | The feed timestamp and the evaluation time are separate; an unevaluated location claims neither | 3.1.10 | ✓ |
| **E8–E9** | Re-evaluation reports which locations *changed* status, and only those | 3.1.8, 6.1.2 | ✓ |
| E10 | Every resident's locations are re-evaluated on a cycle | 3.1.8 | ✓ |

**E4, E6 and G4 are the three to point at.** E4 is the geometry decision made visible: the
in-memory locator projects to a local plane and measures point-to-segment distance, because a
150 m band computed from centroids means something different for every cluster depending on its
size. E6 is two facts a card must not merge — "we checked at 12:00" and "against a feed published
at 10:06" — and E7 is its corollary: an unevaluated location reports `null`, because a timestamp
of *now* would read as "checked just now and found clear". G4 is the failure separation above.

**Verified live.** The running server geocoded postal code 730123 through OneMap to
`123 MARSILING RISE SINGAPORE 730123`, saved it, and evaluated it against the fifteen active NEA
clusters: CLEAR, nearest cluster **Woodlands Ring Rd (Blk 655, 659)** at 1,992 m with 2 cases. A
nonsense address returned 404 rather than 503, which is 3.1.13 and 3.1.17 behaving differently in
production rather than only in a test.

### 2.12 Eighth subject - resident alerts (`tests/alert.test.ts`)

Added 2026-09-03 with the implementation. Every rule tested here exists to stop the feature
becoming spam, which is the only way an alert feature fails in practice.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| T1 | Becoming IN_CLUSTER generates an alert | 6.1.2 | ✓ |
| **T2** | *Being* IN_CLUSTER without changing generates nothing — the transition is the event | 6.1.2 | ✓ |
| **T3–T4** | No subscription, or a disabled one, produces nothing | 6.1.1 | ✓ |
| T5 | Muting one trigger leaves the others working | 6.1.1 | ✓ |
| **T6** | Growth of five alerts, four does not | 6.1.3, 6.1.4 (BV) | ✓ |
| T7 | A resident may raise their own threshold | 6.1.3 | ✓ |
| T8 | Heavy rain forecast for a containing cluster alerts | 6.1.5 | ✓ |
| **T9** | Growth in a cluster a location is only *near* does not alert | 6.1.3 | ✓ |
| C1–C2 | A second alert of the same type inside 24 hours is suppressed, and allowed after | 6.1.9 (BV) | ✓ |
| C3 | A different trigger type is not capped by the first | 6.1.9 | ✓ |
| **C4** | The cap holds **within a single batch**, not only against yesterday | 6.1.9 | ✓ |
| **C5** | A FAILED delivery does not consume the day's allowance | 6.1.9, 6.1.11 | ✓ |
| D1 | The message carries all five required elements | 6.1.8 | ✓ |
| D2–D3 | A send is logged Sent; an account with no linked chat is **Suppressed, not Failed** | 6.1.6, 6.1.10 | ✓ |
| **D4** | Two retries at five-minute intervals, then FAILED — and no fourth attempt | 6.1.11 | ✓ |
| D5 | A retry that succeeds records Sent and stops retrying | 6.1.11 | ✓ |
| D6 | Recipient, trigger, timestamp and outcome are all logged | 6.1.10 | ✓ |
| K1–K3 | A link code links the chat, is single-use, and expires at fifteen minutes | 6.1.7 (BV) | ✓ |
| **K4** | A wrong code is consumed anyway, so retrying cannot brute-force it | 6.1.7 | ✓ |
| P1 | The first preference update creates the subscription with the default threshold | 6.1.4 | ✓ |
| P2–P5 | Another resident's location, a threshold below one, an empty trigger list and an unknown location are all refused | 2.3.1, 6.1.1, 6.1.3 | ✓ |

**T2, C4 and D3 are the three to point at.** T2 is the difference between an alert feature and a
nuisance: 6.1.2 says "changes to IN_CLUSTER", and alerting on the *state* would re-send every hour
for as long as the cluster stands. C4 is a cap that a naive implementation gets half right —
checking the store catches yesterday's alert and misses the second one in the same batch, because
nothing has been written yet. D3 is a distinction 6.1.10's log depends on: an account with no
linked Telegram chat is `Suppressed`, because nothing went wrong and there was simply nowhere to
send it, whereas `Failed` means we tried and could not.

**Testable because the schedule is a port.** 6.1.11's five-minute retry interval is asserted by a
`RetryScheduler` the test controls; a suite that actually waited fifteen minutes is a suite nobody
runs, and an interval nobody asserts is an interval that silently becomes fifty milliseconds.

### 2.13 Ninth subject - the map, the trend and the history (`tests/map-trend.test.ts`)

Added 2026-09-03 with the implementation. Two halves, and they are tested for different reasons.

**`TrendAnalyser.classify` is the only judgement in §9** — every other requirement there displays
a fact — so it is a pure function tested at its band edges, the way `assignTier` is. The band
itself (±10% over the fortnight) is a judgement recorded in the code, because 9.1.10 names three
classes and does not say where the lines fall.

**The layers are an access-control surface wearing map clothes.** 9.1.4 and 9.1.5 read as display
rules and are really §2.3: a resident's home address appearing in another resident's layer is the
most sensitive leak this system could have.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| J1 | A rise beyond the band is Growing; a fall is Receding | 9.1.10 | ✓ |
| **J2–J3** | Exactly the band is classified; just inside it is Stable | 9.1.10 (BV) | ✓ |
| **J4** | The **ends** are compared, not the last step | 9.1.10 | ✓ |
| J5–J6 | Too short to judge is Stable; growth from zero does not divide by zero | 9.1.10 | ✓ |
| **S1** | One point per calendar day, taking the last observation of each | 9.1.9 | ✓ |
| S2 | The 30-day window excludes anything older | 9.1.9 (BV) | ✓ |
| **S3** | The trajectory reads **14** days even though the chart shows 30 | 9.1.9, 9.1.10 | ✓ |
| S4 | No history yields an empty series and a Stable label | 9.1.9 | ✓ |
| M1 | Boundaries carry a tier **and** a tier label in words | 9.1.2, 9.1.11 | ✓ |
| **M2** | The ring is in GeoJSON order, longitude first | 9.1.1 | ✓ |
| **M3–M4** | A resident sees verified reports only; a manager sees unmoderated ones too | 9.1.3, 5.3.5, 2.3.4 | ✓ |
| **M5** | No report marker carries the reporter's identity | 5.2.9 | ✓ |
| M6–M7 | A crew member sees only their own work orders; a resident sees none | 9.1.4, 2.3.3, 2.3.5 | ✓ |
| **M8–M9** | A resident sees only their own saved locations; a manager sees none | 9.1.5, 2.3.1 | ✓ |
| M10 | The layers arrive separately, so one can be hidden | 9.1.6 | ✓ |
| P1 | The panel carries score, breakdown, reports, work orders, series and trajectory | 9.1.8 | ✓ |
| **P2–P3** | A resident gets the panel **without** the driver breakdown or the work orders | 2.3.3, 2.3.4 | ✓ |
| P4 | An unknown cluster is an error, not an empty panel | 9.1.7 | ✓ |

**S3, M2 and P2 are the three to point at.** S3 is a distinction it would be easy to lose: the
chart shows thirty days and the label reads fourteen, and reusing one series for both would
quietly change what the label means — the test builds a cluster that halved a month ago and has
been flat since, which is Receding over 30 days and Stable over 14. M2 catches the error no type
system can: GeoJSON is [longitude, latitude], the reverse of how the coordinates are spoken, and
swapping them puts Singapore in Somalia. P2 is 2.3.3 closing a side door — without it the
operations dashboard is reachable by tapping a boundary on the public map.

**Verified live.** The running server returned all fifteen active NEA cluster boundaries (the
first with a 36-point ring), each tier-coloured and tier-labelled, and a detail panel for the
top-ranked cluster carrying a score of 45.6, tier Medium and all seven driver contributions.

### 2.14 Tenth subject - the dialog map, the router and the field rules (`tests/client-navigation.test.ts`)

Added 2026-09-03. **This is the suite §5 of this plan said to protect.**

11.3.2 claims no transition exists that is not on the dialog map. That is a claim about a PlantUML
file and a TypeScript route table agreeing with each other, edited by different people on different
days, and this plan's own note said it would be false within a fortnight if left to eyeballing. So
`client/src/lib/DialogMap.ts` parses the diagram and the route table is checked against it, in both
directions.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| D1 | The map parses into states and transitions (27 routed states, 74 transitions) | 11.3.1 | ✓ |
| **D2** | Every served route is on the map, **and** every routed state is served | 11.3.1, 11.3.2 | ✓ |
| D3 | Every screen has a distinct URL | 11.3.8 | ✓ |
| **D4** | Every screen except Sign In has a return path | 11.3.3 | ✓ |
| D5 | Every route carries the 11.2.x requirement it realises | 11.2.x | ✓ |
| D6 | The map permits the demo path and refuses an undrawn one | 11.3.2 | ✓ |
| **D7** | A manager reaches work-order creation in ≤ 3 interactions, measured over the map | 11.1.8 | ✓ |
| **R1** | `/ops/work-orders/new` is not swallowed by `/ops/work-orders/:id` | 11.3.8 | ✓ |
| R2–R3 | Parameters extract by name; an unknown path matches nothing | 11.3.8 | ✓ |
| G1 | An unauthenticated visitor reaches exactly the four public screens | 11.1.9 | ✓ |
| G2–G3 | A Resident is refused the dashboard; a crew member reaches only their jobs | 2.3.3, 2.3.5 | ✓ |
| **G4** | An unknown URL is Not Found **before** the role is considered | 2.3.7 | ✓ |
| G5–G6 | A signed-out visitor is sent to sign in and returns to where they were going | 11.1.10 | ✓ |
| **G7** | A `returnTo` the new role may not open is **discarded**, not followed | 11.1.10 | ✓ |
| N1 | Each role sees its own navigation set and nothing more | 11.1.1 | ✓ |
| **N2** | No navigation item leads to a screen its own role may not open | 11.1.1, 10.5.6 | ✓ |
| N3–N4 | Work Orders opens the list, not the create form; the current screen is indicated | 11.1.3, 11.1.4 | ✓ |
| N5–N6 | An authenticated shell shows role and sign-out; an unauthenticated one shows neither | 11.1.6, 11.1.7, 11.1.9 | ✓ |
| F1–F2 | A character count reports against the limit, and 501 fails where 500 passes | 11.5.2, 5.1.4 (BV) | ✓ |
| F3 | The password rules use the server's wording | 2.1.2, 2.1.3, 10.5.3 | ✓ |
| **F4** | Only the **first** failure is shown on a field | 11.5.1 | ✓ |
| F5–F7 | The email rule is loose on purpose; a form is submittable when every field passes; unsaved changes are detectable | 2.1.1, 11.5.7, 11.3.6 | ✓ |

**D2, G4, G7 and N2 are the four to point at.** D2 is the mechanical conformance check, and it has
teeth: adding one route the map does not draw, or removing one it does, each produces exactly one
reported problem. G4 is the client refusing to be the oracle the server refuses to be — answering
"not authorised" for a path that does not exist tells an anonymous visitor which paths do. G7 is
the bug in every hand-rolled return-to: a crew member sent to sign in from a manager's URL must
land on their own jobs, not on Not Authorised one step after signing in successfully. N2 derives
each role's navigation from the route table and then checks every item against the guard, so a nav
link straight into a refusal cannot ship.

**What this suite deliberately does not test:** appearance. The screens themselves await the Lab 1
mockups (US-10.1, B3–B12), which are Yen Kit's deliverable, and building their layout first would
be designing the interface in code and then drawing it afterwards — the order US-10.1 exists to
prevent.

### 2.15 Eleventh subject - the §10.1 performance obligations, measured (`tests/performance.test.ts`)

Added 2026-09-03 for US-0.5, which exists because §10.1 states four numbers and a project can very
easily assert them in a report without ever running anything.

**What was measured**, on a development machine against the in-memory stores, seeded with 500
synthetic clusters carrying 36-vertex boundaries (the vertex count of the live NEA feed's first
cluster on 2026-09-03 — a synthetic square would have made the geometry look free):

| Requirement | Bound | Measured | Margin |
|---|---|---|---|
| **10.1.3** scoring cycle, 500 clusters | 60,000 ms | **10.3 ms** | ~5,800× |
| **10.1.2** read request, p95 over 100 requests | 1,000 ms | **1.3 ms** | ~770× |
| 10.1.4 (server half) 300-polygon layer, 11,100 vertices | — | **0.8 ms** | assembly is not the cost |
| 3.1.8 exposure evaluation, 50 locations × 500 boundaries | — | **26 ms** | the term that grows with both |

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| **P1** | 500 clusters scored inside the bound, **all seven drivers present** | 10.1.3 | ✓ |
| P2 | The ranking is complete and correctly ordered: 1..500, no gaps, no duplicates | 4.1.14 | ✓ |
| P3 | The dashboard read path, p95 over 100 requests | 10.1.2 | ✓ |
| P4 | The map layer assembly over 300 polygons | 10.1.4 (server half) | ✓ |
| **P5** | The obligations that are **not** measured here are recorded, with what each needs | 10.1.1, 10.1.4, 10.1.5 | ✓ |
| P6 | Containment across 500 boundaries, the term that grows with clusters **and** residents | 3.1.8, 5.1.7 | ✓ |

**These numbers are a floor, not a ceiling.** They exclude PostGIS, the network and the browser, so
work that is already too slow here can only get slower. The margins on 10.1.3 and 10.1.2 are large
enough that the conclusion survives that caveat comfortably; 10.1.1, 10.1.4 and 10.1.5 are *not*
claimed — P5 records them as unmeasured along with what each would need, because a suite that
silently omitted them would let §10.1 read as fully verified, which is the thing US-0.5 was
written against.

**P1 caught itself being wrong.** The first version misspelled two driver names in the input map
(`rainfall24hMm` for `rainfall24h`), so the engine recognised nothing in them and the case measured
a **degraded** five-driver cycle at 3.0 ms — a third of the real cost, and a number that would have
gone into a report. `tsc --strict` rejected the cast that hid it. The case now asserts
`isDegraded === false` and a seven-entry breakdown before it believes its own stopwatch, which is
the general lesson: a performance measurement needs a correctness assertion beside it, or it will
eventually measure something cheaper than the thing it names.

### 2.16 Twelfth subject - the 24-hour forecast and the heavy-rain flag (`tests/forecast.test.ts`)

Added 2026-09-03 for US-1.4, and the reason it was written is worth stating plainly:
**`Cluster.heavyRainExpected` was written by nothing at all.** Driver 4.1.4 read `false` for every
cluster in the country, and the heavy-rain alert of 6.1.5 could never fire. Both features had
passing tests. Both were being fed a constant. A suite that tests a driver against a value nobody
produces is testing arithmetic, not the system — so the cases here are weighted towards the
**join** (forecast → region → cluster) rather than towards parsing, which is the easy half.

**The design problem 1.3.2 poses.** The requirement says a cluster maps to a region "by the region
polygon containing the cluster centroid", and the endpoint publishes **no polygons** — it returns
`periods[].regions.{north, south, east, west, central}` and nothing spatial (verified live
2026-09-03; the v0.3 requirements note already records the resolution loss). The five boundaries
therefore have to exist somewhere, and `ForecastRegionMap` is that somewhere: five axis-aligned
rectangles that **partition** Singapore's bounding box exactly, so "exactly one region" holds by
construction rather than by the test data behaving. The cut lines were chosen against real towns,
and those towns are the assertions.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| M1 | Fifteen real places land where a Singaporean would put them | 1.3.2 | ✓ |
| **M2** | The four cut lines, tested from **both sides** (1.29, 1.39 lat; 103.77, 103.89 lon) | 1.3.2, BV | ✓ |
| M3 | A point outside every box takes the nearest-region fallback, never `null` | 1.3.2 | ✓ |
| **M4** | Over a 6,000-point grid, every point inside the bounds gets a region — the partition property | 1.3.2 | ✓ |
| M5 | The rectangles are available as closed polygons for the map layer | 1.3.5 | ✓ |
| K1 | Each of the three keywords named by 1.3.3 sets the flag | 1.3.3, EC | ✓ |
| K2 | The dry class (Fair, Cloudy, Hazy, Windy, Partly Cloudy) does not | 1.3.3, EC | ✓ |
| K3 | The rule is case-insensitive — 1.3.3 names words, not capitalisation | 1.3.3 | ✓ |
| **K4** | "Light Rain" is the near-miss: it *is* rain, and 1.3.3 still says no | 1.3.3, BV | ✓ |
| F1 | The live shape yields one forecast per macro-region | 1.3.1 | ✓ |
| **F2** | The three periods are folded with **OR** — rain in any period is rain expected | 1.3.3 | ✓ |
| F3 | The stored text keeps the period labels, so the flag's basis is readable | 1.3.5 | ✓ |
| F4 | Validity spans earliest period start to latest period end; `covers()` at both edges | 1.3.4, BV | ✓ |
| F5, F6 | Validity falls back to `general.validPeriod`, then to 24 h from retrieval — never "forever" | 1.3.4 | ✓ |
| **F7** | A region absent from every period is **omitted**, not defaulted to dry | 1.3.3, 4.1.12 | ✓ |
| F8 | An empty payload throws rather than producing five empty forecasts | 10.2.4 | ✓ |
| **J1** | Every active cluster comes out with a region, a flag **and** a validity window | 1.3.2–1.3.5 | ✓ |
| **J2** | The run's feature count is *clusters flagged*, not *forecasts stored* | 1.1.14 | ✓ |
| J3 | The forecast a flag came from is retrievable per region | 1.3.5 | ✓ |
| **J4** | A region missing from a later payload leaves its clusters **untouched**, not cleared | 10.2.2 | ✓ |
| J5 | A failed fetch marks the source stale and changes no stored flag | 10.2.4 | ✓ |
| J6 | A cluster outside every box is flagged by the fallback **and reported** | 1.3.2 | ✓ |
| G1–G3 | Health is "returns a forecast", not "returns 200" | 1.4.x | ✓ |

**Three cases carry the argument.** J2 exists because storing five region rows and joining none of
them would look like a successful run while the driver stayed constant — which is precisely how
this gap survived ten epics. J4 and F7 are the same principle in the other direction: an absent
region must not become a confident all-clear, because for a *warning* the cheap failure and the
expensive one are not symmetric. M4 is the only case that tests the property 1.3.2 actually states;
M1's fifteen towns would happily pass a map with a hole in the middle of it.

**Verified live, not only against a fixture.** `npx tsx src/tools/forecast-live.ts` runs the real
NEA cluster feed and the real forecast endpoint through the same job: on 2026-09-03 it flagged all
15 active clusters, assigning Woodlands and Yishun north, Bt Batok and Teban Gardens west, Bishan
and Marymount central. Every flag came back `false`, which is the genuine forecast for that day
("Fair (Night) | Fair (Day) | Windy") and not a stub — the distinction the tests above exist to keep
honest.

### 2.17 Thirteenth subject - source health (`tests/source-health.test.ts`)

Added 2026-09-03 for US-1.5. §1.4 is four short requirements, and the implementation got two of
them wrong **in the same direction — towards looking fine**:

- it warned after **one** failed run, where 1.4.3 says *three consecutive scheduled intervals*;
- it reported **two** sources, where 1.4.1 says *every external data source* (the forecast and the
  geocoder were absent, and a source missing from a health panel does not look unhealthy, it looks
  fine).

Neither defect was visible from the dashboard's own tests, because those asserted what the code did
rather than what the requirement said. That is the general lesson this subject records: a test
written from the implementation cannot find a requirement the implementation never read.

**Two conditions, and both are needed.** A source warns when *either* its three most recent runs all
failed *or* nothing has succeeded for three of its own intervals. A failure counter alone is
structurally blind to the outage in W3 — the scheduler stopping — because a job that never runs
writes no FAILED rows to count.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| **H1** | All four sources appear, including the two that were silently missing | 1.4.1 | ✓ |
| H2 | Never-run is its own state: not a warning, but certainly stale | 1.4.1, 1.4.4 | ✓ |
| H3 | Last-success is the last SUCCESS, not the last run | 1.4.1 | ✓ |
| H4 | UNCHANGED counts as a success — a quiet publisher is a live source | 1.1.21, 1.4.1 | ✓ |
| **W1** | The boundary: **two** failures do not warn, **three** do | 1.4.3, BV | ✓ |
| W2 | The run must be unbroken — a success between failures resets the count | 1.4.3 | ✓ |
| **W3** | The outage a failure counter cannot see: nothing ran at all | 1.4.3 | ✓ |
| W4 | The interval is per source, from configuration — 20 min warns rainfall, not clusters | 1.4.3, 10.6.2 | ✓ |
| W5 | Ran and never once succeeded warns immediately | 1.4.3 | ✓ |
| **S1** | One missed interval marks data **stale** without raising an alarm | 1.4.4 | ✓ |
| S2 | Data inside its own interval is neither stale nor warned on | 1.4.4, BV | ✓ |
| S3 | `isStale` answers per source and defaults to stale for one it cannot find | 1.4.4 | ✓ |
| G1 | An unconfigured geocoder reports as unconfigured, never as healthy | 1.4.1, 3.1.16 | ✓ |
| **G2** | An authentication failure warns at once — a lapsed token does not clear itself | 3.1.16 | ✓ |
| G3, G4 | Healthy inside its refresh interval is clean; seven days of silence on a 48-hour token is not | 3.1.15 | ✓ |
| E1 | The rows map onto the `SourceHealth` entity for storage and serialisation | 1.4.2 | ✓ |

**S1 and S2 are the pair that matters for 1.4.4.** The staleness marker is deliberately a *lower*
bar than the warning: one missed cycle is worth a marker on the data and is not worth an alarm on
the panel. Collapsing the two — which the old code did, having only one — forces a choice between
crying wolf and showing hour-old data unmarked.

**One existing case was corrected rather than kept.** `tests/dashboard.test.ts` D9 asserted that a
single failed run raised an attention item. It was passing, and it was wrong: it encoded the
implementation's rule instead of 1.4.3's. It now asserts both halves of the boundary — one failure
raises nothing, three raise the item — and carries a note saying why it changed.

### 2.18 Fourteenth subject - the audit trail (`tests/audit.test.ts`)

Added 2026-09-03 for US-2.5. §2.4 was two-thirds implemented: registration, sign-in, sign-out and
staff provisioning wrote rows; **report moderation and work-order assignment wrote nothing** —
exactly the pair US-2.5's own acceptance names, and exactly the pair a review of a dispatch decision
would ask about. A trail that covers authentication and not operations records who logged in and
not who sent a crew somewhere.

**The design, not a list of call sites.** The fix reuses the pattern already carrying 5.2.8's
notification: **the single write path is the single audit point.**
`ReportLifecycleController.transition` and `WorkOrderLifecycleController.transition` each own their
entity's status, so one hook there covers every present and future caller. Only the changes a
controller makes *itself* — creation, the assignee field, a cancellation reason, a submission, a
corroboration, a saved location, an alert preference — are logged at the call site. The cases below
test that **property**, because the property is what stops the next hole appearing; testing eight
call sites would pass while the ninth was written without a log line.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| **A1** | Report moderation records moderator, action, report id and time | 2.4.1 | ✓ |
| **A2** | Assignment records the manager and the crew member — **and** the status move, as two rows | 2.4.1 | ✓ |
| A3 | A reassignment records who it was taken **from** as well as who it went to | 2.4.1, 8.2.7 | ✓ |
| A4 | Every status move is recorded, attributed to whoever made it (manager 1, crew 2) | 2.4.1 | ✓ |
| **A5** | A **refused** transition writes no action row — nothing changed | 2.4.1 | ✓ |
| **A6** | A system-initiated move is attributed to `system`, not to the nearest human | 2.4.1, 5.2.6 | ✓ |
| A7 | A submission and a corroboration land against the right resident | 2.4.1 | ✓ |
| A8 | A refusal is logged `DENIED:` and is not countable as a change | 2.3.8, 2.4.1 | ✓ |
| **A9** | Reading the trail hands back **copies** — a caller cannot rewrite history | 2.4.2 | ✓ |
| A10 | The store exposes no update, delete, remove, clear or truncate | 2.4.2 | ✓ |

**A2 asserts two rows on purpose.** An assignment changes the assignee *and* the status, and a
reviewer asking "who moved this to Assigned" and "who put Ah Meng on it" is asking two questions.
Collapsing them would lose the second.

**A5 and A6 are the two ways an audit trail becomes untrustworthy.** Logging a refused operation
makes the log unusable as evidence, because a row would no longer mean a change happened.
Attributing a system-initiated change to whichever human triggered the chain is a lie in the one log
that exists to be trusted — and leaving the actor blank instead would make "nobody did this" and
"we did not record who did this" indistinguishable. Hence `SYSTEM_ACTOR_ID`, a named non-user.

**Two defects were found by writing these cases, not by running them.** `InMemoryAuditStore` was
accepting the target id and **throwing it away**: 2.4.1 specifies four fields and three were being
stored, so every row said what *kind* of thing changed without saying which one. And `recent()` was
returning the stored objects, so any caller could rewrite a record through an ordinary read — 2.4.2
false by accident. Both are fixed; A1 and A9 are the cases that hold them fixed.

### 2.19 Fifteenth subject - the §7.3 charts (`tests/analytics.test.ts`)

Added 2026-09-03 for US-7.3. Four of the five visualisations did not exist. Only 7.3.2's tier
distribution was computed — the one chart a dashboard can answer from today's scores with no history
at all — so "analytics" was in effect a pie chart of this afternoon.

**The cases are weighted towards the insufficient-data state, not the arithmetic.** US-7.3's second
acceptance criterion asks for that state explicitly, and the reason is that the failure mode of a
chart is not a wrong number, it is a **plausible** one. A 30-day case series drawn from four hours
of snapshots is a flat line, and a flat line asserts "cases are steady", which the data does not
support. A median over one work order is that work order. Summing a column is not where this
feature can go wrong.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| C1 | One point per day, summed across clusters, oldest first | 7.3.1 | ✓ |
| **C2** | A cluster snapshotted twice in a day counts **once**, at its last value | 7.3.1 | ✓ |
| **C3** | A **closed** cluster still counts on the days it was open | 7.3.1, 1.1.10 | ✓ |
| **C4** | A day with no snapshots is **omitted**, never drawn as zero | 7.3.1 | ✓ |
| **C5** | The boundary: six days is insufficient, seven is not | 7.3.1, BV | ✓ |
| C6 | Snapshots older than the window are excluded | 7.3.1 | ✓ |
| C7 | The tier distribution is insufficient before any scoring cycle has run | 7.3.2 | ✓ |
| C8 | Counted per assignee, busiest first, with an **unassigned** bucket | 7.3.3, 8.2.1 | ✓ |
| C9 | A verified order is not open; no open work is a real answer | 7.3.3 | ✓ |
| **C10** | Unwired work orders are **insufficient**, not an empty chart | 7.3.3, 7.5.3 | ✓ |
| C11, C12 | Odd sample takes the middle; even sample averages the middle pair | 7.3.4, BV | ✓ |
| **C13** | The median resists the outlier a mean would not; fastest and slowest travel with it | 7.3.4 | ✓ |
| **C14** | The boundary: four verified orders is an anecdote, five is a median | 7.3.4, BV | ✓ |
| C15 | An order verified before the window opened is excluded, however long it took | 7.3.4 | ✓ |
| C16 | Thirty points, one per day, ending today | 7.3.5 | ✓ |
| **C17** | A day with no reports is a **real zero** — unlike 7.3.1's omitted day | 7.3.5 | ✓ |
| C18 | With no reports at all the chart is insufficient, not a confident flat zero | 7.3.5 | ✓ |
| C19 | Every report counts, whatever its moderation outcome | 7.3.5 | ✓ |
| C20, C21 | All five together, each naming its requirement; a Resident is refused | 7.3.x, 2.3.4 | ✓ |

**C4 and C17 are the pair worth reading together.** They look inconsistent and are not: a day with
no *snapshot* is omitted, a day with no *report* is a zero. A missed ingestion cycle is a fact about
the scheduler and drawing it as zero would put a cliff in the case series; nobody filing a report on
a Tuesday is a fact about the world and omitting it would hide a quiet week. The same shape of
absence means different things in the two feeds, and the charts have to say so.

**C10 restates the 7.5.3 argument in a new place.** "No crew has any work" and "we are not reading
work orders" look identical on a bar chart and mean opposite things. Every chart whose source is
unwired therefore reports insufficient with a reason, exactly as `DashboardOverview` returns `null`
rather than `0` for a count it cannot compute.

**C13's median is the requirement's own choice and worth defending.** One work order left open over
a public holiday drags a mean of six far more than it drags a median, and the number is read as "how
long a job takes" — a typical case, not an average one. The fastest and slowest are returned
alongside so that a median of 5 hours over a 3-to-400 spread cannot be misread as consistency.

**Two entity fields had to exist first.** 7.3.4 measures creation to verified completion and neither
end was recorded: `WorkOrder.startedAt` is 8.3.17's *work* start, a third instant and not either of
these. `createdAt` is now stamped by `DispatchController.createWorkOrder` and `verifiedAt` inside
`WorkOrderLifecycleController.transition` — in the transition rather than in `verify()`, so any
future path into Verified stamps it, which is the same argument as the audit hook beside it.
Deriving the pair from the audit trail was rejected: the trail is evidence, not a reporting table.

**Verified live over HTTP.** `GET /api/ops/analytics` on a fresh deployment returns all five charts
with honest insufficiency: 7.3.1 "1 of 7 days of cluster history", 7.3.4 "0 of 5 verified work
orders", 7.3.2 sufficient with the real tier split of the 15 live clusters. That is the behaviour
the acceptance criterion asks for, seen from outside the process rather than asserted inside it.

### 2.20 Sixteenth subject - linking a Telegram chat (`tests/telegram-link.test.ts`)

Added 2026-09-04, when the bot token arrived and US-6.1 stopped being blocked.

**What was actually missing is worth being precise about.** `NotificationController` could already
issue a code and could already claim one, and `POST /api/alerts/link/claim` existed. But that
route's only legitimate caller is the bot, and **the bot was not listening** — nothing read the
messages residents send to it. So the flow was complete on paper and, end to end, did nothing: a
code could be shown on a screen, typed into Telegram, and vanish. This is the same shape of gap as
US-1.4's dead `heavyRainExpected`, found the same way — by asking what writes the value, not what
reads it.

**A poller, not a webhook**, because a webhook needs a public URL and this project has no hosting
target yet. The two are mutually exclusive at Telegram's end, so the coupling is stated in the
class rather than left to be discovered.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| L1 | A six-digit code links that chat, and the reply says what happens next | 6.1.7 | ✓ |
| L2 | Telegram's `/start <code>` deep link is accepted as well as a bare code | 6.1.7 | ✓ |
| **L3** | The code is **single-use**: a second chat sending the same code is refused | 6.1.7 | ✓ |
| **L4** | The boundary: good **at** fifteen minutes, dead a millisecond later | 6.1.7, BV | ✓ |
| L5 | A wrong code is refused with the cause **and** the remedy | 10.5.3 | ✓ |
| L6 | Anything that is not a code gets instructions, never silence | 10.5.3 | ✓ |
| **L7** | The offset advances past **every** update, including unhandled ones | 6.1.6 | ✓ |
| L8 | An unhandled update draws no reply and is not counted as a refusal | 6.1.6 | ✓ |
| L9 | `start()` is idempotent — two pollers on one bot each get half the messages | 6.1.6 | ✓ |
| L10 | The link is a field on the account, which is what 6.1.6's delivery reads | 6.1.6 | ✓ |

**L3 is the case that makes the code safe to type in public.** Six digits is a small space; what
makes it acceptable is the pair of limits, and single use is the half an implementation is most
likely to lose — `claimLinkCode` therefore consumes the code on a **failed** attempt too, because a
code that survives a wrong guess can be brute-forced at leisure.

**L7 is the failure that would look like an outage.** If the offset only advanced on messages the
poller understood, one sticker sent to the bot would stall it permanently and no link would ever
work again — with no error anywhere, because nothing failed.

**Verified live against @DFenceBot, in both directions.**
`npx tsx src/tools/telegram-live.ts` read a real pending message from the bot's inbox; `--send`
delivered a real 6.1.8-composed alert to a real phone and returned `Sent`. Then the server was
started with the poller running: the pending message was consumed and answered with the
instructions reply, and a subsequent read showed zero pending. Inbound and outbound, against
api.telegram.org, not against a fake.

**Not verified end to end by this session, and it should be said plainly:** a resident typing a
freshly issued code into Telegram. That needs a human at the other end of the chat — the whole
point of L3 is that nothing else can present that code — so the last link in the chain is Yen Kit's
to close, with the server running.

### 2.21 Seventeenth subject - the Singapore calendar date (`tests/singapore-date.test.ts`)

Added 2026-09-04, and **not** because a story asked for it. The suite was green at 20:00 and had two
failures at 01:00, on cases that had passed for days. The clock found two real defects that 445
tests had not:

- **`WorkOrder.isOverdue`** compared a Singapore `scheduledDate` against a **UTC** today. Between
  00:00 and 08:00 SGT the UTC date is yesterday, so a work order scheduled for yesterday did not
  read as overdue — precisely during the hours an overnight backlog is reviewed (8.3.14).
- **`TreatmentRecord.completionDate`** was stamped in UTC and read back as `+08:00`, so a job
  completed at 1 am was dated the previous day and read as **one day old the moment it was
  written**, moving the 4.1.15 recency driver by a day for nothing.

**The root cause is duplication, not arithmetic.** `singaporeDate` had been written out by hand in
five places; three were right and two used the raw UTC date. It now exists once, in `valueTypes.ts`
beside `IsoDate` itself, and the other four delegate to it.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| **S1** | After midnight SGT the Singapore date is a day ahead of the UTC date | — | ✓ |
| S2 | During the day the two agree — which is why this went unnoticed | — | ✓ |
| **S3** | The boundary: 07:59:59 and 08:00:00 SGT, either side of the UTC rollover | BV | ✓ |
| S4 | Every helper that names a Singapore date shares the one definition | — | ✓ |
| **S5** | Yesterday's work order **is** overdue at 01:00 SGT — the defect itself | 8.3.14 | ✓ |
| S6 | Today's is not overdue, at either hour | 8.3.14 | ✓ |
| S7 | A settled order is never overdue, whatever the hour | 8.3.14 | ✓ |

**Every case pins an explicit instant.** The two defects were invisible for sixteen hours a day
because the tests that covered them used the wall clock — `yesterday()` and `new Date()` — so they
asked the same question the code did and got the same wrong answer back. A test that only fails
during office hours is not a test, and that is the transferable lesson here rather than anything
about timezones: **a case that derives its expected value the same way the code does cannot falsify
the code.** The two work-order cases that failed were left as they were; these seven are what pin
the behaviour down.

### 2.22 Eighteenth subject - privacy, deletion and attribution (`tests/privacy.test.ts`)

Added 2026-09-04 for US-0.4, which requirements v0.3 introduced with the note that its nine
requirements "read as forgotten rather than deferred". Three of them still were: **10.4.3**
(deletion within seven days), **10.4.4** (attribution for every government source) and **10.3.2**
(HTTPS) had no implementation at all.

**The interesting requirement is 10.4.3, and deleting is its easy half.** The hard half is deciding
what counts as the person's own. A resident's reports are not theirs alone — a verified report is
evidence a cleaning crew was sent somewhere, it sits in 4.1.3's driver, and 8.1.13 may link it to a
work order. Deleting them rewrites an operational history other people acted on; keeping them whole
ignores the request. They are therefore **dissociated**: `reporterId` is severed, the report stays.
That is the line 10.4.1 already draws for a public projection, applied permanently, and P2 pins it
down in both directions at once — gone from `findByReporter`, still present and still legible.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| P1 | Saved locations and the Telegram link are destroyed outright | 10.4.3 | ✓ |
| **P2** | Reports are **dissociated, not deleted** — owner severed, content intact | 10.4.3, 10.4.1 | ✓ |
| **P3** | The email becomes a tombstone, not `''` — or 2.1.4's index matches every deleted account | 10.4.3 | ✓ |
| P4 | The credential is disabled at the provider, which this system does not own | 10.4.3, 10.3.1 | ✓ |
| **P5** | The audit row **outlives the person it describes**, which is what proves the deletion | 2.4.1, 2.4.2 | ✓ |
| P6 | Completed immediately, so nothing is ever overdue — checked eight days on | 10.4.3, BV | ✓ |
| P7 | One caller cannot name another's account: there is no parameter to name it with | 2.3.1 | ✓ |
| P8, P9 | The inventory is complete, and the two **retained** items each cite the rule permitting them | 10.4.2 | ✓ |
| P10 | Every source carries an attribution, a URL and a licence | 10.4.4 | ✓ |
| P11 | A screen gets exactly the sources it draws from — the map shows no OneMap credit | 10.4.4 | ✓ |
| P12, P14 | The footer names each agency; Data Sources carries all four | 10.4.4 | ✓ |
| **P13** | **10.4.5 is not satisfied**, and the exception is enumerable rather than argued away | 10.4.5 | ✓ |
| P15, P16 | The redirect preserves host and query; enforcement is off by default on localhost | 10.3.2 | ✓ |

**P13 is the case worth defending.** 10.4.5 says data comes only from public sources needing no
third-party authentication, and OneMap needs a registered account and an expiring token. It is a
Singapore government service publishing open data, so it would be easy to call it compliant — and
that would be reading the requirement to suit us. `Attribution.credentialedSources()` returns the
exception instead, so it is testable, appears in the API response, and reaches the demo notes rather
than being discovered during marking.

**P5 is the tension inside a deletion feature.** 2.4.2 forbids modifying an audit record, so the row
recording the deletion cannot itself be deleted — and that is the point: it is the only remaining
evidence the request was honoured. The inventory names it as retained, with the requirement that
permits it, rather than leaving a reader to notice the leftover id.

**Verified live over HTTP**: `GET /api/attribution?screenId=MapView` returned the two sources the map
draws from and no OneMap credit; `GET /api/attribution` reported all four with
`credentialedSources: ["Geocoding"]`. A full register → verify → sign-in → `POST /api/account/delete`
run erased the account and the subsequent sign-in was refused.

**Still not done, and gated rather than forgotten:** 10.3.5's signed, non-enumerable photograph URLs
need Supabase Storage, which does not exist yet — `SupabaseStorageGateway.signedUrl` remains a stub
and the bucket policy is the real guarantee. 10.3.2's actual TLS needs a deployment; what is
implemented here is the redirect, HSTS and the header policy, which is the half we control.

---

### 2.23 Nineteenth subject - the twenty-seven screens (`tests/client-screens-*.test.tsx`)

Added 2026-09-04 with E10. Sixty-four cases across three files, split by audience rather than by
component, because the audiences are what the requirements are written about: `-shared` (17) covers
the screens every visitor can reach, `-resident` (21) the resident's own, `-ops` (26) the manager's
and the crew's.

**What a screen test here is, and is not.** Every case renders a real screen component against a
stub `Fetcher` and asserts on the rendered output. None of them assert on a snapshot of the markup:
a snapshot test fails when a class name changes and passes when a refusal stops being shown, which
is exactly backwards. What is asserted is the **rule the screen is obliged to obey** - and the
recurring rule across §11 is that the interface *displays* and the server *decides*.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| S1-S5 | Sign-in: the token is kept in memory, the email is trimmed and the password is not, an invalid form never reaches the network | 11.1.10, 11.5.7 | OK |
| **S3, L3** | A refusal shows the server's sentence and **nothing more** - Not Authorised names neither the screen nor the role that would have worked | 2.3.7 | OK |
| **P1, P2** | Password reset confirms **conditionally**, and a server failure is made to look identical to a success | 2.3.7 | OK |
| R1-R3 | Registration states the password rules before enforcing them; success does not sign the user in | 2.1.4, 11.5.1 | OK |
| M1-M5 | Saved locations: inside a cluster is distinguished from near one, exposure always carries its timestamp, removal is confirmed and reports what it took with it | 3.1.14, 10.5.7, 11.4.6 | OK |
| A1-A3 | Geocoding: the resident chooses among candidates, no match and an unwell geocoder are different states with different remedies | 3.1.4, 3.1.5, 3.1.17 | OK |
| **R1, R3, R6** | Boundary values in the interface: the counter uses the **server's** constant, 500 characters is accepted, the fourth photograph is refused and the third is not | 5.1.4, 5.1.5 | OK |
| D1-D4 | Photographs are withheld until triage; a corroboration count is re-read from the server, never incremented locally | 5.2.x, 5.1.13 | OK |
| O1-O4 | An uncountable figure renders as an em dash and never as zero; a degraded row **names** its excluded drivers | 7.1.x, 7.2.8, 7.2.9 | OK |
| Q1-Q3, W1-W5 | Moderation and dispatch: filters are query parameters so the server filters, the dispatch list proposes and creates nothing, a duplicate refusal offers the order that blocked it | 5.3.x, 8.1.8, 8.1.12 | OK |
| S1-S5 (ops) | Staff and sources: deactivation warns then reports, a warning and a stale marker are distinct sentences, the manual run reports each source and a 409 states cause and remedy | 2.2.5, 1.4.3, 1.4.4, 1.1.18 | OK |
| C1-C6 | The crew screens: the server filters and orders, the action offered follows the status, the task performed is not editable | 8.3.x, 8.4.1, 8.4.2 | OK |
| **X1-X3** | The route table itself: the literal path is registered before the `:id` pattern, every route has a component and every component a route | 11.3.1 | OK |
| M6, S5 (shared) | Tier and error state survive without colour - a label and a sentence, not a hue | 9.1.11, 11.7.5 | OK |

**X1 is a test about Express, not about React,** and it is here because the defect it guards against
is invisible in both. Route matching is registration-order dependent, so `/api/ops/work-orders/:id`
registered before `/api/ops/work-orders/crew-workload` silently swallows the literal path and
answers it as a work order whose id is "crew-workload". Nothing type-checks it and no screen test
would have caught it.

**What these tests cannot do, stated so it is not assumed away.** jsdom renders no pixels. Contrast
ratios, tap-target sizes and legibility in daylight (11.7.1, 11.7.4, 11.7.7) are untested here and
untestable here; §5 records them as needing a human with a phone.

---

### 2.24 Twentieth subject - the four Postgres repositories (`tests/repository.test.ts`)

Added 2026-09-04, closing the row that stood at the top of §5 from the first version of this plan:
*"Repository spatial queries - blocked on a live PostGIS instance"*. There is now a live PostGIS
instance, so the block is gone.

**These are the only tests in the suite that are not offline.** The file skips itself entirely when
`DATABASE_URL` is unset, so `npm test` still runs with no network by default; when the variable is
present the cases run against the real database, create their own account and their own cluster in
an empty patch of the Straits, and delete both in `afterAll`. Verified by querying for leftovers
after a run: none.

**Why an in-memory double cannot stand in for these four.** Each case below is a property of
Postgres or of the mapping to it, not of the `Stores` interface - the in-memory fake passes all of
them by construction and would go on passing if the SQL were wrong.

| # | Behaviour under test | Requirement | Result |
|---|---|---|---|
| **R1** | Latitude and longitude survive the round trip the right way round | 5.1.1 | OK |
| **R2** | The **private** `status` is rehydrated through `applyStatus`, not left at its default | 5.2.1 | OK |
| **R3** | `ST_DWithin` on `geography`: 50 m is inside, 51 m is outside - the boundary case | 5.1.11, BV | OK |
| R4 | A settled report at the same spot is not a duplicate - "an existing **open** report" | 5.1.11 | OK |
| R5 | A different report type at the same spot is not a duplicate | 5.1.11 | OK |
| R6 | A report older than the window is not a duplicate | 5.1.11, BV | OK |
| **R7** | Containment uses `ST_Covers`, so a point **on** the boundary is inside it | 5.1.7, 3.1.8 | OK |
| **R8** | A scheduled date is a calendar date and does not shift a day in Singapore | 8.1.3 | OK |
| R9 | An untreated cluster is 90 days since treatment; a treated one is measured | 4.1.15, 4.1.16 | OK |
| R10 | The lock-out state survives a restart as three values that must agree | 2.1.10 | OK |
| R11 | Touching a session **updates** it rather than inserting a second row | 2.1.9 | OK |

**R1 is the cheapest bug in this system to write and the most expensive to notice.** GeoJSON orders
coordinates `[longitude, latitude]`; the entity is `(latitude, longitude)`. A swap produces a
perfectly plausible coordinate, passes every unit test, and puts a Woodlands report in the Java Sea.

**R3 is the case the requirement actually turns on.** `geography` measures metres on the spheroid;
`geometry` measures **degrees**, and the same query written against `geometry` would have matched
most of Southeast Asia while looking correct. `ST_DWithin` is inclusive, which is what 5.1.11's
"within 50 m" means, and REQUIREMENTS.md §13 records that reading.

**R8 is the trap that survives every test written in UTC.** `pg` returns a `date` column as a
JavaScript `Date` at *local* midnight. `toISOString()` on it is 16:00 the previous day, so the
naive conversion reports work scheduled for the third as the fourth's - or the fourth's as the
third's, depending on which side of midnight the reader is on.

**Nothing failed on the first run except one case that was wrong about itself:** R6 initially
searched a 10 m radius around a point five metres from the fixtures the earlier cases had already
written, so it matched them and proved nothing about the time window. Moved half a kilometre away.
Worth recording because it is the failure mode of every test that shares a live database with its
own siblings.

---

### 2.25 Twenty-first subject - the two acceptance harnesses (`src/tools/uat.ts`, `client-uat.ts`)

Not unit tests, and listed separately for that reason: these run against a **running server and a
live database**, over HTTP, in the order a person would. They are how §3.2.4's "execute the tests
and record the results" is answered for the paths no unit test reaches - the ones where the defect
is in the wiring rather than in any one class.

**`uat.ts` - 56 checks, executed 2026-09-05 against the deployment: 55 passed, 0 failed, 1 skipped.** Organised as beats:
A (the system is up and credits its sources publicly), B (a resident registers, verifies, saves a
location, submits a report), C (a manager reads the dashboard, the priority table, source health,
the analytics, the CSV export, and moderates), D (dispatch, assignment, the crew's day, verification
and the treatment record). Each check states its requirement, and a failure is a sentence rather
than a stack trace.

The one skip is documented rather than hidden: **8.3.14/7.5.2's overdue work order is unreachable
over HTTP**, because 8.1.4 refuses a scheduled date in the past. The rule is covered by unit tests
(§2.8); the point is that the acceptance path cannot construct the state without breaking another
requirement, and saying so is more honest than deleting the check.

**`client-uat.ts` - 9 checks, executed 2026-09-04: 9 passed, 0 failed.** Loads the **served bundle**
- the same `/app.js` a browser gets - into jsdom, points it at the running server and clicks
through: the landing screen credits its sources, a signed-out visitor is offered sign in rather than
staff navigation, a protected URL redirects and remembers where it was going, an unknown URL renders
Not Found, the manager signs in through the form and lands on a dashboard of real numbers, every
navigation item leads to a screen rather than a refusal, and the manager triggers an ingestion run
by clicking the button (1.1.18) against the live NEA and rainfall feeds.

**Both harnesses have themselves been defective, and that is the finding worth recording.** The
first version of `uat.ts` called `response.json()` on the `text/csv` export, which throws - so a
broken download would have been reported as a passing check against an empty object. The second
defect was worse: both tools parsed only `--base <url>` and silently ignored `--base=<url>`, so a
run aimed at one port went to whatever was listening on the default port. On 2026-09-04 that
produced fourteen plausible passes and five 404s against a **stale server from earlier in the
session**, and the first instinct was to look for a regression in code that was fine. A harness that
fails loudly is safe; one that passes against the wrong target is not.

---

### 2.26 Twenty-second subject - the two §10.1 numbers the client unblocked, and the one that failed

Added 2026-09-04. §2.15 recorded 10.1.1, 10.1.4 and 10.1.5 as **not measured here**, each with what
it would need. Two of those three blocks are now gone - the screens exist and are served, and there
is a live database to put under load - so this section is what happened when they were measured.

#### Measured in `tests/performance-client.test.tsx` (jsdom, in the suite)

| # | Measurement | Requirement | Result |
|---|---|---|---|
| P7 | 300 clusters mounted and readable: **78.5 ms** (budget 3 s) | 10.1.4 | OK |
| P8 | The tier arrives as a label on every one of 300 rows, so nothing is derived per row | 9.1.11 | OK |
| P9 | Dashboard mounted with its figures: **12.3 ms** | 10.1.1 | OK |
| P10 | The served bundle is **215 KB**, transferring in **0.18 s** at 10 Mbit/s | 10.1.1 | OK |

**What these numbers exclude, stated so they are not over-read.** jsdom builds a DOM and runs React;
it performs no layout and paints nothing. P7 and P9 bound *mount and reconciliation* - the part that
grows with the data and the part a careless render turns quadratic - and they are asserted against a
**third** of the requirement's budget precisely because the two thirds they cannot see belong to the
browser. P10 is the one part of 10.1.1 that can be computed rather than sampled, and it is also the
part most likely to rot: one charting library added without thought takes the bundle past a
megabyte, and P10 says so.

P10 also recorded a fact worth knowing: **nothing compresses that response.** No `compression`
middleware is mounted, so 215 KB is what a real client transfers, not a pessimistic figure. The
budget is met without it; it is free headroom whenever it is wanted.

#### Measured by `src/tools/load-check.ts` (a running server, the live database)

Fifty *sessions*, not fifty sockets - each virtual user signs in for real and carries its own bearer
token, because session resolution runs on every authenticated request (2.1.9 extends the session on
use) and a load test sharing one token would skip the part most likely to be the bottleneck. Sign-in
is performed serially: it is deliberately expensive by 10.3.1, and fifty concurrent scrypt hashes
would measure the KDF rather than the read path 10.1.2 is about.

**Executed 2026-09-04, 50 users x 10 reads = 500 requests, 0 non-200:**

| Measure | Result |
|---|---|
| median | 495 ms |
| **p95** | **2125 ms** — against 10.1.2's 1000 ms budget |
| worst | 2151 ms |
| throughput | 63 requests/s |

**10.1.5 DOES NOT HOLD, and the per-path breakdown says exactly where.**

| Path | p50 under load | p95 under load |
|---|---|---|
| **`/api/ops/dashboard`** | **1475 ms** | **2139 ms** |
| `/api/ops/priority` | 480 ms | 665 ms |
| `/api/map/layers` | 578 ms | 605 ms |
| `/api/ops/sources` | 265 ms | 381 ms |
| `/api/ops/work-orders` | 231 ms | 243 ms |
| `/api/ops/moderation` | 200 ms | 207 ms |

Every endpoint except the dashboard is comfortably inside budget. A control run at **one** user put
the dashboard at 179 ms and the aggregate p95 at 181 ms, so this is **contention, not an endpoint
that is slow on its own** - roughly an eightfold degradation at fifty-way concurrency.

**The diagnosis, from reading the code the measurement pointed at.** `GET /api/ops/dashboard` calls
`buildOverview` and then `buildAttentionPanel`, and both are strictly serial chains of round trips
to Supabase. Between them, **`reportSourceHealth()` is computed twice and `findAllOpen()` is queried
twice** in the course of answering one request; add `weekOverWeek`, the score read, the cluster read
and the report count, and one dashboard response is on the order of fifteen sequential round trips
over an internet link. At one user that is 179 ms and invisible. At fifty, against a ten-connection
pool, the requests queue behind each other and it is 1475 ms.

**Not fixed here, deliberately.** The remedy is contained and obvious - stop computing the same two
things twice per request, and run the independent reads concurrently - but it is a change to a
control class's behaviour, and this section's job was to measure. It is recorded as a batched
decision rather than made silently, and the duplication is worth noting as more than a performance
defect: two halves of one response computing source health separately could in principle disagree
with each other.

### 2.27 Twenty-third subject - photographic evidence (`tests/photo-storage.test.ts`)

Added 2026-09-05, after an independent review found the sharpest defect in the project: **the
acceptance harness reported the requirement as passing for as long as the requirement was unmet.**

8.3.6 asks for at least one photograph before a work order may be Completed, and 8.3.7 says a
completion carrying none is rejected. The harness checked that an empty `photoKeys` was refused and
that a non-empty one succeeded. Both were true; neither had anything to do with a photograph.
`SupabaseStorageGateway`'s three methods threw `not implemented` and the class was constructed
nowhere, both screens sent `storageKey: file.name`, `report_photo` held zero rows, and
`photoKeys: ["not-a-real-file-at-all"]` closed a work order with a 200.

The lesson generalises past this defect and is the reason the section exists: **a test over a
requirement about a stored object must assert that the object is stored.** Asserting over the
string that names it tests the caller's spelling.

| # | What it establishes | Requirement | Boundary |
|---|---|---|---|
| G1 | An upload sends the bytes and answers a UUID key, not the filename | 5.1.5, 10.3.5 | |
| G2 | Two uploads of identical bytes get different keys | 10.3.5 | |
| G3 | `x-upsert: false` — evidence is never silently overwritten | 8.3.6 | |
| G4 | A PDF, a 5 MB + 1 byte image and a **zero-byte** file are all refused before the network | 5.1.5, 10.3.6 | ✓ |
| G5 | An unknown bucket is refused rather than created | 10.3.5 | |
| G6 | `exists()` answers the store; a 404 is `false`, not a throw | 8.3.7 | |
| G7 | `../`, `a/b.jpg`, `''` and `IMG_4821.jpg` never reach the network | 10.3.5, 10.3.6 | ✓ |
| G8 | A signed URL is absolute and carries an expiry | 10.3.5 | |
| G9 | Deleting what is already gone is success, so erasure survives a retry | 10.4.3 | ✓ |
| G10 | The in-memory twin enforces the same rules, so no test passes on a path production refuses | 10.6.3 | |
| U1–U3 | A resident's photograph is really stored; a `data:` URL is accepted; the bucket comes from the purpose, never the request | 5.1.5, 2.3.x | |
| U4, U5 | Crew and resident cannot upload into each other's bucket, and authorisation runs **before** the image is decoded | 2.3.x, 10.3.6 | |
| U6 | Rubbish that is not base64 is refused rather than stored as a zero-byte object | 10.3.6 | ✓ |
| U7 | A HEIC and an oversized image are refused with a remedy | 5.1.5, 10.5.3 | ✓ |
| U8 | The upload is audited by key | 2.4.1 | |
| E1 | `photoKeys: ["not-a-real-file-at-all"]` is refused and the job stays In Progress | 8.3.7 | |
| E2 | An uploaded photograph completes the job | 8.3.6 | |
| E3 | Three photographs of which one failed says **which count** failed | 8.3.7, 10.5.3 | ✓ |
| E4 | A photograph in the reports bucket is not evidence for a work order | 8.3.7 | ✓ |
| E5 | Nothing is written before the refusal — no evidence row survives it | 8.3.6 | |
| R1–R3 | The same gate on the resident's half: a cited photograph must exist, and no photographs at all is still a valid report | 5.1.5 | ✓ |

Four further cases live in `tests/http-boundary.test.ts` (H10–H13), because what they test is a
**body size limit**, and a limit is enforced by a parser no handler-level test ever runs: a 5 MB
photograph is ~6.7 MB of base64, so the two upload paths are capped at 8 MB while every other route
stays at 2 MB. H11 asserts both halves at once — the large body accepted on an upload path and
refused with 413 elsewhere — so collapsing the two limits into one fails exactly one assertion.

**And the harness was corrected, which is the point.** `src/tools/uat.ts` now uploads a real
one-pixel PNG through the real endpoint and completes with the key it gets back, and it carries a
new beat asserting that a completion citing a key that names nothing is **refused**. Against the
local deployment: 52 passed, 0 failed, 1 documented skip.

### 2.28 Twenty-fourth subject - the audit trail, persisted (`tests/audit.test.ts`, `tests/repository.test.ts`)

Added 2026-09-05. §2.18 already covered the *writing* of audit rows and it was right about all of
it: the single write path is the single audit point, so a future caller cannot forget the hook.
What none of those cases could see is that in the deployment the rows went into an array.
`server.ts` constructed `InMemoryAuditStore` in production, `AuditRecordRepository.save()` threw
`not implemented`, `audit_record` held **zero rows**, and there was no route, so 2.4.1 and 2.3.8
were unsatisfiable through the API however carefully the hooks had been placed.

**The shape of the defect is the same one §2.27 records**, which is why they arrived together: a
suite that tests a store through its port cannot tell which store it is testing. That is the
property the port exists to give and it is worth having; the cost is that the *binding* — which
implementation the composition root chooses — is untested by construction, and both of this
project's silent production defects lived exactly there.

| # | What it establishes | Requirement | Boundary |
|---|---|---|---|
| A11 | A manager reads the trail; a resident and a crew member are refused | 2.3.4, 2.3.7 | |
| A12 | One work order's history is its own rows, not the trail filtered by eye | 2.4.1, 8.3.x | |
| A13 | The filter runs **before** the limit, so an old entity still has a history | 2.4.1 | ✓ |
| A14 | An entity nothing has happened to is an empty list, not a 404 | 2.3.7 | ✓ |
| A15 | A refusal is a boolean, not a `DENIED:` prefix the client string-matches | 2.3.8 | |
| A16 | The limit is bounded: absent, negative and 10,000,000 all land somewhere sane | 10.1.x | ✓ |
| A17 | Reading the trail without the right is itself refused **and logged** | 2.3.8 | |

**And five cases against live Postgres** (`tests/repository.test.ts`, skipped without
`DATABASE_URL`), because the guarantee that matters is not a property of the port:

| # | What it establishes | Requirement |
|---|---|---|
| U1, U2 | A row written through the port returns through it; a denial stays distinguishable | 2.4.1, 2.3.8 |
| U3 | A non-uuid actor (`'system'`) and a non-uuid target (a photograph's storage key) are stored rather than silently dropped | 2.4.1 |
| U4 | **Postgres itself refuses an UPDATE and a DELETE**, against the application's own connection | 2.4.2 |
| U5 | Newest first, with ties broken in insertion order rather than left to the planner | 2.4.1 |

U3 is the case worth reading twice. 001 typed both identifier columns as `uuid`; `SYSTEM_ACTOR_ID`
is the literal string `'system'` and a photograph's key is a UUID *plus an extension*, so both were
rejected by the column. And because `AuditRepository.append` swallows its failures **on purpose** —
a logging error must not turn a clean 403 into a 500, nor roll back a transition the caller has
already been told succeeded — the rejection produced a log line and a missing row rather than an
error anyone would notice. A constraint that quietly drops the rows it dislikes is worse than no
constraint, and worst of all in the one table whose entire value is completeness. Migration 003 is
the fix; U3 is what stops it coming back.

**These rows are never cleaned up**, which is not an oversight: `afterAll` *cannot* delete them.
That is the behaviour under test.

### 2.29 Twenty-fifth subject - what a restart used to lose (`tests/repository.test.ts`)

Added 2026-09-05. Three stores moved onto Postgres in one afternoon - saved locations and alert
subscriptions, then local credentials - and the cases for them are grouped here because they share
a subject: **the behaviour that only appears the second time the process starts.** Nothing in the
suite had ever restarted anything, so nothing had ever noticed.

The three defects were different sizes and the same shape:

| What was lost | What the user saw |
|---|---|
| Saved locations | Three confirmed geocoding round trips gone; 3.1.11's five-location limit counted against a list that could silently empty |
| Alert subscriptions | 6.1.1's switch silently off, so alerts stopped without anything saying so |
| **Credentials** | The account still existed, still had a role, still appeared in the staff list - and nobody could sign in to it |

The third is the worst and it is worth saying why. "Your account does not exist" is a bad outcome.
"Your account exists and your password is wrong" is worse: the user retries, trips 2.1.10's
lock-out after five attempts, and now has evidence that the system is lying to them.

**Eight cases for §3's data** (L1-L8), covering the three things an in-memory double cannot get
wrong on your behalf: `ST_MakePoint` takes (longitude, latitude) while the entity is (latitude,
longitude); `numeric` columns arrive from `pg` as **strings**, so an uncoerced distance comparison
compares text; and `alert_subscription` is UNIQUE on `saved_location_id`, so the obvious id-keyed
upsert violates the constraint the second time a resident changes a setting. L2 additionally pins
the `numeric(7,1)` rounding - 18.25 mm is stored as 18.3 - which is invisible in every other test
and would otherwise surface as a stored total disagreeing with a freshly computed one.

**Nine cases for the credentials** (C1-C9). C1 is the whole point: register through one provider,
build a second provider over the same table - which is precisely what a restart produces - and sign
in. C2 checks that a `bytea` round trip returns the same bytes, because a hash re-encoded through a
string under the wrong encoding compares unequal to itself and the symptom ("the password I just
set does not work") points at the hashing rather than at the storage. C8 covers the consequence
nobody would predict: **persistence broke start-up.** The seeded manager and resident are
re-established from configuration on every boot, which was `createUser` every time; the moment
credentials survived, the second boot hit 2.1.4's duplicate and aborted. `ensureUser` is the fix,
and `createUser` stays strict - a *registration* that quietly overwrote a password would be an
account takeover.

**Also proven outside the suite**, because a test that restarts a server is a test that owns a
port: the server was started, an account registered and verified through the HTTP API, the process
killed, the server started again, and the same credentials accepted. That sequence is what the
whole section is about, and it had never been run before today.


### 2.30 Twenty-sixth subject - the mobile application (`tests/mobile-app.test.tsx`, `tests/http-boundary.test.ts`)

Added 2026-09-05, with §11.8. The brief asks for a mobile application and D-Fence answers with an
installable web application, so "installable" has to be a tested claim rather than a hopeful one.

**Fourteen cases (M1-M14).** The interesting decision is that M8 and M9 **execute the service
worker** rather than assert against its source. `client/public/sw.js` is a real file with no build
step of its own, so the test reads it and runs it in a constructed scope:

```ts
new Function('self', 'caches', 'fetch', 'Response', 'URL', source)(scope, ...);
```

The scope records the listeners the worker registers, and the test then fires `install`, `activate`
and `fetch` at them with a fake cache. This is more work than matching a string, and it earned its
keep immediately: `worker.replace('__BUILD__', stamp)` in `client/build.mjs` was replacing the
occurrence in the *doc comment* rather than the constant, so every deployment shipped a worker whose
cache name was the literal `__BUILD__`. Nothing about the file's text looked wrong. Running it
failed. The build now uses `replaceAll` and throws if any placeholder survives.

The rest of the series covers what installability actually consists of: the manifest parses and
names the icon sizes a launcher needs (M1-M3); `/api/` is never cached in either direction, because
a cached figure shown beside a §7.1.9 freshness line would make a true statement false (M10); an
offline navigation falls back to the shell so a deep link lands on the application rather than the
browser's error page (M11); the install control appears only when the browser offers it and
disappears once installed (M12-M13); and the viewport does **not** lock zoom - M14 asserts that the
opt-out string appears nowhere, since a user who needs to zoom in bright sunlight must be allowed
to.

**Four boundary cases (H14-H17)** check the server's half: the manifest is served as
`application/manifest+json`, the worker with `no-store` and `Service-Worker-Allowed: /` (a worker
served from cache is a worker that cannot be replaced), the icons exist at the paths the manifest
claims, and the CSP carries `worker-src 'self'` and `manifest-src 'self'` - without which the whole
feature is silently blocked in production and works perfectly in development.

### 2.31 Twenty-seventh subject - the demo, driven by a machine (`src/tools/demo-drive.ts`)

Added 2026-09-05. Not a unit test and not counted among the 689: a third acceptance harness, beside
`uat.ts` and `client-uat.ts`, whose subject is **the demonstration itself**. It drives twenty-one
beats of `lab4/DEMO-SCRIPT.md` through real Edge - a 390x844 phone context with Bishan geolocation
for the resident and the crew, a laptop context for the manager - and reports PASS/FAIL per beat
with a screenshot each.

What it is for is narrow and worth stating: a demo script is a document that rots. The software
moves, a button gets renamed, and nobody finds out until it is being projected. This closes that gap
by making the script executable.

The engineering in it is all about running **twice**. A harness that passes once and fails on its
sixth run is worse than none, and both failures were the system behaving correctly:

| What refused it | Why | What the driver does now |
|---|---|---|
| 3.1.1 - five saved locations per account | It added one per run | Sweeps its own `Demo <token>` locations before and after, leaving the seeded one alone |
| 8.1.12 - one open work order per cluster | It collided with the previous run's order | Walks **up from the bottom** of the priority table until it finds a free cluster |

Bottom rather than top for the reason §2.28's investigation established: this path ends in a
treatment record, and writing one against the top-ranked cluster zeroes `DaysSinceLastTreatment` and
suppresses 15% of the score the demonstration is about. The harness that distorted the data is the
one lesson this project has already paid for once.

A third fix is smaller and was the most expensive: a failing beat now reports the **refusal text**
from the screen. `waitForURL: Timeout 25000ms exceeded` hid `you already have 5 saved locations` for
three runs.

Result at the time of writing: **21 passed, 0 failed, 0 skipped - twice consecutively** against the
deployment. The second run is the one that means anything.

### 2.32 Twenty-eighth subject - the drawn map (`tests/map.test.tsx`)

Added 2026-09-05, with §9.1.12-9.1.16. §9.1 says "on a map" and was answered for most of this
project by a list, on the argument that every *fact* the requirement demands was present in text.
The argument was true about the facts and wrong about the requirement, and the tests written under
it tested the list.

**Ten cases (N1-N10)**, and the interesting thing about them is what they refuse to assert.

**No case asserts a pixel.** Leaflet renders into an element that jsdom never lays out, so no test
in this file can prove a polygon is in the right place - and one that mocked Leaflet in order to
claim it did would prove only that the mock agreed with the code that called it. What is assertable
is everything the requirements actually ask for around the drawing: that the region is
`role="application"` and says the arrow keys pan it (N1, 11.7.2); that every tier present is named
in words in the key (N2, 9.1.11); that the basemap is attributed in the page and not only inside
Leaflet's own control, which vanishes with the drawing (N3, 10.4.5); that a layer switch exists for
a layer this principal received and **not** for one they did not, since offering it would advertise
data they are refused (N4, 9.1.6 with §2.3); and that with no geometry at all the key says so
rather than rendering empty (N6).

The drawing itself is asserted in the only place it can honestly be asserted - a browser.
`demo-drive.ts` beats **B3** and **C2-C3** count loaded tiles and rendered paths against the
deployment. That beat earned its place immediately: it failed twice while the map was working,
because it counted tiles the instant the first one arrived, which measures how fast OneMap answered
rather than whether the map drew. It now waits for a threshold.

**Two cases are regressions, and they are the reason this file is worth reading** (N7, N10). Drawing
the map meant reading the map payload properly for the first time, and two screens turned out to
have been reading fields that no response has ever contained:

| Screen | Read | Sent | What the user saw |
|---|---|---|---|
| Resident map | `savedLocation.name`, `.status` | `label`, `exposureStatus` | Every saved location rendered as `" — "` |
| Operations dashboard | `attention.message` | `detail`, `link` | One empty bullet per item, in the panel whose whole job is to say what needs a decision today |

Both are the same defect as §2.28's: a boundary that TypeScript cannot check, because the client
declares the shape it hopes for and the compiler agrees with the client. Both had been live in
production. Neither was visible in any screenshot, because an empty bullet and a panel with nothing
to report look identical.

---

## 3. Basis-path design

### 3.1 `WorkOrderLifecycleController.isTransitionPermitted` (8.3.2, 8.3.3)

The method delegates to `WorkOrderTransitionTable.find`, whose predicate is
`r.from === from && r.to === to && r.actor === actor`, and then tests the result against `undefined`.

**Cyclomatic complexity.** Decision points: the array iteration (1), the three `&&` conditions, each
of which short-circuits (3), and the `!== undefined` test (1). V(G) = 5 + 1 − 1 = **5 independent
paths**, using V(G) = decision points + 1 with the short-circuiting `&&` counted as separate
decisions, which is the reading that matters for coverage.

| Path | Condition exercised | Test input | Expected | Actual |
|---|---|---|---|---|
| P1 | first condition false on every row | Verified → Assigned, Manager | false | false ✓ |
| P2 | first true, second false | Created → Completed, Manager | false | false ✓ |
| P3 | first two true, third false | Assigned → Accepted, **Manager** | false | false ✓ |
| P4 | all three true | Assigned → Accepted, **Crew** | true | true ✓ |
| P5 | iteration exhausts, result undefined | Cancelled → Assigned, Manager | false | false ✓ |
| P0 | empty table | — | **unreachable** | recorded, not tested |

**P0 is recorded rather than tested, deliberately.** `permitted` is a non-empty constant initialised
in the field declaration, so the empty-table path cannot be reached. A test that cannot fail is not
evidence. If the table ever becomes injectable — which it would, if the team decided to load
transitions from configuration — this path becomes reachable and must then be covered. That sentence
is the deliverable, not the omission.

P3 and P4 are the pair that matter: the same transition, differing only in the role attempting it.
8.3.4 gives acceptance to the assigned crew member, and a table that ignored `actor` would pass P1,
P2 and P5 and fail only P3.

Two further cases guard the table itself rather than the method: every non-terminal status has at
least one outgoing rule, exactly Verified and Cancelled are terminal, and **every rule's
`requirement` field matches a real requirement-number format.** That last one exists because an
earlier version of the table carried four rules citing `8.2.x`, which is not a requirement number, in
the very file whose docstring claims every rule carries one. An adversarial review caught it; the
test is why it cannot recur.

### 3.2 `ClusterRanking.rank` (4.1.14)

> **v0.9 note (2026-09-16).** This class is renamed `PriorityRanking` in the design, and 4.1.14 as
> revised orders by score, then severity multiplier, then verified open report count, then locality
> name — because case size exists only for the mosquito and cannot order a mixed-pest queue. The six
> paths below were executed against the code as it stands today and are recorded unchanged. R3 will
> need its input changed when the rename lands, and a seventh path appears for the severity key;
> that is an E11 build step, tracked in §6.1 case C1 and in `EPICS-STORIES.md` US-11.2.

4.1.14 defines a three-key ordering: score descending, then case size, then locality name.

**Cyclomatic complexity.** Decision points: the sort iteration (1), the score comparison (1), the two
missing-key conditions (2), the case-size comparison (1), and the rank-assignment iteration (1).
V(G) = **6 independent paths**.

| Path | Condition exercised | Test input | Expected | Actual |
|---|---|---|---|---|
| R1 | neither loop body executes | empty ranking | no throw, size 0 | as expected ✓ |
| R2 | scores differ | 40 vs 90 | 90 first, ranks 1 and 2 | as expected ✓ |
| R3 | scores tie, case sizes differ | both 60; sizes 3 and 30 | larger cluster first | as expected ✓ |
| R4 | scores and sizes tie | both 60/10; "Zebra" and "Alpha" | Alpha first | as expected ✓ |
| R5 | fully tied pair | two identical keys | same order across two runs | stable ✓ |
| R6 | ranking key missing | a score with no key | throws | throws ✓ |

**R5 is a requirement in disguise.** Nothing in §4 states "the order must be stable", but the
dashboard re-ranks on every scoring cycle, and equal clusters that reshuffle between cycles read to
an Operations Manager as the ranking changing when nothing has. The third sort key is what makes the
order total. **This is worth raising with the team as a candidate requirement** rather than leaving
as a test that asserts more than any requirement demands.

**R6 reaches past the public API** to construct the defect it guards. That is a deliberate, and
limited, exception: the path exists to catch a programming error inside the class, so it cannot be
reached through a correct public call.

### 3.3 Execution

```
npx vitest run
  tests/smoke.test.ts            13 passed
  tests/basis-path.test.ts       15 passed
  tests/priority-scoring.test.ts 27 passed
  Test Files 3 passed (3)   Tests 55 passed (55)
```

---

## 4. Minimising redundancy (§3.2.3)

Four rules were applied, and each one removed cases:

1. **One case per equivalence class, not one per value.** EC1 is a single case, not twenty scores
   below 40.
2. **Boundaries only where a requirement states one.** The two tier thresholds get three cases each;
   the normalisation strategies get their range ends. No boundary was invented for a value no
   requirement constrains.
3. **Invalid classes only where they are reachable.** EC4 and EC5 and basis path P0 are documented
   and not tested, with the reason recorded.
4. **Paths, not permutations.** `isTransitionPermitted` has 14 table rows and 3 roles — 42
   combinations. Five paths cover the logic; the remaining 37 exercise the same branches with
   different data. The table's own integrity is checked separately, in two cases, rather than by
   enumerating rows.

---

### 2.33 Twenty-ninth subject - the shell's chrome (`tests/mobile-app.test.tsx`, M15-M19)

Added 2026-09-06, with §11.9. The Figma screens are two designs rather than one: the Operations
Manager works at 1440x1024 with a dark rail down the left, the Resident and the Crew at 390x844 with
a tab bar across the bottom. The shell now honours that with a single `data-chrome` attribute and
one set of markup, and these five cases guard the seam.

**None of them asserts a pixel either**, for the same reason as §2.32: the arrangement is entirely a
stylesheet's work and jsdom lays out nothing. What they assert is the three facts the CSS keys off -
that the attribute is `rail` for a manager, `bar` for a resident and `none` for a signed-out visitor
(M15, M16) - and the two guarantees the requirements do not let a redesign quietly take away: that
every destination carries its **word** and not only its glyph, with the glyph marked `aria-hidden`
so a screen reader announces the label alone (M17, 11.7.5, 11.9.4), and that exactly one item is
marked `aria-current="page"` (M18, 11.1.4).

**M19 is a regression, and it is the one worth reading.** The tab-bar rules were first written as
`[data-chrome='bar'] nav`, a descendant selector - which also matched the `<nav>` of actions a
screen renders at the foot of its own content. Both were then `position: fixed` at the bottom of the
viewport, the screen's own nav won, and on every phone-sized screen the navigation appeared simply
to have vanished. It was found by taking a screenshot in a real browser, which no test in this suite
would have done; the selectors now say `> header nav`, and M19 asserts the structural fact they
depend on. The lesson is recorded rather than the fix: **a stylesheet change is not verified by a
green suite**, because nothing here renders.

## 5. What still needs tests, and what blocks each

| Area | Blocked on |
|---|---|
| ~~Repository spatial queries (1.2.5, 3.1.8, 5.1.7)~~ | **Done 2026-09-04** — §2.24. The block was a live PostGIS instance; there is one, and the eleven cases run against it |
| ~~`AbstractIngestionJob.run` template~~ | **Done 2026-09-03** — §2.6, cases I1–I5 |
| ~~`AccessControlService.authorise` — every §2.3 rule~~ | **Done** — the ownership-scoped check is covered in §2.9 (V4) and the role rules in §2.10 (T2) and §2.8 |
| ~~`WorkOrderLifecycleController.transition` end to end~~ | **Done 2026-09-03** — §2.8 |
| ~~Dialog map ↔ router agreement (11.3.2)~~ | **Done 2026-09-03** — §2.14, case D2. The diagram is parsed and the route table checked against it in both directions |
| One end-to-end path (Playwright) | **Largely answered 2026-09-04** — §2.25. `uat.ts` walks the whole API path over HTTP and `client-uat.ts` drives the served bundle in jsdom. What a real browser would still add is rendering: layout, contrast and tap targets, which is the same gap as the row below |
| **Visual regressions in the stylesheet (11.9.x)** | Rendering. The `> header nav` defect (§2.33, M19) was invisible to 704 green tests and obvious in the first screenshot. Until something renders in CI, a layout change is verified by a human looking at a browser - which is now a step in the demo-drive run rather than an intention |
| **Contrast, tap-target size, sunlight legibility (11.7.1, 11.7.4, 11.7.7)** | A human with a phone, outdoors. jsdom renders no pixels, and no test in this suite can substitute — recorded here rather than left implied by the screen tests' green results |
| **10.1.5 does not hold: p95 2125 ms against a 1000 ms budget** | Nothing — it is measured (§2.26). What it needs is a *fix*: `/api/ops/dashboard` computes `reportSourceHealth()` and `findAllOpen()` twice per request across its two halves, in fifteen-odd serial round trips. Awaiting a decision rather than blocked |
| ~~Everything in §6~~ | **§6.1 to §6.4 done 2026-09-16** — 41 cases across `tests/pest-compatibility.test.ts` and `tests/pest-scoring.test.ts`. §6.5 and §6.6 remain blocked on build steps 7 and 8, the two external gateways |
| **`rainfall.test.ts` J2 — fixed, and it was not what it looked like** | It read as a de-duplication defect: a second `backfill()` of the same page reported two fresh writes instead of zero. De-duplication was correct. `InMemoryRainfallStore` pruned against `Date.now()`, and this file's fixture is dated 2026-09-03, so from 2026-09-06 onwards every reading was older than the 80-hour retention floor the moment it was written — the map emptied between the two calls, and the second call genuinely was writing new rows. **The case would have failed on demo day**, and it would have been read on demo day as the accumulation double-counting rain. The store now takes its clock as a constructor argument, real in production and pinned to the fixture's date in the test. 749/749 |
| The manual run's `1.1.12` ingestion-failure **event** | Implementation. `DomainEventPublisher` is still a `not implemented` skeleton; the failure is recorded as a FAILED run and surfaces on the health and attention panels, but no event is raised, so there is nothing to test yet |
| `NEAFeedGateway.fetchLastUpdatedAt` / `fetchClusters` against a fixture | Implementation. The two-hop download (poll-download → signed S3 URL) is the part worth a test, since the signed URL expires |

**The last row is the one to protect.** 11.3.2 says no transition exists that is not in the dialog
map. That claim is checkable mechanically once the router exists, and if it is left to eyeballing it
will be false within a fortnight — the Lab 2 and Lab 3 reviews each found dialog-map defects that a
test of this kind would have caught the day they were introduced.

---

## 6. Designed but not executed — the v0.9 cross-pest generalisation

**Read this heading literally.** Everything in §2 and §3 above was transcribed from a real run.
Nothing in this section has been executed, because none of the code exists yet: `REQUIREMENTS.md`
v0.9 and the Lab 2/Lab 3 diagrams were updated on 2026-09-16 ahead of any implementation, and this
section is the test design that goes with them. The Actual Output column is therefore **absent**, not
blank — a blank column invites someone to fill it in with what they expect, which is exactly the
failure a test plan exists to prevent. When `EPICS-STORIES.md` E11 is built, these tables move up into
§2 with real results, and this section shrinks to what remains undone.

Design-time status is itself a §3.2.3 decision: the cases below were chosen now, while the
requirements were being written, for the same reason `PriorityScoringEngine` was chosen at design time
rather than found afterwards.

### 6.1 §2.34 — the compatibility obligation, requirement 4.2.5

> **Executed 2026-09-16 — `tests/pest-compatibility.test.ts`, 16 cases, all passing.** C1 runs once
> per fixture through `it.each`, and two cases were added while building that the design did not
> foresee: **C1b** and **C6**, both below.

**This is the first test to be written in E11, before any other line of E11 code.** 4.2.5 says the
mosquito's priority score shall equal the weighted sum of the seven v0.8 drivers on the same 0–100
scale. It is the requirement that makes the generalisation provably additive, and it is the only one
whose failure means the widening must be backed out rather than fixed.

**Why it can pass.** Severity multipliers are normalised against the most severe pest in the
catalogue, so σ(Mosquito) = σ(Rat) = 1.000 by construction (4.2.7 refuses a catalogue where no pest
carries 1.0), and the tier A weight set is v0.8's unchanged (4.3.4). Score = 1.000 × urgency =
the v0.8 weighted sum. The arithmetic is an identity, not an approximation, and the cases below are
what stop it quietly ceasing to be one.

| # | Method | Test input | Expected output |
|---|---|---|---|
| C1 | `PestPriorityCalculator.score` | every driver fixture already used by `tests/priority-scoring.test.ts` | **bit-identical** to the v0.8 expected value, not merely within a tolerance |
| C2 | `PestProfileRegistry.severityOf` | `Mosquito` | exactly 1.0 |
| C3 | `PestPriorityCalculator.assignTier` | the BV1–BV8 scores of §2.4, pest type `Mosquito` | the same tiers §2.4 recorded |
| C4 | `PestProfileRegistry.driversFor` | tier A | the seven drivers of 4.1.3, in the v0.8 order |
| C5 | `ConfigSet.validatePestProfiles` | a catalogue whose highest severity multiplier is 0.9 | rejected — 4.2.7 |
| **C1b** | `scoreOne` | fixture D5, two rainfall drivers absent | `excludedDrivers` is exactly `[Rainfall24h, Rainfall72h]` |
| **C6** | `applySeverity` | urgency 0.626 at severity 1.0 | 62.6 |

**C1b was not in the design, and it is the case that caught a real defect.** v0.8 derived
`excludedDrivers` by walking the whole `Driver` enum. In v0.9 that enum has four more members, so
every dengue score would have come back marked DEGRADED, naming four drivers a mosquito can never
have — the score itself unchanged, so C1 alone would have passed. The fix is in `UrgencyCalculator`:
exclusion is computed against `profile.drivers()`, the tier's set, not against the enum. The same
mistake was waiting in `ConfigSet.validateComplete` and in `NormalisationFactory.build`; both are
fixed, and the enum-walking that remains in the factory carries a comment saying why it is correct
there and nowhere else.

**The v0.8 goldens, for the record.** Produced by `tests/fixtures/generate-v08-goldens.ts` against
the v0.8 engine *before* the split, and reproduced exactly by the generalised scorer:

| Fixture | v0.8 score | tier | contributions |
|---|---:|---|---:|
| D1 large active cluster | 62.6 | Medium | 7 |
| D2 small new cluster | 30.0 | Low | 7 |
| D3 mid cluster, saturating rainfall | 63.7 | Medium | 7 |
| D4 zero everywhere | 0.0 | Low | 7 |
| D5 two drivers absent | 57.0 | Medium | 5 |

**C1 is the case that matters and C5 is the case that protects it.** C1 alone would pass on a
catalogue where every multiplier had been scaled down by the same factor — the mosquito would still be
top of its own ranking and every score would be wrong. C5 is what makes the normalisation invariant
enforceable rather than conventional.

**C3 is not redundant with §2.4** even though it reuses those inputs. §2.4 tests `assignTier` on a
bare number; C3 tests it through the new severity path, where a defect would be a multiplication, not
a comparison. Same inputs, different subject — which is the distinction §4 rule 1 turns on.

### 6.2 §2.35 — the critical override, requirement group 4.4

> **Executed 2026-09-16 — `tests/pest-scoring.test.ts`, cases O1 to O10, all passing.**

§4.4 exists because a linear weighted sum cannot express acute life-safety: a snake indoors in a
locality with two reports scores low and is correct to score low, and is still the thing the manager
must see first. The override is deliberately **not** arithmetic — it does not add points — so the
cases test a branch, not a number.

**Equivalence classes for `CriticalOverrideEvaluator.evaluate`:**

| Class | Report | Expected | Valid? |
|---|---|---|---|
| EC-O1 | pest class Wildlife, location context Indoor | Critical (4.4.7) | valid |
| EC-O2 | pest class Wildlife, location context Outdoor | no override | valid |
| EC-O3 | any pest class, injury recorded | Critical (4.4.8) | valid |
| EC-O4 | pest class not Wildlife, no injury | no override | valid |
| EC-O5 | unverified report | not evaluated at all — 4.4.1 says *verified* | valid, and easy to get wrong |

| # | Method | Test input | Expected output |
|---|---|---|---|
| O1 | `evaluate` | verified snake report, Indoor | Critical, rule named `wildlife-indoors` |
| O2 | `evaluate` | verified snake report, Outdoor | tier from score alone |
| O3 | `evaluate` | verified ant report, `injuryReported` true | Critical, rule named `injury` |
| O4 | `evaluate` | verified ant report, no injury, score 12.0 | Low |
| O5 | `evaluate` | **unverified** snake report, Indoor | no override (4.4.1) |
| O6 | `evaluate` | verified snake report, Indoor, score 12.0 | tier Critical **and** score still 12.0 (4.4.5) |
| O7 | `PriorityRanking.rank` | one Critical at 12.0, one High at 88.0 | the 12.0 row ranks first (4.4.4) |
| O8 | `evaluate` | a report matching both rules | Critical, both rules named (4.4.6) |
| O9 | `CriticalOverrideEvaluator` | rules absent from configuration | start-up refused, not silently unarmed |
| O10 | notification path | a subject raised to Critical | manager notified within 60 s (4.4.9) |

**O6 and O7 are the pair that carry the requirement.** An implementation that raises the *score* to
100 instead of raising the *tier* passes O1, O3 and O7 and fails O6 — and it would have destroyed the
only honest thing about the override, which is that it tells the manager the case is dangerous
*without* pretending the evidence is stronger than it is. O7 then proves the ranking respects a tier
the arithmetic disagrees with.

**O9 is a configuration case in a behaviour suite on purpose.** An override that silently fails to
load looks exactly like an override that never matched. Every other failure here is loud; this one
would be silent, so it is tested at start-up rather than at evaluation.

### 6.3 §2.36 — evidence tiers and driver availability, requirement group 4.3

> **Executed 2026-09-16 — cases T1 to T6, all passing.** T6 was added while building: the same
> urgency produces a fourfold difference in score between a rat (sigma 1.00) and a pangolin (sigma
> 0.25), which is the cross-pest comparability claim stated as an assertion. Note what it does
> **not** assert — that the rat's score is exactly four times the pangolin's. 4.2.4 rounds each
> score independently, so four times 15.9 is 63.6 while the rat's own score is 63.4. Asserting the
> first would be asserting that rounding does not happen.

| # | Method | Test input | Expected output |
|---|---|---|---|
| T1 | `driversFor` | tier B | the six drivers of 4.3.5 |
| T2 | `driversFor` | tier C | the five drivers of 4.3.6 |
| T3 | `ConfigSet.validate` | a tier C weight set naming `Rainfall72h` | rejected — 4.3.8 |
| T4 | `ConfigSet.validate` | a tier B weight set summing to 0.95 | rejected — 4.3.7 |
| T5 | `PestPriorityCalculator.score` | a tier C pest, **every gateway unreachable** | a score is produced — 4.3.10 |
| T6 | `PestPriorityCalculator.score` | bed bug, no observations, no feed | a score, and evidence tier C displayed with it (4.3.9) |

**T5 is the point of the whole tier scheme.** Bed bugs and fleas returned **one iNaturalist record
each in twelve months** when the feed was screened on 2026-09-16 — that measurement is why tier C
exists, and T5 is the assertion that the system does not degrade to zero when it has nothing but its
own reports. It should run with the network stubbed out entirely.

### 6.4 §2.37 — referral, requirement group 8.6

> **Executed 2026-09-16 — cases F1 to F7, all passing**, with F1b and F1c added for 8.1.16 and 8.1.17.
>
> **What building F2 found.** The report transition table has no `Verified -> Actioned` rule for an
> Operations Manager: 5.2.6's rule is `SYSTEM`, because the status change is a *consequence* of an
> action rather than the action itself, exactly as when a work order is raised. The referral
> controller therefore transitions as `SYSTEM`, and who referred it is recorded on the `Referral`
> (8.6.4) and in the audit trail. That is the design agreeing with itself rather than a rule being
> added to suit a new caller, and it is worth saying out loud in a viva: the table refused, and the
> table was right.

| # | Method | Test input | Expected output |
|---|---|---|---|
| F1 | `WorkOrderController.create` | a verified wild boar report | refused — 8.1.14 — and the referral action offered (8.1.15) |
| F2 | `ReferralController.refer` | a verified macaque report | referral recorded with destination, referrer, timestamp, reason; report status Actioned |
| F3 | `ReferralController.refer` | as F2 | **no `WorkOrder` row and no `TreatmentRecord` row exists afterwards** (8.6.10, 8.6.11) |
| F4 | recency driver | a locality whose only case was referred | days-since-last-treatment unchanged by the referral (8.6.11) |
| F5 | `ReferralController.recordOutcome` | an open referral | report status Closed (8.6.9) |
| F6 | `ReferralController.refer` | a pest whose profile names no dispatch authority | refused with a stated cause (6.10.EX.2) |
| F7 | notification path | a referral | the reporting resident is told, and the destination authority is named (8.6.6) |

**F3 and F4 are one defect in two places.** Writing a treatment record on referral is the natural
thing for a developer to do — the case is closed, after all — and it would corrupt 4.1.17's feedback
loop by telling the scorer a locality was treated when nobody treated it. F3 catches the write; F4
catches the consequence, so that removing the write without understanding why still leaves a test
standing.

### 6.5 §2.38 — observation ingestion, requirement group 1.5

> **Executed.** `tests/observation-ingestion.test.ts`, 11 cases — B1 to B8 as designed, plus B4b,
> B9 and B10. Build step 8 is written.
>
> **B3 failed on its first run, and the code was wrong, not the test.** `isAdmissible` measured the
> 90-day window in elapsed milliseconds against a bare `observed_on` date, which parses to midnight.
> A record exactly 90 days old was therefore admitted at 00:30 and rejected at 02:00 the same
> morning: the rule depended on what time of day the job happened to run, and the feed would have
> quietly shrunk for whoever scheduled the cycle later. The comparison is now whole days between
> calendar dates, on Singapore's calendar for the reason J3 records. This is what a boundary case is
> for — an implementation that is wrong by hours fails here and nowhere else.

| # | Method | Test input | Expected output |
|---|---|---|---|
| B1 | `INaturalistGateway.parse` | a record with `obscured: true` | rejected — 1.5.6 |
| B2 | `INaturalistGateway.parse` | `positional_accuracy` 500 / 501 | accepted / rejected — 1.5.7, at the boundary |
| B3 | `INaturalistGateway.parse` | observed 90 / 91 days ago | accepted / rejected — 1.5.5, at the boundary |
| B4 | `INaturalistGateway.parse` | a record with no latitude | rejected — 1.5.4 |
| B5 | `ObservationIngestionJob.run` | a batch of 10, 4 rejected across all four rules | per-rule rejection counts recorded — 1.5.8 |
| B6 | `ObservationIngestionJob.run` | the same batch twice | stored once, nothing overwritten — 1.5.11 |
| B7 | `ObservationIngestionJob.run` | a record outside every locality | discarded — 1.5.10 |
| B8 | `ObservationIngestionJob.run` | gateway failing three times | three retries at five minutes, then last-good served — 1.5.12, 1.5.13 |

**B2 and B3 are boundary cases in the §2.2 sense** — 500 and 90 are stated in the requirement, so an
implementation using `>` where it should use `>=` fails exactly here and nowhere else.

**B1 is the one to run against a real payload before trusting any of it.** Macaque, otter and pangolin
records sampled on 2026-09-16 were **100% obscured**; a parser that mishandles the flag would admit
coordinates randomised across a 22 km box and bind them to whichever locality they happened to land
in. That is not a wrong number, it is a fabricated one.

### 6.6 §2.39 — the operator registry, requirement group 1.6

> **Executed.** `tests/operator-registry.test.ts`, 9 cases — G1 to G6 as designed, plus G1b, G4b and
> G5b. Build step 7 is written.
>
> **G1b was added beyond the design.** A `split(',')` reader passes G1 and fails G1b, and the symptom
> would not look like a parsing bug: company names in this file contain commas
> ("PEST-PRO MANAGEMENT PTE. LTD., SINGAPORE"), so shearing one shifts every later column one place
> left and the file arrives as 290 rows with invalid postal codes.

| # | Method | Test input | Expected output |
|---|---|---|---|
| G1 | `VCORegistryGateway.parse` | postal code `52` and `528844` | rejected / accepted — 1.6.3 |
| G2 | `OperatorRegistryLoader.load` | the 290-row fixture | all valid rows loaded with coordinates |
| G3 | `OperatorRegistryLoader.load` | the same postal code twice | geocoded once — 1.6.5 |
| G4 | `OperatorRegistryLoader.load` | geocoder unavailable, warm cache | previous registry retained — 1.6.6 |
| G5 | nearest-operator distance | a locality with a known nearest office | the straight-line distance, to the metre — 1.6.8 |
| G6 | any surface displaying the registry | — | the source publication date is present — 1.6.7 |

**G6 is not cosmetic.** 1.6.7 exists because this registry is static reference data presented beside
live feeds, and the one thing a viewer must not conclude is that 290 offices were where they are
today. It is a display obligation and it is testable, so it is tested.

### 6.7 What this section does *not* cover, and why

| Not designed | Reason |
|---|---|
| Basis-path cases for `PestPriorityCalculator.score` | The method is a multiplication and a tier lookup. V(G) is 2. §3.2.2 asks for methods with *complex* logic, and inventing a third subject with no branches would be padding — the two existing subjects stand |
| The severity multipliers themselves | They are judgement, from the rubric in `PEST-PRIORITY-MODEL.md` §4, not measurement. A test asserting σ(Macaque) = 0.92 asserts only that someone typed 0.92 twice. What *is* tested is the invariant they must satisfy — C2 and C5 |
| The 22-row catalogue's contents | Same reason. C4 tests the tier A driver set because 4.3.4 states it; nothing states which pest is third-most severe |
| Cross-pest ranking *correctness* | There is no ground truth to test against. O7 tests that the ranking respects the tier, and §2.34 tests that dengue is unchanged. Whether a rat in Bedok should outrank a mosquito in Yishun is a question for the demo's Q&A, not for a test |

### 6.8 §2.40 — the evidence actually reaching a score, and the schema underneath it

> **Executed.** `tests/cross-pest-scoring.test.ts`, 7 cases.
>
> This section was not in the original design, and why it exists is worth recording. Build steps 7
> and 8 delivered two evidence sources with twenty passing cases between them — and nothing read
> what they collected. `ExternalObservationDensity` and `ResponseCapacityDeficit` were declared as
> driver inputs and populated by nobody, so a locality with wildlife sightings and no reports scored
> nothing at all. Every case in §6.5 and §6.6 passed throughout.

| # | Method | Test input | Expected output |
|---|---|---|---|
| X1 | `reportDriversByLocalityAndPest` | rats and cockroaches in one locality | counted separately — 4.1.3 |
| X2 | same | verified, unverified, and one outside the window | velocity counts submissions; 4.1.3 counts verified — 4.1.23 |
| X3 | `CrossPestScoringService.scoreAll` | a locality with one rat report | one score, not 22 |
| X4 | same | a mosquito report and a rat report | the mosquito is not scored here |
| X5 | same | an observation and no reports | the tier B pest is scored — 1.5.9 into 4.1.24 |
| X6 | same | registry loaded / not loaded | the driver is fed / excluded and the score degraded — 1.6.8, 4.1.9 |
| X7 | same | a tier C pest | five drivers, no observation driver — 4.3.6 |

**X5 is the case that would have failed before this pass**, and so would X6's first half.

**The schema gap sat underneath all of it.** `Report.pestType` was written by the form, enforced by
the controller and read by 8.1.14 to decide whether a crew is sent — and `ReportRepository` had no
column to put it in. A deployed instance would have accepted a snake report, stored a report of no
particular pest, and dispatched a cleaning crew to it. Nothing would have errored. The suite was
blind to this by construction: every other test runs against the in-memory stores, so the only
configuration that lost data was the deployed one. `tests/repository.test.ts`, which runs against
live PostGIS, failed within seconds of the query changing — which is the argument for keeping a
live-database suite at all. Migration `005_pest_generalisation.sql` closes it, and is applied.

**Two migrations report a checksum mismatch** — `001_initial_schema.sql` and
`002_task_type_alignment.sql` were edited after being applied. The runner warns rather than fails,
and it predates this work. It means a freshly migrated database and the current one are not
guaranteed identical, which is worth resolving before anyone sets up a second environment.

### 6.9 §2.41 — the two requirements that were wired to nothing (4.4.9, 8.6.6)

Executed. `tests/cross-pest-scoring.test.ts` (X8–X10, N1–N4) and `tests/pest-scoring.test.ts`
(F8, F9). Nine cases, all passing.

Both subjects here are the same *kind* of defect as §6.8's, found the same way — by asking what
calls a thing rather than what tests it — and one of them is worse than a gap.

**8.6.6 was not missing; it was wrong.** The requirement is that the reporting Resident is told
their report has been referred, naming the destination authority. No such message was sent. What
was sent instead came from 8.6.5: referral sets the report `Actioned`, 5.2.8 fires on every status
change, and the default `Actioned` wording is "has been scheduled for treatment". So a resident who
reported a snake was told D-Fence had scheduled a treatment for it, when the case had just been
handed to AVS and nothing was scheduled or treated. 8.6.9's closing message had the same fault:
"has been treated and closed", with 8.6.11 explicitly forbidding the TreatmentRecord that would
have made it true.

The fix keeps delivery on the single write path 5.2.8 requires — `ReportLifecycleController.transition`
now accepts an optional resident-facing notice, and `ReferralController` supplies the true sentence,
which names the authority and gives its number so the resident can follow the case up with the body
that now holds it.

**4.4.9 could not be wired, because 4.4 was not running.** `CriticalOverrideEvaluator` and
`PestPriorityCalculator.withOverride` were reached by nothing in `src/` — only by their own tests
in §6.2 and by two type-imports. The override rules were correct, tested and never executed against
a real score, so a venomous snake indoors was ranked on its two reports like any other thin case:
precisely the outcome requirement group 4.4 exists to prevent. §6.2's ten cases all passed
throughout, and could not have caught this — they construct the evaluator and call it directly.

| # | Method | Test input | Expected output |
|---|---|---|---|
| F8 | `ReferralController.refer` | a verified wild boar report | the resident is told it was referred, naming AVS — 8.6.6 |
| F9 | `recordOutcome` | the authority reports back | the closing message claims no treatment — 8.6.9, 8.6.11 |
| X8 | `CrossPestScoringService.scoreAll` | a verified snake report, indoors | the subject is Critical — 4.4.3, 4.4.7 |
| X9 | same | with and without the evaluator | same score, higher tier — 4.4.5 |
| X10 | same | the same report, unverified | scored, not raised — 4.4.1 |
| N1 | `CriticalEscalationNotifier.announce` | one newly Critical subject | the manager is told, naming pest, place and rule — 4.4.6, 4.4.9 |
| N2 | same | the same subject, next cycle | announced once, not every cycle |
| N3 | same | Critical, then not, then Critical | announced twice |
| N4 | same | a High subject | nobody is notified |

**N2 is the case that decides the design.** 4.4.9 says "raised to", which is a transition and not a
state. Announcing the state every cycle would send a manager the same snake every fifteen minutes
until someone dealt with it, and a notification stream that repeats is one a manager learns to
ignore — defeating the requirement rather than meeting it. N3 is the other half: a subject that
drops out of Critical and returns is a new event and is announced again.

The one-minute deadline is met by construction rather than by a timer: `announce` is called inline
in `scoreAndAlert`, immediately after the scores are saved, so the only latency between the
escalation and the message is delivery itself.

**A note on the case ids.** The designed §6.4 table gave F7 to "the reporting resident is told, and
the destination authority is named". When §6.4 was executed, F7 was written against 8.6.1 and 8.6.4
instead and the notification case was not written at all — which is how an unwired requirement kept
a row in a table of passing tests. F8 is the designed F7. The id is not reused, per the same rule
the requirements follow: numbers are permanent.

### 6.10 §2.42 — the query that nearly took the database down (1.2.7, 1.2.8)

Executed. `tests/rainfall.test.ts` (Q1–Q6) and `tests/repository.test.ts` (RA1–RA4, live PostGIS).
Ten cases, all passing.

This one was not found by reading code. Supabase sent a Fair Use notice: **13.31 GB of egress
against a 5.5 GB allowance**, with the project to start returning 402 on 19 September 2026. The
cause was a single line in the scoring cycle.

`scoreAndAlert` called `rainfall.readingsSince(now − 72 h)` and handed the result to
`RainfallAccumulator.accumulate`, which needs, per station, four sums and two timestamps. Measured
against the live database: **66,778 rows, 3.038 MB, 680 ms — every five minutes, 288 times a day,
0.85 GB a day.** Over the thirteen days since 4 September that is essentially the entire overrun.
The same call sat on the resident saved-location path, so opening one saved location pulled 3 MB to
answer "has it rained at my block".

`RainfallStore.stationWindows(now)` now does the summation in SQL. Measured on the same data:
**88 rows, 0.008 MB, 66 ms — a 359-fold reduction in bytes and a tenfold one in latency.**

| # | Method | Test input | Expected output |
|---|---|---|---|
| Q1 | `accumulateWindows` vs `accumulate` | a three-window fixture | identical results |
| Q2 | same | unequal values per station | identical — the 1.2.6 weighting survives |
| Q3 | same | nothing in the 24-hour window | 0 mm with no coverage, not 0 mm measured — 4.1.12 |
| Q4 | same | 26 hours of history | still reported as 26 — W6 through the new path |
| Q5 | same | fresh / stale / aged out entirely | staleness agrees in all three — 1.2.10 |
| Q6 | `stationWindows` | nine readings, three stations | three rows |
| RA1 | `RainfallRepository.stationWindows` | readings inside, outside and in the future | each window sums only its own, and returns numbers not strings |
| RA2 | same | a station absent from a window | `null`, never 0 — 4.1.12 |
| RA3 | aggregate vs row-by-row, live | the same stored rows | the same cluster rainfall |
| RA4 | same | the live table | one row per station |

**RA1 and RA2 are the cases that need a real database.** Every trap here is SQL's own and every one of
them yields a plausible number rather than an error: `sum()` over no rows is `NULL` and a careless
mapping writes 0, which asserts "no rain here" where the truth is "no data" — the exact false claim
§6.9's W6 was written for. `numeric` arrives from `pg` as a string, so `+` concatenates: `"1.5" +
"2.25"` is `"1.52.25"`, and a 72-hour accumulation becomes nonsense that still renders. A `FILTER`
bound an hour out sums the wrong window and looks like weather.

**The general lesson, and it is the third of its kind this week.** §6.8 found evidence that reached
no score, §6.9 found requirements that reached no caller, and this found a query whose cost nobody
had measured because the suite runs against in-memory stores where reading 66,778 rows is free. A
test that proves an answer correct says nothing about what the answer cost to obtain.

### 6.11 §2.43 — the migration that took scoring down for ten hours (4.1.11, 4.2.1)

Executed. `tests/repository.test.ts` (PS1–PS3, live PostGIS). Three cases, all passing.

Found by deploying. Not by a test, not by review — by checking, after the deploy, whether the live
system had actually scored anything, and finding that its newest score was **nine and a half hours
old**.

Migration 005 replaced the unique key on `priority_score`: `(cluster_id, computed_at)` became
`(cluster_id, pest_type, computed_at)`, because a locality now has one score per pest and the old
key would have let the second pest scored in a cycle silently fail to insert. That reasoning is
right and it is written into 005. What the migration did not do is touch
`PriorityScoreRepository`, which names that key in an `ON CONFLICT` clause.

From **2026-09-16 16:05Z**, every scoring cycle on the deployed instance raised *"no unique or
exclusion constraint matching the ON CONFLICT specification"*, rolled back the cycle's transaction
and wrote nothing. Two things hid it. Ingestion kept succeeding and `/api/health` kept returning
200, because neither depends on scoring. And the dashboard kept serving the last scores it had, so
the failure looked exactly like a quiet afternoon.

The repository was also writing no `pest_type` at all, so once the conflict target was repaired
every cross-pest score would have been stored under the column's default of `Mosquito` — and then
collided with the real mosquito on the conflict target, leaving one row where there were three
subjects. Migration 005's whole purpose, defeated by the writer it was written for.

| # | Method | Test input | Expected output |
|---|---|---|---|
| PS1 | `PriorityScoreRepository.saveAll` | one mosquito score | it saves at all — the regression itself |
| PS2 | same | three pests, one locality, one cycle | three rows, three pest types — 4.2.1 |
| PS3 | same | the same subject scored twice | one row, updated, not duplicated — 4.1.11 |

**Why the suite could not have caught this.** `PriorityScoreRepository` had no live-database test of
any kind, and the in-memory store has no constraints to violate: `saveAll` against a `Map` cannot
fail an `ON CONFLICT` that names nothing. This is the same lesson as §6.8 and §6.10 arriving from a
third direction — a schema change is a change to two artefacts, the migration and every writer that
names what it changed, and only one of those has a test that runs against Postgres.

**A standing check follows from this.** After applying any migration, run the live-database suite
*and* confirm the deployed instance still writes: `max(computed_at)` on `priority_score` should
never be more than one cycle old. A green in-memory suite is not evidence about a database.

### 6.12 §2.44 — a source is named in three tables (1.1.20, 1.4.1)

Executed. `tests/repository.test.ts` (SK1, live PostGIS). One case, passing. Migration
`006_source_check_widening.sql` written and applied.

Found in the deployed instance's own log, within minutes of §6.11's fix going out — which is the
argument for reading the log after a deploy rather than trusting a green health check.

Migration 005 widened `ingestion_run_source_check` to admit `Observations` and `OperatorRegistry`,
and stopped there. `source_state` and `source_health` carry the same list of sources in their own
CHECK constraints, written in 001 when there were four sources and no reason to imagine more.

The resulting failure had the worst available shape. `IngestionRunRepository.recordRun` updates
`source_state` *after* a successful run, so the observation job fetched from iNaturalist, applied
1.5.4–1.5.7, stored its records and wrote its `ingestion_run` row — and then threw

> `new row for relation "source_state" violates check constraint "source_state_source_check"`

while recording that it had succeeded. The exception propagated out of `observationCycle` and
aborted the remainder of the cycle. A feed that had worked perfectly took the cycle down at its last
step, and the message named a constraint nobody had looked at since 001.

| # | Method | Test input | Expected output |
|---|---|---|---|
| SK1 | `source_state`, `source_health`, `ingestion_run` | every member of `SourceKind` | every table accepts every one |

**SK1 deliberately does not test the two sources that were missing.** It iterates `SourceKind` and
asserts all three tables accept every member, which is the only form of the case that still holds
when someone adds a seventh source. A test naming `Observations` and `OperatorRegistry` would pass
for ever and catch this exact class of defect never again.

**Taken with §6.11, the rule this yields:** adding a value to an enum that reaches the database is a
change to *every* table that constrains it, and finding one of them is not finding all of them.
`grep` for the old value list, not for the table you happened to be thinking about.

---

## §6.13 — A score that could not say why it was Critical

`PriorityScore` carries four claims the model makes about itself: urgency (4.1.7), the severity
multiplier (4.2.8), the evidence tier (4.3.9), and the name of the rule that raised the subject to
Critical (4.4.6). The `priority_score` table stored none of them. Every score read back from the
database therefore came back with those fields unset, and `PestPriorityCalculator.describe` — the
string 7.2.x renders beside the number — printed `evidence tier ?, severity ?` for anything not
still in memory from the current cycle.

For 4.4.6 the consequence was worse than a missing label. A Critical row reloaded after a restart
showed the tier and no reason for it, which is the single thing 4.4.6 exists to prevent: the
override raises the tier and never the score (4.4.5), so the rule name is the *only* record that the
tier was earned rather than computed. It survived exactly as long as the process did.

Migration 007 adds the four columns. Nothing is backfilled. Urgency for a historical mosquito row is
recoverable in principle — score / 100, because σ(Mosquito) = 1.000 by construction — but storing it
would turn a derivation into a stored fact, and the first pest whose multiplier is not 1.000 would
make one column mean two different things. `override_rule_name` is the exception and is
`NOT NULL DEFAULT ''`: Critical only became an assignable tier in 005 and the evaluator was not
wired into the cycle until 2026-09-17, so no existing row was raised by a rule. `''` there is the
true value, not a guess.

| # | Method | Test input | Expected output |
|---|---|---|---|
| PS4 | `saveAll` / `historyFor` | a Critical snake, urgency 0.12, tier B, rule `wildlife-indoors` | all four survive the round trip; `describe` contains no `?` |
| PS5 | `historyFor` | a row whose four columns are NULL, as every pre-007 row is | urgency, severity and tier read back `undefined`; `describe` renders `evidence tier ?` |

**PS5 is the case that constrains the mapping.** `Number(null)` is `0`, and for urgency and severity
`0` is not "unknown" — it is the strongest available claim that a locality needs no attention. The
repository leaves the field unassigned instead, and the "?" the dashboard shows is a true statement
about a row written before the column existed.

### The two live cases this section also repaired

`RA3` and `RA4` were written in §6.10 calling `readingsSince` over the whole 72-hour window, to
compare the aggregate against the row-by-row accumulation. That is the query §6.10 exists to
eliminate: tens of thousands of rows and several MB per run, growing daily. Both began timing out at
5 s as the table filled. They now compare against the fixtures the block itself inserted.

**A test for an egress fix must not re-incur the egress.** The old shape would have gone on
charging the project for the very bytes the change was made to stop paying for, once per test run,
and it would have failed by timeout rather than by assertion — a failure that says nothing about
whether the arithmetic is right.

---

## §6.14 — The requirement that cannot be satisfied indefinitely

Every defect in §6.9 to §6.13 was code that was wrong. This one is a requirement that is right and
unbounded, which is a harder thing to notice because the code implements it faithfully.

**4.1.11** requires the score, tier and driver breakdown of *every* scoring cycle to be retained as
history, and names no period. The scoring cycle runs every five minutes. On 2026-09-19 the database
held 144 MB of the free tier's 500 MB, all of it written since 4 September, growing at **7.9 MB/day**
— full in roughly 45 days. `driver_contribution` was half of it, at 4.6 MB/day: five to seven rows
per score, one score per subject, 288 cycles a day. The rate is linear in pests as well as cycles,
and three of the 22 configured pests currently reach a score.

Egress (§6.10) was fixable by making one query cheaper. Disk is not the cost of a query but the
accumulated cost of every cycle that has ever run, so the only levers are retention and plan.

`src/tools/capacity-check.ts` measures it — read-only, rows per day taken from the data's own
timestamps rather than assumed, bytes per row from `pg_total_relation_size` so that indexes count.
It reports a 7-day and a 1-day window: the week is the *lower* figure, because it contains §6.11's
ten-hour outage and several days on which only one pest scored. When they disagree the shorter one
is what to plan against.

### The proposed policy, and why it is only proposed

Keep every cycle inside 14 days; beyond that keep the **last cycle of each UTC day**, so every day
the system ran is still represented by a real, complete cycle rather than by an average of several.
That takes steady-state growth from ~7.9 MB/day to ~0.03 MB/day and leaves the database stable at
roughly 160 MB, indefinitely.

`src/tools/prune-history.ts` implements it, defaults to a dry run, and requires `--apply`. **It is
not wired into the scheduler and must not be:** a deletion running on the same five-minute timer as
the scoring cycle would destroy history unattended, and the first miscomputed window would take the
history with it before anyone read a log. Retention is a decision, so it is a command.

It also needs a *new* requirement number rather than an edit to 4.1.11 — numbers are permanent —
and until the team ratifies one, running `--apply` is a decision to retain less than the
requirement as written demands.

| # | Method | Test input | Expected output |
|---|---|---|---|
| RT1 | `DOOMED_CYCLES` | three cycles on one old day, one on the next | the first two of day one; the day's last cycle and the lone next-day cycle survive |
| RT2 | `DOOMED_CYCLES` | the whole live table | every selected cycle is older than the window; the fixture's five rows are untouched |
| RT3 | `driver_contribution` | the whole live table | no contribution exists whose score does not |

**RT2 is stated over the whole table rather than over the fixtures deliberately.** It is the
property that makes the tool safe to run at all: the recent window is untouchable by construction,
so an error in the daily grouping can only ever cost old resolution, never current history.

**RT3 guards the reason `DOOMED_CYCLES` names one table.** `driver_contribution` follows its score
by `ON DELETE CASCADE`. If that were ever dropped, the tool would leave half a million rows behind
that no score explains and nothing reads — and it would leave them silently, because an orphaned
breakdown raises nothing.

**The selection is defined once, in `RetentionPolicy.ts`, and used by both the count and the
delete.** Two statements describing the same set in different words would eventually disagree, and
a dry run that reports one thing while the deletion does another is the single failure a deletion
tool cannot be allowed to have.

