# Figma AI prompt pack — D-Fence mockups

Lab 1 deliverable 4 (UI mockups). Written 2026-09-02.
Screens come from `../REQUIREMENTS.md` §11.2; behaviour from the use case descriptions in
`USE-CASE-MODEL.md`.

## How to use this

Figma AI degrades badly when asked for a whole application at once. Work one screen at a time:

1. **Paste Block A once** at the start of a session. It is the shared context — product, roles,
   palette, type, rules. Do not re-paste it for every screen.
2. **Paste one screen prompt** from Block B. Generate. Refine with Block C if needed.
3. **Move to the next screen in the same session** so it inherits the styles already established.
   Starting a fresh session loses the palette and the components will not match.

Order matters. Generate the resident screens first — they are simplest and they establish the type
scale and colour tokens the denser manager screens then inherit.

**Before accepting any output, check it against Block D.** Figma AI produces attractive screens that
quietly break the requirements — the commonest failures are tier shown by colour alone, invented
Singapore addresses, and no empty or error state at all.

---

# Block A — paste this once, first

```
You are designing a real Singapore government operations product called D-Fence. It ranks
dengue clusters for cleaning priority using live NEA cluster data, rainfall and resident reports,
then dispatches cleaning crews against that ranking.

There are three user roles and they get different treatments:
- Resident — public, mobile-first, used occasionally and under mild worry. Calm, plain, reassuring.
- Operations Manager — a town council officer at a desk, 1440px wide, used all day. Dense,
  information-first, scannable. This is a working tool, not a marketing page.
- Cleaning Crew Member — a field officer on a phone at 360px, outdoors, one-handed, possibly in
  bright sun. Large targets, high contrast, very few elements per screen.

Visual direction — use these exact values, do not substitute:
- Ground: #FBFBF9 page, #FFFFFF surfaces, #12151A text, #5C6470 secondary text.
- Borders and dividers: #E3E5E1.
- Accent (interactive, links, primary buttons): #1B5E56 deep teal. Hover #164B45.
- Priority tiers, used ONLY for tier: High #A4342B, Medium #B8763A, Low #4A7C59.
- Semantic: error #A4342B, warning #B8763A, success #4A7C59, info #1B5E56.
- Typography: "IBM Plex Sans" for everything, "IBM Plex Mono" for numbers in tables and for
  scores. Type scale 12 / 14 / 16 / 20 / 28 / 36. Body 14 on the manager screens, 16 on resident
  and crew screens.
- 8px spacing grid. 6px corner radius. No drop shadows except on modals and menus. No gradients.
  No illustrations. No emoji.

Content rules — this matters more than the styling:
- Use real Singapore locality names exactly as NEA writes them: Ang Mo Kio Avenue 3, Bedok North
  Avenue 1, Tampines Street 45, Woodlands Drive 60, Jurong West Street 91, Hougang Avenue 8,
  Yishun Ring Road, Clementi Avenue 4, Bukit Batok East Avenue 5, Pasir Ris Drive 1.
- Never use Lorem Ipsum, never invent placeholder names, never write "Address line 1".
- Timestamps read "02 Sep 2026 14:35 SGT". Always that format, always with SGT.
- Every number carries its unit: "18 cases", "47.2 mm", "score 78.4", "6 days since treatment".
- Priority tier is ALWAYS a text label plus colour, never colour alone. A coloured dot with no
  word next to it is wrong.

Design one screen per request. Use auto layout throughout. Name every frame with the screen name
I give you. Build reusable components for anything that appears twice.
```

---

# Block B — screen prompts

Twelve screens, in generation order. These cover the whole demo chain. The remaining twelve screens
in §11.2 are simple variations and can be derived from these.

## B1 — Resident Map (screen 11.2.5)

```
Design the Resident Map screen, mobile 390x844.

A full-bleed Singapore map fills the screen. Three dengue cluster polygons are drawn on it, each
filled at 25% opacity in its tier colour with a 2px solid border in the same colour, and each
labelled with a small white pill containing the tier word and case count: "High · 18 cases",
"Medium · 9 cases", "Low · 3 cases".

Top: a search field, "Search an address or postal code", with a filter icon on the right.
Overlaid bottom sheet, collapsed to 180px, draggable up:
  - Handle bar.
  - Title "Your places".
  - Two rows. Row 1: home icon, "Home", "Ang Mo Kio Avenue 3", then a red "High" pill and the line
    "In an active cluster · 18 cases". Row 2: briefcase icon, "Workplace", "Clementi Avenue 4",
    then a grey "Clear" pill and "No active cluster within 150 m".
  - Below the rows, small grey text: "Cluster data updated 02 Sep 2026 14:35 SGT".
A floating action button bottom-right in accent teal, label "Report a site", with a plus icon.
Bottom navigation bar with five items: Map (active), My Places, Report, My Reports, Settings.
```

