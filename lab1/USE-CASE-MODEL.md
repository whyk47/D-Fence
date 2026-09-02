# D-Fence — Use Case Model

Lab 1 deliverable 3 (initial use case model: diagram and descriptions)
Version 0.1 · 2026-09-02 · drafted by Y. K. Chow
Companion documents: `../REQUIREMENTS.md` (v0.3), `../EPICS-STORIES.md` (v0.3)
Diagram source: `use-case-diagram.puml`

## How this document is built

Descriptions follow the supplied Wiegers use case template
(`instructions/templates/UseCase_Template.doc`) field for field: identification, history, actor,
description, pre- and postconditions, priority, frequency, flow of events, alternative flows,
exceptions, includes, special requirements, assumptions, and notes.

Conventions taken from the template and the lab manual:

- **Use case IDs are hierarchical (X.Y)**, grouped by area, so related use cases sit together and
  requirements trace back to a labelled use case.
- **Alternative flows are numbered `X.Y.AC.n`** and **exceptions `X.Y.EX.n`**, prefixed by the use
  case ID, exactly as the template specifies.
- **Flows of events run six to seven steps**, per Lab 1 §3.3.2, alternating actor action and system
  response.
- Every description carries a **Traces** line citing the requirement numbers in `../REQUIREMENTS.md`
  that it realises. Traceability is graded separately in the Lab 5 demo; it is built here rather than
  reconstructed later.
- **Priority** uses the same scheme as the backlog: P0 (the project fails without it), P1 (a graded
  criterion depends on it), P2 (build if on schedule), P3 (cut unless ahead).

**Scope of this version.** Lab 1 asks for an *initial* use case model and Lab 2 for the *complete*
set of descriptions. Twenty use cases carry full descriptions here — the ones that carry the
architecture and the demo. The remaining eighteen are inventoried with actor, description,
pre/postconditions and priority, and are marked for completion in Lab 2. This split is deliberate and
matches the lab schedule; it is not an omission.

---

# 1. Actors

| ID | Actor | Type | Description |
|---|---|---|---|
| A0 | Registered User | Abstract | Generalisation of the three human roles. Performs the use cases common to anyone with an account. Never instantiated directly. |
| A1 | Resident | Primary, human | Member of the public. Saves locations, receives alerts, reports breeding sites, confirms others' reports. |
| A2 | Operations Manager | Primary, human | Town council or environmental services officer. Monitors the ranking, moderates reports, dispatches and verifies work. |
| A3 | Cleaning Crew Member | Primary, human | Field officer. Receives assigned work orders and records completion with evidence. |
| A4 | Scheduler | Primary, system | Internal time-triggered actor. Drives ingestion, scoring and alert evaluation. |
| A5 | NEA Data Service | Secondary, external | Supplies the dengue cluster feed. |
| A6 | Weather Data Service | Secondary, external | Supplies rainfall readings and the 24-hour forecast. |
| A7 | OneMap | Secondary, external | Supplies geocoding and the map base layer. Also issues the API token. |
| A8 | Telegram Service | Secondary, external | Delivers alerts and assignment notifications. |

**Actor generalisation.** Resident, Operations Manager and Cleaning Crew Member all inherit from
Registered User, which owns 1.2 Sign In and 1.3 Reset Password. Without the generalisation those two
use cases would be drawn three times each. This is the diagram's one generalisation relationship and
it is there because it removes real duplication, not to demonstrate the notation.

**A note on A2 and A3, unresolved.** In Singapore, fogging and larviciding are NEA vector-control
functions while refuse and drain clearance sit with town councils. This model dispatches both through
one Operations Manager to one Cleaning Crew. The team must decide before submission whether to narrow
A2 to town-council tasks or to declare A2 a deliberate composite actor in the SRS. See open point 1 in
`../EPICS-STORIES.md`.

---

# 2. Use case inventory

## Group 1 — Account and access

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 1.1 | Register Account | Resident | P0 | Full |
| 1.2 | Sign In | Registered User | P0 | Full |
| 1.3 | Reset Password | Registered User | P1 | Lab 2 |
| 1.4 | Manage Staff Accounts | Operations Manager | P2 | Lab 2 |

## Group 2 — Locations and exposure

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 2.1 | Add Saved Location | Resident | P1 | Full |
| 2.2 | Remove Saved Location | Resident | P2 | Lab 2 |
| 2.3 | View Exposure Status | Resident | P1 | Full |

## Group 3 — Reporting

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 3.1 | Submit Breeding-Site Report | Resident | P0 | Full |
| 3.2 | Confirm Existing Report | Resident | P1 | Full |
| 3.3 | Track Own Reports | Resident | P1 | Full |
| 3.4 | Moderate Report | Operations Manager | P0 | Full |

## Group 4 — Alerts

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 4.1 | Link Telegram Chat | Resident | P1 | Full |
| 4.2 | Configure Location Alerts | Resident | P1 | Full |
| 4.3 | Notify Resident | Scheduler | P1 | Lab 2 |

## Group 5 — Operations oversight

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 5.1 | Monitor Operations Dashboard | Operations Manager | P1 | Full |
| 5.2 | Review Priority Ranking | Operations Manager | P1 | Full |
| 5.3 | Inspect Cluster Detail | Operations Manager | P2 | Lab 2 |
| 5.4 | Monitor Data Source Health | Operations Manager | P2 | Lab 2 |

## Group 6 — Dispatch and field work

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 6.1 | Generate Daily Dispatch List | Operations Manager | P1 | Full |
| 6.2 | Create Work Order | Operations Manager | P1 | Full |
| 6.3 | Assign Work Order | Operations Manager | P1 | Full |
| 6.4 | View Assigned Jobs | Cleaning Crew Member | P1 | Lab 2 |
| 6.5 | Accept and Start Job | Cleaning Crew Member | P1 | Full |
| 6.6 | Complete Job with Evidence | Cleaning Crew Member | P1 | Full |
| 6.7 | Raise Issue on Job | Cleaning Crew Member | P2 | Lab 2 |
| 6.8 | Verify Completed Work | Operations Manager | P0 | Full |
| 6.9 | Cancel Work Order | Operations Manager | P2 | Lab 2 |

## Group 7 — Automated system behaviour

| ID | Name | Actor | Priority | Description status |
|---|---|---|---|---|
| 7.1 | Ingest Cluster Data | Scheduler | P0 | Full |
| 7.2 | Detect Cluster Change | Scheduler | P0 | Lab 2 |
| 7.3 | Ingest Rainfall Data | Scheduler | P0 | Lab 2 |
| 7.4 | Ingest Weather Forecast | Scheduler | P1 | Lab 2 |
| 7.5 | Compute Priority Scores | Scheduler | P0 | Full |
| 7.6 | Evaluate Alert Triggers | Scheduler | P1 | Lab 2 |
| 7.7 | Refresh Geocoding Token | Scheduler | P1 | Lab 2 |

## Group 8 — Shared behaviour, included by other use cases

| ID | Name | Included by | Priority | Description status |
|---|---|---|---|---|
| 8.1 | Geocode Address | 2.1, 3.1 | P1 | Lab 2 |
| 8.2 | View Driver Breakdown | 5.2, 5.3 | P1 | Lab 2 |
| 8.3 | Link Verified Reports | 6.2 | P1 | Lab 2 |
| 8.4 | Record Treatment | 6.8 | P0 | Lab 2 |

---

# 3. Relationships

## 3.1 Include

An include is used where behaviour is genuinely shared by two or more use cases, or where a step is
substantial enough to be described once and referenced.

