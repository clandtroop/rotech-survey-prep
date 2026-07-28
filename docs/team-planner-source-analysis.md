# Team Planner — source file analysis & proposed schema

Phase 1 record. Source: `Team_Planner_5.21.2026.xlsx` (19 sheets, 5 hidden).
Written up as the schema proposal that gated the migration; §5 records what was
actually loaded on 2026-07-28.

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
113 of the imported 2026 entries carry one.

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

Day-cells are what the grid holds; entries are what was written, after
consecutive identical absences merge into one range (see §5).

| Person | 2026 range | Day-cells | Entries |
| --- | --- | --- | --- |
| Tammy | Jan 5 – Dec 25 | 188 | 174 |
| Aundrea | Jan 8 – Dec 31 | 201 | 186 |
| Janet | Jan 28 – Dec 31 | 228 | 216 |
| Deanne | Jan 6 – Dec 25 | 153 | 151 |
| Cody | May 25 – Dec 31 | 136 | 135 |
| Hector | May 25 – Dec 25 | 48 | 46 |
| Paige | May 25 – Dec 31 | 59 | 50 |
| **Total** | | **1,013** | **958** |

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

## 4. Decisions taken

These were the open questions; all were resolved on the defaults below.

1. **Auth emails.** `ownerEmail` is set from the roster. Only Tammy
   (`tasmith@rotech.com`) and Cody (`cody.landtroop@rotech.com`) were known, so the
   other five import un-owned. The app's admin **Roster** panel links a person to an
   email and backfills `ownerEmail` onto every entry with that `personKey`, which is
   what makes their migrated history editable. Until then those entries are
   admin-editable only.
2. **2027 rows.** Included — 2026 and 2027 dated occurrences both migrate.
3. **Survey-due rows.** Excluded (`Sheet1` r33–36, the "Annual Application Due …"
   rows in `3 Yr Planner`, and the whole `Survey Structure` sheet).
4. **Former specialists.** David, Billy and Jason are on `teamPlannerPeople` with
   `active: false`. No 2026 entries.
5. **PTO-sheet-only people.** Tamara and Laura are skipped — no calendar tab, and
   the `PTO` sheet otherwise duplicates the person tabs. Tamara's birthday and work
   anniversary do come across as milestones (they are on `Sheet1`), so they carry a
   `personKey` with no matching roster row; the stored label is what renders.

## 5. Migration results (dry run)

`node scripts/migrate-team-planner.mjs <xlsx>` parses and reports without writing;
`--write` needs `TP_ADMIN_EMAIL`/`TP_ADMIN_PASSWORD` for an account on the admin
allowlist. Document IDs are deterministic (`personKey`, `sheet+row`,
`personKey+date`) so a re-run updates in place rather than duplicating.

| Collection | Documents |
| --- | --- |
| `teamPlannerPeople` | 10 (7 active) |
| `teamPlannerTasks` | 226 — Sheet1 31, Assigned Duties 53, 3 Yr Planner 142 |
| `teamPlannerEntries` | 958 |
| `teamPlannerMilestones` | 13 |

Tasks by cadence: 142 one-off, 54 standing, 17 specific-month, 6 weekly, 3 monthly,
3 quarterly, 1 month-range. 304 dated rows from 2023–2025 skipped for the backfill
phase. Entries by status: 578 home office, 177 site visit, 93 travel, 38 holiday,
35 PTO, 15 limited availability, 13 meeting, 9 flex holiday. 113 entries carry a
day-level note.

**Loaded to Firestore 2026-07-28** and verified by reading back: 10 / 226 / 13 / 958.
The survey-prep collections were untouched (`locations` still reads 322 docs).

Twenty warnings. Four are genuine gaps in the source — Paige's, Hector's and Cody's
work anniversaries have no date, and `3 Yr Planner` r469 ("Weekly Fluview Email") has
"Oct - March" where a date belongs, already captured as the month-range rule from
`Sheet1` r31. The other sixteen are mistyped day numbers the importer corrected
(eight of them in 2026), described below.

### Two things worth knowing about the import

**Site visits import one entry per day, not one per trip.** Each day of a swing
carries its own location (`Travel Day` → `Searcy, AR` → `Little Rock, AR`), and
collapsing the run into a single multi-day entry would throw those away. Only
identical consecutive absences merge — a week of `PTO` becomes one entry (26 merges
across 2026). Multi-day entries created in the app use the same start/end fields, so
a trip entered going forward can be one document with hotel and flight attached.

**The day numbers in the source are not trustworthy.** Two separate parser bugs
came out of this, both worth recording because the backfill phase will hit them
again.

The first pass treated a row as a week's day-number row only if it held three or
more numbers. A month's last week is often just "30 31", so those rows were read as
status text: entries named `"30"` appeared, and the following week's real statuses
were absorbed into the previous week's notes (Aundrea's 6/22 note read `Sunday
Travel · AM Approved · Training Cody · 29 · Tulsa, OK · Cody w/me`, with 6/29's
Tulsa visit missing entirely). The rule is now "every non-empty cell in the row is a
day number", which recovered 33 day-cells.

Worse, the numbers themselves are sometimes wrong. The week of 2026-07-20 is
labelled `20 21 21 23 24` on *every* tab — Wednesday numbered 21 instead of 22 — and
2026-03-23's week has Wednesday as 28. Because document IDs are `personKey+date`,
two columns resolving to the same date meant one day's status silently overwrote the
other's: Tammy's and Hector's St. George visit was replaced by the Las Vegas one, and
the collision broke run-merging so Janet's week of PTO arrived as four disconnected
entries. The importer now derives every date from the column's position — column 0
is Monday, column 4 is Friday, and that never varies. Each typed number votes for
which Monday the row starts on, but only when its own weekday agrees with the column
it occupies; the majority wins and a mistyped number is outvoted by its neighbours.
Every disagreement is reported as a warning.

This was caught only because a read-back after the first write returned 956 entries
where 960 had been written. Four documents from that first pass were left behind at
dates that no longer exist in the corrected data (two of them on a Saturday) and
were deleted after checking each one.