## B2 — Add Saved Location (screen 11.2.7)

```
Design the Add Saved Location screen, mobile 390x844.

Header with a back arrow and the title "Add a place".
Form in a single column:
  - Field "Address or postal code", filled with "560103", with helper text below: "Enter a postal
    code or a street address."
  - A label selector as four chips: Home (selected, teal fill, white text), Workplace, School,
    Other.
  - Optional field "Name this place", placeholder "For example, Mum's flat", with a character
    counter reading "0 / 40" right-aligned under it.
Below the form, a results card that appears after lookup, titled "Is this the right place?",
listing three candidate matches as selectable rows. First row selected:
  "Blk 103 Ang Mo Kio Avenue 3, Singapore 560103".
Primary button "Save place" full width in accent teal, secondary text button "Cancel" beneath it.

Then create a second frame of this same screen named "Add Saved Location — no match", where the
results card is replaced by an inline error under the address field, in error red with a warning
icon: "No match found. Check the postal code and try again." The entered text stays in the field.
```

## B3 — Report a Site (screen 11.2.8)

```
Design the Report a Site screen, mobile 390x844.

Header with back arrow and title "Report a breeding site".
A 240px tall map at the top with a draggable pin dropped on it and a small caption below:
"Drag the pin to the exact spot, or enter an address."
Form:
  - Type selector, five radio rows with icons: Standing water (selected), Uncleared refuse,
    Blocked drain, Overgrown vegetation, Other.
  - Description textarea, three lines tall, filled with the real text "Water collecting in three
    plant pot trays at the void deck, been there since the weekend." Character counter reads
    "97 / 500".
  - Photo upload: a dashed-border drop zone with a camera icon, label "Add photos (optional)",
    sub-label "Up to 3 photos, JPEG or PNG, 5 MB each". Show one already-attached thumbnail with
    its filename "IMG_2481.jpg", size "2.1 MB", and a small remove X.
Primary button "Submit report", full width, accent teal.
A quiet info note above the button: "Reports are reviewed before they affect cleaning priorities."
```

## B4 — Duplicate Report Detected (use case 3.2, a modal over B3)

```
Design a modal over the Report a Site screen, mobile 390x844.

The modal is a bottom sheet with a white surface, 6px top corners, and a subtle scrim behind.
Title: "Someone already reported this".
Body: a card showing the existing report — type "Standing water", the text "Trays under the
letterboxes holding water", "Reported 14 hours ago", "Confirmed by 2 residents", and a small
thumbnail.
Explanatory line: "Confirming tells us more people have seen it, which raises its priority faster
than a second report would."
Two buttons stacked: primary "Confirm this report" in accent teal, secondary outline button
"Mine is a different problem".
```

## B5 — My Reports (screens 11.2.9 and 11.2.10)

```
Design two frames, mobile 390x844.

Frame 1, "My Reports": a list of four report cards. Each card shows the type as its heading, the
locality, the date "28 Aug 2026 09:12 SGT", and a status pill. Use these four statuses in order so
the whole lifecycle is visible: Closed (green), Actioned (teal), Verified (teal outline),
Submitted (grey). The Closed card carries an extra line: "Treated on 01 Sep 2026".

Frame 2, "Report Detail": header with back arrow. The photo at the top, full width, 200px tall.
Then type, locality, submitted timestamp, and a vertical status timeline with four steps —
Submitted, Verified, Actioned, Closed — the first three filled in accent teal with their dates,
the last one filled green with "Treated on 01 Sep 2026 by the cleaning crew". Below the timeline,
a quiet card: "Your report raised this cluster's cleaning priority."
```

## B6 — Operations Dashboard (screen 11.2.12)

```
Design the Operations Dashboard, desktop 1440x1024. This is the densest screen in the product and
the most important one. Information first.

Left sidebar 240px, dark surface #12151A, white text: product name at top, then nav items
Dashboard (active), Map, Moderation, Work Orders, Data Sources. User block at the bottom reading
"Priya Raman" and "Operations Manager".

Main area:
  - Page header "Operations Dashboard" with a right-aligned grey line "Data as at 02 Sep 2026
    14:35 SGT" and a small "Refreshing every 5 min" indicator.
  - A row of five stat tiles. Each has a small uppercase label, a large number in IBM Plex Mono,
    and a change line against last week with an up or down arrow. Use: "Active clusters 34, +6 vs
    last week"; "Total active cases 289, +41"; "High priority 7, +3"; "Open verified reports 18,
    -4"; "Open work orders 12, of which 3 overdue".
  - Below, a two-column layout. Left column 65%: the section "Needs attention" as three rows —
    a red row "3 work orders overdue", an amber row "Rainfall feed last updated 51 minutes ago",
    a teal row "18 reports awaiting moderation". Each row is clickable with a chevron.
  - Right column 35%: a simple line chart titled "Total active cases, last 30 days" trending
    upward, and beneath it a horizontal stacked bar titled "Clusters by priority" split 7 High,
    15 Medium, 12 Low with the counts labelled on the segments.
```