| Base use case | Includes | Why |
|---|---|---|
| 2.1 Add Saved Location | 8.1 Geocode Address | Same address-to-coordinates behaviour as 3.1, including the ambiguous-match dialogue. |
| 3.1 Submit Breeding-Site Report | 8.1 Geocode Address | As above. Extracting it stops the two flows drifting apart. |
| 5.2 Review Priority Ranking | 8.2 View Driver Breakdown | The breakdown is reached from the table and from the cluster detail. |
| 5.3 Inspect Cluster Detail | 8.2 View Driver Breakdown | As above. |
| 6.1 Generate Daily Dispatch List | 6.2 Create Work Order | Accepting a proposed item performs exactly 6.2 for that cluster. |
| 6.2 Create Work Order | 8.3 Link Verified Reports | Every work order binds the verified reports inside its cluster. |
| 6.8 Verify Completed Work | 8.4 Record Treatment | Verification always writes the treatment record; there is no path that does one without the other. |
| 7.1 Ingest Cluster Data | 7.2 Detect Cluster Change | Change detection runs on every ingestion cycle without exception. |
| 7.6 Evaluate Alert Triggers | 4.3 Notify Resident | A fired trigger always results in a delivery attempt. |

## 3.2 Extend

An extend is used where the behaviour is conditional — the base use case is complete without it.

| Extending use case | Extends | Extension point / condition |
|---|---|---|
| 3.2 Confirm Existing Report | 3.1 Submit Breeding-Site Report | At the duplicate check: a matching open report exists within 50 m and 24 hours. The resident confirms it instead of filing. |
| 6.7 Raise Issue on Job | 6.6 Complete Job with Evidence | At any point before completion: the crew member finds the site inaccessible or the task impossible as instructed. |
| 6.9 Cancel Work Order | 6.3 Assign Work Order | After assignment: the work is no longer required, for example because the cluster closed. |

## 3.3 Generalisation

| Child actors | Parent actor | Inherited use cases |
|---|---|---|
| Resident, Operations Manager, Cleaning Crew Member | Registered User | 1.2 Sign In, 1.3 Reset Password |

## 3.4 The diagrams

Four diagrams, all generated from PlantUML source in this folder. **The `.puml` files are the source
of truth** — edit those and re-render, never the images, so the two cannot drift apart.

| Source | Rendered | Contents |
|---|---|---|
| `use-case-diagram.puml` | `D-Fence-UseCases.png` / `.svg` | **Master.** All 38 use cases, all nine actors, every include, extend and generalisation. |
| `use-case-diagram-resident.puml` | `D-Fence-Resident.png` / `.svg` | Resident's 12 use cases plus the notification path. |
| `use-case-diagram-operations.puml` | `D-Fence-Operations.png` / `.svg` | Operations Manager's 15 use cases including the dispatch chain. |
| `use-case-diagram-crew-system.puml` | `D-Fence-Crew-and-System.png` / `.svg` | Cleaning Crew's field work and the Scheduler's automated behaviour. |

**Why four and not one.** Thirty-eight use cases in a single frame is valid UML and unreadable on a
printed page — the master renders at roughly 1300 × 3100 pixels with long crossing association lines.
The three role views are subsets of the master using identical IDs and identical relationships; no use
case, actor or relationship appears in a role view that is not in the master. Put the master in the
appendix and the three role views in the body of the report.

**To re-render.** With `plantuml.jar` on the machine:

```
java -jar plantuml.jar -tpng -tsvg use-case-diagram*.puml
```

Or use the PlantUML extension in VS Code or IntelliJ, or paste the source into plantuml.com. All four
sources were rendered and visually checked on 2026-09-02; PlantUML reports syntax errors as text
inside the output image, and none of the four contains any.

---

# 4. Use case descriptions

---

## Use Case 1.1 — Register Account

| Field | Value |
|---|---|
| **Use Case ID** | 1.1 |
| **Use Case Name** | Register Account |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P0 |
| **Frequency of Use** | Once per resident. Expect a burst at launch, then a low steady rate. |

**Description.** A member of the public creates an account so they can save locations, receive alerts
and submit reports. The account is created with the Resident role and cannot be used until the email
address is verified.

**Preconditions.**
1. The visitor is not signed in.
2. The visitor has access to the email address they intend to register.

**Postconditions.**
1. A user record exists with the Resident role and an unverified email address.
2. A single-use verification link has been sent to that address.
3. No session has been created.

**Flow of Events.**
1. The visitor selects Register from the landing screen.
2. The system presents the registration form.
3. The visitor enters an email address and a password and submits.
4. The system validates the password against the length and composition rules and checks the email address is not already registered.
5. The system creates the account with the Resident role and marks the email address unverified.
6. The system sends a verification link and confirms on screen that it has done so.
7. The visitor opens the link; the system marks the address verified and invites them to sign in.

**Alternative Flows.**
- **1.1.AC.1 — Address already registered.** At step 4, the system states that the address is already
  registered and offers Sign In and Reset Password. The flow ends.
- **1.1.AC.2 — Verification link not opened.** The account remains unverified. The visitor may request
  a new link, which invalidates the previous one.

**Exceptions.**
- **1.1.EX.1 — Password rejected.** The password is shorter than eight characters or lacks a letter or
  a digit. The system states which rule failed beside the field and retains the entered email address.
- **1.1.EX.2 — Email delivery fails.** The account exists but no link was sent. The system states that
  verification could not be sent and offers to resend.
- **1.1.EX.3 — Sign-in attempted before verification.** The system refuses and states that the address
  must be verified first.

**Includes.** None.

**Special Requirements.** Passwords are stored only as salted hashes (10.3.1). All traffic is over
HTTPS (10.3.2). Field validation is reported beside the field (11.5.1, 11.5.2).

**Assumptions.** Email delivery is available and reaches the resident's inbox. No identity
verification beyond email control is required.

**Notes and Issues.** Singpass and Myinfo were considered and rejected: agency subscription approval
will not arrive within eleven weeks. Cite them as a future integration path if asked.

**Traces.** 2.1.1, 2.1.2, 2.1.3, 2.1.4, 2.1.5, 2.1.6, 2.2.1, 2.2.2, 11.2.2.

---

## Use Case 1.2 — Sign In

| Field | Value |
|---|---|
| **Use Case ID** | 1.2 |
| **Use Case Name** | Sign In |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Registered User (primary) — inherited by Resident, Operations Manager, Cleaning Crew Member |
| **Priority** | P0 |
| **Frequency of Use** | Residents a few times a month; managers and crew daily. |

**Description.** A registered user authenticates and receives a session. The screen they land on
depends on their role, and on whether they were trying to reach a particular screen when they were
asked to sign in.

**Preconditions.**
1. An account exists with a verified email address.
2. The account is not deactivated.

**Postconditions.**
1. A session token has been issued.
2. The user is on their role's landing screen, or on the screen they originally requested.

**Flow of Events.**
1. The user selects Sign In, or requests a screen that requires authentication.
2. The system presents the sign-in screen, retaining the originally requested screen if there was one.
3. The user enters their email address and password and submits.
4. The system verifies the credentials against the stored hash and checks the account is verified and active.
5. The system issues a session token and resolves the user's role.
6. The system navigates to the originally requested screen, or to the role's landing screen — the dashboard for a manager, My Jobs for crew, the map for a resident.
7. The system displays the user's name and role in the header.

**Alternative Flows.**
- **1.2.AC.1 — Deep link.** At step 6, where a screen was originally requested and the role may access
  it, the user lands there rather than on the role landing screen.
- **1.2.AC.2 — Role may not access the requested screen.** The system navigates to the role landing
  screen instead and states why.

**Exceptions.**
- **1.2.EX.1 — Credentials incorrect.** The system states that the email address or password is
  incorrect, without revealing which, and increments the failed-attempt counter.
- **1.2.EX.2 — Account locked.** After five failed attempts within fifteen minutes the system refuses
  further attempts for fifteen minutes and states when the account will unlock.
