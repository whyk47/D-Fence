# USE CASE DESCRIPTIONS — D-Fence

Lab 2 deliverable 2. Version 0.2, 2026-09-02. Supersedes the Lab 1 set.

**41 use cases, all described.** The Lab 1 model carried 20 full descriptions and deferred 18; those
18 are written here, together with three use cases added by the Lab 1 AI critique and one correction
to an existing relationship.

**Changes from Lab 1** (all traceable to `../lab1/submission/AI-CRITIQUE.md` §6):

| Change | Origin |
|---|---|
| 18 deferred descriptions written | Lab 1 deferral |
| **1.5 Sign Out** added | Critique point 5 — requirement 2.1.12 had no representation |
| **2.4 View Cluster Map** added | Critique point 4 — all of §9 was modelled for the manager only |
| **4.4 Notify Crew Member** added | Critique point 3 — 8.2.4, 8.2.6 and 8.3.11 had no representation |
| **6.7 Raise Issue on Job** re-modelled as a direct association, not an `<<extend>>` of 6.6 | Critique point 1 |
| **3.4** and **6.8** now include **4.3 Notify Resident** | Critique point 2 — 5.2.8 and 8.5.2 |
| Scheduler retained as an actor | Critique point 6, rejected on verification |

Descriptions follow the Wiegers template supplied in `instructions/templates/UseCase_Template.doc`.
Every description ends with a **Traces** line citing the requirement numbers it realises, so the
model can be checked against `REQUIREMENTS.md` v0.3 rather than taken on trust.

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

## Use Case 1.3 — Reset Password