## B7 — Priority Table with driver breakdown (screen 11.2.12, use case 5.2)

```
Design the Priority Ranking table, desktop 1440x1024, same sidebar as the dashboard.

Header "Priority Ranking" with filter chips: All tiers (active), High, Medium, Low, and a second
group: Any status, Unassigned, In progress. A right-aligned "Export CSV" secondary button.

A dense data table, 10 rows. Columns: Rank, Locality, Cases, Change, Rain 24h, Reports, Days since
treatment, Score, Tier, Work order. Numbers in IBM Plex Mono, right-aligned, decimals aligned.
Rows, in order:
  1, Ang Mo Kio Avenue 3, 18 cases, +5, 47.2 mm, 4, 21 days, 78.4, High, Unassigned
  2, Tampines Street 45, 15 cases, +2, 39.8 mm, 3, 14 days, 74.1, High, Assigned
  3, Bedok North Avenue 1, 12 cases, +4, 51.0 mm, 5, 30 days, 71.9, High, Unassigned
  4, Jurong West Street 91, 11 cases, 0, 22.4 mm, 1, 9 days, 62.3, Medium, In progress
  5, Woodlands Drive 60, 9 cases, +1, 18.7 mm, 2, 12 days, 58.0, Medium, Unassigned
  ...continue the pattern down to rank 10 with decreasing scores.
Tier is a filled pill with the word in it, in the tier colour.

Row 1 is expanded, showing beneath it a driver breakdown panel: a horizontal bar for each of seven
drivers with its name, its contribution in points, and the bar width proportional. Use: Case size
24.1, Rainfall 24h 18.6, Days since treatment 14.2, Verified reports 11.0, Case growth 6.3,
Premises mix 2.9, Rainfall 72h 1.3. A caption underneath: "Contributions sum to the score of 78.4."

Add one row further down, rank 8, marked with a small amber warning icon beside its score and the
tooltip text shown as a label: "Degraded — rainfall excluded, source stale".
```

## B8 — Moderation Queue and Report Review (screens 11.2.14, 11.2.15)

```
Design the Moderation Queue, desktop 1440x1024, same sidebar.

Header "Moderation" with a count "18 awaiting review" and filters for cluster and report type.
Split layout: left 40% is a scrollable list of submitted reports, oldest first, each showing a
thumbnail, type, locality, time waiting ("waiting 2 days"), and corroboration ("confirmed by 3").
The first item is selected with a teal left border.

Right 60% is the review panel for the selected report: large photo, type "Blocked drain", locality
"Bedok North Avenue 1", submitted "31 Aug 2026 18:44 SGT", description text, a small map thumbnail
showing the pin inside the cluster boundary, and "Confirmed by 3 residents".
At the bottom of the panel, two buttons: primary "Verify" in accent teal, and outline "Reject" in
error red. Beneath them a collapsed textarea labelled "Reason (required to reject, minimum 10
characters)".
```

## B9 — Daily Dispatch Proposal (screen 11.2.16)

```
Design the Daily Dispatch Proposal, desktop 1440x1024, same sidebar.

Header "Today's proposed dispatch" with the subtitle "The 10 highest-priority clusters with no open
work order. Nothing is dispatched until you accept it." A right-aligned secondary button "Accept
all reviewed".

A list of 6 proposal cards, each a wide row containing: rank and locality on the left; score and
tier pill; a one-line reason reading "Driven by case size and 47.2 mm rain in 24h"; a task type
dropdown defaulted to "Fogging"; a date field defaulted to "03 Sep 2026"; and on the right three
controls — a teal "Accept" button, a text button "Edit", and a quiet "Reject" link.
Card 1 is already accepted: it is shown with a green left border, the buttons replaced by the text
"Accepted — work order WO-2418 created".
Card 3 is rejected: dimmed, with a reason field showing "Cleared by contractor last week".
```

## B10 — Work Order Detail with assignment (screen 11.2.18)