- **1.2.EX.3 — Account deactivated.** The system refuses and directs the user to their Operations
  Manager.
- **1.2.EX.4 — Email address unverified.** The system refuses and offers to resend the verification
  link.

**Includes.** None.

**Special Requirements.** Sessions expire after 24 hours of inactivity (2.1.9). Authorisation is
enforced on the server irrespective of what the interface offers (2.3.6, 10.3.3).

**Assumptions.** One role per account. A person who is both a resident and a staff member holds two
accounts.

**Notes and Issues.** Whether staff accounts should require a second factor is unresolved and is
out of scope for this version.

**Traces.** 2.1.7, 2.1.8, 2.1.9, 2.1.10, 2.2.5, 11.1.9, 11.2.3, 10.3.1.

---

## Use Case 2.1 — Add Saved Location

| Field | Value |
|---|---|
| **Use Case ID** | 2.1 |
| **Use Case Name** | Add Saved Location |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary), OneMap (secondary) |
| **Priority** | P1 |
| **Frequency of Use** | Two or three times per resident in total, at sign-up. |

**Description.** A resident registers a place they care about — home, workplace, a child's school — so
the system can tell them whether it falls inside a dengue cluster and alert them when that changes.

**Preconditions.**
1. The resident is signed in.
2. The resident has fewer than five saved locations.

**Postconditions.**
1. A saved location exists with coordinates, a label and an exposure status.
2. The location is included in the next exposure evaluation.

**Flow of Events.**
1. The resident selects Add Location from My Locations.
2. The system presents the entry form with the label selector.
3. The resident enters a postal code or address, chooses a label, and submits.
4. The system performs 8.1 Geocode Address and obtains coordinates.
5. The system evaluates the coordinates against every active cluster boundary and derives the exposure status.
6. The system saves the location and returns the resident to My Locations.
7. The system displays the new location with its exposure status, cluster name and data timestamp.

**Alternative Flows.**
- **2.1.AC.1 — Several candidate matches.** At step 4, 8.1 returns more than one match. The system
  presents up to five candidates and the resident selects one before the flow continues at step 5.
- **2.1.AC.2 — Location is inside an active cluster.** At step 7 the system additionally offers to
  enable alerts for this location, which invokes 4.2.

**Exceptions.**
- **2.1.EX.1 — No match found.** The system states that no match was found and retains the entered
  text so the resident can amend it.
- **2.1.EX.2 — Geocoding unavailable.** OneMap is unreachable or the token is invalid. The system
  states that address lookup is temporarily unavailable — distinct from no match — and raises a
  source-health warning.
- **2.1.EX.3 — Sixth location attempted.** The system refuses and states the limit of five.

**Includes.** 8.1 Geocode Address.

**Special Requirements.** Geocoding uses OneMap rather than a chargeable service (project decision,
2026-08-28). Only the resident may read their own saved locations (2.3.1).

**Assumptions.** Five saved locations is enough for a household. The 150 m buffer that defines
WITHIN_150M is a judgement, recorded in `../REQUIREMENTS.md` §13.

**Notes and Issues.** OneMap Search has not yet been test-pulled — register and confirm the response
shape in week 1. Until then this use case rests on an unverified dependency.

**Traces.** 3.1.1, 3.1.2, 3.1.3, 3.1.4, 3.1.5, 3.1.6, 3.1.7, 3.1.8, 3.1.9, 3.1.13, 3.1.17, 11.2.7.

---

## Use Case 2.3 — View Exposure Status

| Field | Value |
|---|---|
| **Use Case ID** | 2.3 |
| **Use Case Name** | View Exposure Status |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Several times a week during an outbreak; rarely otherwise. |

**Description.** A resident checks whether the places they have saved are inside or near an active
dengue cluster, and how large that cluster is.

**Preconditions.**
1. The resident is signed in.
2. The resident has at least one saved location.

**Postconditions.**
1. No system state has changed. This use case is read-only.

**Flow of Events.**
1. The resident opens My Locations.
2. The system retrieves each saved location with its current exposure status.
3. The system displays each location's status, containing or nearest cluster, that cluster's case size, and the timestamp of the data.
4. The resident selects a location to see it on the map.
5. The system opens the map centred on the location with the cluster boundaries drawn and coloured by priority tier.
6. The resident selects the containing cluster.
7. The system opens the cluster detail panel showing case size, trajectory and the 30-day case series.

**Alternative Flows.**
- **2.3.AC.1 — No saved locations.** At step 2, the system presents an empty state naming the action
  that populates the list, and offers 2.1.
- **2.3.AC.2 — All locations clear.** The system states plainly that no saved location is in or near an
  active cluster, rather than presenting an empty table.

**Exceptions.**
- **2.3.EX.1 — Cluster data stale.** The system displays a staleness banner naming the source and the
  time of its last successful retrieval, and still shows the last known status.
- **2.3.EX.2 — Data unavailable.** The system states the cause and a remedy and offers a retry control.

**Includes.** None.

**Special Requirements.** Exposure status is conveyed by text as well as colour (11.6.1, 11.7.5).
Timestamps are shown in Singapore time (11.6.2, 11.6.3).

**Assumptions.** Residents understand "cluster" as NEA uses the term. The interface should not need to
teach it, but the empty and clear states should say what the absence means.

**Notes and Issues.** None.

**Traces.** 3.1.10, 1.4.4, 9.1.1, 9.1.2, 9.1.7, 9.1.9, 9.1.10, 11.2.6, 11.4.3, 11.4.7.

---

## Use Case 3.1 — Submit Breeding-Site Report

| Field | Value |
|---|---|
| **Use Case ID** | 3.1 |
| **Use Case Name** | Submit Breeding-Site Report |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary), OneMap (secondary) |
| **Priority** | P0 |
| **Frequency of Use** | Low per resident, but continuous in aggregate. This is the system's main public input. |

**Description.** A resident reports standing water, uncleared refuse, a blocked drain or overgrown
vegetation. Verified reports raise the priority score of the cluster they fall in, so this is the
mechanism by which the public changes what the operations team does.

**Preconditions.**
1. The resident is signed in.
2. The resident can identify the location by map pin or address.

**Postconditions.**
1. A report exists with status Submitted, bound to a cluster or to a locality.
2. The report is queued for moderation.
3. The report does not yet affect any priority score.

**Flow of Events.**
1. The resident selects Report a Site.
2. The system presents the form with a map pin picker, the type selector and the description field.
3. The resident places a pin or enters an address, selects a type, writes a description and optionally attaches photographs.
4. The system performs 8.1 Geocode Address where an address was entered, then checks for an existing open report of the same type within 50 m and 24 hours.
5. The system binds the report to the active cluster containing the location, or to the nearest locality within one kilometre, or marks the locality binding Unassigned.
6. The system saves the report with status Submitted, the timestamp and the reporter's identity.
7. The system confirms submission and states that the report will be reviewed before it affects priorities.

**Alternative Flows.**
- **3.1.AC.1 — Duplicate detected.** At step 4 a matching open report exists. The system refuses the
  submission and offers 3.2 Confirm Existing Report. *(This is the extension point for 3.2.)*
- **3.1.AC.2 — No photograph.** The resident submits without photographs. The flow is unchanged;
  photographs are optional.
- **3.1.AC.3 — Location outside every locality.** At step 5 no locality lies within one kilometre. The
  report is saved with the locality binding Unassigned and the resident is told it will still be
  reviewed.

**Exceptions.**
- **3.1.EX.1 — Photograph rejected.** The file exceeds 5 MB or is not JPEG or PNG. The system states
  which rule failed and retains the rest of the form.
- **3.1.EX.2 — Description too long.** The system shows the remaining-character count and prevents
  submission beyond 500 characters.
- **3.1.EX.3 — Upload interrupted.** The system retains the entered values, reports the failure with a
  retry control, and does not create a partial report.