| Field | Value |
|---|---|
| **Use Case ID** | 1.3 |
| **Use Case Name** | Reset Password |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Registered User (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Occasional. A few per hundred accounts per month. |

**Description.** A registered user who cannot sign in obtains a single-use link by email and sets a
new password. The link is valid for 30 minutes and may be used once.

**Preconditions.**
1. The user is not signed in.
2. An account exists for the email address the user will enter.

**Postconditions.**
1. The account's stored password hash is replaced.
2. The reset link is consumed and cannot be reused.
3. No session is created; the user must sign in with the new password.

**Flow of Events.**
1. The user selects Forgot Password on the Sign In screen.
2. The system presents the Password Reset Request screen.
3. The user enters an email address and submits.
4. The system sends a single-use reset link valid for 30 minutes, and states that a link has been sent if the address is registered.
5. The user opens the link; the system presents the Password Reset screen.
6. The user enters a new password twice and submits.
7. The system validates the password, replaces the stored hash, invalidates the link and invites the user to sign in.

**Alternative Flows.**
- **1.3.AC.1 — Address not registered.** At step 4 the system gives the same confirmation message and
  sends no email. The wording must not reveal whether the address is registered.
- **1.3.AC.2 — Second request before the first is used.** The most recent link is valid; any earlier
  link is invalidated.

**Exceptions.**
- **1.3.EX.1 — Link expired.** More than 30 minutes have passed. The system states that the link has
  expired and offers to send a new one.
- **1.3.EX.2 — Link already used.** The system states that the link has already been used and offers
  to send a new one.
- **1.3.EX.3 — Password rejected.** The new password fails the length or composition rule. The system
  states which rule failed beside the field.

**Includes.** None.

**Special Requirements.** The confirmation message at step 4 is identical whether or not the address
is registered, so the screen cannot be used to enumerate accounts (10.3.x). Passwords are stored only
as salted hashes (10.3.1).

**Assumptions.** Email delivery is available.

**Notes and Issues.** Requirement 2.1.11 fixes both the 30-minute validity and single use. Neither is
configurable.

**Traces.** 2.1.11, 2.1.2, 2.1.3, 11.2.4, 11.5.1, 11.5.2.

---

## Use Case 1.4 — Manage Staff Accounts

| Field | Value |
|---|---|
| **Use Case ID** | 1.4 |
| **Use Case Name** | Manage Staff Accounts |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P2 |
| **Frequency of Use** | Rare. A handful of times per deployment, then on staff turnover. |

**Description.** An Operations Manager creates accounts carrying the Operations Manager or Cleaning
Crew role, and deactivates accounts that should no longer have access. Self-registration always
produces a Resident, so this is the only route by which a staff account comes into existence.

**Preconditions.**
1. The actor is signed in with the Operations Manager role.

**Postconditions.**
1. Any created account exists with exactly one of the two staff roles.
2. Any deactivated account can no longer authenticate.
3. Every change is recorded in the audit log.

**Flow of Events.**
1. The manager opens the Staff Accounts screen.
2. The system lists existing staff accounts with role and active state.
3. The manager selects Create Account.
4. The manager enters an email address and selects a role from Operations Manager or Cleaning Crew.
5. The system creates the account, marks the email unverified and sends a verification link.
6. The manager may select any account and deactivate it, confirming the action.
7. The system marks the account inactive and records the change in the audit log.

**Alternative Flows.**
- **1.4.AC.1 — Deactivating a crew member holding open work orders.** The system states how many open
  work orders the account holds and requires them to be reassigned before deactivation completes.
- **1.4.AC.2 — Deactivating a Resident.** Permitted by 2.2.4 and reached from the same screen.

**Exceptions.**
- **1.4.EX.1 — Address already registered.** The system refuses and states that the address is in use.
- **1.4.EX.2 — Self-deactivation.** The system refuses to deactivate the account the actor is signed
  in as.

**Includes.** None.

**Special Requirements.** Deactivation is a destructive action and requires confirmation (11.7.x).
Every creation and deactivation is written to the audit log (2.4.1).

**Assumptions.** Staff email addresses are issued by the operating agency.

**Notes and Issues.** Role is single-valued (2.2.1), so a person who is both a manager and a crew
member needs two accounts. This is a recorded simplification, not an oversight.

**Traces.** 2.2.1, 2.2.3, 2.2.4, 2.2.5, 2.4.1, 8.2.3, 11.2.22.

---

## Use Case 1.5 — Sign Out

| Field | Value |
|---|---|
| **Use Case ID** | 1.5 |
| **Use Case Name** | Sign Out |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Registered User (primary) — inherited by Resident, Operations Manager, Cleaning Crew Member |
| **Priority** | P1 |
| **Frequency of Use** | Once per session for shared-device users; rarely for personal devices. |

**Description.** A signed-in user ends their session deliberately. Added in Lab 2 after the AI
critique found requirement 2.1.12 had no representation in the model.

**Preconditions.**
1. The user holds an active session.

**Postconditions.**
1. The session token is terminated and cannot be reused.
2. The user is returned to the Landing screen.

**Flow of Events.**
1. The user selects Sign Out from the application shell.
2. The system terminates the active session token.
3. The system returns the user to the Landing screen and confirms that they are signed out.

**Alternative Flows.**
- **1.5.AC.1 — Unsaved form input.** The system warns before navigating away from a form with unsaved
  changes and allows the sign-out to be cancelled.

**Exceptions.**
- **1.5.EX.1 — Session already expired.** The token has already lapsed under 2.1.9. The system returns
  the user to the Landing screen without error.

**Includes.** None.

**Special Requirements.** Termination is server-side; clearing the client alone does not satisfy
2.1.12, because 2.3.6 requires every access rule to be enforced on the server.

**Assumptions.** None.

**Notes and Issues.** Added by the Lab 1 AI critique, point 5.

**Traces.** 2.1.12, 2.3.6, 11.3.6.

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

## Use Case 2.2 — Remove Saved Location

| Field | Value |
|---|---|
| **Use Case ID** | 2.2 |
| **Use Case Name** | Remove Saved Location |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P2 |
| **Frequency of Use** | Rare. On moving house, or to free one of the five slots. |

**Description.** A Resident deletes a saved location. Deleting the location also deletes the alert
subscription attached to it, so the resident stops receiving alerts for that address.

**Preconditions.**
1. The actor is signed in as a Resident.
2. At least one saved location exists on the account.

**Postconditions.**
1. The saved location no longer exists.
2. Its alert subscription no longer exists.
3. One of the five location slots is free.

**Flow of Events.**
1. The resident opens the My Locations screen.
2. The system lists the saved locations with their exposure statuses.
3. The resident selects Remove on one location.
4. The system asks for confirmation and states that alerts for that location will stop.
5. The resident confirms.
6. The system deletes the location and its alert subscription.
7. The system returns the resident to the My Locations list and confirms the deletion.

**Alternative Flows.**
- **2.2.AC.1 — Cancelled.** At step 5 the resident cancels; nothing is deleted and the list is
  unchanged.
- **2.2.AC.2 — Last location removed.** The My Locations screen shows its empty state, naming Add
  Location as the action that would populate it.

**Exceptions.**
- **2.2.EX.1 — Deletion fails.** The system states that the location could not be removed and offers
  a retry; the location remains in the list.

**Includes.** None.

**Special Requirements.** Deletion is a destructive action and requires confirmation. The cascade to
the alert subscription is obligatory, not incidental (3.1.12).

**Assumptions.** None.

**Notes and Issues.** Alert history is retained after deletion for the audit log; only the
subscription is removed.

**Traces.** 3.1.11, 3.1.12, 11.2.6, 11.4.3, 11.4.4.

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

## Use Case 2.4 — View Cluster Map

| Field | Value |
|---|---|
| **Use Case ID** | 2.4 |
| **Use Case Name** | View Cluster Map |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Resident (primary) |
| **Priority** | P1 |
| **Frequency of Use** | High. The main resident-facing screen and the usual entry point. |

**Description.** A Resident views active dengue clusters on a map, coloured and labelled by priority
tier, with their own saved locations overlaid, and opens a cluster to see its detail and 30-day
trend. Added in Lab 2 after the AI critique found that all of requirements §9 was modelled for the
Operations Manager only, although no requirement restricts the map to that role.

**Preconditions.**
1. The actor is signed in as a Resident. *(Required by 11.1.8, which restricts an unauthenticated
   visitor to the Landing, Sign In, Register and Password Reset screens. An earlier draft of this
   description allowed visitor access and contradicted that requirement.)*
2. At least one successful cluster ingestion has completed.

**Postconditions.**
1. No stored state changes. This use case is read-only.

**Flow of Events.**
1. The resident opens the Resident Map screen.
2. The system displays every active cluster boundary, coloured by priority tier and labelled with the tier as text.
3. The system overlays the signed-in resident's saved locations and any report markers.
4. The resident shows or hides individual map layers.
5. The resident selects a cluster.
6. The system opens the cluster detail panel with case size, priority tier, trajectory and the 30-day case-size series.
7. The resident closes the panel and returns to the map.

**Alternative Flows.**
- **2.4.AC.1 — Signed in with no saved locations.** Steps 2 and 6 proceed; the saved-location layer
  at step 3 is empty and the system offers Add Location.
- **2.4.AC.2 — No active clusters.** The map displays its empty state stating that no active clusters
  are published, with the data timestamp.

**Exceptions.**
- **2.4.EX.1 — Cluster data stale.** The system displays the staleness banner naming the source and
  its last successful retrieval time, and continues to display the last good snapshot.
- **2.4.EX.2 — Base map unavailable.** The OneMap tile layer fails. The system states that the map
  cannot be loaded and offers a retry; cluster data remains available in list form.

**Includes.** None.

**Special Requirements.** Tier is conveyed by a text label as well as colour (9.1.11, 11.7.5), so the
map is usable without colour discrimination. The driver breakdown is *not* shown here — 4.1.18
restricts it to the Operations Manager, and use case 8.2 carries it.

**Assumptions.** Cluster boundaries are small enough to render client-side without simplification.

**Notes and Issues.** Added by the Lab 1 AI critique, point 4. The resident view deliberately shows
tier but not score: a public-facing numeric ranking of neighbourhoods invites misreading, and no
requirement obliges it.

**Traces.** 9.1.1, 9.1.2, 9.1.3, 9.1.5, 9.1.6, 9.1.7, 9.1.9, 9.1.10, 9.1.11, 11.2.5, 11.4.3, 11.4.7.

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

**Includes.** 4.3 Notify Resident. *(Added in Lab 2, AI critique point 2: 5.2.8 obliges the reporting resident to be notified on every report status change.)*

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

## Use Case 4.3 — Notify Resident

| Field | Value |
|---|---|
| **Use Case ID** | 4.3 |
| **Use Case Name** | Notify Resident |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary), Telegram Service (secondary), Resident (recipient) |
| **Priority** | P1 |
| **Frequency of Use** | Continuous. Bounded by the per-location per-trigger daily cap. |