```
Design the Work Order Detail screen, desktop 1440x1024, same sidebar.

Header "WO-2418 · Fogging · Ang Mo Kio Avenue 3" with a status pill "Assigned" and a scheduled date
"03 Sep 2026".
Left column 60%:
  - A horizontal status stepper: Created, Assigned (current), Accepted, In progress, Completed,
    Verified. Completed and Verified are greyed as not yet reached.
  - A card "Instructions" with the text "Focus on the void decks of Blk 103 to 109 and the drain
    line along the carpark."
  - A card "Linked reports (3)" listing three report rows with thumbnails, types and dates.
Right column 40%:
  - An "Assign to" card: a list of four crew members, each row showing name, and a workload line
    "4 open work orders". Rows read: Kamal Ibrahim, 4 open; Wei Ling Tan, 2 open; Arun Devi,
    6 open; Siti Nurhaliza, 1 open. Wei Ling Tan is selected.
  - A primary button "Assign work order" in accent teal, and beneath it a quiet line "The crew
    member is notified within a minute."
  - A "Cluster" card showing a small map, score 78.4, tier High, and "21 days since last treatment".
```

## B11 — Crew My Jobs (screen 11.2.19)

```
Design the crew My Jobs screen, mobile 360x800. Field use: large targets, high contrast, minimal
chrome. Every tappable target at least 44px tall.

Header "My jobs" with the crew member's name "Wei Ling Tan" beneath it in secondary text.
Three tabs: Today (active), Upcoming, Completed.
Three job cards. Each card is tall and simple:
  - Task type as a large heading, "Fogging".
  - Locality in body text, "Ang Mo Kio Avenue 3".
  - A row with a tier pill "High" and the scheduled time "Today, 03 Sep 2026".
  - A full-width button at the bottom of the card: card 1 "Accept job", card 2 "Start job" (this
    one already accepted, so show a small teal "Accepted" pill in its header row), card 3 shows
    "In progress" as a pill and its button reads "Complete job".
Bottom navigation: My Jobs (active), Map, Profile.
```

## B12 — Crew Job Completion (screen 11.2.21)

```
Design the crew Job Completion screen, mobile 360x800.

Header with back arrow, "Complete job", subtitle "WO-2418 · Fogging · Ang Mo Kio Avenue 3".
Content:
  - A required photo block: a large dashed capture area with a camera icon and the text "Take a
    photo of the completed work", and beneath it the line "At least one photo is required" in
    secondary text. Show one photo already captured as a 100x100 thumbnail with a remove X.
  - A checkbox row, 44px tall, "I confirm the fogging was carried out as instructed".
  - A notes textarea, "Notes", filled with "Fogged void decks Blk 103-109. Drain along carpark
    cleared of leaf litter." Counter "84 / 500".
  - A quiet outline button "Report an issue instead".
  - Primary full-width button "Submit completion" in accent teal, 52px tall.

Then a second frame named "Job Completion — no photo error", identical, but with no thumbnail, the
submit button pressed, and an error banner at the top in error red: "Add at least one photo before
submitting. A completion cannot be verified without evidence."
```

---

# Block C — refinement prompts

Use these on a generated screen that is nearly right.

```
Make this denser. Reduce vertical padding by a third, drop body text to 14px, and fit two more
table rows without shrinking the type below 12px.
```

```
Every priority tier here is shown only as a colour. Add the tier word inside each pill so the
meaning survives in greyscale and for a colour-blind user.
```

```
Add the three missing states as separate frames, named after this screen: an empty state that
names the action which would populate it, a loading state with skeleton rows rather than a blank
area, and an error state with a cause, a remedy and a retry button.
```

```
Add a stale-data banner across the top of this screen: amber background, warning icon, text
"Rainfall data last updated 51 minutes ago. Priority scores may be out of date." with a "Retry
now" text button on the right.
```

```
This is for a field worker outdoors on a phone. Increase every tap target to at least 44px,
increase text contrast, remove all secondary decoration, and make the primary action the largest
element on the screen.
```

---

# Block D — check before accepting

Run this list over every generated screen. Each line maps to a numbered requirement, so a failure
here is a traceable defect, not a matter of taste.

| Check | Requirement |
|---|---|
| Tier shown as a word, not colour alone | 11.6.1, 11.7.5, 9.1.11 |
| Timestamps in "02 Sep 2026 14:35 SGT" format | 11.6.2, 11.6.3 |
| Every quantity carries its unit | 11.6.11 |
| Numeric table columns aligned on the decimal | 11.6.4 |
| Sorted column and direction indicated | 11.6.5 |
| Empty state names the action that populates the list | 11.4.3, 11.4.4 |
| Error state gives cause, remedy and a retry control | 11.4.5, 11.4.6 |
| Stale-source banner present where data is shown | 11.4.7 |
| Character counter on every bounded text field | 11.5.7 |
| Required fields marked before submission | 11.5.3 |
| Destructive actions confirm, naming the object | 10.5.2, 11.5.9 |
| Crew targets at least 44px | 11.7.7 |
| Role's navigation shows only what that role may reach | 11.1.2, 11.1.3, 11.1.4, 11.1.5 |
| Real Singapore localities, no placeholder text | Lab 1 §3.4.2, credibility |
| Manager reaches work-order creation in ≤3 interactions | 10.5.6 |