**Includes.** 8.1 Geocode Address.

**Special Requirements.** Photographs are withheld from other residents until the report is verified
(5.3.5). Reporter identity is never shown to other residents (5.2.9, 10.4.1).

**Assumptions.** The 50 m and 24-hour duplicate window is a judgement, recorded in
`../REQUIREMENTS.md` §13. Residents will pin accurately enough for a 50 m test to be meaningful.

**Notes and Issues.** Whether anonymous reporting should be permitted is unresolved. It would raise
volume and lower quality, and it removes the notification path in 3.3, so the current model requires
an account.

**Traces.** 5.1.1 through 5.1.12, 5.2.1, 5.2.2, 11.2.8, 11.5.7, 11.5.10, 11.5.11.

---

## Use Case 3.2 — Confirm Existing Report

| Field | Value |
|---|---|
| **Use Case ID** | 3.2 |
| **Use Case Name** | Confirm Existing Report |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Whenever two residents notice the same site — expected to be common in dense estates. |

**Description.** Rather than filing a second report of the same problem, a resident confirms the one
already open. The corroboration count records how many people have seen it, which tells the moderator
how real it is without inflating the report count.

**Preconditions.**
1. The resident is signed in.
2. An open report of the same type exists within 50 m, filed within the preceding 24 hours.
3. The resident has not already confirmed that report.

**Postconditions.**
1. The report's corroboration count has increased by one.
2. No new report has been created.

**Flow of Events.**
1. The resident attempts to submit a report and the system detects a duplicate (3.1.AC.1).
2. The system presents the existing report — its type, description, age and corroboration count.
3. The resident reviews it and selects Confirm.
4. The system records the confirmation against the resident's identity.
5. The system increments the corroboration count.
6. The system confirms and offers to show the report in My Reports.

**Alternative Flows.**
- **3.2.AC.1 — Not the same problem.** At step 3 the resident states that their report is different.
  The system permits the original submission to proceed and flags both reports for the moderator.
- **3.2.AC.2 — Reached from the map.** The resident opens an existing report from the map and confirms
  it directly, entering the flow at step 2.

**Exceptions.**
- **3.2.EX.1 — Already confirmed.** The system states that the resident has already confirmed this
  report and does not increment the count.
- **3.2.EX.2 — Report closed while viewing.** The report was actioned or closed between steps 2 and 3.
  The system states that it has been dealt with and offers to file a new report.

**Includes.** None. This use case **extends** 3.1 at its duplicate-check extension point.

**Special Requirements.** One confirmation per resident per report (5.1.13).

**Assumptions.** Corroboration is a better signal than report volume. This is a design judgement,
not an evidenced claim.

**Notes and Issues.** Whether corroboration count should feed the priority score directly is open.
It currently does not; only the verified report count does.

**Traces.** 5.1.11, 5.1.12, 5.1.13, 5.1.14.

---

## Use Case 3.3 — Track Own Reports

| Field | Value |
|---|---|
| **Use Case ID** | 3.3 |
| **Use Case Name** | Track Own Reports |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Once or twice per report filed. |

**Description.** A resident follows what happened to a report they filed, from submission through
verification to the work order that closed it. This is what makes reporting feel worth doing, and it
is the visible half of the feedback loop.

**Preconditions.**
1. The resident is signed in and has filed at least one report.

**Postconditions.**
1. No system state has changed. This use case is read-only.

**Flow of Events.**
1. The resident opens My Reports.
2. The system lists the resident's own reports with their current status, newest first.
3. The resident selects a report.
4. The system presents the report detail with its photographs, its status history and the reason recorded for any rejection.
5. Where the report has been linked to a work order, the system shows that the site has been scheduled for treatment.
6. Where the work order has been verified, the system shows the report as Closed with the treatment date.

**Alternative Flows.**
- **3.3.AC.1 — No reports yet.** At step 2 the system presents an empty state that names the action
  which populates the list and offers 3.1.
- **3.3.AC.2 — Report rejected.** At step 4 the system shows the moderator's reason, which is
  mandatory for a rejection.

**Exceptions.**
- **3.3.EX.1 — Report not found.** A report id no longer resolves. The system presents the Not Found
  screen rather than an empty detail view.

**Includes.** None.

**Special Requirements.** Only the reporter and an Operations Manager may see a report in identified
form (2.3.2, 10.4.1). The reporter is notified on every status change (5.2.8).

**Assumptions.** Residents want closure more than they want speed. Showing the treatment date matters
even when it is late.

**Notes and Issues.** None.

**Traces.** 5.2.1, 5.2.7, 5.2.8, 5.2.9, 2.3.2, 11.2.9, 11.2.10, 11.4.3.

---

## Use Case 3.4 — Moderate Report

| Field | Value |
|---|---|
| **Use Case ID** | 3.4 |
| **Use Case Name** | Moderate Report |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P0 |
| **Frequency of Use** | Daily, in a batch. Volume follows outbreak size. |

**Description.** An Operations Manager reviews submitted reports and decides which are genuine.
Only verified reports feed the priority score, so this use case is the gate between public input and
the operational ranking.

**Preconditions.**
1. The Operations Manager is signed in.
2. At least one report has status Submitted.

**Postconditions.**
1. Each reviewed report has status Verified or Rejected.
2. The moderator's identity, the timestamp and any reason are recorded.
3. Verified reports are counted in the next scoring cycle.

**Flow of Events.**
1. The Operations Manager opens the moderation queue.
2. The system lists reports with status Submitted, oldest first.
3. The manager selects a report and reviews its description, photographs, location and corroboration count.
4. The manager selects Verify or Reject.
5. Where Reject is selected, the system requires a reason of at least ten characters.
6. The system records the decision with the moderator's identity and timestamp, and notifies the reporter.
7. The system returns the manager to the queue, which no longer contains that report.

**Alternative Flows.**
- **3.4.AC.1 — Filter the queue.** At step 2 the manager filters by cluster or by report type before
  selecting, for instance to clear one estate at a time.
- **3.4.AC.2 — Verify and dispatch immediately.** After verifying at step 4 the manager proceeds
  directly to 6.2 Create Work Order against the report.

**Exceptions.**
- **3.4.EX.1 — Reason too short.** The system refuses the rejection and states the minimum length.
- **3.4.EX.2 — Report already moderated.** Another manager moderated it first. The system states who
  decided and when, and returns to the queue.

**Includes.** None.

**Special Requirements.** Every decision is audited (2.4.1). Photographs become visible to other
residents only on verification (5.3.5).

**Assumptions.** One team of managers shares one queue. No allocation of reports to individual
moderators is modelled.

**Notes and Issues.** There is no appeal path for a rejected report. Whether one is needed is open.

**Traces.** 5.2.3, 5.2.4, 5.2.5, 5.3.1, 5.3.2, 5.3.3, 5.3.4, 5.3.5, 11.2.14, 11.2.15.

---

## Use Case 4.1 — Link Telegram Chat

| Field | Value |
|---|---|
| **Use Case ID** | 4.1 |
| **Use Case Name** | Link Telegram Chat |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary), Telegram Service (secondary) |
| **Priority** | P1 |
| **Frequency of Use** | Once per resident. |

**Description.** A resident connects their Telegram account so alerts reach their phone rather than
waiting to be discovered in the application.

**Preconditions.**
1. The resident is signed in.
2. The resident has Telegram installed.

**Postconditions.**
1. The resident's account holds a linked Telegram chat identifier.
2. Alerts for that resident can be delivered.

**Flow of Events.**
1. The resident opens Alert Settings and selects Connect Telegram.
2. The system generates a single-use code valid for fifteen minutes and displays it with instructions.
3. The resident opens the bot in Telegram and sends the code.
4. The bot passes the code and the chat identifier to the system.
5. The system validates the code, stores the chat identifier against the account and invalidates the code.
6. The system sends a confirmation message to that chat and updates Alert Settings to show the link is active.