**Description.** The system delivers a notification to a Resident. Included by 7.6 Evaluate Alert
Triggers for location alerts, and — added in Lab 2 — by 3.4 Moderate Report and 6.8 Verify Completed
Work, because requirements 5.2.8 and 8.5.2 oblige the reporting resident to be told when their
report's status changes.

**Preconditions.**
1. A notification trigger has fired.
2. The recipient's account has a linked Telegram chat.

**Postconditions.**
1. The notification is delivered, or recorded as FAILED after two retries.
2. The attempt is logged with recipient, trigger type, timestamp and outcome.

**Flow of Events.**
1. The calling use case supplies the recipient, the trigger type and the payload.
2. The system checks the per-location per-trigger 24-hour cap for alert triggers.
3. The system composes the message, including the location label, cluster name, trigger reason, current case size and data timestamp.
4. The system sends the message through the Telegram Bot API to the recipient's linked chat.
5. The system records the delivery outcome against the alert log.

**Alternative Flows.**
- **4.3.AC.1 — Cap already reached.** At step 2 the alert is suppressed and logged as suppressed, not
  sent. Report-status notifications under 5.2.8 are not subject to the cap.
- **4.3.AC.2 — No linked chat.** The notification is recorded as undeliverable and surfaced in the
  application instead; the resident is prompted to link Telegram.

**Exceptions.**
- **4.3.EX.1 — Delivery fails.** The system retries twice at five-minute intervals, then records the
  outcome as FAILED.
- **4.3.EX.2 — Recipient has blocked the bot.** Telegram reports the block. The system records the
  outcome and stops attempting delivery to that chat until it is relinked.

**Includes.** None. This use case is itself included by 7.6, 3.4 and 6.8.

**Special Requirements.** Alert content carries no personal data beyond the recipient's own saved
location label (10.4.x).

**Assumptions.** The Telegram Bot API is reachable and the bot token is valid.

**Notes and Issues.** Extended in Lab 2 by AI critique point 2. Before that change, 3.4 and 6.8 could
alter a report's status with no notification path, contradicting 5.2.8.

**Traces.** 6.1.6, 6.1.8, 6.1.9, 6.1.10, 6.1.11, 5.2.8, 8.5.2.

---

## Use Case 4.4 — Notify Crew Member

| Field | Value |
|---|---|
| **Use Case ID** | 4.4 |
| **Use Case Name** | Notify Crew Member |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (initiating, indirectly), Telegram Service (secondary), Cleaning Crew Member (recipient) |
| **Priority** | P1 |
| **Frequency of Use** | Several times per crew member per working day. |

**Description.** The system notifies a Cleaning Crew Member of an event affecting their work. Added
in Lab 2 after the AI critique found that requirements 8.2.4, 8.2.6 and 8.3.11 oblige three separate
crew notifications for which the model held no use case at all.

**Preconditions.**
1. A work order event affecting a specific crew member has occurred.

**Postconditions.**
1. The notification is delivered, or recorded as FAILED.
2. The attempt is logged against the work order's history.

**Flow of Events.**
1. The calling use case supplies the crew member, the work order and the event type.
2. The system composes the message, naming the locality, task type, scheduled date and priority tier.
3. The system sends the message to the crew member's linked chat.
4. The system records the delivery outcome against the work order.

**Alternative Flows.**
- **4.4.AC.1 — Reassignment.** Both the previous and the new assignee are notified, with different
  messages: one that the job has been taken off them, one that it has been given to them.
- **4.4.AC.2 — Completion rejected.** The message carries the rejection reason so the crew member
  knows what to redo before resuming.

**Exceptions.**
- **4.4.EX.1 — Assignment notification not delivered within one minute.** The system raises the
  failure to the Operations Manager on the work order, because 8.2.4 makes the one-minute bound an
  obligation rather than a target.

**Includes.** None. Included by 6.3 Assign Work Order and 6.8 Verify Completed Work.

**Special Requirements.** The one-minute bound in 8.2.4 is a verifiable timing requirement and is the
tightest notification constraint in the system.

**Assumptions.** Crew members have linked a Telegram chat during onboarding.

**Notes and Issues.** Added by the Lab 1 AI critique, point 3.

**Traces.** 8.2.4, 8.2.6, 8.3.11, 8.4.3.

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

## Use Case 5.3 — Inspect Cluster Detail

| Field | Value |
|---|---|
| **Use Case ID** | 5.3 |
| **Use Case Name** | Inspect Cluster Detail |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P2 |
| **Frequency of Use** | Many times per working day; the main investigative screen. |

**Description.** An Operations Manager opens one cluster and examines everything the system knows
about it — score and driver breakdown, case trend, open reports, work orders, and the effect of the
last verified treatment on the score.

**Preconditions.**
1. The actor is signed in with the Operations Manager role.
2. The cluster is active, or was active within the retained history.

**Postconditions.**
1. No stored state changes. This use case is read-only.

**Flow of Events.**
1. The manager selects a cluster from the map, the priority table or a work order.
2. The system displays the Cluster Detail screen with the current score, tier and rank.
3. The system displays the driver breakdown by including 8.2 View Driver Breakdown.
4. The system displays the 30-day case-size series and the 14-day trajectory classification.
5. The system lists the cluster's open reports and its work orders with their statuses.
6. The system displays the priority score immediately before and immediately after the most recent verified treatment.
7. The manager returns to the screen they came from.

**Alternative Flows.**
- **5.3.AC.1 — No treatment history.** Step 6 states that the cluster has no verified treatment, and
  the days-since-last-treatment driver is shown using its default of 90 days.
- **5.3.AC.2 — Cluster closed.** The system labels the cluster CLOSED and displays its retained
  history; no work order may be created against it.

**Exceptions.**
- **5.3.EX.1 — Score degraded.** The system marks the score DEGRADED and names every excluded driver.
- **5.3.EX.2 — Trend unavailable.** Fewer than two snapshots exist. The system states that trend data
  will appear once history accumulates, rather than drawing an empty chart.

**Includes.** 8.2 View Driver Breakdown.

**Special Requirements.** The before-and-after treatment comparison (8.5.4) is the screen's most
important element for the demo: it is the visible evidence that the feedback loop works.

**Assumptions.** Snapshot history is retained from the first ingestion run onward.