**Annotate the mockups before submitting.** Lab 1 §3.4.1 asks for HCI principles to be applied, and
the AI will not do this for you. On each screen add a callout naming the principle it demonstrates —
visibility of system status for the refresh timestamp and the stale banner, error prevention for the
duplicate-report sheet, recognition over recall for the driver breakdown, flexibility for the
Today/Upcoming/Completed filters. A mockup with no annotation reads as a picture; a mockup with
annotation reads as design work.

---

# Screens not covered by Block B

These twelve are simple variations of the ones above and can be generated by adapting the nearest
prompt: 11.2.1 Landing, 11.2.2 Register, 11.2.3 Sign In, 11.2.4 Password Reset, 11.2.6 My Locations,
11.2.11 Alert Settings, 11.2.13 Cluster Detail, 11.2.17 Work Order Create, 11.2.20 Job Detail,
11.2.22 Staff Accounts, 11.2.23 Data Sources, 11.2.24 Not Authorised and Not Found.

Cluster Detail (11.2.13) is the one worth real effort — it carries the before-and-after treatment
score that the Lab 5 demo turns on. Write it from use case 6.8 rather than adapting another screen.

---

# Block E — corrections, 2026-09-19

Blocks A–D describe the product as designed. This block describes the **eleven places where the
built screens and the mockups disagreed**, found on 2026-09-19 by photographing all twenty-eight
screens at the viewport each role actually uses (`npm run shots`) and looking at them.

The code has been corrected. **These prompts bring the Figma file to the same place**, so that the
mockups and the deployment stop being two different products. Paste Block A first if you are
starting a new session, then Block E0 (the components), then whichever screens you are updating.

Two of the eleven were not styling problems at all and are worth stating plainly, because the
mockups showed them working and the product never did:

- **No photograph in the system could be seen by anybody.** Not a rendering bug — there was no
  route that served one, no key on any payload, no `<img>` on any screen, and a
  Content-Security-Policy whose `img-src` would have refused the image had one ever been asked
  for. B5's "photo at the top, full width, 200px tall" and B8's evidence panel described a product
  that did not exist.
- **Identifiers were reaching users.** A resident's own report was headed `StandingWater`, the
  staff table read `CleaningCrew`, the dispatch list suggested `RefuseClearance`, the score
  breakdown listed `DaysSinceLastTreatment`, and a saved location's status read `CLEAR`.

---

## E0 — the four components, paste this before any screen in this block

```
Add four components to the D-Fence library. Every screen prompt after this one uses them, so
build them once and use instances.

1. "Fact row" — a labelled fact, used on every detail screen.
   Two columns: a label in 13px #5C6470 medium in a fixed 200px column, and a value in 14px
   #12151A. A 1px #E3E5E1 rule under the row, full width. A "wide" variant puts the label above
   the value and lets the value run the full width, for a description or a note.
   At 390px wide, both variants stack: label above value, value at 16px.

2. "Pill" — a status or tier, as a word in a chip.
   Height 22px, 10px horizontal padding, fully rounded, 12px semibold, 1px border. Eight variants,
   text colour then fill:
     Critical  #FFFFFF on #7A1F18
     High      #A4342B on #FBEFEE
     Medium    #8A561F on #FCF4EA
     Low       #3A6247 on #EFF5F0
     Good      #3A6247 on #EFF5F0
     Warning   #8A561F on #FCF4EA
     Bad       #A4342B on #FBEFEE
     Neutral   #5C6470 on #FFFFFF
   The word is always present. A pill with a colour and no word is not a variant of this
   component, it is a different component and we do not have one.

3. "Photo tile" — a photograph in a 4:3 frame, 6px radius, 1px #E3E5E1 border, image cropped to
   fill. A grid of these auto-fills at a minimum of 160px per tile with a 12px gutter.
   Two extra states: "loading" is a 45-degree grey hatch; "unavailable" is a bordered box holding
   13px #5C6470 text, centred, reading "that photograph is no longer stored".

4. "Series" — a small chart. A 2px accent-teal line over an 8%-opacity accent-teal fill down to a
   1px #5C6470 baseline, with a 1px dashed #E3E5E1 line at the peak. Under it, one 12px #5C6470
   row: "peak 912 cases on 04 Sep 2026" left, "latest 105 cases" right, both numbers in IBM Plex
   Mono. A flat series is drawn across the middle of the frame, not along the bottom.
```

---

## E1 — Report Review (screen 11.2.15). The most wrong screen in the product.