**Alternative Flows.**
- **4.1.AC.1 — Relink.** A resident who has changed device repeats the flow; the new chat identifier
  replaces the old one.
- **4.1.AC.2 — Unlink.** The resident selects Disconnect. The system removes the chat identifier and
  suspends alert delivery, leaving alert preferences intact.

**Exceptions.**
- **4.1.EX.1 — Code expired.** The system refuses the link and offers to issue a new code.
- **4.1.EX.2 — Code already used.** The system refuses and states that each code works once.
- **4.1.EX.3 — Telegram unreachable.** The system states that the confirmation could not be delivered
  and leaves the link inactive rather than claiming success.

**Includes.** None.

**Special Requirements.** Delivery outcomes are logged (6.1.10). Telegram is chosen because it is free
and unmetered, unlike SMS.

**Assumptions.** Residents have Telegram. This is reasonable in Singapore but it is an assumption, and
in-application notification remains the fallback for those who do not.

**Notes and Issues.** Staff notification for work-order assignment reuses this mechanism. Confirm with
the team — see open point 6 in `../EPICS-STORIES.md`.

**Traces.** 6.1.6, 6.1.7, 6.1.10, 6.1.11, 11.2.11.

---

## Use Case 4.2 — Configure Location Alerts

| Field | Value |
|---|---|
| **Use Case ID** | 4.2 |
| **Use Case Name** | Configure Location Alerts |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Once at set-up, then rarely. |

**Description.** A resident chooses which of their saved locations should generate alerts, so they are
warned about the places that matter and not the ones that no longer do.

**Preconditions.**
1. The resident is signed in and has at least one saved location.

**Postconditions.**
1. Each saved location carries an alert subscription that is on or off.
2. The trigger evaluator honours the setting from the next cycle.

**Flow of Events.**
1. The resident opens Alert Settings.
2. The system lists each saved location with its alert toggle and current exposure status.
3. The resident enables or disables alerts for a location.
4. The system saves the preference and confirms within one second.
5. The system states which triggers will fire for an enabled location — entering a cluster, cluster growth, and heavy rain forecast for an active cluster.
6. The resident leaves the screen; the preference persists across sessions.

**Alternative Flows.**
- **4.2.AC.1 — Telegram not linked.** At step 2 the system states that alerts cannot be delivered until
  Telegram is connected and offers 4.1.
- **4.2.AC.2 — Enabled during 2.1.** The resident enables alerts at the point of saving a location,
  entering this use case at step 3.

**Exceptions.**
- **4.2.EX.1 — Save fails.** The toggle reverts to its previous state and the system states that the
  change was not saved, rather than leaving the control showing an untrue value.

**Includes.** None.

**Special Requirements.** No more than one alert per location per trigger type in 24 hours (6.1.9).
Deleting a location deletes its subscriptions (3.1.12).

**Assumptions.** Residents want per-location control rather than one global switch. Households with a
school-age child are the case that motivates it.

**Notes and Issues.** The five-case growth threshold is a judgement, recorded in
`../REQUIREMENTS.md` §13. Whether residents should be able to set it themselves is open.

**Traces.** 6.1.1, 6.1.2, 6.1.3, 6.1.4, 6.1.5, 6.1.9, 11.2.11.

---

## Use Case 5.1 — Monitor Operations Dashboard

| Field | Value |
|---|---|
| **Use Case ID** | 5.1 |
| **Use Case Name** | Monitor Operations Dashboard |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Several times a day. This is the manager's home screen. |

**Description.** An Operations Manager sees the state of the outbreak and of their own operation in one
screen: how many clusters are active, how many are high priority, what is waiting for moderation, and
what work is open or overdue.

**Preconditions.**
1. The Operations Manager is signed in.
2. At least one scoring cycle has completed.

**Postconditions.**
1. No system state has changed, other than the manager's persisted filter selections.

**Flow of Events.**
1. The manager signs in and the system presents the dashboard as the landing screen.
2. The system displays the headline counts — active clusters, total active cases, high-tier clusters, open verified reports, and open and overdue work orders.
3. The system displays each count's change against the same figure seven days earlier.
4. The system displays the attention panel: source-health warnings, overdue work orders and the moderation backlog.
5. The manager selects an attention item.
6. The system navigates to the screen on which that item can be resolved.
7. The dashboard refreshes at least every five minutes and shows the timestamp of the data presented.

**Alternative Flows.**
- **5.1.AC.1 — Nothing needs attention.** At step 4 the panel states plainly that there are no
  warnings, rather than rendering an empty container.
- **5.1.AC.2 — Insufficient history.** Before seven days of history exist, the comparison in step 3
  states that there is not yet enough history rather than showing a misleading zero.

**Exceptions.**
- **5.1.EX.1 — A source is stale.** The dashboard displays the staleness banner naming the source and
  its last successful retrieval, and marks any affected score DEGRADED.
- **5.1.EX.2 — Aggregates unavailable.** The system presents an error state with cause, remedy and a
  retry control, and does not render partial figures without saying so.

**Includes.** None.

**Special Requirements.** First complete render within three seconds (10.1.1). Refresh without a
manual page reload (7.1.8).

**Assumptions.** A seven-day comparison is the right period for a manager's sense of direction. It is
a judgement.

**Notes and Issues.** None.

**Traces.** 7.1.1 through 7.1.9, 7.5.1, 7.5.2, 7.5.3, 7.5.4, 11.2.12, 11.4.7.

---

## Use Case 5.2 — Review Priority Ranking

| Field | Value |
|---|---|
| **Use Case ID** | 5.2 |
| **Use Case Name** | Review Priority Ranking |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Daily, before dispatch. |

**Description.** An Operations Manager works through the ranked list of active clusters to decide where
crews should go. The ranking is only useful if the manager can see why each cluster scored what it did,
so the driver breakdown is part of the use case rather than an optional extra.

**Preconditions.**
1. The Operations Manager is signed in.
2. A scoring cycle has completed within the current day.

**Postconditions.**
1. No system state has changed, other than persisted filter selections.

**Flow of Events.**
1. The manager opens the priority table from the dashboard.
2. The system lists all active clusters in descending score order with rank, locality, case size, case delta, 24-hour rainfall, open verified reports, days since last treatment, score, tier and work-order status.
3. The manager filters by tier or by work-order status, or sorts by a column.
4. The manager expands a row.
5. The system performs 8.2 View Driver Breakdown and shows each driver's contribution to that cluster's score, largest first.
6. The manager selects the row.
7. The system opens the cluster detail view, from which 6.2 Create Work Order can be started.

**Alternative Flows.**
- **5.2.AC.1 — Export.** At step 3 the manager exports the current filtered view as CSV, containing
  exactly the rows and columns on screen.
- **5.2.AC.2 — Reached from the map.** The manager selects a cluster boundary on the map; the table
  selection follows, and the flow continues at step 5.

**Exceptions.**
- **5.2.EX.1 — A score is DEGRADED.** The row is marked and names the excluded driver, so the manager
  can see that the ranking is computed on incomplete inputs.
- **5.2.EX.2 — No active clusters.** The system states that there are no active clusters rather than
  presenting an empty table.

**Includes.** 8.2 View Driver Breakdown.

**Special Requirements.** Numeric columns align on the decimal point and tables over fifty rows
paginate (11.6.4, 11.6.6). The sorted column and direction are indicated (11.6.5).

**Assumptions.** A manager will act on a ranking they can interrogate and will ignore one they cannot.
This is the reasoning behind requiring the breakdown, and it is a judgement.

**Notes and Issues.** Driver weights are not yet chosen. Whoever demonstrates this must be able to
justify them — see open point 3 in `../EPICS-STORIES.md`.

