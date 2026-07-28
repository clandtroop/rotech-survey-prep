#!/usr/bin/env node
/**
 * One-time migration: Team_Planner_5.21.2026.xlsx -> Firestore (surveyprep db).
 *
 *   node scripts/migrate-team-planner.mjs <path-to-xlsx>              # dry run
 *   node scripts/migrate-team-planner.mjs <path-to-xlsx> --write      # writes
 *
 * A dry run parses everything, prints the counts, and dumps the full payload to
 * scripts/team-planner-migration-preview.json so the mapping can be eyeballed
 * before anything touches production.
 *
 * Writing needs an admin account (the same allowlist as plannerAdmin() in
 * firestore.rules), passed as env vars so no credential ends up in the repo:
 *
 *   TP_ADMIN_EMAIL=tasmith@rotech.com TP_ADMIN_PASSWORD=… \
 *     node scripts/migrate-team-planner.mjs ./Team_Planner_5.21.2026.xlsx --write
 *
 * Document IDs are deterministic (personKey, sheet+row, personKey+date), so a
 * re-run updates in place instead of duplicating. Nothing is ever deleted.
 *
 * ── SCOPE (phase 1) ─────────────────────────────────────────────────────────
 * Current-year data only: recurring tasks plus 2026/2027 dated occurrences and
 * 2026 whereabouts. Prior years (2023-2025) stay in the spreadsheet for the
 * later backfill phase — nothing is removed from the source file either way.
 *
 * ── WHAT IS DELIBERATELY NOT IMPORTED ───────────────────────────────────────
 * - `Team Visits`: every cell is a formula pointing at a person tab
 *   (=Tammy!A2239). It is a rollup view, not data — importing it alongside the
 *   person tabs would double every entry.
 * - `Tasks by Month`: a hand-maintained restatement of Sheet1 as month-sized
 *   text blobs. No unique data; the app renders that view from the tasks.
 * - `#REF!` / `#VALUE!` cells: broken formula links, skipped rather than
 *   imported as literal text.
 * - Survey due dates (Sheet1 r33-36, the "Annual Application Due …" rows, and
 *   the `Survey Structure` sheet): these stay in survey-prep.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const CURRENT_YEAR = 2026;
const TASK_YEARS = [2026, 2027];   // 2027 rows are work already scheduled ahead

// ─── ROSTER ──────────────────────────────────────────────────────────────────
// sortOrder mirrors the row order the Team Visits rollup used, so the new
// calendar lists people in the order the team is used to reading them.
// Emails are only filled in where they are already known from the admin
// allowlist; the rest are linked from the app's Roster panel after deploy,
// which backfills ownerEmail onto that person's entries.
const ROSTER = [
  { personKey: "tammy",   displayName: "Tammy Smith",    sheet: "Tammy",   sortOrder: 1, active: true,  email: "tasmith@rotech.com" },
  { personKey: "aundrea", displayName: "Aundrea Ellis",  sheet: "Aundrea", sortOrder: 2, active: true,  email: "" },
  { personKey: "janet",   displayName: "Janet Tompkins", sheet: "Janet",   sortOrder: 3, active: true,  email: "" },
  { personKey: "deanne",  displayName: "Deanne Wilson",  sheet: "Deanne",  sortOrder: 4, active: true,  email: "" },
  { personKey: "cody",    displayName: "Cody Landtroop", sheet: "Cody",    sortOrder: 5, active: true,  email: "cody.landtroop@rotech.com" },
  { personKey: "hector",  displayName: "Hector Muro",    sheet: "Hector",  sortOrder: 6, active: true,  email: "" },
  { personKey: "paige",   displayName: "Paige Bookout",  sheet: "Paige",   sortOrder: 7, active: true,  email: "" },
  // Former specialists: no 2026 data at all, kept on the roster as inactive so
  // the later backfill of their 2020-2025 tabs needs no schema change.
  { personKey: "david",   displayName: "David Moats",    sheet: "David",   sortOrder: 8, active: false, email: "" },
  { personKey: "billy",   displayName: "Billy",          sheet: "Billy",   sortOrder: 9, active: false, email: "" },
  { personKey: "jason",   displayName: "Jason Efird",    sheet: "Jason",   sortOrder: 10, active: false, email: "" },
];
const KEY_BY_NAME = new Map();
ROSTER.forEach(p => {
  KEY_BY_NAME.set(p.displayName.toLowerCase(), p.personKey);
  KEY_BY_NAME.set(p.personKey, p.personKey);
});

// ─── STATUS CLASSIFICATION ───────────────────────────────────────────────────
// The source has no status column — day cells are free text, 224 distinct
// spellings in 2026 alone. These buckets must stay in step with STATUSES in
// src/teamPlannerData.js. The original string is always kept as `rawText`, so
// a misfiled entry is recoverable without going back to the spreadsheet.
const STATUS_IDS = ["home_office", "site_visit", "travel", "pto", "flex_holiday",
  "limited_availability", "meeting", "holiday", "other"];

const HOLIDAY_RE = /MEMORIAL DAY|LABOR DAY|THANKSGIVING|CHRISTMAS|4th OF JULY|NEW YEAR|INDEPENDENCE|HAPPY|MERRY/i;

function classify(text) {
  const t = String(text).trim();
  const l = t.toLowerCase();
  if (HOLIDAY_RE.test(t)) return "holiday";
  if (/\bpto\b|vacation/i.test(t)) return "pto";
  if (/^fh\b|\bfh$/i.test(t) || l === "fh") return "flex_holiday";
  if (/ltd avail|limited avail/i.test(t)) return "limited_availability";
  if (l.includes("home")) return "home_office";
  if (l.includes("travel")) return "travel";
  if (/team m(eeting|tg)|^corp\b|^corporate$|conference|education|team mtg/i.test(t)) return "meeting";
  return "site_visit";   // fallback: in practice a city/state string
}

// ─── SHEET HELPERS ───────────────────────────────────────────────────────────

const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"];
const MONTH_HEADER_RE = new RegExp(`^\\s*(${MONTHS.join("|")})\\s+(\\d{4})\\s*$`, "i");

// Returns '' for empty cells, error cells (#REF! and friends), and the literal
// zeros the broken rollup formulas leave behind.
function cellStr(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  if (!cell) return "";
  if (cell.t === "e") return "";
  const v = cell.v;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/ /g, " ").trim();
  if (s === "0" || s.startsWith("#REF") || s.startsWith("#VALUE") || s.startsWith("#N/A")) return "";
  return s;
}

function cellDate(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  if (!cell || cell.t === "e") return null;
  if (cell.v instanceof Date) {
    const d = cell.v;
    // SheetJS hands back a UTC-midnight Date for a date cell; read the UTC
    // parts so a negative local offset can't roll it back a day.
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

function sheetRows(ws) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  return range.e.r + 1;
}

const dayNum = s => (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 31 ? +s : null);

// A day-number row is one where every cell that has anything in it is a day
// number. Counting how many numbers appear is not enough: a month's last week
// is often just "30 31", and treating that as body text swallowed the whole
// following week — the day numbers landed in `rawText` as entries called "30",
// and the next week's real statuses landed in the previous week's notes.
function dayNumbersOf(ws, r) {
  const cells = [1, 2, 3, 4, 5].map(c => cellStr(ws, r, c));
  const filled = cells.filter(Boolean);
  if (!filled.length || !filled.every(s => dayNum(s))) return null;
  return cells.map(s => (s ? dayNum(s) : null));
}

// ─── PERSON TABS -> ENTRIES ──────────────────────────────────────────────────
// Each tab repeats: month header, weekday header (Mon-Fri only — the source
// has no weekend columns), a day-number row, then 1-4 free-text rows per day.
// Line 1 is the status, lines 2+ are notes.
function parsePersonSheet(ws, person, warnings) {
  const out = [];
  const maxRow = sheetRows(ws);
  let cur = null;
  let r = 1;

  while (r <= maxRow) {
    const a = cellStr(ws, r, 1);
    const header = a && MONTH_HEADER_RE.exec(a);
    if (header) {
      cur = { year: +header[2], month: MONTHS.indexOf(header[1].toLowerCase()) + 1 };
      r++;
      continue;
    }

    const nums = dayNumbersOf(ws, r);
    if (!cur || !nums) { r++; continue; }

    // Collect the text rows belonging to this week.
    const body = [];
    let rr = r + 1;
    while (rr <= maxRow && rr - r <= 12) {
      const a2 = cellStr(ws, rr, 1);
      if (a2 && MONTH_HEADER_RE.test(a2)) break;
      if (/^notes/i.test(a2)) break;
      if (dayNumbersOf(ws, rr)) break;                // next week's day numbers
      body.push([1, 2, 3, 4, 5].map(c => cellStr(ws, rr, c)));
      rr++;
    }

    nums.forEach((day, col) => {
      if (!day) return;
      const iso = `${cur.year}-${String(cur.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // A day number that doesn't exist in that month means the source grid was
      // typed wrong (May 2020 has "25 26 27 29 29"). Record it and move on.
      if (new Date(`${iso}T00:00:00Z`).getUTCDate() !== day) {
        warnings.push(`${person.sheet}: ${cur.year}-${cur.month} has no day ${day} — skipped`);
        return;
      }
      const lines = body.map(b => b[col]).filter(Boolean);
      if (!lines.length) return;
      out.push({ iso, lines, row: r });
    });

    r = rr;
  }
  return out;
}

// Consecutive weekdays with an identical status and identical text are one
// absence, so a week of PTO becomes one entry rather than five. Site visits and
// travel days are left per-day on purpose: each day carries its own location
// ("Travel Day", "Searcy, AR", "Little Rock, AR"), and collapsing the run would
// throw that away. Multi-day trips created in the app use the same start/end
// fields — this only governs what the import produces.
const MERGEABLE = new Set(["pto", "flex_holiday", "holiday", "limited_availability", "meeting"]);

function buildEntries(person, days) {
  const entries = [];
  let open = null;

  const flush = () => { if (open) entries.push(open); open = null; };

  for (const day of days) {
    const rawText = day.lines[0];
    const notes = day.lines.slice(1).join(" · ");
    const status = classify(rawText);

    const contiguous = open
      && open.status === status
      && open.rawText === rawText
      && open.notes === notes
      && MERGEABLE.has(status)
      && isNextWeekday(open.endDate, day.iso);

    if (contiguous) { open.endDate = day.iso; continue; }

    flush();
    open = {
      id: `${person.personKey}-${day.iso}`,
      personKey: person.personKey,
      personName: person.displayName,
      ownerEmail: person.email || "",
      ownerUid: null,
      startDate: day.iso,
      endDate: day.iso,
      status,
      rawText,
      notes,
      visit: status === "site_visit"
        ? { location: rawText, purpose: "", multiDay: false }
        : { location: "", purpose: "", multiDay: false },
      travel: null,   // no hotel/flight data exists in the source workbook
      source: { sheet: person.sheet, row: day.row },
    };
  }
  flush();
  return entries;
}

// True when `next` is the following weekday after `prev` (Friday -> Monday
// counts; the source grids have no weekend columns).
function isNextWeekday(prev, next) {
  const d = new Date(`${prev}T00:00:00Z`);
  for (let step = 0; step < 3; step++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    return d.toISOString().slice(0, 10) === next;
  }
  return false;
}

// ─── SHEET1 / ASSIGNED DUTIES / 3 YR PLANNER -> TASKS ────────────────────────

const CADENCE_WORDS = { weekly: "weekly", monthly: "monthly", quarterly: "quarterly" };

function parseCadence(label) {
  const raw = String(label || "").trim();
  const l = raw.toLowerCase();
  if (!raw) return { type: "standing", rawLabel: "" };
  if (CADENCE_WORDS[l]) return { type: CADENCE_WORDS[l], rawLabel: raw };

  const single = MONTHS.indexOf(l);
  if (single !== -1) return { type: "month", months: [single + 1], rawLabel: raw };

  // "Oct - March" — an inclusive span that wraps the year end.
  const span = /^([a-z]+)\s*[-–]\s*([a-z]+)$/i.exec(l);
  if (span) {
    const from = monthIndexLoose(span[1]);
    const to = monthIndexLoose(span[2]);
    if (from !== -1 && to !== -1) {
      const months = [];
      for (let m = from; ; m = (m + 1) % 12) {
        months.push(m + 1);
        if (m === to) break;
        if (months.length > 12) break;
      }
      return { type: "monthRange", months, rawLabel: raw };
    }
  }
  return { type: "standing", rawLabel: raw };
}

function monthIndexLoose(word) {
  const w = String(word).toLowerCase().slice(0, 3);
  return MONTHS.findIndex(m => m.startsWith(w));
}

function assigneeOf(name) {
  const raw = String(name || "").trim();
  if (!raw) return { type: "unassigned", personKey: "", displayName: "" };
  if (/^team$/i.test(raw) || /^all$/i.test(raw)) return { type: "team", personKey: "", displayName: "Team" };
  const key = KEY_BY_NAME.get(raw.toLowerCase()) || KEY_BY_NAME.get(raw.split(/\s+/)[0].toLowerCase());
  return { type: "specialist", personKey: key || "", displayName: raw };
}

// Survey due dates belong to survey-prep, not here.
const SURVEY_ROW_RE = /annual application due|^survey due$/i;

function parseSheet1(ws, warnings) {
  const tasks = [];
  const milestones = [];
  const maxRow = sheetRows(ws);

  for (let r = 2; r <= maxRow; r++) {
    const dateLabel = cellStr(ws, r, 1);
    const applicable = cellStr(ws, r, 2);
    const name = cellStr(ws, r, 3);
    const specialist = cellStr(ws, r, 4);
    const comments = cellStr(ws, r, 5);

    // Birthday / anniversary block: the label sits in col B with no task name.
    if (!name && /birthday|anniversary/i.test(applicable)) {
      const iso = cellDate(ws, r, 1);
      if (!iso) { warnings.push(`Sheet1 r${r}: "${applicable}" has no date — skipped`); continue; }
      const who = /^([a-z]+)'s/i.exec(applicable);
      const personKey = who ? KEY_BY_NAME.get(who[1].toLowerCase()) || who[1].toLowerCase() : "";
      const type = /birthday/i.test(applicable) ? "birthday" : "work_anniversary";
      const sinceYear = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(applicable);
      milestones.push({
        id: `${personKey}-${type}`,
        personKey, type,
        month: +iso.slice(5, 7), day: +iso.slice(8, 10),
        year: sinceYear ? +sinceYear[3] : null,
        label: applicable,
        source: { sheet: "Sheet1", row: r },
      });
      continue;
    }

    if (!name) continue;
    if (SURVEY_ROW_RE.test(name)) continue;                 // survey-prep data
    if (/^\d{6}$/.test(applicable)) continue;               // lawson # -> survey row

    tasks.push({
      id: `sheet1-r${String(r).padStart(3, "0")}`,
      name,
      cadence: parseCadence(dateLabel),
      assignee: assigneeOf(specialist),
      scope: applicable,
      comments,
      active: true,
      source: { sheet: "Sheet1", row: r },
    });
  }
  return { tasks, milestones };
}

function parseAssignedDuties(ws) {
  const tasks = [];
  const maxRow = sheetRows(ws);
  for (let r = 2; r <= maxRow; r++) {
    const duty = cellStr(ws, r, 1);
    const specialist = cellStr(ws, r, 2);
    if (!duty) continue;
    tasks.push({
      id: `duties-r${String(r).padStart(3, "0")}`,
      name: duty,
      // Standing ownership, not something with a due date — cols D+ on this
      // sheet are unrelated region/state reference tables and are not imported.
      cadence: { type: "standing", rawLabel: "Assigned duty" },
      assignee: assigneeOf(specialist),
      scope: "",
      comments: "",
      active: true,
      source: { sheet: "Assigned Duties", row: r },
    });
  }
  return tasks;
}

function parsePlanner(ws, warnings) {
  const tasks = [];
  const maxRow = sheetRows(ws);
  let skippedYears = 0;

  for (let r = 2; r <= maxRow; r++) {
    const iso = cellDate(ws, r, 1);
    const applicable = cellStr(ws, r, 2);
    const name = cellStr(ws, r, 3);
    const specialist = cellStr(ws, r, 4);
    const comments = cellStr(ws, r, 5);

    if (!iso) {
      if (name) warnings.push(`3 Yr Planner r${r}: "${name}" has no usable date — skipped`);
      continue;
    }
    const year = +iso.slice(0, 4);
    if (!TASK_YEARS.includes(year)) { skippedYears++; continue; }   // backfill phase
    if (!name) continue;                       // birthday rows, already captured
    if (SURVEY_ROW_RE.test(name)) continue;
    if (/^\d{6}$/.test(applicable)) continue;

    tasks.push({
      id: `planner-r${String(r).padStart(3, "0")}`,
      name,
      cadence: { type: "oneOff", date: iso, rawLabel: "" },
      assignee: assigneeOf(specialist),
      scope: applicable,
      comments,
      active: true,
      source: { sheet: "3 Yr Planner", row: r },
    });
  }
  return { tasks, skippedYears };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function build(workbookPath) {
  // SheetJS reports a missing file as a bare "Cannot access file <path>" with
  // no hint about where it looked, which is unhelpful when the path is
  // relative and the shell is a directory or two off.
  if (!fs.existsSync(workbookPath)) {
    console.error(`\nNo file at: ${path.resolve(workbookPath)}`);
    console.error(`(working directory: ${process.cwd()})`);
    const found = [".", "docs", "..", process.env.HOME ? path.join(process.env.HOME, "Downloads") : ""]
      .filter(Boolean)
      .flatMap(dir => {
        try {
          return fs.readdirSync(dir)
            .filter(f => f.endsWith(".xlsx") && !f.startsWith("~$"))
            .map(f => path.join(dir, f));
        } catch { return []; }
      });
    if (found.length) {
      console.error(`\nWorkbooks found nearby — pass one of these instead:`);
      found.forEach(f => console.error(`  ${f}`));
    }
    process.exit(1);
  }

  const wb = XLSX.readFile(workbookPath, { cellDates: true });
  const warnings = [];
  const need = name => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Sheet "${name}" not found in ${path.basename(workbookPath)}`);
    return ws;
  };

  const { tasks: sheet1Tasks, milestones } = parseSheet1(need("Sheet1"), warnings);
  const dutyTasks = parseAssignedDuties(need("Assigned Duties"));
  const { tasks: plannerTasks, skippedYears } = parsePlanner(need("3 Yr Planner"), warnings);
  const tasks = [...sheet1Tasks, ...dutyTasks, ...plannerTasks];

  const entries = [];
  const perPerson = {};
  for (const person of ROSTER) {
    const ws = wb.Sheets[person.sheet];
    if (!ws) { warnings.push(`No sheet named "${person.sheet}" — person skipped`); continue; }
    const days = parsePersonSheet(ws, person, warnings)
      .filter(d => d.iso.startsWith(String(CURRENT_YEAR)));
    const built = buildEntries(person, days);
    perPerson[person.personKey] = { days: days.length, entries: built.length };
    entries.push(...built);
  }

  const people = ROSTER.map(({ sheet, ...p }) => ({ ...p, sheetNames: [sheet] }));

  return { people, tasks, entries, milestones, warnings, perPerson, skippedYears };
}

function report(data) {
  const { people, tasks, entries, milestones, warnings, perPerson, skippedYears } = data;
  const tally = (list, fn) => list.reduce((a, x) => { const k = fn(x); a[k] = (a[k] || 0) + 1; return a; }, {});

  console.log(`\n=== TEAM PLANNER MIGRATION — ${CURRENT_YEAR} ===\n`);
  console.log(`teamPlannerPeople      ${String(people.length).padStart(5)}  (${people.filter(p => p.active).length} active)`);
  console.log(`teamPlannerTasks       ${String(tasks.length).padStart(5)}`);
  console.log(`teamPlannerEntries     ${String(entries.length).padStart(5)}`);
  console.log(`teamPlannerMilestones  ${String(milestones.length).padStart(5)}`);

  console.log(`\nTasks by source sheet:`);
  Object.entries(tally(tasks, t => t.source.sheet)).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v}`));
  console.log(`Tasks by cadence:`);
  Object.entries(tally(tasks, t => t.cadence.type)).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v}`));
  console.log(`Tasks by assignee:`);
  Object.entries(tally(tasks, t => t.assignee.displayName || "(unassigned)")).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v}`));

  console.log(`\nEntries by person (source day-cells -> entries after merging):`);
  Object.entries(perPerson).forEach(([k, v]) => {
    if (v.days) console.log(`  ${k.padEnd(10)} ${String(v.days).padStart(4)} -> ${v.entries}`);
  });
  console.log(`Entries by status:`);
  Object.entries(tally(entries, e => e.status)).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));

  const unowned = entries.filter(e => !e.ownerEmail).length;
  console.log(`\nOwnership: ${entries.length - unowned} entries have an ownerEmail, ${unowned} need one`);
  console.log(`  (link the remaining people from the app's Roster panel — it backfills their entries)`);

  console.log(`\nSkipped: ${skippedYears} dated task rows outside ${TASK_YEARS.join("/")} (prior-year backfill phase)`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.slice(0, 25).forEach(w => console.log(`  - ${w}`));
    if (warnings.length > 25) console.log(`  … and ${warnings.length - 25} more`);
  }
}

async function write(data) {
  const email = process.env.TP_ADMIN_EMAIL;
  const password = process.env.TP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("\nTP_ADMIN_EMAIL and TP_ADMIN_PASSWORD must be set to write. Aborting.");
    process.exit(1);
  }

  // Firebase config: real environment variables win, .env.local fills the
  // gaps. The committed .env.local is a placeholder stub (the real values live
  // in the repo's GitHub Actions secrets and are only injected at build time),
  // and that file is tracked — so pasting live config into it would stage
  // credentials into a commit. Passing them inline avoids that entirely.
  const envPath = path.join(REPO_ROOT, ".env.local");
  const fileEnv = fs.existsSync(envPath)
    ? Object.fromEntries(
        fs.readFileSync(envPath, "utf8").split("\n")
          .map(l => l.trim()).filter(l => l && !l.startsWith("#"))
          .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
      )
    : {};
  const read = key => process.env[key] || fileEnv[key] || "";
  const env = Object.fromEntries(
    ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID",
     "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_APP_ID"]
      .map(k => [k, read(k)]),
  );

  // The stub's placeholders fail deep inside the Auth SDK with an opaque
  // "api-key-not-valid" — catch them here where the cause is still obvious.
  const placeholders = Object.entries(env).filter(([, v]) => !v || /^YOUR_/.test(v));
  if (placeholders.length) {
    console.error(`\nFirebase config is missing or still placeholder:`);
    placeholders.forEach(([k, v]) => console.error(`  ${k} = ${v || "(empty)"}`));
    console.error(`\nGet the real values from the Firebase console (Project settings ->`);
    console.error(`Your apps -> SDK setup and configuration) and pass them inline, e.g.:\n`);
    console.error(`  VITE_FIREBASE_API_KEY=AIza… VITE_FIREBASE_APP_ID=1:… \\`);
    console.error(`    TP_ADMIN_EMAIL=… TP_ADMIN_PASSWORD=… \\`);
    console.error(`    node scripts/migrate-team-planner.mjs <xlsx> --write\n`);
    console.error(`Do not paste them into .env.local — that file is tracked by git.`);
    process.exit(1);
  }

  const { initializeApp } = await import("firebase/app");
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  const { getFirestore, doc, writeBatch } = await import("firebase/firestore");

  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  // Named database — this project has no "(default)" database at all.
  const db = getFirestore(app, "surveyprep");
  await signInWithEmailAndPassword(getAuth(app), email, password);
  console.log(`\nSigned in as ${email}. Writing…`);

  const now = new Date().toISOString();
  const jobs = [
    ["teamPlannerPeople", data.people.map(p => [p.personKey, p])],
    ["teamPlannerTasks", data.tasks.map(t => [t.id, t])],
    ["teamPlannerMilestones", data.milestones.map(m => [m.id, m])],
    ["teamPlannerEntries", data.entries.map(e => [e.id, e])],
  ];

  for (const [collectionName, docs] of jobs) {
    // writeBatch caps at 500 operations.
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach(([id, body]) => {
        const { id: _drop, ...rest } = body;
        batch.set(doc(db, collectionName, id), { ...rest, migratedAt: now, updatedAt: now }, { merge: true });
      });
      await batch.commit();
    }
    console.log(`  ${collectionName.padEnd(22)} ${docs.length} documents written`);
  }
  console.log("\nDone.");
  process.exit(0);
}

const [, , workbookArg, ...flags] = process.argv;
if (!workbookArg) {
  console.error("Usage: node scripts/migrate-team-planner.mjs <path-to-xlsx> [--write]");
  process.exit(1);
}

const data = build(workbookArg);
report(data);

if (flags.includes("--write")) {
  await write(data);
} else {
  const preview = path.join(__dirname, "team-planner-migration-preview.json");
  fs.writeFileSync(preview, JSON.stringify(data, null, 2));
  console.log(`\nDry run — nothing written. Full payload: ${path.relative(REPO_ROOT, preview)}`);
  console.log(`Re-run with --write (and TP_ADMIN_EMAIL / TP_ADMIN_PASSWORD set) to load Firestore.`);
}