```
Redraw the Report Review screen, desktop 1440x1024, sidebar as in B6.

It currently shows six unlabelled paragraphs stacked in body text. Replace them.

Title row: "Standing water" as the 28px page title, with a Warning pill reading "Submitted"
beside it, vertically centred, at 12px — the pill must not scale with the heading.

Then four Fact rows:
  Where          Jln Kayu / Jln Tari Dulang, Payong, Piring, Serimpi, Zapin / Lor Tanggam
  Submitted      04 Sep 2026 06:42 SGT
  Corroborations 2 neighbours confirmed this
  What the resident wrote   (wide variant) "Water collecting in three plant pot trays at the void
                            deck, been there since the weekend."

Then a section headed "Photographs" — an H2, 20px — holding a grid of three Photo tiles showing
real photographs of a void deck, a drain and a plant pot tray. This section is the reason the
screen exists and it must sit ABOVE the decision controls.

Then the rejection reason textarea, its helper text, and last a button row: "Verify" as a filled
accent-teal primary, "Reject" as an outline button with #A4342B text and an #E0BDB9 border. These
two must not look alike; they currently do.

Make a second frame, "Report Review — no photographs", identical except that the grid is replaced
by a dashed-border box holding 13px #5C6470 text: "This report carries no photographs. 5.1.5 makes
them optional, so this is not an error — verify it on the description and the location."
```

## E2 — Cluster Detail (screen 11.2.13). The screen that justifies a rank.

```
Redraw the Cluster Detail screen, desktop 1440x1024, sidebar as in B6.

Title: the full NEA locality string, which really is this long and will wrap to three lines —
"Ho Ching Rd (Blk 117, 119, 120) / Kang Ching Rd (Blk 335) / Tah Ching Rd (Blk 321, 322, 323, 324,
326, 329, 330, 332) / Yuan Ching Rd (Lakeside Twr)". Design for it rather than for a short one.

Under the title, two stat tiles side by side, each in a white card with a 1px #E3E5E1 border:
"CASES / 73" and "PRIORITY SCORE / 40.3", numbers at 36px in IBM Plex Mono.
Beneath the tiles, two pills on one line: a Medium pill "Medium priority" and a Neutral pill
"Stable".

Then "How this score was reached", an H2, over a six-column table:
  Driver | Measured | Normalised | Weight | Contribution | Share of the score
Rows, exactly these, and note that the driver names are in English with units on the measurement:
  Case size                  73 cases   0.75  0.30  0.23   [bar, full width]
  Days since last treatment  90 days    1.00  0.15  0.15   [bar, 65%]
  Premises mix               0.526      0.53  0.05  0.03   [bar, 13%]
  Case growth                0 cases    0.00  0.20  0.00   [bar, 1%]
  Rainfall, last 24 h        0.0 mm     0.00  0.08  0.00   [bar, 1%]
  Rainfall, last 72 h        0.0 mm     0.00  0.12  0.00   [bar, 1%]
  Open verified reports      0 reports  0.00  0.10  0.00   [bar, 1%]
The four numeric columns are right-aligned IBM Plex Mono. The bar is an 8px fully-rounded
accent-teal bar in a 140px column, scaled against the largest contribution in this table, not
against 1.0.

Then "Case history", an H2, over a Series component with three points all at 73 cases — so it is
drawn as a flat line across the middle of the frame — and a collapsed disclosure beneath it
labelled "The daily figures".

Then "Work": "0 open verified reports", an empty-state card reading "No open work orders for this
cluster.", and a link "Raise a work order".
```

## E3 — Moderation Queue (screen 11.2.14). Currently a numbered list 23 items long.

```
Redraw the Moderation Queue, desktop 1440x1024, sidebar as in B6.

Title "Moderation", then a freshness line "Updated 14:42:57 — refreshes every 20 seconds" with a
"Refresh now" outline button, then a type filter dropdown reading "All types".

The queue is a stack of cards, NOT a numbered list. Each card: white surface, 1px #E3E5E1 border,
6px radius, 12px/16px padding, 8px between cards, and the card content spans the full width of the
main area — the current build squeezes it into the left 40% and leaves the rest empty.

Each card has:
  - a head row: the report type as an accent-teal link at 14px semibold — "Standing water", not
    "StandingWater" — then a wait pill, then, when it applies, a Neutral pill "outside every
    cluster". The wait pill is Neutral under 3 days ("waiting 6 h"), Warning from 3 days
    ("waiting 4 d"), and Bad from 14 days ("waiting 15 d").
  - the description on its own line, 14px #12151A.
  - a meta row, 13px #5C6470, items separated by 16px: the locality, then "2 photographs", then
    "1 corroboration" when there is one.

Draw eight cards. Make one of them a 15-day Bad pill, because that is the row this screen exists
to make impossible to miss and the current design makes it look like all the others.
```