**Traces.** 7.2.1 through 7.2.9, 7.4.1, 7.4.2, 7.4.3, 4.1.18, 11.6.4, 11.6.5, 11.6.6.

---

## Use Case 6.1 — Generate Daily Dispatch List

| Field | Value |
|---|---|
| **Use Case ID** | 6.1 |
| **Use Case Name** | Generate Daily Dispatch List |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Once each working morning. |

**Description.** The system proposes the day's targets — the highest-scoring clusters that have no open
work order — and the manager accepts, edits or rejects each one. The manager decides; the system only
proposes.

**Preconditions.**
1. The Operations Manager is signed in.
2. A scoring cycle has completed.

**Postconditions.**
1. A work order exists for each accepted proposal.
2. Rejected proposals are recorded with the manager's identity.

**Flow of Events.**
1. The manager selects Generate Dispatch List.
2. The system selects the highest-scoring active clusters with no open work order, up to the configured limit of ten.
3. The system presents each proposal with its score, tier, driver breakdown summary and open report count.
4. The manager accepts, edits or rejects each item individually.
5. For each accepted item the system performs 6.2 Create Work Order, defaulting the task type and scheduled date.
6. The system records each rejection with the manager's identity for the audit trail.
7. The system presents the created work orders, ready for assignment through 6.3.

**Alternative Flows.**
- **6.1.AC.1 — Edit before accepting.** At step 4 the manager changes the task type, scheduled date or
  instructions, and the edited values are used in step 5.
- **6.1.AC.2 — Accept all.** The manager accepts the whole list in one action, having reviewed it.

**Exceptions.**
- **6.1.EX.1 — No candidates.** Every high-scoring cluster already has an open work order. The system
  states this rather than presenting an empty list.
- **6.1.EX.2 — Duplicate discovered on creation.** A work order of the same type was created for that
  cluster between steps 2 and 5. The system refuses that item, offers the existing work order, and
  continues with the rest.

**Includes.** 6.2 Create Work Order.

**Special Requirements.** The proposal limit is configurable (8.1.8). Every acceptance and rejection is
audited (2.4.1).

**Assumptions.** Ten is a plausible daily dispatch volume for one town council. It is configurable
precisely because it is a guess.

**Notes and Issues.** The list is proposed, never auto-dispatched. That is a deliberate design choice:
a system that dispatched crews without a human decision would be neither credible nor defensible.

**Traces.** 8.1.7, 8.1.8, 8.1.9, 8.1.10, 8.1.11, 8.1.12, 11.2.16.

---

## Use Case 6.2 — Create Work Order

| Field | Value |
|---|---|
| **Use Case ID** | 6.2 |
| **Use Case Name** | Create Work Order |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Several times daily. |

**Description.** An Operations Manager raises a unit of field work against a cluster or against a
verified report, so that the work is tracked rather than remembered.

**Preconditions.**
1. The Operations Manager is signed in.
2. The target cluster is active, or the target report is verified.

**Postconditions.**
1. A work order exists with status Created.
2. Every verified open report inside the target cluster is linked to it.

**Flow of Events.**
1. The manager selects Create Work Order from a cluster detail view, a verified report, or a dispatch proposal.
2. The system presents the creation form with the task type selector, scheduled date and instructions.
3. The system defaults the priority to the target cluster's tier.
4. The manager selects a task type, sets a scheduled date and submits.
5. The system checks that no open work order of the same task type exists for that cluster.
6. The system creates the work order with status Created and performs 8.3 Link Verified Reports.
7. The system presents the work order, ready for assignment.

**Alternative Flows.**
- **6.2.AC.1 — Created from a report.** At step 1 the origin is a verified report; the target cluster is
  that report's cluster, and the report is linked at step 6 regardless of its position in the queue.
- **6.2.AC.2 — Instructions added.** The manager writes up to 1000 characters of instructions, which
  the crew sees on the job detail screen.

**Exceptions.**
- **6.2.EX.1 — Duplicate task type.** An open work order of the same task type exists for that cluster.
  The system refuses and offers to open the existing one.
- **6.2.EX.2 — Scheduled date in the past.** The system refuses and states that the date cannot be in
  the past.
- **6.2.EX.3 — Cluster closed between steps.** The cluster is no longer active. The system warns and
  requires explicit confirmation before creating the work order.

**Includes.** 8.3 Link Verified Reports.

**Special Requirements.** Task type is one of the five defined in 8.1.3. Creation is audited (2.4.1).

**Assumptions.** One task type per work order. A cluster needing both fogging and drain clearance gets
two work orders, which is also how the duplicate guard stays meaningful.

**Notes and Issues.** The task type set spans NEA and town council responsibilities — see the actor
note in §1. Resolve before submission.

**Traces.** 8.1.1, 8.1.2, 8.1.3, 8.1.4, 8.1.5, 8.1.6, 8.1.11, 8.1.12, 8.1.13, 8.3.15, 11.2.17.

---

## Use Case 6.3 — Assign Work Order

| Field | Value |
|---|---|
| **Use Case ID** | 6.3 |
| **Use Case Name** | Assign Work Order |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary), Telegram Service (secondary) |
| **Priority** | P1 |
| **Frequency of Use** | Several times daily, usually straight after 6.1. |

**Description.** An Operations Manager gives a work order to a named crew member, with each candidate's
current workload visible so the work is spread sensibly rather than piled on whoever comes first in the
list.

**Preconditions.**
1. The Operations Manager is signed in.
2. The work order has status Created, Assigned, Accepted or In Progress.
3. At least one active Cleaning Crew Member account exists.

**Postconditions.**
1. The work order has status Assigned and names one crew member.
2. The assignee has been notified.
3. Any previous assignee is retained in the audit history.

**Flow of Events.**
1. The manager opens the work order and selects Assign.
2. The system lists active crew members with each member's count of open work orders.
3. The manager selects a crew member and confirms.
4. The system sets the status to Assigned and records the assignment with the manager's identity and timestamp.
5. The system notifies the assignee within one minute, in the application and by Telegram.
6. The system sets every linked report to status Actioned and notifies each reporter.
7. The system displays the work order as assigned, showing the assignee and the notification outcome.

**Alternative Flows.**
- **6.3.AC.1 — Reassignment.** The work order already has an assignee. The system notifies both the
  previous and the new assignee, and retains the previous assignee in the audit history.
- **6.3.AC.2 — Cancel instead.** The manager determines the work is no longer required and invokes 6.9
  Cancel Work Order. *(This is the extension point for 6.9.)*

**Exceptions.**
- **6.3.EX.1 — Account deactivated.** The chosen crew member's account has been deactivated. The system
  refuses the assignment and states why.
- **6.3.EX.2 — Notification fails.** The work order remains assigned; the system records the delivery
  failure and shows it on the work order, so the manager knows to tell the crew member another way.
- **6.3.EX.3 — Work order already completed.** The system refuses the assignment and states the current
  status.

**Includes.** None. **Extended by** 6.9 Cancel Work Order.

**Special Requirements.** Assignment and reassignment are audited (8.2.7, 2.4.1). Notification within
one minute (8.2.4).

**Assumptions.** One assignee per work order. Whether crews should be modelled as teams is open — see
open point 5 in `../EPICS-STORIES.md`.

**Notes and Issues.** Open work order count is shown as a proxy for availability. It is a crude
measure; a real system would model shifts.

**Traces.** 8.2.1, 8.2.2, 8.2.3, 8.2.4, 8.2.5, 8.2.6, 8.2.7, 5.2.6, 11.2.18.

---

## Use Case 6.5 — Accept and Start Job

