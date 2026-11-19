// ─── JC 427 rules shared by the tab, the Excel export and the visual report ──
// Everything here is plain data in, plain data out (no React, no DOM), so the
// JC 427 tab in App.jsx, the write-back export and JC427Report.jsx all judge
// a date or read a comment exactly the same way.

export const JC427_CATEGORY_ORDER = [
  "Onboarding Documents", "Training", "Performance Review", "Medical Record",
  "Non-Clinical Competency Assessments", "Clinical Competency Assessments",
];

// ── Date rules ──────────────────────────────────────────────────────────────
// These mirror the conditional formatting in the real JC 427 spreadsheet
// (public/JC427_Template.xlsx), which is the official Rotech form, so the app,
// the report and the exported file always agree on a color:
//
//   FDA 019 + every competency row   red    if older than TODAY()-1095
//                                    yellow if between TODAY()-1095 and TODAY()-730
//                                    green  if newer than TODAY()-730
//   Annual N95 Mask Fit Testing      red    if older than TODAY()-365
//                                    green  otherwise (the sheet has no yellow band)
//
// Day counts, not calendar years, because that is what the sheet's formulas
// compare against. The app used to apply a 3-year / 6-month rule to every
// date, N95 included, so a two-year-old fit test showed green in the app and
// red in the spreadsheet.
export const JC427_DATE_RULES = {
  default:      { validDays: 1095, warnDays: 365, summary: "valid 3 years; flagged in the final 12 months" },
  n95_fit_test: { validDays: 365,  warnDays: 0,   summary: "annual; flagged once more than a year old" },
};
export function jc427DateRule(itemId) {
  return JC427_DATE_RULES[itemId] || JC427_DATE_RULES.default;
}

const DAY_MS = 86400000;
// Whole-day number (days since the Unix epoch) for a calendar date. Built from
// UTC so a daylight-saving change can never make two dates 23 or 25 hours apart.
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
const todayNumber = (today = new Date()) => dayNumber(today.getFullYear(), today.getMonth() + 1, today.getDate());

