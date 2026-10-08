#!/usr/bin/env node
/**
 * Export: Team Planner (Firestore, surveyprep db) -> one CSV per SharePoint list.
 *
 *   TP_ADMIN_EMAIL=… TP_ADMIN_PASSWORD=… node scripts/export-team-planner-sharepoint.mjs
 *   TP_ADMIN_EMAIL=… TP_ADMIN_PASSWORD=… node scripts/export-team-planner-sharepoint.mjs --out ./somewhere
 *
 * Read-only against Firestore: it signs in, reads every teamPlanner* collection
 * in full (all years, not the calendar's one-year window), and writes CSV files
 * locally. Nothing in Firestore is changed. Run it again right before cutover —
 * whatever was entered in the app since the last run is only in Firestore.
 *
 * The output is laid out for SharePoint's "New list → From CSV": one file per
 * list, headers are the column names in docs/sharepoint-migration-plan.md, and
 * choice values are the same labels the app shows. Do not open and re-save the
 * files in Excel first — Excel rewrites dates and strips leading zeros.
 *
 * The output contains hotel/flight confirmation numbers and everyone's
 * whereabouts, so it goes to a gitignored folder (scripts/sharepoint-export/)
 * by default. Delete it once the import has been checked.
 *
 * Credentials work as in migrate-team-planner.mjs: real environment variables
 * win, .env.local fills the gaps. Reading only needs a signed-in account, but
 * the admin one is what the other scripts use.
 *
 * Node prints a MODULE_TYPELESS_PACKAGE_JSON warning when this loads
 * src/teamPlannerData.js. It is harmless — the labels are imported rather than
 * copied so the CSVs can never disagree with what the app displays.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PLANNER_ADMIN_EMAILS, STATUS_BY_ID, CADENCE_BY_ID, VISIT_MODES, VISIT_CONFIRMATIONS,
  visitModeOf, visitConfirmationOf, hasTravelDetail, seriesKeyOf,
} from "../src/teamPlannerData.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(REPO_ROOT, "scripts", "sharepoint-export");

// SharePoint's single-line text column holds 255 characters. Columns not listed
// here are created as "Multiple lines of text" and have no practical limit.
const MULTILINE = new Set(["RawText", "Notes", "TravelJson", "Comments", "SheetNames"]);
const SINGLE_LINE_MAX = 255;

// "From CSV" will not create a list from more rows than this.
const CSV_IMPORT_MAX_ROWS = 5000;

const ASSIGNEE_LABEL = { specialist: "Specialist", team: "Team", unassigned: "Unassigned" };
const MILESTONE_LABEL = { birthday: "Birthday", work_anniversary: "Work anniversary" };
const labelOf = (list, id) => list.find(x => x.id === id)?.label || "";

const yesNo = v => (v === false ? "No" : "Yes");

// Delegation-safe copy of a date: SharePoint can't reliably filter date columns
// with < / > from Power Apps, but it can filter numbers. 2026-06-08 -> 20260608.
const dateNum = iso => (iso ? String(iso).replace(/-/g, "") : "");

// ─── ROW BUILDERS ────────────────────────────────────────────────────────────
// One function per list. Column order here is the column order in the CSV.

function personRow(p) {
  return {
    Title: p.displayName || p.personKey,
    PersonKey: p.personKey || p.id,
    Person: p.email || "",
    // New in SharePoint: who approves this person's PTO. Filled in by hand
    // after import — nothing in Firestore knows it.
    Approver: "",
    // Replaces the hard-coded PLANNER_ADMIN_EMAILS check. Members can only
    // read this list, so nobody can grant it to themselves.
    Admin: PLANNER_ADMIN_EMAILS.includes(String(p.email || "").trim().toLowerCase()) ? "Yes" : "No",
    Active: yesNo(p.active),
    SortOrder: p.sortOrder ?? "",
    Color: p.color || "",
    SheetNames: (p.sheetNames || []).join("; "),
  };
}

function entryRow(e, nameOf) {
  const start = e.startDate || "";
  const end = e.endDate || e.startDate || "";
  const status = STATUS_BY_ID[e.status] || STATUS_BY_ID.other;
  const visit = e.visit || {};
  const isVisit = e.status === "site_visit";
  const name = e.personName || nameOf(e.personKey);
  return {
    Title: [name, status.label, visit.location].filter(Boolean).join(" · "),
    LegacyId: e.id,
    PersonKey: e.personKey || "",
    PersonName: name,
    OwnerEmail: e.ownerEmail || "",
    StartDate: start,
    EndDate: end,
    StartNum: dateNum(start),
    EndNum: dateNum(end),
    // Half days are new with the PTO flow; everything recorded so far is whole days.
    DayPart: "Full day",
    Status: status.label,
    RawText: e.rawText || "",
    Notes: e.notes || "",
    // Kept for every status, not only site visits: the Today and Whereabouts
    // views show visit.location whenever it is set, so dropping it would
    // change what those views display.
    VisitLocation: visit.location || "",
    VisitPurpose: visit.purpose || "",
    // Mode and confirmation only mean something on a site visit. The app
    // defaults a missing value to Onsite / Scheduled; that default is written
    // out so Site Circuit reads the same thing it does today.
    VisitMode: isVisit ? labelOf(VISIT_MODES, visitModeOf(e)) : "",
    VisitConfirmation: isVisit ? labelOf(VISIT_CONFIRMATIONS, visitConfirmationOf(e)) : "",
    VisitTime: visit.time || "",
    // Hotel/flight stay one JSON blob, as they are one nested object today:
    // only the detail view reads them, and flattening would add ~20 columns
    // that are empty on almost every row.
    TravelJson: hasTravelDetail(e) ? JSON.stringify(e.travel) : "",
    RequestId: "",
    LegacySource: e.source?.sheet ? `${e.source.sheet}!${e.source.col || ""}${e.source.row ?? ""}` : "",
  };
}

function taskRow(t) {
  const c = t.cadence || {};
  return {
    Title: t.name || "",
    // Completion records point at this rather than at the SharePoint item ID,
    // which isn't known until after import.
    TaskKey: t.id,
    CadenceType: CADENCE_BY_ID[c.type]?.label || "",
    CadenceMonths: (c.months || []).join(","),
    CadenceDate: c.date || "",
    CadenceLabel: c.rawLabel || "",
    AssigneeType: ASSIGNEE_LABEL[t.assignee?.type] || "Unassigned",
    AssigneePersonKey: t.assignee?.personKey || "",
    AssigneeName: t.assignee?.displayName || "",
    Scope: t.scope || "",
    Comments: t.comments || "",
    Tags: (t.tags || []).join(", "),
    SeriesKey: seriesKeyOf(t),
    Origin: t.origin === "personal" ? "Personal" : "Assigned",
    OwnerEmail: t.ownerEmail || "",
    Active: yesNo(t.active),
    LegacySource: t.source?.sheet ? `${t.source.sheet}!${t.source.row ?? ""}` : "",
  };
}

function doneRow(d) {
  return {
    Title: d.id,
    TaskKey: d.taskId || "",
    SeriesKey: d.seriesKey || "",
    TaskName: d.taskName || "",
    PeriodKey: d.periodKey || "",
    PersonKey: d.personKey || "",
    DoneBy: d.doneBy || "",
    DoneByEmail: d.doneByEmail || "",
    // Left as text: it is only ever displayed, and an ISO timestamp survives
    // the CSV import unchanged where a date-time column would be re-zoned.
    DoneAt: d.doneAt || "",
  };
}

function milestoneRow(m, nameOf) {
  const type = MILESTONE_LABEL[m.type] || m.type || "";
  return {
    Title: m.label || `${nameOf(m.personKey)} — ${type}`,
    MilestoneKey: m.id,
    PersonKey: m.personKey || "",
    Type: type,
    Month: m.month ?? "",
    Day: m.day ?? "",
    Year: m.year ?? "",
  };
}

// ─── BUILD ───────────────────────────────────────────────────────────────────

export function buildExport({ people, entries, tasks, done, milestones }) {
  const warnings = [];
  const byKey = new Map(people.map(p => [p.personKey || p.id, p]));
  const nameOf = key => byKey.get(key)?.displayName || key || "";

  // Checks worth knowing about before import. None of them stop the export —
  // the data is written exactly as Firestore holds it.
  people.filter(p => p.active !== false && !p.email).forEach(p =>
    warnings.push(`Active person "${p.displayName}" has no email — fill in Person on TP People after import.`));
  const orphanKeys = [...new Set(entries.map(e => e.personKey).filter(k => !byKey.has(k)))];
  orphanKeys.forEach(k =>
    warnings.push(`${entries.filter(e => e.personKey === k).length} entries reference personKey "${k}", which is not on the roster.`));
  entries.filter(e => e.endDate && e.startDate && e.endDate < e.startDate).forEach(e =>
    warnings.push(`Entry ${e.id} ends (${e.endDate}) before it starts (${e.startDate}).`));
  entries.filter(e => !e.startDate).forEach(e =>
    warnings.push(`Entry ${e.id} has no start date — it never showed on the calendar.`));
  entries.filter(e => e.status && !STATUS_BY_ID[e.status]).forEach(e =>
    warnings.push(`Entry ${e.id} has unknown status "${e.status}" — exported as Other.`));
  const taskIds = new Set(tasks.map(t => t.id));
  const strayDone = done.filter(d => !taskIds.has(d.taskId));
  if (strayDone.length) warnings.push(`${strayDone.length} completion records point at tasks that no longer exist (exported anyway).`);

  const byDate = (a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.personKey).localeCompare(String(b.personKey));
  const files = [
    { list: "TP People",     file: "tp-people.csv",     rows: [...people].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)).map(personRow) },
    { list: "TP Entries",    file: "tp-entries.csv",    rows: [...entries].sort(byDate).map(e => entryRow(e, nameOf)) },
    { list: "TP Tasks",      file: "tp-tasks.csv",      rows: tasks.map(taskRow) },
    { list: "TP Task Done",  file: "tp-task-done.csv",  rows: done.map(doneRow) },
    { list: "TP Milestones", file: "tp-milestones.csv", rows: milestones.map(m => milestoneRow(m, nameOf)) },
  ];

  for (const f of files) {
    if (f.rows.length > CSV_IMPORT_MAX_ROWS) {
      warnings.push(`${f.file} has ${f.rows.length} rows; "From CSV" stops at ${CSV_IMPORT_MAX_ROWS}. Import the rest with grid-view paste or a flow.`);
    }
    for (const row of f.rows) {
      for (const [col, val] of Object.entries(row)) {
        if (!MULTILINE.has(col) && String(val).length > SINGLE_LINE_MAX) {
          warnings.push(`${f.file}: ${col} on "${row.Title}" is ${String(val).length} characters; a single-line column holds ${SINGLE_LINE_MAX}. Make ${col} multi-line or shorten it.`);
        }
      }
    }
  }

  return { files, warnings };
}

// RFC 4180, with a BOM so SharePoint and Excel read it as UTF-8 and CRLF line
// endings. Quotes any field holding a comma, quote or line break.
export function toCsv(rows) {
  if (!rows.length) return "﻿";
  const cols = Object.keys(rows[0]);
  const cell = v => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function loadConfig() {
  const envPath = path.join(REPO_ROOT, ".env.local");
  const fileEnv = fs.existsSync(envPath)
    ? Object.fromEntries(
        fs.readFileSync(envPath, "utf8").split("\n")
          .map(l => l.trim()).filter(l => l && !l.startsWith("#"))
          .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
      )
    : {};
  const read = k => process.env[k] || fileEnv[k] || "";
  const env = Object.fromEntries(
    ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID",
     "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_APP_ID"].map(k => [k, read(k)]),
  );
  const bad = Object.entries(env).filter(([, v]) => !v || /^YOUR_/.test(v));
  if (bad.length) {
    console.error("\nFirebase config is missing or still placeholder:");
    bad.forEach(([k, v]) => console.error(`  ${k} = ${v || "(empty)"}`));
    console.error("\nPass the real values inline — do not put them in .env.local, which is tracked by git.");
    process.exit(1);
  }
  return env;
}

async function main() {
  const outArg = process.argv.indexOf("--out");
  const outDir = outArg > -1 && process.argv[outArg + 1] ? path.resolve(process.argv[outArg + 1]) : DEFAULT_OUT;

  if (!process.env.TP_ADMIN_EMAIL || !process.env.TP_ADMIN_PASSWORD) {
    console.error("\nTP_ADMIN_EMAIL and TP_ADMIN_PASSWORD are required (Team Planner data is only readable signed in).");
    process.exit(1);
  }

  const env = loadConfig();
  const { initializeApp } = await import("firebase/app");
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  const { getFirestore, collection, getDocs } = await import("firebase/firestore");

  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
  });
  // Named database — see the comment in src/firebase.js. "(default)" does not exist.
  const db = getFirestore(app, "surveyprep");
  await signInWithEmailAndPassword(getAuth(app), process.env.TP_ADMIN_EMAIL, process.env.TP_ADMIN_PASSWORD);

  const read = async name => (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }));
  const [people, entries, tasks, done, milestones] = await Promise.all([
    read("teamPlannerPeople"), read("teamPlannerEntries"), read("teamPlannerTasks"),
    read("teamPlannerTaskDone"), read("teamPlannerMilestones"),
  ]);

  const { files, warnings } = buildExport({ people, entries, tasks, done, milestones });

  fs.mkdirSync(outDir, { recursive: true });
  console.log(`\nWrote to ${outDir}\n`);
  for (const f of files) {
    fs.writeFileSync(path.join(outDir, f.file), toCsv(f.rows), "utf8");
    console.log(`  ${f.file.padEnd(20)} ${String(f.rows.length).padStart(5)} rows  → list "${f.list}"`);
  }

  const years = entries.reduce((a, e) => { const y = String(e.startDate || "").slice(0, 4) || "none"; a[y] = (a[y] || 0) + 1; return a; }, {});
  console.log(`\nEntries by year: ${Object.entries(years).sort().map(([y, n]) => `${y}: ${n}`).join(", ")}`);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning${warnings.length === 1 ? "" : "s"}:`);
    warnings.forEach(w => console.log(`  - ${w}`));
  }
  console.log(`\nAfter importing, each SharePoint list's item count should match the row counts above.`);
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