| Field | Value |
|---|---|
| **Use Case ID** | 6.5 |
| **Use Case Name** | Accept and Start Job |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Cleaning Crew Member (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Several times per crew member per working day. |

**Description.** A crew member acknowledges an assigned job and marks it started when they arrive on
site, so the manager can see what is genuinely under way rather than merely allocated.

**Preconditions.**
1. The Cleaning Crew Member is signed in on a mobile device.
2. A work order assigned to them has status Assigned.

**Postconditions.**
1. The work order has status Accepted, then In Progress.
2. A start timestamp has been recorded.

**Flow of Events.**
1. The crew member opens My Jobs, filtered to Today.
2. The system lists their assigned work orders by scheduled date then priority tier.
3. The crew member opens a job and reviews the locality, task type, instructions, cluster boundary on the map and any linked reports with photographs.
4. The crew member selects Accept.
5. The system sets the status to Accepted and records the acknowledgement.
6. On arriving on site the crew member selects Start.
7. The system sets the status to In Progress and records the start timestamp.

**Alternative Flows.**
- **6.5.AC.1 — Progress note.** After starting, the crew member adds a progress note, which the manager
  can see without waiting for completion.
- **6.5.AC.2 — Obstruction found.** The site is inaccessible or the task cannot be performed as
  instructed; the crew member invokes 6.7 Raise Issue on Job. *(Extension point for 6.7.)*

**Exceptions.**
- **6.5.EX.1 — Reassigned in the meantime.** The work order is no longer assigned to this crew member.
  The system states this and removes it from their list.
- **6.5.EX.2 — Cancelled in the meantime.** The system states that the work order was cancelled, shows
  the reason, and refuses the transition.
- **6.5.EX.3 — No connectivity.** The system states that the change could not be sent and retains the
  crew member's input rather than showing a status it has not saved.

**Includes.** None. **Extended by** 6.7 Raise Issue on Job.

**Special Requirements.** Usable at a 360 pixel viewport with touch targets of at least 44 pixels
(10.5.5, 11.7.7). A crew member sees only their own work orders (2.3.5, 8.4.1).

**Assumptions.** Crew work from a phone in the field, one job at a time.

**Notes and Issues.** Offline capture is not modelled. If crews work in areas with poor coverage this
becomes a real gap; flagged rather than solved.

**Traces.** 8.3.4, 8.3.5, 8.3.17, 8.4.1, 8.4.2, 8.4.3, 8.4.4, 8.4.5, 8.4.6, 8.4.7, 11.2.19, 11.2.20.

---

## Use Case 6.6 — Complete Job with Evidence

| Field | Value |
|---|---|
| **Use Case ID** | 6.6 |
| **Use Case Name** | Complete Job with Evidence |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Cleaning Crew Member (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Once per work order. |

**Description.** A crew member closes a job by recording what was done, when, and photographic proof.
The photograph is mandatory: without it, verification is a matter of trust and the treatment record
that lowers the cluster's priority would rest on nothing.

**Preconditions.**
1. The Cleaning Crew Member is signed in.
2. The work order is assigned to them and has status In Progress.

**Postconditions.**
1. The work order has status Completed.
2. A completion timestamp, notes and at least one photograph are stored against it.
3. The work order appears in the manager's verification queue.

**Flow of Events.**
1. The crew member opens the in-progress job and selects Complete.
2. The system presents the completion form with photograph capture, the task-performed confirmation and the notes field.
3. The crew member captures or selects at least one photograph.
4. The system displays each file's name, size and upload progress.
5. The crew member confirms the task performed, writes notes and submits.
6. The system validates that a completion timestamp, a confirmation, at least one photograph and notes are all present.
7. The system sets the status to Completed and confirms that the job is awaiting verification.

**Alternative Flows.**
- **6.6.AC.1 — Partial completion.** The work was only partly possible. The crew member records what was
  done in the notes and raises an issue through 6.7 rather than completing silently.
- **6.6.AC.2 — Several photographs.** More than one photograph is attached; all are stored and shown to
  the verifying manager.

**Exceptions.**
- **6.6.EX.1 — No photograph.** The system refuses the completion and states that at least one
  photograph is required.
- **6.6.EX.2 — Photograph rejected.** The file exceeds 5 MB or is not JPEG or PNG. The system states
  which rule failed and retains the rest of the form.
- **6.6.EX.3 — Upload interrupted.** The system retains the entered values with a retry control and does
  not record a completion without its evidence.

**Includes.** None. **Extended by** 6.7 Raise Issue on Job.

**Special Requirements.** Photographs are served only through authenticated, non-enumerable URLs
(10.3.5). Completion does not itself write the treatment record — that happens on verification (8.4).

**Assumptions.** Crew have a camera-capable device. Photographic proof is the practice in this kind of
operation; this is a reasonable inference rather than a sourced fact.

**Notes and Issues.** Photograph geotag verification was considered and rejected as effort a marker
cannot see. Mention it as an extension if asked.

**Traces.** 8.3.6, 8.3.7, 8.3.8, 11.2.21, 11.5.10, 11.5.11.

---

## Use Case 6.8 — Verify Completed Work

| Field | Value |
|---|---|
| **Use Case ID** | 6.8 |
| **Use Case Name** | Verify Completed Work |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P0 |
| **Frequency of Use** | Daily, in a batch. |

**Description.** An Operations Manager checks a crew member's completion evidence and accepts or rejects
it. Acceptance writes the treatment record, closes the linked reports and lowers the cluster's next
priority score. This is the use case that closes the loop the whole system is built around.

**Preconditions.**
1. The Operations Manager is signed in.
2. A work order has status Completed.

**Postconditions.**
1. The work order has status Verified or Rejected.
2. On verification: a treatment record exists, linked reports are Closed, their reporters are notified, and the cluster is rescored within one scoring cycle.
3. On rejection: the reason is recorded and the crew member is notified.

**Flow of Events.**
1. The manager opens a completed work order from the dashboard or the work order list.
2. The system presents the completion evidence — photographs, notes, timestamps and any issue flag.
3. The manager reviews the evidence against the instructions and the linked reports.
4. The manager selects Verify.
5. The system performs 8.4 Record Treatment, writing the cluster, task type and completion date.
6. The system sets every linked report to Closed and notifies each reporter.
7. The system triggers a scoring cycle; the cluster's score falls and the cluster detail view shows the score before and after the treatment.

**Alternative Flows.**
- **6.8.AC.1 — Rejection.** At step 4 the manager selects Reject and gives a reason. The work order rests
  in status Rejected, the crew member is notified, and they return it to In Progress through 8.3.20.
- **6.8.AC.2 — Issue flagged by crew.** The completion carries an issue flag. The manager reads it before
  deciding and may verify partial work or raise a follow-up work order.

**Exceptions.**
- **6.8.EX.1 — Reason missing on rejection.** The system refuses and states that a reason of at least ten
  characters is required.
- **6.8.EX.2 — Invalid transition.** The work order is not in status Completed. The system refuses,
  states the current status and names the permitted transitions.
- **6.8.EX.3 — Scoring cycle fails.** The treatment record still stands; the system raises the failure
  and rescoring is retried on the next cycle, so verification is never lost because scoring failed.

**Includes.** 8.4 Record Treatment.

**Special Requirements.** Verified is terminal: a verified work order cannot be reassigned or cancelled
(8.2.5, 8.3.13). Every decision is audited (2.4.1).

**Assumptions.** The manager who verifies is not the crew member who completed. The role separation
makes this structural rather than a matter of policy.

**Notes and Issues.** This is the ninety seconds to demonstrate in Lab 5: a resident's report becomes a
priority, becomes a dispatched job, becomes a treatment, and the priority falls.

**Traces.** 8.3.9, 8.3.10, 8.3.11, 8.3.12, 8.3.19, 8.5.1, 8.5.2, 8.5.3, 8.5.4, 4.1.17.

---

## Use Case 7.1 — Ingest Cluster Data

| Field | Value |
|---|---|
| **Use Case ID** | 7.1 |
| **Use Case Name** | Ingest Cluster Data |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary), NEA Data Service (secondary), Operations Manager (secondary, manual trigger) |
| **Priority** | P0 |
| **Frequency of Use** | At least hourly, continuously. |

**Description.** The system retrieves the NEA dengue cluster feed, stores each cluster as a timestamped
snapshot without overwriting history, and detects what changed since the previous run. Everything else
in the system reads from what this use case writes.

**Preconditions.**
1. The scheduler is running.
2. The NEA feed endpoint is configured.

**Postconditions.**
1. A snapshot exists for every valid cluster in the response.
2. Each cluster is classified NEW, GROWN, UNCHANGED, SHRUNK or CLOSED.
3. The ingestion run is recorded with its start, end, feature count and outcome.

**Flow of Events.**
1. The scheduler triggers the ingestion cycle, or an Operations Manager triggers it manually.
2. The system retrieves the cluster feed from the NEA data service.
3. The system parses each feature into its fields and boundary geometry, rejecting and logging any feature missing a required field while continuing with the rest.
4. The system stores each accepted feature as a new timestamped snapshot, setting first-seen on first appearance and last-updated where any value changed.
5. The system performs 7.2 Detect Cluster Change, computing the case delta and classifying each cluster.
6. The system computes each cluster's premises mix and updates saved-location exposure statuses.
7. The system records the run outcome and triggers a scoring cycle through 7.5.

**Alternative Flows.**
- **7.1.AC.1 — Manual trigger.** An Operations Manager runs the cycle on demand, for instance to
  demonstrate change detection. The flow is otherwise identical.
- **7.1.AC.2 — Nothing changed.** Every cluster classifies UNCHANGED. The run is still recorded and the
  scoring cycle still executes.

**Exceptions.**
- **7.1.EX.1 — Retrieval fails.** The system retries three times at five-minute intervals. If all fail it
  raises an ingestion-failure event and continues serving the last successful snapshot, marked stale.
- **7.1.EX.2 — Malformed features.** Invalid features are rejected and logged with the missing field
  name; the remaining features are processed normally.
- **7.1.EX.3 — Source stale for three intervals.** The system raises a source-health warning visible to
  the Operations Manager.

**Includes.** 7.2 Detect Cluster Change.

**Special Requirements.** History is appended, never overwritten (1.1.5) — the trend view and the
seven-day dashboard comparisons both depend on it. A failed cycle must not make the application
unavailable (10.2.1).

**Assumptions.** The NEA field list is documented but has not been read back from a live payload, and
the feed's true update frequency is unknown. Both are recorded in `../REQUIREMENTS.md` §13 and must be
confirmed in week 1.

**Notes and Issues.** If the feed proves to update daily rather than hourly, the cluster ranking may not
visibly move during the demo. The manual trigger in 7.1.AC.1 is the mitigation.

**Traces.** 1.1.1 through 1.1.18, 3.1.8, 3.1.9, 10.2.1, 10.2.2, 10.2.3.

---

## Use Case 7.5 — Compute Priority Scores

| Field | Value |
|---|---|
| **Use Case ID** | 7.5 |
| **Use Case Name** | Compute Priority Scores |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary) |
| **Priority** | P0 |
| **Frequency of Use** | After every cluster ingestion cycle, and on every work-order verification. |