**Notes and Issues.** 5.3.EX.2 is a real risk in week 1 of the demo period — the trend view needs
history that only accumulates with time, which is why ingestion must start early.

**Traces.** 9.1.7, 9.1.8, 9.1.9, 9.1.10, 4.1.10, 4.1.18, 4.1.13, 4.1.20, 8.5.4, 11.2.13.

---

## Use Case 5.4 — Monitor Data Source Health

| Field | Value |
|---|---|
| **Use Case ID** | 5.4 |
| **Use Case Name** | Monitor Data Source Health |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P2 |
| **Frequency of Use** | Daily, and whenever a staleness banner appears elsewhere. |

**Description.** An Operations Manager checks whether the four external data sources are being
retrieved successfully, sees when each last succeeded, and triggers a manual ingestion run when a
source has fallen behind.

**Preconditions.**
1. The actor is signed in with the Operations Manager role.

**Postconditions.**
1. No state changes unless a manual run is triggered, in which case an ingestion run is recorded.

**Flow of Events.**
1. The manager opens the Data Sources screen.
2. The system lists each source with its last successful retrieval timestamp and its warning state.
3. The system marks any source with no success across three consecutive scheduled intervals.
4. The manager selects a source and reviews its recent ingestion runs with their outcomes and feature counts.
5. The manager triggers a manual ingestion run for a source that has fallen behind.
6. The system executes the run and updates the source's health record with the outcome.

**Alternative Flows.**
- **5.4.AC.1 — All sources healthy.** Steps 5 and 6 do not occur; the screen states that all sources
  are current.
- **5.4.AC.2 — OneMap authentication failure.** The source shows a warning raised specifically by an
  authentication error, distinguishing an expired token from an unreachable service.

**Exceptions.**
- **5.4.EX.1 — Manual run fails.** The system reports the failure with its cause and retains the
  previous last-successful timestamp unchanged.

**Includes.** None.

**Special Requirements.** The manual trigger exists because the NEA feed's true update frequency is
unverified; if the feed proves slow, this control is what makes the ranking visibly move during a
live demo (1.1.18).

**Assumptions.** Four sources are monitored: NEA clusters, rainfall, forecast and OneMap.

**Notes and Issues.** Verify the NEA feed's real update interval in week 1. If it updates daily, the
demo script must depend on this use case rather than on natural feed movement.

**Traces.** 1.4.1, 1.4.2, 1.4.3, 1.4.4, 1.1.14, 1.1.18, 3.1.16, 11.2.23.

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

## Use Case 6.4 — View Assigned Jobs

| Field | Value |
|---|---|
| **Use Case ID** | 6.4 |
| **Use Case Name** | View Assigned Jobs |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Cleaning Crew Member (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Many times per working day. The crew member's home screen. |

**Description.** A Cleaning Crew Member sees the work orders assigned to them, ordered by schedule
and priority, filtered to today's work, upcoming work or completed work.

**Preconditions.**
1. The actor is signed in with the Cleaning Crew role.

**Postconditions.**
1. No stored state changes. This use case is read-only.

**Flow of Events.**
1. The crew member opens the My Jobs screen.
2. The system lists only the work orders assigned to that member.
3. The system sorts them by scheduled date ascending, then by priority tier.
4. The system displays for each the locality, task type, scheduled date, priority tier and instructions.
5. The crew member applies the Today, Upcoming or Completed filter.
6. The crew member selects a job and the system opens its Job Detail screen with the cluster boundary on a map and every linked report with descriptions and photographs.

**Alternative Flows.**
- **6.4.AC.1 — No jobs assigned.** The list shows its empty state, naming who assigns work rather
  than leaving a blank area.
- **6.4.AC.2 — Overdue job present.** The system flags any work order whose scheduled date has passed
  and whose status is not Completed, Verified or Cancelled.

**Exceptions.**
- **6.4.EX.1 — Job reassigned while open.** The work order disappears from the list on refresh; the
  system states that it has been reassigned rather than removing it silently.

**Includes.** None.

**Special Requirements.** Access is restricted on the server to work orders assigned to the
requesting account (2.3.5, 2.3.6); the filter is not the access control.

**Assumptions.** Crew members work from a mobile device in the field.

**Notes and Issues.** Linked report photographs are the crew member's main evidence of what to look
for on arrival, so image loading on a mobile connection matters more here than elsewhere.

**Traces.** 8.4.1, 8.4.2, 8.4.3, 8.4.4, 8.4.5, 8.4.6, 8.3.14, 2.3.5, 11.2.19, 11.2.20, 11.4.3.

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

## Use Case 6.7 — Raise Issue on Job

| Field | Value |
|---|---|
| **Use Case ID** | 6.7 |
| **Use Case Name** | Raise Issue on Job |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Cleaning Crew Member (primary) |
| **Priority** | P2 |
| **Frequency of Use** | Occasional. A few per hundred jobs. |

**Description.** A Cleaning Crew Member flags an obstruction that prevents work — a locked site, an
inaccessible drain, a hazard, a wrong address — at any point before the job is completed. The
Operations Manager sees the flag and its reason and decides whether to reschedule, reassign or
cancel.

**Preconditions.**
1. The actor is signed in with the Cleaning Crew role.
2. The work order is assigned to that member and its status is Assigned, Accepted or In Progress.

**Postconditions.**
1. The work order carries an issue flag and a reason.
2. The work order's status is unchanged.
3. The flag is visible to the Operations Manager on the work order.

**Flow of Events.**
1. The crew member opens a job that is not yet Completed.
2. The crew member selects Raise Issue.
3. The system presents a reason field.
4. The crew member enters a reason of at least ten characters and submits.
5. The system records the flag, the reason, the author and the timestamp against the work order.
6. The system surfaces the flagged work order to the Operations Manager in the dashboard attention panel.

**Alternative Flows.**
- **6.7.AC.1 — Issue raised before acceptance.** Permitted. A crew member who can already see the job
  cannot reach the site is exactly the case worth reporting early.
- **6.7.AC.2 — Manager responds by cancelling.** The manager cancels the work order with a reason
  (6.9); the crew member is notified.

**Exceptions.**
- **6.7.EX.1 — Reason too short.** The system refuses and states the ten-character minimum beside the
  field.
- **6.7.EX.2 — Work order already Completed.** Raising an issue is refused; 8.3.8 permits it only
  before completion. The system states this rather than failing silently.

**Includes.** None.

**Special Requirements.** This use case must be reachable from any pre-completion state. Requirement
8.3.8 says "at any time before completion", which is a timing obligation, not a convenience.

**Assumptions.** The crew member has network access in the field; otherwise the flag is raised on
return.

**Notes and Issues.** **Corrected in Lab 2 following AI critique point 1.** This was previously
modelled as `<<extend>>` on 6.6 Complete Job with Evidence, which confined it to the completion flow
and would have forced a crew member to claim completion in order to report an obstruction. It is now
a direct association from Cleaning Crew Member, guarded by the status precondition above.

**Traces.** 8.3.8, 7.5.4, 7.5.5, 11.2.20.

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

**Includes.** 8.4 Record Treatment, 4.3 Notify Resident, 4.4 Notify Crew Member. *(Added in Lab 2, AI critique point 2: 5.2.8 obliges the reporting resident to be notified on every report status change.)*

**Special Requirements.** Verified is terminal: a verified work order cannot be reassigned or cancelled
(8.2.5, 8.3.13). Every decision is audited (2.4.1).

**Assumptions.** The manager who verifies is not the crew member who completed. The role separation
makes this structural rather than a matter of policy.

**Notes and Issues.** This is the ninety seconds to demonstrate in Lab 5: a resident's report becomes a
priority, becomes a dispatched job, becomes a treatment, and the priority falls.

**Traces.** 8.3.9, 8.3.10, 8.3.11, 8.3.12, 8.3.19, 8.5.1, 8.5.2, 8.5.3, 8.5.4, 4.1.17.

---

## Use Case 6.9 — Cancel Work Order

| Field | Value |
|---|---|
| **Use Case ID** | 6.9 |
| **Use Case Name** | Cancel Work Order |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary) |
| **Priority** | P2 |
| **Frequency of Use** | Occasional. Duplicate dispatch, cluster closed, work no longer required. |

