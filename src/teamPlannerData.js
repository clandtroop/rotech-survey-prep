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
// One document per *completed occurrence*, id `${taskId}_${periodKey}`. Completion
// has to be per occurrence rather than per task — "QPOW done this week", not
// "QPOW done" — and a flag on the task itself could not express that.
export const TASK_DONE_COLLECTION  = "teamPlannerTaskDone";

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

// ─── SITE VISIT DETAIL ───────────────────────────────────────────────────────
// Extra fields on a `site_visit` entry's `visit` map, added for Site Circuit —
// the leadership notification is grouped by mode and reports each visit's
// confirmation state, and neither could be derived from what entries already
// carried. Both live here rather than in SiteCircuit.jsx because the Team
// Planner entry editor writes them too, and a vocabulary owned by one of two
// consumers drifts.
//
// A visit saved before these existed has neither. Treat a missing mode as
// onsite (every migrated spreadsheet visit was a trip) and a missing
// confirmation as scheduled, rather than dropping the visit from the email.
// ─────────────────────────────────────────────────────────────────────────────
export const VISIT_MODES = [
  { id: "onsite",  label: "Onsite" },
  { id: "virtual", label: "Virtual" },
];
export const DEFAULT_VISIT_MODE = "onsite";

export const VISIT_CONFIRMATIONS = [
  { id: "scheduled",        label: "Scheduled" },
  { id: "confirmed",        label: "Confirmed" },
  { id: "needs-reschedule", label: "Needs reschedule" },
];
export const DEFAULT_VISIT_CONFIRMATION = "scheduled";

export const visitModeOf = entry => entry?.visit?.mode || DEFAULT_VISIT_MODE;
export const visitConfirmationOf = entry => entry?.visit?.confirmation || DEFAULT_VISIT_CONFIRMATION;

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

// ─── TASK SERIES ─────────────────────────────────────────────────────────────
// The spreadsheet recorded the same duty twice over: a recurring rule on Sheet1
// ("QPOW, weekly") and a dated row per occurrence on 3 Yr Planner saying whose
// turn it was. 128 of the 142 dated rows repeat a rule this way. Listed flat
// that gives one specialist thirteen rows all called QPOW, so they are grouped
// back into the duty they belong to.
//
// The dated rows are not redundant and must not be discarded: the rule says the
// duty exists, the dated rows carry the rotation. Grouping keeps both — one row
// per duty, showing the dates that belong to you.

export function seriesKeyOf(task) {
  if (task.seriesKey) return task.seriesKey;
  return String(task.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ISO-8601 week, so a completion in the same week resolves to the same key
// regardless of which day it was ticked.
export function isoWeekKey(iso) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));   // Thursday of this week
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// The period a completion belongs to. Standing duties return null — they are
// ongoing ownership with nothing to finish, and showing them as permanently
// unticked would read as a backlog that never clears.
export function periodKeyFor(task, iso) {
  const type = task.cadence?.type;
  switch (type) {
    case "oneOff":     return task.cadence.date || iso;
    case "weekly":     return isoWeekKey(iso);
    case "quarterly":  return `${iso.slice(0, 4)}-Q${quarterOf(Number(iso.slice(5, 7)))}`;
    case "monthly":
    case "month":
    case "monthRange": return monthKey(iso);
    default:           return null;   // standing
  }
}

export function isCompletable(task) {
  return task.cadence?.type !== "standing";
}

// Collapses a person's tasks into one row per duty.
//
// `personKey` selects what is theirs; team-assigned tasks come back separately
// so the view can keep them in their own section rather than mixing work that
// is specifically yours with work that is everyone's.
export function buildTaskSeries(tasks, personKey, iso) {
  const relevant = tasks.filter(t => t.active !== false).filter(t =>
    t.assignee?.personKey === personKey || t.assignee?.type === "team");

  const groups = new Map();
  for (const task of relevant) {
    const key = `${seriesKeyOf(task)}::${task.assignee?.type === "team" ? "team" : "mine"}`;
    if (!groups.has(key)) groups.set(key, { key, rule: null, occurrences: [], tasks: [] });
    const g = groups.get(key);
    g.tasks.push(task);
    if (task.cadence?.type === "oneOff") g.occurrences.push(task);
    // Prefer a real recurring rule as the group's identity; a standing duty is
    // the fallback, since it carries the ownership but no schedule.
    else if (!g.rule || (g.rule.cadence?.type === "standing" && task.cadence?.type !== "standing")) g.rule = task;
  }

  return [...groups.values()].map(g => {
    g.occurrences.sort((a, b) => (a.cadence.date || "").localeCompare(b.cadence.date || ""));
    // With no recurring rule, the earliest occurrence stands in as the row's
    // identity so a purely dated task still has a name, scope and comments.
    const head = g.rule || g.occurrences[0];
    const dates = g.occurrences.map(o => o.cadence.date).filter(Boolean);
    const next = g.occurrences.find(o => (o.cadence.date || "") >= iso) || null;
    return {
      key: g.key,
      head,
      isTeam: head?.assignee?.type === "team",
      rule: g.rule,
      occurrences: g.occurrences,
      dates,
      next,
      // What a tick actually marks done: the upcoming occurrence if there is
      // one, otherwise the rule's current period.
      target: next || g.rule || head,
      tags: [...new Set(g.tasks.flatMap(t => t.tags || []))].sort(),
    };
  }).filter(s => s.head);
}

// Which section of My Tasks a series belongs in.
export function seriesBucket(series, iso) {
  const head = series.head;
  if (head.cadence?.type === "standing" && !series.occurrences.length) return "standing";
  if (series.next) {
    const d = series.next.cadence.date;
    if (d === iso) return "today";
    const ws = weekStart(iso);
    if (d >= ws && d <= addDays(ws, 6)) return "week";
    if (monthKey(d) === monthKey(iso)) return "month";
    return "later";
  }
  // No dated occurrence left — fall back to the rule's own cadence.
  const bucket = series.rule ? taskDueBucket(series.rule, iso) : null;
  if (bucket) return bucket;
  // Occurrences all in the past and nothing recurring: it was due and wasn't done.
  return series.occurrences.length ? "overdue" : "later";
}

// ─── TASK PERMISSIONS ────────────────────────────────────────────────────────
// Whether you may edit a task is a permission, not a label — nothing in the UI
// badges a task as "compliance". `origin` exists only to answer these two
// questions and is never displayed.

export function canEditTask(task, email, isAdmin) {
  if (isAdmin) return true;
  return task.origin === "personal" && !!task.ownerEmail && task.ownerEmail === email;
}

// Tagging is how someone organises their own list, so it can't be admin-only —
// otherwise a specialist can't tag the standing duties that make up most of
// what they see. Anyone the task is assigned to may change its tags, and the
// security rule allows that write only when `tags` is the sole field touched.
export function canTagTask(task, email, isAdmin, personKey) {
  if (canEditTask(task, email, isAdmin)) return true;
  return task.assignee?.personKey === personKey || task.assignee?.type === "team";
}

export function normalizeTag(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 24);
}

export function allTagsOf(tasks) {
  return [...new Set(tasks.flatMap(t => t.tags || []))].sort();
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
