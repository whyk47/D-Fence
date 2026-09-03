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
| §3.2.1 (extension) EC/BV cases for the feed parser and driver bindings | **Done 2026-09-03.** `ClusterFeedParser` and `NormalisationFactory`, 30 cases — `tests/cluster-feed.test.ts`, designed in §2.5 |
| §3.2.2 Basis-path cases for **2 methods with complex logic** | **Done.** `isTransitionPermitted` and `ClusterRanking.rank`, 15 cases — `tests/basis-path.test.ts` |
| §3.2.3 Minimise redundant cases while keeping coverage | Applied — see §4 |
| §3.2.4 Execute and document `Test Input / Expected / Actual` | **Done** for the above — §2.4 and §3.3 |
| Integration and end-to-end tests | **Not started.** They need the persistence and HTTP layers, which are skeleton |

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

**D4 and C4 are the two cases worth pointing at in a viva.** Both encode the same rule: an unknown
state must never be recorded as "unchanged". A parser that returned `false` in either case would pass
every happy-path test and silently freeze the cluster data the first time a metadata field went
missing — a failure with no error message anywhere.

**Execution.** `npm test` — 4 files, **85 cases, all passing**, `tsc --strict` clean (2026-09-03).

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
| Repository spatial queries (1.2.5, 3.1.8, 5.1.7) | A live PostGIS instance; these are integration tests, not unit tests |
| `AbstractIngestionJob.run` template — the 10.2.2 / 10.2.3 / 10.2.4 behaviour | Implementation, then a fake `ExternalGateway`. The `ports/` layer exists precisely so this needs no network |
| `AccessControlService.authorise` — every §2.3 rule | Implementation. `AccessPolicy` is done and tested; the ownership-scoped check is not |
| `WorkOrderLifecycleController.transition` end to end | Implementation, plus fakes for four collaborators |
| Dialog map ↔ router agreement (11.3.2) | The client router, which is a stub. This one should be a **test**, not an inspection — every route in the code must be a state on the map |
| One end-to-end path (Playwright) | A running stack |
| `NEAFeedGateway.fetchLastUpdatedAt` / `fetchClusters` against a fixture | Implementation. The two-hop download (poll-download → signed S3 URL) is the part worth a test, since the signed URL expires |

**The last row is the one to protect.** 11.3.2 says no transition exists that is not in the dialog
map. That claim is checkable mechanically once the router exists, and if it is left to eyeballing it
will be false within a fortnight — the Lab 2 and Lab 3 reviews each found dialog-map defects that a
test of this kind would have caught the day they were introduced.
