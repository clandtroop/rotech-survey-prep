# Team Planner — source file analysis & proposed schema

Phase 1 exploration output. Source: `Team_Planner_5.21.2026.xlsx` (19 sheets, 5 hidden).
Nothing has been migrated yet — this document is the schema proposal that gates the
migration script.

## 1. What the workbook actually contains

The layout differs from the initial description in three ways that matter, all
confirmed by reading the file:

### `Team Visits` is entirely derived — it is not a data source

Every status cell on `Team Visits` is a cross-sheet formula pointing at a person tab:

```
r2112: =Tammy!A2239   =Tammy!B2239   =Tammy!C2239   ...
r2113: =Aundrea!A579  =Aundrea!B579  ...
r2116: =Cody!A183     =Cody!B183     ...
```

Each week block is seven rows, one per specialist, in fixed order
(Tammy, Aundrea, Janet, Deanne, Cody, Hector, Paige). The `#REF!` cells are formulas
whose target rows were deleted, and the `0` cells are formulas pointing at empty cells.
The person tabs are the single source of truth; `Team Visits` is a rollup view of them
and is fully reproduced by the Team Whereabouts Calendar. **Migration reads the person
tabs and skips `Team Visits` entirely** — importing both would double every entry.

### The person tabs are month grids, weekdays only, with free text (not a status list)

Each tab repeats this block per month:

| row | content |
| --- | --- |
| month header | `MAY 2026` in col A |
| weekday header | Monday…Friday in cols A–E |
| day-number row | `4  5  6  7  8` |
| 1–4 text rows | free-typed status / location / notes, one line each |
| `NOTES:` | block terminator |

There are **no weekend columns** and **no controlled vocabulary** — 224 distinct
first-line strings appear in 2026 alone (`Home Office`, `HOME`, `Home office`,
`HOME OFFICE`, `Home Officw`, `PTO`, `PTO - Dominican`, `Travel Day`, `Searcy, AR`, …).
Status has to be *inferred* from the text; see §3.

Rows 2+ of a day cell are notes (`With Aundrea`, `Aundrea appt 12:30-4:30pm`) —
135 of the 980 2026 day-entries have more than one line.

### There is no hotel or flight data in the workbook

Columns F onward are empty on every calendar tab (two stray cells total: `Cody!F207`
= "Home Office", `Team Visits!K173` = "v"). The hotel/flight detail object is a new
forward-looking feature with nothing to migrate into it.

### Sheet-by-sheet summary

| Sheet | Layout | Migration role |
| --- | --- | --- |
| `Sheet1` (hidden) | `Date \| Applicable to: \| Task \| Specialist \| Comments` — r2–32 recurring rules, r33–36 survey-due, r40–55 birthdays/anniversaries | Primary recurring-task source |
| `Tasks by Month` | Quarter grid, one multi-line text blob per month (`Q1 / JANUARY / "WEEKLY FLUVIEW EMAIL\nCOLLECT INFLUENZA…"`) | No unique data — a hand-maintained restatement of `Sheet1`. Derived at render time, not migrated |
| `Assigned Duties` | col A = duty, col B = specialist (53 rows). Cols D–F and H–I are unrelated reference tables (region/loc/whse counts, state/JV counts) | Standing duties → tasks with cadence `standing`. Cols D+ not migrated |
| `3 Yr Planner` | Same 5 columns as `Sheet1`, one row per dated occurrence. 2023: 77, 2024: 115, 2025: 112, **2026: 140**, 2027: 23 | Current-year dated occurrences |
| `Team Visits` | Formula rollup of the 7 person tabs | **Skipped** (derived) |
| `PTO` | Same month grid, names typed manually (`Janet PTO`, `Aundrea - FH`) | Mostly duplicates the person tabs; unique value is people with no tab (Tamara, Laura) |
| Person tabs | Month grids as above | Primary whereabouts source |
| `Validation` (hidden) | Dropdown source lists for `Applicable to` / `Specialist` / `Task` | Seeds the pick-lists in the new UI |
| `Survey Structure` | `LAWSON \| CITY \| ST \| HCO \| REGION \| AREA \| SURVEY DUE` (318 locations) | **Not migrated** — survey due dates stay in survey-prep |