**Description.** An Operations Manager cancels a work order that should not be carried out, giving a
reason. Cancelled is terminal: the work order cannot be revived, and a fresh one must be created if
the work is needed later.

**Preconditions.**
1. The actor is signed in with the Operations Manager role.
2. The work order's status is Created, Assigned, Accepted or In Progress.

**Postconditions.**
1. The work order's status is Cancelled and is terminal.
2. The cancellation reason, actor and timestamp are recorded.
3. Any assignee has been notified.
4. Reports linked to the work order return to the status they held before the work order was created (8.3.21).

**Flow of Events.**
1. The manager opens the Work Order Detail screen.
2. The manager selects Cancel.
3. The system asks for confirmation and requires a reason.
4. The manager enters a reason of at least ten characters and confirms.
5. The system sets the status to Cancelled and records the reason, actor and timestamp.
6. The system notifies the assignee, if one exists.

**Alternative Flows.**
- **6.9.AC.1 — Unassigned work order.** Step 6 does not occur.
- **6.9.AC.2 — Cancelled in response to a raised issue.** The manager reaches this use case from the
  attention panel; the issue reason is displayed alongside the cancellation form.

**Exceptions.**
- **6.9.EX.1 — Work order already Completed or Verified.** Cancellation is refused. The state table
  permits no transition from those states to Cancelled, and the system states the reason for refusal.

**Includes.** None.

**Special Requirements.** Cancellation is a destructive action: confirmation and a reason are both
mandatory (8.3.18). No treatment record is written, so the cluster's days-since-last-treatment driver
is unaffected — a cancelled job must not look like completed work.

**Assumptions.** None.

**Notes and Issues.** The rule that linked reports revert rather than close is deliberate: a report
closed by a cancelled work order would disappear from the moderation view while the breeding site
still exists. This was asserted in the description before any requirement obliged it; requirement
8.3.21 was added in v0.4 after adversarial review found the gap.

**Traces.** 8.3.1, 8.3.2, 8.3.13, 8.3.18, 8.3.21, 8.2.6, 2.4.1.

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

## Use Case 7.2 — Detect Cluster Change

| Field | Value |
|---|---|
| **Use Case ID** | 7.2 |
| **Use Case Name** | Detect Cluster Change |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary) |
| **Priority** | P0 |
| **Frequency of Use** | Once per cluster ingestion cycle, at most hourly. |

**Description.** After each cluster ingestion, the system compares the new snapshot against the
previous one for every cluster and classifies what changed. This is what turns a feed of current
values into a record of movement, and it is the source of the case delta the scoring engine uses.

**Preconditions.**
1. A cluster ingestion cycle has completed successfully.

**Postconditions.**
1. Every cluster carries exactly one change classification for this cycle.
2. Case deltas are computed and stored.
3. Clusters absent from two consecutive retrievals are classified CLOSED.

**Flow of Events.**
1. The scheduler invokes change detection on completion of 7.1 Ingest Cluster Data.
2. The system pairs each cluster in the new snapshot with its previous snapshot by OBJECTID.
3. The system computes the case delta as the new CASE_SIZE minus the previous CASE_SIZE.
4. The system classifies each cluster as exactly one of NEW, GROWN, UNCHANGED, SHRUNK or CLOSED.
5. The system updates each cluster's last-updated timestamp only where a stored attribute value has changed.
6. The system records a first-seen timestamp for any OBJECTID appearing for the first time.

**Alternative Flows.**
- **7.2.AC.1 — Cluster absent for the first time.** The cluster is retained and not yet CLOSED;
  classification waits for a second consecutive absence.
- **7.2.AC.2 — First ever ingestion.** Every cluster is NEW and no deltas exist. Trend and delta
  drivers are unavailable until a second cycle completes.

**Exceptions.**
- **7.2.EX.1 — OBJECTID reused by NEA for a different locality.** The system treats the mismatch as a
  new cluster and logs the anomaly rather than computing a meaningless delta.

**Includes.** None. This use case is included by 7.1 Ingest Cluster Data.

**Special Requirements.** Snapshots are append-only (1.1.5). Change detection reads history; it never
overwrites it.

**Assumptions.** NEA's OBJECTID is stable for the lifetime of a cluster. This is an assumption, not a
verified guarantee, which is why 7.2.EX.1 exists.

**Notes and Issues.** The GROWN classification and the case delta are the most demo-visible outputs
in the system — they are what makes the ranking move.

**Traces.** 1.1.6, 1.1.7, 1.1.8, 1.1.9, 1.1.10, 1.1.5.