## E4 — Work Order Detail (screen 11.2.18). A manager verifies work they cannot see.

```
Redraw the Work Order Detail screen, desktop 1440x1024, sidebar as in B6.

Title "Fogging" with a Good pill "Verified" beside it.

Four Fact rows:
  Scheduled     04 Sep 2026
  Priority      (a Medium pill, in the value column)
  Cluster       "View the cluster" as an accent-teal link
  Instructions  (wide) "Fog the perimeter drains and the bin centre."

Then a bordered panel headed "What the crew recorded", which does not exist in the current build
at all:
  Three Fact rows — "Task performed / Fogging", "Completed / 04 Sep 2026 09:00 SGT",
  "Notes (wide) / Drains fogged, bin centre cleared, two trays emptied."
  Then a grid of two Photo tiles showing real before-and-after photographs of a drain.
This panel sits ABOVE the Actions section. A decision control placed above its evidence invites
the decision to be taken without it.

Then "Assignment": the line "Assigned to crew.tan@towncouncil.gov.sg" — an email address, never
an identifier; the current build prints a UUID here — a crew dropdown, and an outline "Reassign"
button.

Then "Actions": the reason textarea, then three buttons in a row — "Verify completion" filled
accent teal, "Reject completion" and "Cancel work order" both as outline buttons with #A4342B
text and #E0BDB9 borders.

Then "History", a vertical audit trail with four entries and their timestamps.
```

## E5 — My Reports and Report Detail, resident (screens 11.2.9, 11.2.10)

```
Redraw two frames at 390x844. B5 already describes these well; the build diverged from it and
these are the corrections.

Frame "My Reports": the list is cards, not bullet points — the built screen renders literal list
markers. Each card: a head row with the type as an accent-teal semibold link ("Standing water")
and a status pill; then a 13px #5C6470 meta row holding the locality and the timestamp
"05 Sep 2026 18:26 SGT", and "2 neighbours confirmed this" when it applies.
The word "Submitted" must appear at most once per card. It currently appears twice — as the status
and again as a label on the date — which reads as a stutter.
Four cards, statuses Closed, Actioned, Verified, Submitted.

Frame "Report Detail": title "Standing water" with a Warning pill "Submitted". Three Fact rows —
Where, Submitted, and a wide "What you wrote". Then a grid of Photo tiles showing the resident's
own photograph, full width, two per row. Then "No other residents have confirmed this yet." and a
filled accent-teal button "I have seen this too".
Make a second variant where the photographs are replaced by a dashed box reading "Photographs are
shown once the report has been reviewed." — that is the rule for a report somebody else filed.
```

## E6 — Resident Map (screen 11.2.5). It opens showing no dengue.

```
Redraw the Resident Map, mobile 390x844.

The critical correction is the framing. The built screen fits the map to the resident's saved
location alone at street zoom, so it opens on the Ang Mo Kio street grid with not one cluster
polygon in view — a screen called "Dengue map" answering "where do I live". Frame the map so that
the saved-location pin AND the nearest cluster polygon are both visible, with the polygon clearly
a polygon: filled at 25% in its tier colour with a 2px border of the same colour.

The map is 380px tall and full-bleed to the screen edges. The layer toggles above it are a single
row that scrolls horizontally rather than wrapping — "Fit to clusters" is currently cut off at the
right edge.

Below the map:
  - Cluster cards, each with the locality as a heading, a tier pill, and "73 cases".
  - "Your saved locations": one card per place, the name in semibold and a pill beside it. The
    pill text is "Inside a cluster" (Bad), "Within 150 m of a cluster" (Warning) or "No cluster
    nearby" (Good). The built screen renders the third of these as the word CLEAR.
  - "Recent reports": cards, each with the type in words and a status pill. The built screen shows
    ten bullet points all reading "StandingWater — Verified", which is the same two words ten
    times.
```

## E7 — Analytics (screen 11.2.26). Five charts, three of which are tables.

```
Redraw the Analytics screen, desktop 1440x1024, sidebar as in B6.

Every chart sits in its own white card: 1px #E3E5E1 border, 6px radius, 20px padding, 24px apart.
The current build runs them into one another and clips every line at both edges.

1. "Active cases per day" — a Series component, 140px tall, with a visible baseline and the peak
   gridline. Under it the note "Days on which no ingestion cycle succeeded are omitted rather than
   shown as zero — a missed cycle is not a day on which dengue stopped." Then the figures as a
   table in a 240px-tall scroll panel with a sticky header. The table stays visible: it is what a
   screen reader reads, so it may not be hidden behind a disclosure.

2. "Clusters by priority tier" — three rows, each a tier Pill, a count in IBM Plex Mono, and a
   6px rounded share bar in the tier colour: High 0 / 0%, Medium 1 / 8%, Low 12 / 92%. It is
   currently three rows of plain black text with no colour at all.

3. "Open work orders per crew member" — email addresses, never identifiers. The built screen shows
   "93738330-b7ca-417e-8531-6232e8d90d01" in the crew member column.

4. "Time from raised to verified" — the median at 28px in IBM Plex Mono with "from raised to
   verified, typically" beside it, then the spread at 13px: "Fastest 4.2 hours, slowest 61.0
   hours, over 62 verified work orders."

5. "Reports received per day" — as 1, with its own note about zeroes being real.

Above each chart, when the data is too short, a sufficiency line in #12151A at the same weight as
the body — never grey-on-grey, never colour alone: "Not yet enough data to read as a trend.
Only 3 days of snapshots exist. What is shown below is everything there is."
```