### 2026 volume

| Person | 2026 range | Day-entries |
| --- | --- | --- |
| Tammy | Jan 5 – Dec 25 | 180 |
| Aundrea | Jan 8 – Dec 31 | 195 |
| Janet | Jan 28 – Dec 31 | 217 |
| Deanne | Jan 6 – Dec 25 | 147 |
| Cody | May 25 – Dec 31 | 134 |
| Hector | May 25 – Dec 25 | 48 |
| Paige | May 25 – Dec 31 | 59 |
| **Total** | | **980** |

Cody, Hector and Paige start 2026-05-25 ("WELCOME TO THE TEAM!!"). David, Billy and
Jason have no 2026 rows at all — their tabs end in 2024/2025 and are hidden.
Coverage is patchy against 261 weekdays; gaps are genuinely blank in the source.

Recurring tasks: 31 rules on `Sheet1`, 53 standing duties on `Assigned Duties`,
140 dated 2026 rows on `3 Yr Planner` (of which 11 are birthday/anniversary rows and
3 are survey-due rows — see open questions).

## 2. Proposed Firestore schema

Four new collections in the existing `surveyprep` database, all prefixed
`teamPlanner*` so they never collide with `followUpChecklists`, `visitTrends`,
`locations`, `policyDates`, `inProgressVisits` or `auditLog`.

### `teamPlannerPeople/{personKey}`

Roster + the identity bridge between spreadsheet names and Firebase Auth accounts.
`personKey` is a slug (`tammy`, `aundrea`, …).

```js
{
  personKey:   "cody",
  displayName: "Cody Landtroop",
  sheetNames:  ["Cody", "Cody Landtroop"], // every spelling seen in the source
  email:       "cody.landtroop@rotech.com", // the Auth account that owns this person
  active:      true,
  sortOrder:   5,   // preserves the Team Visits row order
  color:       "#0053a1",
}
```

### `teamPlannerTasks/{taskId}`

One collection covering all three task sources, distinguished by `cadence.type`.

```js
{
  name:     "Weekly Fluview Email",
  cadence: {
    type: "weekly" | "monthly" | "quarterly" | "month" | "monthRange" |
          "oneOff" | "standing",
    months:   [10, 11, 12, 1, 2, 3], // for month / monthRange
    date:     "2026-08-17",          // for oneOff (from 3 Yr Planner)
    rawLabel: "Oct - March",         // the source Date cell, verbatim
  },
  assignee: {
    type: "specialist" | "team" | "unassigned",
    personKey:   "deanne",
    displayName: "Deanne Wilson",
  },
  scope:    "All Regions" | "Targeted Locations" | "Everybody" | "330862" | "" ,
  comments: "Send emails October thru March",
  source:   { sheet: "Sheet1", row: 31 },   // provenance for the backfill phase
  active:   true,
  createdAt, updatedAt, updatedBy,
}
```

`Tasks by Month` needs no rows of its own — the Task Calendar renders the same
quarter-grid view by grouping this collection on `cadence`.

### `teamPlannerEntries/{entryId}`

Replaces the person tabs, `Team Visits` and `PTO`. One document per person per
contiguous span (single-day entries have `startDate === endDate`).

```js
{
  personKey: "cody",
  personName:"Cody Landtroop",
  ownerEmail:"cody.landtroop@rotech.com", // what the security rule checks
  ownerUid:  null,                        // filled on first edit in-app
  startDate: "2026-06-08",                // ISO, inclusive
  endDate:   "2026-06-12",                // inclusive; === startDate if single day
  status:    "home_office" | "site_visit" | "travel" | "pto" | "flex_holiday" |
             "limited_availability" | "meeting" | "holiday" | "other",
  rawText:   "Travel Day",                // exact source string, never discarded
  notes:     "With Aundrea",              // lines 2-4 of the day cell, joined
  visit: {                                // only when status === "site_visit"
    location: "Searcy, AR",
    purpose:  "",
    multiDay: true,
  },
  travel: {                               // never rendered inline on the calendar
    hotel:  { name, confirmation, checkIn, checkOut, phone, notes },
    flight: { airline, confirmation, departAirport, departTime,
              arriveAirport, arriveTime, returnFlight: {...}, notes },
  },
  source:    { sheet: "Cody", row: 38, col: "A" },
  createdAt, updatedAt,
}
```