---

## Use Case 7.3 — Ingest Rainfall Data

| Field | Value |
|---|---|
| **Use Case ID** | 7.3 |
| **Use Case Name** | Ingest Rainfall Data |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary), Weather Data Service (secondary) |
| **Priority** | P0 |
| **Frequency of Use** | Every five minutes, continuously. |

**Description.** The system retrieves real-time rainfall readings from the national station network,
assigns the three nearest stations to each active cluster and saved location, and maintains rolling
24-hour and 72-hour accumulations by inverse-distance weighting.

**Preconditions.**
1. The rainfall endpoint is reachable.

**Postconditions.**
1. Accepted readings are stored with their timestamps.
2. Every active cluster and saved location has current 24-hour and 72-hour accumulations.
3. The rainfall source's health record is updated.

**Flow of Events.**
1. The scheduler invokes rainfall ingestion on its five-minute interval.
2. The system retrieves the station list and the current readings.
3. The system parses each station into id, name, latitude and longitude, and each reading into timestamp, station id and value in millimetres.
4. The system discards any reading whose timestamp is more than 30 minutes older than the retrieval time.
5. The system assigns to each active cluster the three nearest stations by great-circle distance from the cluster centroid.
6. The system computes each cluster's rainfall value as the inverse-distance-weighted mean of those three stations.
7. The system updates the rolling 24-hour and 72-hour accumulations for every cluster and saved location, to one decimal place.

**Alternative Flows.**
- **7.3.AC.1 — Station offline.** A station reporting no reading is skipped; the weighted mean uses
  the remaining assigned stations.
- **7.3.AC.2 — New cluster appears.** Station assignment runs for it on the next cycle after
  ingestion creates it.

**Exceptions.**
- **7.3.EX.1 — Retrieval fails.** The system retries up to three times at five-minute intervals and
  raises an ingestion-failure event if all fail.
- **7.3.EX.2 — No accepted reading for 30 minutes.** Rainfall is marked stale, and the scoring engine
  excludes both rainfall drivers and marks affected scores DEGRADED.

**Includes.** None.

**Special Requirements.** Inverse-distance weighting over three stations is the specified method
(1.2.6); a simple nearest-station value is not acceptable, because Singapore rainfall is highly
localised and a single gauge misrepresents a cluster's exposure.

**Assumptions.** The 97-station network is verified and its five-minute cadence is stable.

**Notes and Issues.** Rainfall is the highest-frequency source in the system, so it is the one most
likely to dominate storage. Retention of raw readings should be reviewed in Lab 3.

**Traces.** 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5, 1.2.6, 1.2.7, 1.2.8, 1.2.9, 1.2.10, 4.1.12.

---

## Use Case 7.4 — Ingest Weather Forecast

| Field | Value |
|---|---|
| **Use Case ID** | 7.4 |
| **Use Case Name** | Ingest Weather Forecast |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary), Weather Data Service (secondary) |
| **Priority** | P1 |
| **Frequency of Use** | Every six hours. |

**Description.** The system retrieves the 24-hour forecast, maps each active cluster to one of the
five macro-regions by centroid containment, and derives a heavy-rain-expected flag used by the
resident alert triggers.

**Preconditions.**
1. The forecast endpoint is reachable.
2. At least one active cluster exists.

**Postconditions.**
1. Each active cluster carries a forecast region and a heavy-rain-expected flag.
2. The forecast validity period is stored alongside each derived value.
3. The assigned region is recorded so the flag's basis is inspectable.

**Flow of Events.**
1. The scheduler invokes forecast ingestion on its six-hour interval.
2. The system retrieves the 24-hour forecast for the five regions.
3. The system determines which region polygon contains each active cluster's centroid.
4. The system derives the heavy-rain-expected flag as true where the region's forecast text contains "Heavy", "Thundery Showers" or "Showers".
5. The system stores the flag, the assigned region and the forecast validity period against each cluster.

**Alternative Flows.**
- **7.4.AC.1 — Cluster centroid on a region boundary.** The system assigns exactly one region by a
  deterministic tie-break and records which, so the assignment is reproducible.

**Exceptions.**
- **7.4.EX.1 — Retrieval fails.** Retries as for other sources; the previous forecast continues to
  apply until its validity period lapses.
- **7.4.EX.2 — Forecast expired.** The validity period has passed with no successful retrieval. The
  flag is treated as unavailable, not as false, and rain-forecast alerts are suppressed.

**Includes.** None.

**Special Requirements.** The endpoint returns **five macro-regions**, not the 45 named areas of the
two-hour nowcast. Spatial resolution is therefore coarse, and this must be stated as a limitation
during the demo rather than glossed.

**Assumptions.** Region polygons for the five macro-regions are available or can be approximated.
This is the weakest assumption in the ingestion layer and should be confirmed early.

**Notes and Issues.** Requirement 1.3.2 was written against the wrong endpoint shape in v0.2 and
corrected in v0.3. 7.4.EX.2 distinguishes "unavailable" from "no rain expected"; conflating them
would silently suppress a real alert.

**Traces.** 1.3.1, 1.3.2, 1.3.3, 1.3.4, 1.3.5, 6.1.5.

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

## Use Case 7.6 — Evaluate Alert Triggers

| Field | Value |
|---|---|
| **Use Case ID** | 7.6 |
| **Use Case Name** | Evaluate Alert Triggers |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary) |
| **Priority** | P1 |
| **Frequency of Use** | Once per cluster ingestion cycle. |

**Description.** After each ingestion, the system tests every saved location with alerts enabled
against the three alert conditions — newly inside a cluster, containing cluster grown past the
threshold, heavy rain forecast for a containing cluster — and dispatches the alerts that fire.

**Preconditions.**
1. A cluster ingestion cycle and its exposure evaluation have completed.

**Postconditions.**
1. Every qualifying alert has been dispatched or suppressed by the daily cap.
2. Every decision is logged.

**Flow of Events.**
1. The scheduler invokes trigger evaluation after exposure statuses are updated.
2. The system selects every saved location whose alert subscription is enabled.
3. The system tests whether the location's exposure status has changed to IN_CLUSTER since the previous cycle.
4. The system tests whether the containing cluster has grown by at least the configured case-growth threshold, defaulting to five cases.
5. The system tests whether heavy rain is forecast within 24 hours for a containing active cluster.
6. For each trigger that fires, the system includes 4.3 Notify Resident.
7. The system logs every fired, suppressed and failed alert.