**Description.** The system combines seven drivers into a single priority score per active cluster,
assigns a tier, ranks the clusters and retains each driver's contribution. This is the computation that
distinguishes the product from a presentation of extracted data.

**Preconditions.**
1. At least one active cluster exists.
2. A valid weight configuration is loaded.

**Postconditions.**
1. Every active cluster has a score, a tier and a stored driver breakdown.
2. The clusters are ranked in descending score order.
3. The cycle is retained as history.

**Flow of Events.**
1. The cluster ingestion cycle completes, or a work order is verified, triggering the scoring cycle.
2. The system assembles the seven driver values for every active cluster.
3. The system normalises each driver to a value between zero and one by that driver's documented method.
4. The system computes the weighted sum, expresses it on a 0–100 scale to one decimal place, and assigns High, Medium or Low against the configured thresholds.
5. The system stores each driver's normalised value and weighted contribution alongside the score.
6. The system ranks the clusters, breaking ties by case size and then by locality name.
7. The system retains the cycle as history and makes the new ranking available to the dashboard.

**Alternative Flows.**
- **7.5.AC.1 — Triggered by verification.** The cycle runs because a work order was verified. The treated
  cluster's days-since-treatment resets and its score falls.
- **7.5.AC.2 — A driver source is stale.** The system excludes that driver, renormalises the remaining
  weights to sum to one, and marks the affected scores DEGRADED naming the excluded driver.

**Exceptions.**
- **7.5.EX.1 — Weights do not sum to 1.0.** The system rejects the configuration at start-up rather than
  computing scores on an invalid weighting.
- **7.5.EX.2 — Cycle exceeds its time budget.** The run is recorded as failed; the previous ranking
  continues to serve and is marked as of its own timestamp.
- **7.5.EX.3 — No treatment history for a cluster.** The system uses the ninety-day default rather than
  excluding the driver.

**Includes.** None.

**Special Requirements.** A cycle for 500 clusters completes within 60 seconds (10.1.3). Weights and
thresholds come from configuration, not code (10.6.2).

**Assumptions.** Every one of the weights, the tier cut points and the ninety-day default is a
judgement, collected in `../REQUIREMENTS.md` §13. The scoring method is defensible; the specific numbers
are not yet evidenced.

**Notes and Issues.** This is the designated Lab 4 key control class for equivalence-class and
boundary-value testing, and the first of the two basis-path methods. Protect it in the schedule.

**Traces.** 4.1.1 through 4.1.21, 8.5.3.

---

# 5. Use cases scheduled for Lab 2

The eighteen use cases below are inventoried above with actor, priority and relationships, and appear
on the diagram. Their full Wiegers descriptions are written in Lab 2, which is where the lab manual
asks for the complete set.

1.3 Reset Password · 1.4 Manage Staff Accounts · 2.2 Remove Saved Location · 4.3 Notify Resident ·
5.3 Inspect Cluster Detail · 5.4 Monitor Data Source Health · 6.4 View Assigned Jobs ·
6.7 Raise Issue on Job · 6.9 Cancel Work Order · 7.2 Detect Cluster Change · 7.3 Ingest Rainfall Data ·
7.4 Ingest Weather Forecast · 7.6 Evaluate Alert Triggers · 7.7 Refresh Geocoding Token ·
8.1 Geocode Address · 8.2 View Driver Breakdown · 8.3 Link Verified Reports · 8.4 Record Treatment

**Assign these across the team.** Every member must contribute to four different work-product types,
and the use case model is one of the eight. Splitting these eighteen by group — one member takes group
7, another takes group 8 and the included behaviours, and so on — gives each person an attributable
artefact and keeps the authorship record honest.

---

# 6. Open issues in this model

1. **Actor authority (A2, A3).** Fogging and larviciding are NEA functions; refuse and drain clearance
   are town council. One manager dispatching both is a simplification that must be either narrowed or
   declared. **Owner: the team. Due: before Lab 1 submission.**
2. **Anonymous reporting.** Currently disallowed, which costs reach and buys the notification path in
   3.3. **Owner: the team. Due: Lab 2.**
3. **Appeal path for a rejected report.** Not modelled. **Owner: the team. Due: Lab 2.**
4. **Offline capture for crew (6.5, 6.6).** Not modelled; a real gap if coverage is poor in the field.
   **Owner: the team. Due: Lab 3, when the architecture is fixed.**
5. **Crew teams versus individuals (6.3).** One assignee per work order today. **Owner: the team.
   Due: Lab 2.**