`travel` is a nested object on the entry rather than a subcollection: it is at most
one small object per visit, it is always fetched with the entry it belongs to, and
keeping it nested means the calendar's single month query returns everything the
detail drawer needs with no second read. The calendar renders `status`, `rawText`
and `notes` only; `visit` and `travel` render solely in the expanded detail view.

### `teamPlannerMilestones/{id}`

The 16 birthday/anniversary rows from `Sheet1` r40–55. They are dated annual
reminders, not compliance tasks, and mixing them into `teamPlannerTasks` would put
"TAMMY'S BIRTHDAY SEPTEMBER 12TH" in a task list filtered by cadence and specialist.

```js
{ personKey: "tammy", type: "birthday" | "work_anniversary",
  month: 9, day: 12, year: 1993 /* anniversaries only */, label: "…", }
```

### Security rules

Follows the two patterns already in `firestore.rules`:

- `teamPlannerPeople`, `teamPlannerTasks`, `teamPlannerMilestones` — read for any
  signed-in specialist, write restricted to `ADMIN_EMAILS`, exactly like `locations`
  and `policyDates` (`Assigned Duties` r52 lists Tammy as the Team Planner owner).
- `teamPlannerEntries` — read for any signed-in specialist (everyone sees the whole
  team's calendar), create/update/delete only where
  `request.auth.token.email == resource.data.ownerEmail`, mirroring the `ownerUid`
  check on `inProgressVisits` but keyed on email so migrated entries have an owner
  before anyone signs in. Admins can also write any entry, for roster fixes.
- Writes to `teamPlannerTasks` are mirrored into the existing `auditLog` collection,
  same as `locations`.

## 3. Status inference

No status column exists, so the migration classifies `rawText` and always keeps the
original string. Applied to the 980 2026 entries:

| Inferred status | Count | Matches |
| --- | --- | --- |
| `home_office` | 549 | contains "home" (`Home Office`, `HOME`, `Home Officw`) |
| `site_visit` | 178 | anything unmatched — in practice city/state strings |
| `travel` | 93 | contains "travel" (`Travel Day`, `Travel Home`) |
| `pto` | 75 | contains "pto"/"vacation" (`PTO - Dominican`, `Paige PTO`) |
| `holiday` | 34 | `MEMORIAL DAY`, `HAPPY 4th OF JULY`, `MERRY CHRISTMAS`… |
| `meeting` | 23 | `TEAM MEETING`, `Corporate`, `Orlando-Team Mtg`, `JC Conference` |
| `limited_availability` | 13 | `LTD Avail 6.21.26`, `Limited Availability` |
| `flex_holiday` | 7 | `FH` |
| — dropped | 8 | stray day numbers from a mis-shaped week block |

`site_visit` is the fallback bucket, so it is the one to review: contiguous
weekday runs collapse into ~74 multi-day trips.

## 4. Open questions (blocking the migration run)

1. **Auth emails.** `ownerEmail` needs the Firebase Auth address for each of the
   seven specialists. Only two are known from `ADMIN_EMAILS`
   (`tasmith@rotech.com`, `cody.landtroop@rotech.com`). Default if unanswered:
   migrate with `ownerEmail` blank and add an admin roster panel to map people to
   accounts after deploy — migrated entries are read-only until that mapping exists.
2. **2027 rows.** `3 Yr Planner` has 23 rows dated 2027 (QPOW rotation already
   scheduled ahead). Default: include them — forward-scheduled work is not backfill.
3. **Survey-due rows.** `Sheet1` r33–36 and 3 rows in `3 Yr Planner`
   ("Annual Application Due 12/13/2026") are survey due dates. Default: **excluded**,
   per "survey due dates stay where they are".
4. **Former specialists.** David, Billy and Jason have no 2026 data. Default: added
   to `teamPlannerPeople` as `active: false` so the later backfill needs no schema
   change.
5. **PTO-sheet-only people.** Tamara (4 entries) and Laura appear on the `PTO` sheet
   with no calendar tab of their own. Default: skipped in Phase 1, flagged here.
