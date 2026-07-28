// Collection names, controlled vocabularies and date helpers for the Team
// Planner module. Kept out of TeamPlanner.jsx so the migration script's
// vocabulary has one documented source to be checked against, and so nothing
// here has to import from App.jsx.
//
// These collections are deliberately separate from the survey-prep ones
// (followUpChecklists / visitTrends / locations / policyDates /
// inProgressVisits / auditLog) — survey due dates stay where they are.

// Admins allowed to edit the roster, the recurring task list and anyone's
// whereabouts entries. Must be kept in sync with plannerAdmin() in
// firestore.rules (which enforces it server-side) and with ADMIN_EMAILS in
// App.jsx, which is the same allowlist for the survey-prep collections.
export const PLANNER_ADMIN_EMAILS = ["tasmith@rotech.com", "cody.landtroop@rotech.com"];

export const PEOPLE_COLLECTION     = "teamPlannerPeople";
export const TASKS_COLLECTION      = "teamPlannerTasks";
export const ENTRIES_COLLECTION    = "teamPlannerEntries";
export const MILESTONES_COLLECTION = "teamPlannerMilestones";

// ─── STATUS VOCABULARY ───────────────────────────────────────────────────────
// The source spreadsheet had no status column — every day cell was free text
// (224 distinct spellings in 2026 alone: "Home Office", "HOME", "Home office",
// "Home Officw", …). These are the buckets the migration classifies into, and
// the picker the app writes going forward. `rawText` on every entry keeps the
// original string, so a bad classification is always recoverable.
//
// `short` is what the print grids show — a month-at-a-glance column is ~4
// characters wide, same as the old Excel sheet's abbreviations.
// ─────────────────────────────────────────────────────────────────────────────
export const STATUSES = [
  { id: "home_office",          label: "Home Office",          short: "HOME", out: false },
  { id: "site_visit",           label: "Site Visit",           short: "VISIT", out: true },
  { id: "travel",               label: "Travel",               short: "TRVL", out: true },
  { id: "pto",                  label: "PTO",                  short: "PTO",  out: true },
  { id: "flex_holiday",         label: "Flex Holiday",         short: "FH",   out: true },
  { id: "limited_availability", label: "Limited Availability", short: "LTD",  out: false },
  { id: "meeting",              label: "Meeting",              short: "MTG",  out: true },
  { id: "holiday",              label: "Company Holiday",      short: "HOL",  out: true },
  { id: "other",                label: "Other",                short: "—",    out: false },
];
export const STATUS_BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));

// Statuses that put someone out of the office — drives the Today view's
// "who's out" list. Limited availability is deliberately not "out": the person
// is reachable, which is the whole point of recording it separately.
export const OUT_STATUSES = STATUSES.filter(s => s.out).map(s => s.id);

// ─── CADENCE VOCABULARY ──────────────────────────────────────────────────────
// Covers all three task sources in one collection: Sheet1's recurring rules,
// Assigned Duties' standing ownership, and 3 Yr Planner's dated occurrences.
// ─────────────────────────────────────────────────────────────────────────────
export const CADENCES = [
  { id: "weekly",     label: "Weekly" },
  { id: "monthly",    label: "Monthly" },
  { id: "quarterly",  label: "Quarterly" },
  { id: "month",      label: "Specific month" },
  { id: "monthRange", label: "Month range" },
  { id: "oneOff",     label: "One-off date" },
  { id: "standing",   label: "Standing duty" },
];
export const CADENCE_BY_ID = Object.fromEntries(CADENCES.map(c => [c.id, c]));

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// ─── DATES ───────────────────────────────────────────────────────────────────
// Everything is a "YYYY-MM-DD" string. Dates are built and compared as local
// calendar days, never as Date objects parsed from ISO — `new Date("2026-07-28")`
// is UTC midnight and lands on the 27th anywhere west of Greenwich, which would
// shift the whole calendar by a day for this (US) team.
// ─────────────────────────────────────────────────────────────────────────────

export function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso() {
  return toIso(new Date());
}

export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

// Monday-based, matching the source grids (which have no weekend columns).
export function weekStart(iso) {
  const d = fromIso(iso);
  const dow = d.getDay();               // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return toIso(d);
}

export function monthKey(iso) {
  return String(iso).slice(0, 7);
}

export function quarterOf(month) {
  return Math.floor((month - 1) / 3) + 1;
}

export function monthsOfQuarter(q) {
  return [0, 1, 2].map(i => (q - 1) * 3 + i + 1);
}

export function formatDate(iso, opts = { month: "short", day: "numeric" }) {
  if (!iso) return "";
  return fromIso(iso).toLocaleDateString("en-US", opts);
}

