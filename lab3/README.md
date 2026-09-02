# LAB 3 — DESIGN AND IMPLEMENTATION

**Project:** D-Fence · **Module:** SC2006 / CZ2006 · **Started:** 2026-09-03

## Deliverables (lab manual §4)

| # | Deliverable required | File | Status |
|---|---|---|---|
| 1 | Complete use case model | `use-case-diagram*.puml` + `.png`/`.svg`, `USE-CASE-DESCRIPTIONS.md` | **Done.** 41 use cases, all described. Carried from Lab 2 unchanged — no requirement added since changes one |
| 2 | Design model — class diagram | `class-diagram-design-entity.puml`, `-control.puml`, `-boundary.puml` | **Done.** Explained in `DESIGN-MODEL.md` |
| 2 | Design model — dialog map | `dialog-map-design.puml` | **Done.** Routes, operations and self-transitions added |
| 2 | Design model — system architecture | `architecture.puml` + `DESIGN-MODEL.md` §2 | **Done.** Three tiers plus a separate scheduler process |
| 3 | Application skeleton code | `../src/`, `../client/src/` | **Done.** 128 files, typechecks clean under `tsc --strict`; the pure core is implemented, not only stubbed |
| 4 | AI project-initialisation PDF + zip | — | **Not started.** See below — it needs the team, not just the model |

## The design model in one paragraph

The 23 analysis entities keep their names and gain types, visibility and operations; four value types
(`GeoPoint`, `Polygon`, `PremisesMix`, `TierThresholds`) are promoted out of loose attributes. The 15
control classes gain full signatures and are joined by a startup class (`AppConfigurator`) and three
coordinators (`ServiceContainer`, `DomainEventPublisher`, `WorkOrderTransitionTable`). Boundary splits
in two: the HTTP surface the browser talks to, and five adapters to the external services. Five design
patterns are in the diagrams — Strategy, Template Method, Observer, Adapter, Repository — and one, the
GoF State pattern, was deliberately rejected in favour of a table-driven state machine. `DESIGN-MODEL.md`
gives the reasoning for all of it, including the two Bruegge ch. 7.4 questions: persistence and access
control.

## Skeleton code

```
src/
  boundary/    http/ (RouteHandler + 8 route classes), gateways/ (5 adapters + HttpClient)
  control/     15 control classes, 3 coordinators, ingestion/ (Template Method), normalisation/ (Strategy)
  ports/       ExternalGateway family, Repository, the DTOs that cross the boundary
  entity/      23 entity classes, 15 enumerations, 4 value types
  persistence/ 10 repositories, Database, migrations/
  config/      AppConfigurator, ServiceContainer, ConfigSet
client/src/
  screens/     27 screen components, grouped by role
  lib/         LoadState (the four §11.4 sub-states as one value), ApiClient
  app/         AppShell, RouteGuard
```

Packaged by stereotype, as lab §3.4.2 requires. The dependency rule is one-directional — **boundary →
control → persistence, everything may import `ports/` and `entity/`, nothing imports `boundary/`** —
and it is now true of the code. It was not in the first version: the gateway interfaces sat in
`boundary/`, so control imported boundary while `DESIGN-MODEL.md` claimed it did not. The `ports/`
layer is that fix. See `DESIGN-MODEL.md` §8.

Every public class and method carries a docstring naming the requirement it serves, per lab §3.4.3.
**The pure, dependency-free logic is implemented** — haversine distance, all five normalisation
strategies, tier assignment, the weighted sum with driver degradation, ranking, the access-control
matrix, weight validation, and the overdue and terminal predicates. Everything that needs a database,
an HTTP call or a clock still throws `not implemented`, which is where §3.4.1 continues.

```
npm install
npm run typecheck     # tsc --strict, currently clean
npm run dev:server
npm run dev:scheduler
```

**Note on language.** The lab manual gives the OO-to-code mapping in Java conventions (§2.4). We are
building in TypeScript, per the Lab 2 stack decision, so the mapping reads: UML class → `class`,
generalization → `extends`, realization → `implements`, multiplicity association → array or `Map`.
Every one of those appears in the skeleton.

## Deliverable 4 is not done, and here is exactly what it needs

Lab §3.3 has five parts, and three of them cannot honestly be done inside this session:

- **§3.3.1** — re-run the tech-stack prompt **in a fresh chat** with the updated class diagrams. This
  session wrote the diagrams and already knows the Lab 2 answer, so any response it produced would be
  contaminated. It has to be a genuinely new session, or a different tool.
- **§3.3.2** — compare against the Lab 2 recommendation and question any shift. Doable once §3.3.1 exists.
- **§3.3.3** — prompt a coding agent for a skeleton directory structure, **TODO comments only, no
  implementation code**. Worth knowing in advance: agents routinely ignore that instruction, and the
  evaluation in §3.3.4 is more interesting if we record that it did.
- **§3.3.4–§3.3.5** — evaluate critically, compile the PDF, zip the generated structure.

The team decision this needs is only *who runs it and in which tool*. Everything it must be given —
`REQUIREMENTS.md` v0.4 and the three design class diagrams — exists now.

## Outstanding

1. **Deliverable 4** above.
2. **Driver weights unset.** 4.1.5 defers them to configuration and 4.1.6 requires them to sum to 1.0.
   `ConfigSet` holds them; the values should be set against real cluster data.
3. **NEA feed update frequency still unverified** — carried from Lab 2, still load-bearing for the
   grader's "live data update" criterion.
4. **OneMap Search still not test-pulled.**
5. **Lab 1 mockups B3–B12** remain outstanding.

## Standing notes

**Renamed to D-Fence on 2026-09-03.** Every living document uses the new name. The verbatim AI-exercise
records in `lab1/submission/AI-CRITIQUE.md` and `lab2/AI-TECH-STACK.md` keep the old one, with a note
saying why — they are records of what was submitted, not descriptions of the current model.

**Diagrams** render with PlantUML 1.2024.7 on Java 21. Re-render after any edit, in two invocations:

```
java -jar plantuml.jar -tpng *.puml
java -jar plantuml.jar -tsvg *.puml
```
