# TEST PLAN — D-Fence

Lab 4 deliverable 3, started early. Version 0.1, 2026-09-03.

**Status.** This covers lab §3.2.1–3.2.4 for the parts of the system that are implemented. It is
started ahead of Lab 4 because the two subjects the lab asks for were *chosen at design time* rather
than found afterwards, and both are now real code that runs. What is not here is anything requiring a
database, an HTTP call or a browser — those tests follow the implementation.

**Everything below has been executed.** The Actual Output columns are transcribed from a real run,
not predicted: `npx vitest run`, 55 tests, 3 files, all passing.

---

## 1. What the lab asks for, and what is done

| Lab requirement | State |
|---|---|
| §3.2.1 Equivalence-class and boundary-value cases for **1 key control class** | **Done.** `PriorityScoringEngine`, 27 cases — `tests/priority-scoring.test.ts` |
| §3.2.1 (extension) EC/BV cases for the feed parser and driver bindings | **Done 2026-09-03.** `ClusterFeedParser` and `NormalisationFactory`, 32 cases — `tests/cluster-feed.test.ts`, designed in §2.5 |
| §3.2 (extension) Ingestion template + full scoring cycle, no network, no database | **Done 2026-09-03.** 15 cases — `tests/ingestion.test.ts`, designed in §2.6 |
| §3.2 (extension) The rainfall path — parsing, station assignment, accumulation, staleness | **Done 2026-09-03.** 18 cases — `tests/rainfall.test.ts`, designed in §2.7 |
| §3.2 (extension) The work-order lifecycle driven end to end | **Done 2026-09-03.** 27 cases — `tests/work-order.test.ts`, designed in §2.8 |
| §3.2 (extension) Community reporting, its boundaries and its join to §8 | **Done 2026-09-03.** 42 cases — `tests/report.test.ts`, designed in §2.9 |
| §3.2 (extension) Accounts, sessions, lock-out and staff provisioning | **Done 2026-09-03.** 38 cases — `tests/account.test.ts`, designed in §2.10 |
| §3.2 (extension) Saved locations, geocoding failure modes and the exposure band | **Done 2026-09-03.** 27 cases — `tests/location.test.ts`, designed in §2.11 |
| §3.2 (extension) Resident alerts: triggers, the daily cap, delivery and retries | **Done 2026-09-03.** 29 cases — `tests/alert.test.ts`, designed in §2.12 |
| §3.2 (extension) Map layers as an access surface, and the trend classification | **Done 2026-09-03.** 24 cases — `tests/map-trend.test.ts`, designed in §2.13 |
| §3.2 (extension) Dialog-map conformance, the route guard, navigation and field rules | **Done 2026-09-03.** 31 cases — `tests/client-navigation.test.ts`, designed in §2.14 |
| US-0.5 (§10.1) Performance obligations measured rather than asserted | **Done 2026-09-03.** 6 cases — `tests/performance.test.ts`, designed in §2.15 |
| US-1.4 (§1.3) The 24-hour forecast, region mapping and the heavy-rain flag | **Done 2026-09-03.** 26 cases — `tests/forecast.test.ts`, designed in §2.16 |
| US-1.5 (§1.4) Source health: the three-interval rule and the staleness marker | **Done 2026-09-03.** 17 cases — `tests/source-health.test.ts`, designed in §2.17 |
| US-2.5 (§2.4) The audit trail across the operational write paths | **Done 2026-09-03.** 10 cases — `tests/audit.test.ts`, designed in §2.18 |
| §3.2.2 Basis-path cases for **2 methods with complex logic** | **Done.** `isTransitionPermitted` and `ClusterRanking.rank`, 15 cases — `tests/basis-path.test.ts` |
| §3.2.3 Minimise redundant cases while keeping coverage | Applied — see §4 |
| §3.2.4 Execute and document `Test Input / Expected / Actual` | **Done** for the above — §2.4 and §3.3 |
| Integration and end-to-end tests | **Partly done.** The §2.6, §2.8 and §2.9 suites are integration tests in all but name — several controllers, real stores, no fakes below the gateway. A browser-level end-to-end test still needs the client |

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

## 5. What still needs tests, and what blocks each

| Area | Blocked on |
|---|---|
| Repository spatial queries (1.2.5, 3.1.8, 5.1.7) | A live PostGIS instance. The **rule** is now tested through the `ClusterLocator` port (§2.9, L1–L3); what remains untested is the PostGIS implementation of it |
| ~~`AbstractIngestionJob.run` template~~ | **Done 2026-09-03** — §2.6, cases I1–I5 |
| ~~`AccessControlService.authorise` — every §2.3 rule~~ | **Done** — the ownership-scoped check is covered in §2.9 (V4) and the role rules in §2.10 (T2) and §2.8 |
| ~~`WorkOrderLifecycleController.transition` end to end~~ | **Done 2026-09-03** — §2.8 |
| ~~Dialog map ↔ router agreement (11.3.2)~~ | **Done 2026-09-03** — §2.14, case D2. The diagram is parsed and the route table checked against it in both directions |
| One end-to-end path (Playwright) | A running stack |
| `NEAFeedGateway.fetchLastUpdatedAt` / `fetchClusters` against a fixture | Implementation. The two-hop download (poll-download → signed S3 URL) is the part worth a test, since the signed URL expires |

**The last row is the one to protect.** 11.3.2 says no transition exists that is not in the dialog
map. That claim is checkable mechanically once the router exists, and if it is left to eyeballing it
will be false within a fortnight — the Lab 2 and Lab 3 reviews each found dialog-map defects that a
test of this kind would have caught the day they were introduced.