// "MM/DD/YYYY" (how every date in this app is stored) -> { y, m, d } or null.
export function parseUsDate(us) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(us || "").trim());
  if (!m) return null;
  const mo = +m[1], d = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function usDateFromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${dt.getUTCFullYear()}`;
}

// Excel stores a date as a serial day count from 1899-12-30. Writing that
// number (rather than the text "03/14/2023") is what lets the template's own
// date comparisons, and therefore its colors, actually work.
const EXCEL_EPOCH_OFFSET = 25569; // serial number of 1970-01-01
export function excelSerialFromUsDate(us) {
  const p = parseUsDate(us);
  return p ? dayNumber(p.y, p.m, p.d) + EXCEL_EPOCH_OFFSET : null;
}

// Full picture for one dated answer: null when there's no usable date,
// otherwise { status: "red"|"yellow"|"green", expires: "MM/DD/YYYY",
// daysLeft } where daysLeft is negative once it has expired.
export function jc427DateInfo(usDate, itemId, today = new Date()) {
  const p = parseUsDate(usDate);
  if (!p) return null;
  const { validDays, warnDays } = jc427DateRule(itemId);
  const entered = dayNumber(p.y, p.m, p.d);
  const now = todayNumber(today);
  const age = now - entered;
  const status = age > validDays ? "red"
    : (warnDays > 0 && age >= validDays - warnDays) ? "yellow"
    : "green";
  const expiresDay = entered + validDays;
  return { status, expires: usDateFromDayNumber(expiresDay), daysLeft: expiresDay - now };
}

export function getJC427ExpirationStatus(usDate, itemId) {
  return jc427DateInfo(usDate, itemId)?.status ?? null;
}

// Wording used on follow-up checklist items, the After Visit Email and trend
// records. Kept generic (no dates) so trend records for the same item group
// together across visits.
export function jc427FindingSuffix(status) {
  if (status === "red") return "EXPIRED";
  if (status === "yellow") return "Expires within 12 months";
  return "";
}

// ── Per-employee answers and comments ───────────────────────────────────────
// Answers, dates and comments are all keyed item|sheet|column, one value per
// employee per item.
export const jc427SlotId = slot => `${slot.sheetName}|${slot.col}`;
export const jc427Key = (itemId, slot) => `${itemId}|${jc427SlotId(slot)}`;

// Comments used to be keyed by item id alone and shared by every employee, so
// typing a note on one person's card put it on everyone's. Visits saved before
// the switch still hold those shared comments; this moves each one onto the
// employees it most likely described (anyone with a "No", expired or expiring
// answer on that item) or, if nobody has one, onto every employee so nothing
// is lost and the specialist can trim it.
//
// The `${itemId}|migrated` marker is what makes this run once per item. The
// cloud merge (mergeVisitForWrite) keeps keys the other copy still has, so the
// old shared key can come back from Firestore on a later load; the marker
// tells this function it has already been handled and should just be dropped.
// A marker key has two "|" segments, so it can never collide with an
// employee key (three segments) and is never read as a comment.
const MIGRATED = "migrated";
const isBlank = v => v === undefined || v === null || String(v).trim() === "";

export function migrateJC427Comments(comments, slots = [], items = [], answers = {}, dates = {}) {
  if (!comments || typeof comments !== "object") return {};
  const legacyIds = Object.keys(comments).filter(k => !k.includes("|"));
  if (legacyIds.length === 0) return comments;

  const out = { ...comments };
  legacyIds.forEach(itemId => {
    const text = String(out[itemId] ?? "").trim();
    const marker = `${itemId}|${MIGRATED}`;
    if (out[marker] || !text) { delete out[itemId]; return; }
    // No employees on the visit yet: nowhere to put it, so leave it alone
    // rather than drop it. It moves the first time a load sees an employee.
    if (slots.length === 0) return;

    const item = items.find(it => it.id === itemId);
    const flagged = !item ? [] : slots.filter(s => {
      const k = jc427Key(itemId, s);
      if (item.answerType === "yn") return answers[k] === "no";
      const st = getJC427ExpirationStatus(dates[k], itemId);
      return st === "red" || st === "yellow";
    });
    (flagged.length ? flagged : slots).forEach(s => {
      const k = jc427Key(itemId, s);
      if (isBlank(out[k])) out[k] = text;
    });
    out[marker] = "1";
    delete out[itemId];
  });
  return out;
}

export const jc427Comment = (comments, itemId, slot) => String(comments?.[jc427Key(itemId, slot)] ?? "").trim();

// ── Report data ─────────────────────────────────────────────────────────────
// One cell per (item, employee), classified into five report states:
//   ok    — Y, or a date that is current
//   warn  — a date in its expiring-soon window
//   bad   — N, or an expired date
//   na    — N/A, or a dated item left blank (the sheet says "blank if NA")
//   blank — a Y/N item nobody answered yet
export const JC427_CELL_STATES = ["ok", "warn", "bad", "na", "blank"];

export function employeeLabel(slot, index) {
  return String(slot?.name || "").trim() || `Employee ${index + 1}`;
}

function classifyCell(item, slot, answers, dates, today) {
  const key = jc427Key(item.id, slot);
  if (item.answerType === "yn") {
    const v = answers[key];
    if (v === "yes") return { state: "ok", label: "Y", detail: "Complete" };
    if (v === "no") return { state: "bad", label: "N", detail: "Missing" };
    if (v === "na") return { state: "na", label: "N/A", detail: "Not applicable" };
    return { state: "blank", label: "", detail: "Not answered" };
  }
  const date = String(dates[key] || "").trim();
  const info = jc427DateInfo(date, item.id, today);
  if (!info) return { state: "na", label: "", detail: "No date (N/A)" };
  if (info.status === "red") return { state: "bad", label: date, date, detail: `Expired ${info.expires}`, ...info };
  if (info.status === "yellow") return { state: "warn", label: date, date, detail: `Expires ${info.expires}`, ...info };
  return { state: "ok", label: date, date, detail: `Current until ${info.expires}`, ...info };
}

const emptyCounts = () => ({ ok: 0, warn: 0, bad: 0, na: 0, blank: 0 });

export function buildJC427ReportData({ slots = [], items = [], answers = {}, dates = {}, comments = {} }, today = new Date()) {
  const orderedItems = JC427_CATEGORY_ORDER.flatMap(cat => items.filter(it => it.category === cat));

  const employees = slots.map((slot, index) => {
    const counts = emptyCounts();
    const cells = {};
    const findings = [];
    const notes = [];
    let missing = 0, expired = 0;
    orderedItems.forEach(item => {
      const cell = classifyCell(item, slot, answers, dates, today);
      cell.comment = jc427Comment(comments, item.id, slot);
      cells[item.id] = cell;
      counts[cell.state]++;
      if (cell.state === "bad") {
        if (item.answerType === "yn") missing++; else expired++;
      }
      if (cell.state === "bad" || cell.state === "warn") findings.push({ item, cell });
      else if (cell.comment) notes.push({ item, cell });
    });
    return {
      slot, index, name: employeeLabel(slot, index),
      jobTitle: String(slot.jobTitle || "").trim(), hireDate: String(slot.hireDate || "").trim(),
      cells, counts, findings, notes, missing, expired, expiring: counts.warn,
    };
  });

  const categories = JC427_CATEGORY_ORDER
    .map(cat => {
      const catItems = orderedItems.filter(it => it.category === cat);
      const counts = emptyCounts();
      catItems.forEach(item => employees.forEach(emp => { counts[emp.cells[item.id].state]++; }));
      return { cat, items: catItems, counts };
    })
    .filter(c => c.items.length > 0);

  const expirations = employees
    .flatMap(emp => emp.findings
      .filter(f => f.item.answerType === "date")
      .map(f => ({ employee: emp, item: f.item, cell: f.cell })))
    .sort((a, b) => a.cell.daysLeft - b.cell.daysLeft);

  const totals = {
    employees: employees.length,
    missing: employees.reduce((n, e) => n + e.missing, 0),
    expired: employees.reduce((n, e) => n + e.expired, 0),
    expiring: employees.reduce((n, e) => n + e.expiring, 0),
    unanswered: employees.reduce((n, e) => n + e.counts.blank, 0),
    clearEmployees: employees.filter(e => e.findings.length === 0).length,
  };

  return { items: orderedItems, employees, categories, expirations, totals };
}
