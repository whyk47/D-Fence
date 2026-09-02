# LAB 2 — REQUIREMENTS ANALYSIS

**Project:** D-Fence · **Module:** SC2006 / CZ2006 · **Started:** 2026-09-02

## Deliverables (lab manual §4)

| # | Deliverable required | File | Status |
|---|---|---|---|
| 1 | Complete use case diagram | `use-case-diagram*.puml` + `.png`/`.svg` | **Done.** v0.2, 41 use cases |
| 2 | Use case descriptions | `USE-CASE-DESCRIPTIONS.md` | **Done.** All 41 described |
| 3 | Class diagram of entity classes | `class-diagram-entity.puml` + `.png`/`.svg` | **Done.** 23 entity classes, 13 enumerations |
| 4 | Key boundary and control classes | `class-diagram-boundary-control.puml` + `.png`/`.svg` | **Done.** 27 screen + 5 gateway boundary classes, 15 control classes; key subset named in `ANALYSIS-MODEL.md` §2 |
| 5 | Initial dialog map | `dialog-map.puml` + `.png`/`.svg` | **Done.** 27 states, three role regions |
| 6 | PDF report on AI technology stack recommendations | `AI-TECH-STACK.md` | **Written; needs PDF export** |

All three models are explained in **`ANALYSIS-MODEL.md`** — modelling decisions, the traceability
table back to Lab 1, and the open items carried into Lab 3.

**Adversarial review run 2026-09-02**, two critics on disjoint axes, every claim verified against
source. Twelve modelling defects fixed and three requirements added (7.5.5, 8.3.21, 11.2.25 — taking
`REQUIREMENTS.md` to v0.4). Dispositions, including what was rejected, are in `ANALYSIS-MODEL.md` §6.
All 352 requirement citations in the use case descriptions were checked programmatically: none
dangle.

## What changed from Lab 1

The Lab 1 model had 20 of 38 use cases described and carried seven known defects from the AI
critique. Both are now closed.

| Change | Origin |
|---|---|
| 18 deferred descriptions written | Lab 1 deferral |
| **1.5 Sign Out** added | Critique 5 — requirement 2.1.12 had no representation |
| **2.4 View Cluster Map** added | Critique 4 — all of §9 was modelled for the manager only |
| **4.4 Notify Crew Member** added | Critique 3 — 8.2.4, 8.2.6, 8.3.11 had no representation |
| **6.7 Raise Issue on Job** re-modelled as a direct association | Critique 1 — the `<<extend>>` on 6.6 confined it to the completion flow |
| **3.4** and **6.8** now include **4.3 Notify Resident** | Critique 2 — 5.2.8, 8.5.2 |
| Scheduler retained as an actor | Critique 6, rejected on verification |

38 → 41 use cases. Identifiers are permanent: nothing was renumbered, so every Lab 1 trace still
resolves.

## Diagrams

| File | View |
|---|---|
| `use-case-diagram.puml` → `D-Fence-UseCases.*` | Master — all 41, complete but dense |
| `use-case-diagram-resident.puml` → `D-Fence-Resident.*` | Resident |
| `use-case-diagram-operations.puml` → `D-Fence-Operations.*` | Operations Manager |
| `use-case-diagram-crew-system.puml` → `D-Fence-Crew-and-System.*` | Cleaning Crew and system actors |

Rendered and visually checked with PlantUML 1.2024.7 on Java 21. Re-render after any edit:

```
java -jar plantuml.jar -tpng *.puml
java -jar plantuml.jar -tsvg *.puml
```

Run the two flags in **separate** invocations — combining `-tpng -tsvg` emits only SVG.

## Outstanding before submission

1. Export `AI-TECH-STACK.md` to PDF.
2. Team review of the three models — particularly the 15 control classes, since Lab 3 builds
   directly on them.
3. Lab 1 mockups B3-B12 remain outstanding and are graded at the Lab 2 session.

## Standing notes

**Settled 2026-09-02: one Operations Manager, one Cleaning Crew.** The real NEA / town-council split of the four task
types is recorded as a known simplification in the entity diagram and in `ANALYSIS-MODEL.md` §1, and
belongs in the extensibility segment of the Lab 5 demo.

**Do not build the design class model here.** Lab 2 wants Bruegge's analysis model — entity,
boundary and control with stereotypes. Fox pp. 341–345, also in `instructions/textbook/`, is the
transformation into a *design* class model, which is Lab 3's deliverable.