**Alternative Flows.**
- **7.6.AC.1 — Multiple triggers fire for one location.** Each trigger type is capped independently,
  so a location may legitimately produce more than one alert in a cycle, but not two of the same type.
- **7.6.AC.2 — Alerts disabled for the location.** The location is skipped entirely at step 2.

**Exceptions.**
- **7.6.EX.1 — Exposure evaluation incomplete.** Trigger evaluation is skipped for this cycle rather
  than run against stale exposure statuses, which would produce false alerts.

**Includes.** 4.3 Notify Resident.

**Special Requirements.** The 24-hour per-location per-trigger cap (6.1.9) is what keeps the system
from becoming an alert generator residents mute. It is a usability requirement expressed as a rate
limit.

**Assumptions.** Exposure status is recomputed on every cluster ingestion cycle (3.1.8).

**Notes and Issues.** Alert fatigue is the main failure mode of this feature. If demo data produces
too many alerts, raise the growth threshold rather than removing the trigger.

**Traces.** 6.1.1, 6.1.2, 6.1.3, 6.1.4, 6.1.5, 6.1.9, 6.1.10, 3.1.8, 3.1.9.

---

## Use Case 7.7 — Refresh Geocoding Token

| Field | Value |
|---|---|
| **Use Case ID** | 7.7 |
| **Use Case Name** | Refresh Geocoding Token |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Scheduler (primary), OneMap (secondary) |
| **Priority** | P1 |
| **Frequency of Use** | At most every 48 hours. |

**Description.** The system obtains a fresh OneMap API token before the stored one expires, so that
geocoding and the map base layer do not fail silently. The OneMap token is valid for three days; the
refresh interval is 48 hours, leaving a full day of margin.

**Preconditions.**
1. OneMap credentials are configured.

**Postconditions.**
1. A valid token is stored with its issue time.
2. A failure has raised a source-health warning.

**Flow of Events.**
1. The scheduler invokes token refresh on its 48-hour interval.
2. The system requests a new token from OneMap using the stored credentials.
3. The system stores the new token and its issue timestamp.
4. The system updates the OneMap source-health record.

**Alternative Flows.**
- **7.7.AC.1 — Refresh triggered early by an authentication failure.** A OneMap authentication error
  raised anywhere in the system triggers an immediate refresh attempt rather than waiting for the
  interval.

**Exceptions.**
- **7.7.EX.1 — Refresh fails.** The system raises a source-health warning naming OneMap, retains the
  existing token, and retries on the next interval.
- **7.7.EX.2 — Credentials rejected.** The system raises the warning as an authentication failure
  specifically, distinguishing an invalid credential from an unreachable service.

**Includes.** None.

**Special Requirements.** Failure here degrades two visible features at once — address lookup and the
map base layer — so the warning must reach the Operations Manager rather than only the log.

**Assumptions.** OneMap's three-day token lifetime and its refresh endpoint behave as documented.
**OneMap Search has not been test-pulled**; this is recorded as an unverified dependency.

**Notes and Issues.** Added in requirements v0.3 after the adversarial review found the token expiry
had no refresh path. An eleven-week project would otherwise have lost geocoding mid-semester with no
diagnosis.

**Traces.** 3.1.14, 3.1.15, 3.1.16, 3.1.17, 1.4.1, 1.4.3.

---

## Use Case 8.1 — Geocode Address

| Field | Value |
|---|---|
| **Use Case ID** | 8.1 |
| **Use Case Name** | Geocode Address |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | OneMap (secondary). Included by 2.1 Add Saved Location and 3.1 Submit Breeding-Site Report. |
| **Priority** | P1 |
| **Frequency of Use** | Every location entry by a resident. |

**Description.** The system converts a Singapore postal code or free-text address into latitude and
longitude, presenting candidates for confirmation where the lookup is ambiguous. Shared by every use
case that accepts a typed location.

**Preconditions.**
1. A valid OneMap token is stored.
2. The calling use case has supplied a postal code or address string.

**Postconditions.**
1. A confirmed latitude and longitude is returned to the calling use case, or
2. The calling use case is told that no match was found, or that lookup is unavailable.

**Flow of Events.**
1. The calling use case supplies the entered text.
2. The system queries the OneMap Search API.
3. The system receives the candidate results.
4. Where more than one candidate is returned, the system presents up to five for the user to confirm.
5. The user selects the intended address.
6. The system returns the selected coordinates to the calling use case.

**Alternative Flows.**
- **8.1.AC.1 — Exactly one candidate.** Steps 4 and 5 are skipped and the single result is returned.
- **8.1.AC.2 — More than five candidates.** The five closest matches are presented and the user is
  invited to refine the entry.

**Exceptions.**
- **8.1.EX.1 — No result.** The system states that no match was found and the calling use case
  rejects the entry.
- **8.1.EX.2 — Request fails for any other reason.** The system states that address lookup is
  temporarily unavailable — explicitly *not* that no match was found — and offers a retry.
- **8.1.EX.3 — Authentication error.** The system raises a source-health warning and triggers a token
  refresh through 7.7.

**Includes.** None.

**Special Requirements.** 8.1.EX.1 and 8.1.EX.2 must produce different messages (3.1.17). Telling a
resident their address does not exist when the service is merely down is the failure this
distinction prevents.

**Assumptions.** OneMap Search accepts both postal codes and free-text addresses in one endpoint.

**Notes and Issues.** This use case is the single point at which an unverified external dependency
touches two resident-facing flows, so it is worth test-pulling in week 1.

**Traces.** 3.1.2, 3.1.3, 3.1.4, 3.1.5, 3.1.13, 3.1.17, 5.1.2.

---

## Use Case 8.2 — View Driver Breakdown

| Field | Value |
|---|---|
| **Use Case ID** | 8.2 |
| **Use Case Name** | View Driver Breakdown |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary). Included by 5.2 Review Priority Ranking and 5.3 Inspect Cluster Detail. |
| **Priority** | P1 |
| **Frequency of Use** | Many times per working day. |

**Description.** The system shows how one cluster's priority score was arrived at: each of the seven
drivers with its raw value, its normalised value, its weight and its weighted contribution, and any
driver excluded as stale. This is what makes the ranking auditable rather than an opaque number.