// "Jun 8 – 12" / "Jun 29 – Jul 2" / "Jun 8" for a single day.
export function formatRange(startIso, endIso) {
  if (!startIso) return "";
  if (!endIso || endIso === startIso) return formatDate(startIso);
  const sameMonth = startIso.slice(0, 7) === endIso.slice(0, 7);
  return `${formatDate(startIso)} – ${sameMonth ? fromIso(endIso).getDate() : formatDate(endIso)}`;
}

// The weekday (Mon–Fri) grid for a month, as an array of weeks, each week an
// array of 5 cells holding an ISO date or null. Weekends are omitted because
// the source sheets never had them and nobody records weekend status.
export function monthWeekdayGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0).getDate();
  const weeks = [];
  let week = [null, null, null, null, null];
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const col = dow - 1;                // Mon = 0 … Fri = 4
    if (week[col] !== null) { weeks.push(week); week = [null, null, null, null, null]; }
    week[col] = toIso(d);
    if (col === 4) { weeks.push(week); week = [null, null, null, null, null]; }
  }
  if (week.some(Boolean)) weeks.push(week);
  return weeks;
}

export function weekdaysOfMonth(year, month) {
  return monthWeekdayGrid(year, month).flat().filter(Boolean);
}

// ─── ENTRY HELPERS ───────────────────────────────────────────────────────────

// Entries store an inclusive start/end so a multi-day trip is a single
// document — a five-day swing through Arkansas is one thing that happened, not
// five unrelated rows, and the hotel/flight detail hangs off it once.
export function entryCovers(entry, iso) {
  const start = entry.startDate;
  const end = entry.endDate || entry.startDate;
  return !!start && start <= iso && iso <= end;
}

export function entryDayCount(entry) {
  if (!entry.startDate) return 0;
  const end = entry.endDate || entry.startDate;
  return Math.round((fromIso(end) - fromIso(entry.startDate)) / 86400000) + 1;
}

export function isMultiDay(entry) {
  return !!entry.endDate && entry.endDate !== entry.startDate;
}

// True when the entry carries any hotel/flight detail worth an expand
// affordance on the calendar. Recurses so a trip where only the return flight
// was filled in still gets one.
export function hasTravelDetail(entry) {
  const filled = v => (v && typeof v === "object" ? Object.values(v).some(filled) : !!String(v ?? "").trim());
  return filled(entry.travel);
}

// ─── TASK SCHEDULING ─────────────────────────────────────────────────────────

// Which "due" bucket a task falls into relative to `iso`. The source data has
// no completion tracking and no per-occurrence due dates for the recurring
// rules — cadence is all there is — so this answers "is this in play right
// now", not "is this overdue".
//
// Returns "today" | "week" | "month" | null.
export function taskDueBucket(task, iso) {
  const cadence = task.cadence || {};
  const month = Number(iso.slice(5, 7));
  const inMonth = (cadence.months || []).includes(month);

  switch (cadence.type) {
    case "oneOff": {
      if (!cadence.date) return null;
      if (cadence.date === iso) return "today";
      const ws = weekStart(iso);
      if (cadence.date >= ws && cadence.date <= addDays(ws, 6)) return "week";
      if (monthKey(cadence.date) === monthKey(iso)) return "month";
      return null;
    }
    case "weekly":     return "week";
    case "monthly":    return "month";
    case "quarterly":  return "month";
    case "month":
    case "monthRange": return inMonth ? "month" : null;
    default:           return null;   // standing duties are ongoing, never "due"
  }
}

// Sort key that puts the most time-critical cadences first in a task list.
export const CADENCE_ORDER = ["oneOff", "weekly", "monthly", "quarterly", "month", "monthRange", "standing"];
export function cadenceRank(task) {
  const i = CADENCE_ORDER.indexOf(task.cadence?.type);
  return i === -1 ? CADENCE_ORDER.length : i;
}

// Human-readable cadence, preferring the verbatim source label where the
// spreadsheet said something a dropdown can't ("Oct - March").
export function cadenceLabel(task) {
  const c = task.cadence || {};
  if (c.rawLabel && (c.type === "month" || c.type === "monthRange")) return c.rawLabel;
  if (c.type === "oneOff") return c.date ? formatDate(c.date, { month: "short", day: "numeric", year: "numeric" }) : "One-off";
  if (c.type === "month" && c.months?.length === 1) return MONTH_NAMES[c.months[0] - 1];
  return CADENCE_BY_ID[c.type]?.label || "—";
}

// ─── PEOPLE ──────────────────────────────────────────────────────────────────

export function personKeyFromName(name) {
  return String(name || "").trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
}

// The roster entry for the signed-in account, matched on email. Returns null
// for a signed-in specialist who has not been mapped to a roster person yet —
// they can see the whole team's calendar but have nothing of their own to edit.
export function findPersonForEmail(people, email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  return people.find(p => String(p.email || "").trim().toLowerCase() === e) || null;
}
