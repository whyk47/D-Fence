# LAB 1 — REQUIREMENTS ELICITATION

**Project:** D-Fence — dengue sanitisation prioritiser
**Module:** SC2006 / CZ2006 Software Engineering
**Compiled:** 2026-09-02

---

## Deliverables (lab manual §4)

| # | Deliverable required | File | Status |
|---|---|---|---|
| 1 | Documentation of functional and non-functional requirements | `REQUIREMENTS.md` | **Complete.** v0.3, 349 atomised requirements |
| 2 | Data dictionary | `DATA-DICTIONARY.md` | **Complete.** v0.1, 23 entities, 13 enumerations, 16 relationships |
| 3 | Initial use case model (diagram and descriptions) | `USE-CASE-MODEL.md` + 4 diagrams | **Complete.** 9 actors, 38 use cases, 20 full descriptions |
| 4 | UI mockups | Figma (link below) | **In progress — 2 of 12 screens.** See §Mockups |
| 5 | PDF report on the AI critique | `AI-CRITIQUE.md` | **Written; needs PDF export** |

---

## 1. Requirements — `REQUIREMENTS.md`

Version 0.3. Atomised to Fox pp. 126–130: active voice, "shall" only, one testable obligation per
bullet, hierarchically numbered so every requirement can be traced into the use case model, the
data dictionary, the design and the tests.

Eleven sections: live data acquisition · accounts, roles and access control · saved locations and
exposure · priority scoring engine · community reporting · resident alerts · operations dashboard ·
work-order dispatch · map, trend and history · non-functional · front end and UI. §12 is the
traceability matrix, §13 the assumptions and data-verification status, §14 the review dispositions.

This file is a **submission snapshot**. The working master is `../REQUIREMENTS.md`; re-copy it here
if it changes before the deadline.

## 2. Data dictionary — `DATA-DICTIONARY.md`

23 entities with attributes, types, domains and the requirement that defines each one; the
relationship table; a single reference for all 13 enumerations; and the terms of art. §6 records
three known gaps rather than concealing them — the per-driver normalisation method, the driver
weights, and the unmodelled NEA/town-council authority split.

## 3. Use case model

| File | Contents |
|---|---|
| `USE-CASE-DESCRIPTIONS.md` | The 20 descriptions alone, cut to use case name and actor plus the flows |
| `USE-CASE-MODEL.md` | Actor catalogue, 38 use cases in 8 groups, include/extend/generalisation tables, and 20 full descriptions in the Wiegers template |
| `use-case-diagram.puml` → `D-Fence-UseCases.png` / `.svg` | Master diagram — complete, but dense |
| `use-case-diagram-resident.puml` → `D-Fence-Resident.*` | Resident view |
| `use-case-diagram-operations.puml` → `D-Fence-Operations.*` | Operations Manager view |
| `use-case-diagram-crew-system.puml` → `D-Fence-Crew-and-System.*` | Cleaning Crew and system-actor view |

The three role views are subsets of the master and reuse its use case identifiers exactly. They
exist because the master at 38 use cases is complete but hard to read; present the role views and
keep the master as the completeness artefact.

Rendered with PlantUML 1.2024.7. Re-render after editing any `.puml`:

```
java -jar plantuml.jar -tpng use-case-diagram.puml
java -jar plantuml.jar -tsvg use-case-diagram.puml
```

**18 of the 38 use case descriptions are inventoried but not yet written.** Lab 1 asks for an
*initial* model; the remaining descriptions are scheduled for the Lab 2 refinement.

## 4. UI mockups

**Figma file:** https://www.figma.com/make/A6SlK6Z69o0m56P2GuyztR/D-Fence-SG-Design-Screens

`FIGMA-PROMPTS.md` is the prompt pack driving the file — Block A is the shared design context
(palette, type, grid, content rules), Block B is twelve screen prompts, Block C refinement prompts,
Block D an acceptance checklist in which every check cites the requirement it enforces.

| Screen | Prompt | State |
|---|---|---|
| Resident Map | B1 | Done |
| Add Saved Location | B2 | Done |
| Report a Site | B3 | To do |
| Duplicate Report Detected | B4 | To do |
| My Reports | B5 | To do |
| Operations Dashboard | B6 | To do |
| Priority Table with driver breakdown | B7 | To do |
| Moderation Queue and Report Review | B8 | To do |
| Daily Dispatch Proposal | B9 | To do |
| Work Order Detail with assignment | B10 | To do |
| Crew My Jobs | B11 | To do |
| Crew Job Completion | B12 | To do |

**Two things the mockup tool will not produce and the lab grades:**

- **HCI annotations.** Lab §3.4.1 requires HCI principles to be incorporated, and a marker has to
  be able to see which principle each screen demonstrates. Block D names the principle per screen;
  the annotation itself has to be added by hand once the screens exist.
- **Empty, loading, error and stale states.** Required by `REQUIREMENTS.md` §11.4 and demanded
  explicitly by prompts B2 and B12. Generated screens default to the happy path.

## 5. AI critique — `AI-CRITIQUE.md`

Records the tool, the two attachments, the verbatim prompt from lab §3.5.1, and the response in
full. §3 verifies each of the seven claims against the requirements — five accepted, one rejected,
one already mitigated. §4 gives the insightful point with justification (an `<<extend>>`
relationship narrower than the requirement it models). §5 gives the unhelpful point (an unfounded
objection to the Scheduler actor) and the lesson: the response gave no signal separating its
verified defects from its stylistic preference.

**Export to PDF before submitting** — the manual asks for a PDF.

---

## Outstanding before submission

1. Generate screens B3–B12 in the Figma file.
2. Add HCI annotations to every screen, and the empty/loading/error states.
3. Export `AI-CRITIQUE.md` to PDF.
4. Apply the seven use case model changes listed in `AI-CRITIQUE.md` §6 — or defer them to Lab 2
   and say so, since Lab 1 asks only for an initial model.
5. **Team decision:** the NEA / town-council authority question. Fogging and larviciding are NEA
   vector-control functions; refuse and drain clearance are town council. The model collapses both
   into one Operations Manager and one Cleaning Crew. If the team splits them, `Account.role` and
   `WorkOrder.task_type` are the two attributes that change.
6. Re-copy `../REQUIREMENTS.md` into this folder if it is edited again.