## E8 — Dispatch Proposal (screen 11.2.16)

```
Redraw the Dispatch Proposal, desktop 1440x1024, sidebar as in B6.

Cards, not a numbered list. Each card:
  - head row: the locality as an H2 at 20px, then a tier pill "Medium priority".
  - meta row, 13px #5C6470: "score 40.3" in IBM Plex Mono, then "Suggested: Refuse clearance" —
    in words, not "RefuseClearance".
  - an action row with 20px between two accent-teal links: "Raise a work order" and "Why is this
    ranked here?". In the built screen these two have no space between them and render as one
    run-on sentence, "Raise a work order for Bt Batok St 23Why is this ranked here?".

The first link no longer repeats the locality — the card heading is already the locality.
```

## E9 — Staff Accounts (screen 11.2.22)

```
Redraw the Staff Accounts screen, desktop 1440x1024, sidebar as in B6.

The "Add a staff account" form moves to the TOP of the page, in a bordered panel, above the table.
It is currently below seventy-five rows.

Add a filter row above the table: a search field "Find an account" and a role dropdown.

Table columns: Email, Role, Status, Action.
  - Role reads "Cleaning Crew" and "Operations Manager", not "CleaningCrew".
  - Status is a Pill: Good "Active", Neutral "Deactivated".
  - Action is a button reading just "Deactivate" — 96px wide. The built screen repeats the whole
    email address inside the button, which makes the action column the widest on the screen.
```

## E10 — Pest Reference (screen 11.2.27). A resident is shown the scoring model.

```
Redraw the Pest Reference screen at 390x844 and at 1440x1024.

The last column currently reads "severity 1.00 · evidence tier A" — internal model figures shown
to a member of the public who has just seen a snake. Replace the column heading with "How quickly"
and the values with one of four phrases: "Treated as urgent", "Treated as high priority",
"Treated as routine", "Logged and monitored".

On mobile the twenty-five rows become twenty-five cards and the page runs to nine thousand pixels.
Add a sticky search field at the top and group the cards under two sticky subheadings:
"Call the authority first" for the wildlife AVS and NParks handle, and "Report it to us" for the
rest. The phone number stays a tel: link, 16px, accent teal.
```

## E11 — My Jobs, crew (screen 11.2.19)

```
Redraw My Jobs at 390x844.

The four filters — Today, Upcoming, Completed, All — are a 2x2 grid of equal-width buttons, each
48px tall, rather than a row that wraps and leaves "All" alone on a second line.
The selected filter is filled accent teal with white text. In the built screen the selection is
announced to a screen reader and shown to nobody: all four look identical.

Job cards below: the locality as a semibold link, a tier pill, the task type in words, the
scheduled time, and a large 56px-tall primary action button per card.
```

---

## Block E checklist — what to reject in the returned frames

Figma AI will quietly reintroduce most of these. Check each frame for:

1. **An identifier anywhere a person can see it.** `StandingWater`, `CleaningCrew`, `CLEAR`,
   `RefuseClearance`, `CaseSize`, a UUID. If the string has no space in it and is not a proper
   noun, it is wrong.
2. **A tier or status shown as colour alone**, or as plain text with no colour. It is always both.
3. **A number with no unit.** "73" is not "73 cases"; "0.526" needs either a unit or a column
   heading that supplies one.
4. **A collection rendered with list markers.** Every collection in this product is a card stack
   or a table.
5. **A photograph rendered as a file name**, or a photo area that is only ever shown full.
   Every photo area needs an empty state and an unavailable state.
6. **Two links touching**, with no gutter between them.
7. **A destructive button styled like the safe one beside it.**
8. **A chart with no baseline**, or a chart whose accompanying table is hidden behind a
   disclosure.
9. **A detail screen whose facts have no labels.** If the reader has to work out what a line is
   by reading its value, use Fact rows.
10. **An empty right-hand half on a 1440px frame.** Several built screens squeeze their content
    into the left 40%.