**Preconditions.**
1. The actor is signed in with the Operations Manager role.
2. A priority score exists for the cluster.

**Postconditions.**
1. No stored state changes. This use case is read-only.

**Flow of Events.**
1. The calling use case supplies the cluster and its most recent score.
2. The system retrieves the stored driver contributions for that scoring cycle.
3. The system displays each driver with its raw value, normalised value, weight and weighted contribution.
4. The system displays the contributions so that they visibly sum to the stated score.
5. The system states the scoring cycle timestamp the breakdown belongs to.

**Alternative Flows.**
- **8.2.AC.1 — Score is DEGRADED.** The system names every excluded driver and shows the renormalised
  weights actually used, not the configured ones.

**Exceptions.**
- **8.2.EX.1 — No score yet.** The cluster was ingested but not yet scored. The system states that
  scoring is pending rather than displaying zeros.

**Includes.** None. This use case is included by 5.2 and 5.3.

**Special Requirements.** The contributions must reconcile to the displayed score. A breakdown that
does not add up is worse than none, because it invites distrust of the whole ranking.

**Assumptions.** Driver contributions are stored per scoring cycle (4.1.10), not recomputed on
display. Recomputation would show current values against a historical score.

**Notes and Issues.** This is the screen that answers "why is this cluster top?" in the demo. It is
the most direct evidence that the system processes data rather than presenting it — the criterion the
grader named explicitly.

**Traces.** 4.1.3, 4.1.4, 4.1.5, 4.1.7, 4.1.10, 4.1.13, 4.1.18, 4.1.19, 4.1.20.

---

## Use Case 8.3 — Link Verified Reports

| Field | Value |
|---|---|
| **Use Case ID** | 8.3 |
| **Use Case Name** | Link Verified Reports |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary). Included by 6.2 Create Work Order. |
| **Priority** | P1 |
| **Frequency of Use** | Once per work order creation. |

**Description.** When a work order is created against a cluster, the system attaches every verified
open report inside that cluster to it. This is what carries resident evidence into the field: the
crew member sees the photographs and descriptions of what was reported.

**Preconditions.**
1. A work order is being created against a target cluster.

**Postconditions.**
1. Every verified open report inside the cluster is linked to the work order.
2. Each linked report's status becomes Actioned once the work order is assigned.

**Flow of Events.**
1. The calling use case supplies the newly created work order and its target cluster.
2. The system selects every report bound to that cluster whose status is Verified.
3. The system links each selected report to the work order.
4. The system displays the linked reports on the work order for the manager to review.
5. On assignment of the work order, the system sets each linked report's status to Actioned.

**Alternative Flows.**
- **8.3.AC.1 — No verified reports in the cluster.** The work order is created with no linked
  reports. This is normal: most work orders come from the score, not from reports.
- **8.3.AC.2 — Work order created from a single report.** The originating report is linked, and any
  other verified open reports in the same cluster are linked alongside it.

**Exceptions.**
- **8.3.EX.1 — Report verified after the work order was created.** It is not retrospectively linked.
  The manager may link it manually from the work order.

**Includes.** None. This use case is included by 6.2 Create Work Order.

**Special Requirements.** Only Verified reports are linked. Submitted reports are unmoderated and
must not be sent to a crew as though they were confirmed.

**Assumptions.** Report-to-cluster binding is current at the time of work order creation.

**Notes and Issues.** This use case is the join between the community reporting loop and the dispatch
loop — the point at which multi-user interaction becomes visible in the system rather than
theoretical.

**Traces.** 8.1.13, 5.2.5, 5.2.6, 8.4.5.

---

## Use Case 8.4 — Record Treatment

| Field | Value |
|---|---|
| **Use Case ID** | 8.4 |
| **Use Case Name** | Record Treatment |
| **Created By** | Y. K. Chow |
| **Date Created** | 2026-09-02 |
| **Last Updated By** | Y. K. Chow |
| **Date Last Updated** | 2026-09-02 |
| **Actor** | Operations Manager (primary). Included by 6.8 Verify Completed Work. |
| **Priority** | P0 |
| **Frequency of Use** | Once per verified work order. |

**Description.** When an Operations Manager verifies completed work, the system writes a dated
treatment record against the cluster. That record feeds the days-since-last-treatment driver, so a
treated cluster scores lower on the next cycle and drops down the ranking. This use case closes the
system's feedback loop.

**Preconditions.**
1. A work order has been set to Verified by an Operations Manager.

**Postconditions.**
1. A treatment record exists carrying the cluster, task type and completion date.
2. Every report linked to the work order is set to Closed.
3. The cluster's priority score is recomputed within one scoring cycle.
4. The recomputed score is lower, all other drivers being equal.

**Flow of Events.**
1. The calling use case supplies the verified work order.
2. The system writes a treatment record with the target cluster, the task type and the completion date.
3. The system sets every linked report to Closed.
4. The system notifies each reporting resident that their report is Closed, through 4.3.
5. The system marks the cluster for rescoring.
6. The scoring engine recomputes the cluster's score within one scoring cycle, using the new days-since-last-treatment value.

**Alternative Flows.**
- **8.4.AC.1 — Cluster has prior treatments.** The new record becomes the most recent; the driver
  reads from it, and earlier records are retained as history.
- **8.4.AC.2 — Work order raised against a report in an unassigned locality.** No cluster exists to
  attach the treatment to; the record is written against the locality and does not feed the driver.

**Exceptions.**
- **8.4.EX.1 — Cluster closed between assignment and verification.** The treatment record is still
  written for the history, but no rescoring occurs because the cluster is no longer active.

**Includes.** None. This use case is included by 6.8 Verify Completed Work.

**Special Requirements.** Requirement 4.1.17 makes the score reduction an obligation the system must
demonstrably satisfy, which makes it directly testable: score the cluster, write a treatment record,
score it again, assert the decrease. Expect this to be a Lab 4 test case.

**Assumptions.** Verification is the only route by which a treatment record is created. Cancellation
must never write one.

**Notes and Issues.** This is the single most demonstrable causal chain in the project — crew
photograph, manager verification, treatment record, lower score, changed ranking — and it should be
the spine of the Lab 5 demo.

**Traces.** 8.3.12, 8.5.1, 8.5.2, 8.5.3, 8.5.4, 4.1.15, 4.1.16, 4.1.17.
