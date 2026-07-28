#!/usr/bin/env node
/**
 * One-time backfill: adds the fields the My Tasks view needs to the tasks that
 * were already migrated into Firestore.
 *
 *   node scripts/backfill-task-fields.mjs            # dry run, prints the plan
 *   node scripts/backfill-task-fields.mjs --write
 *
 * Config and credentials work exactly as in migrate-team-planner.mjs: real
 * environment variables win, .env.local fills the gaps, and TP_ADMIN_EMAIL /
 * TP_ADMIN_PASSWORD must belong to an account on the admin allowlist.
 *
 * Adds three fields, changes nothing else:
 *
 *   origin: "assigned"  every migrated task is admin-owned work. Tasks a
 *                       specialist creates in the app are "personal" and are
 *                       written that way from the start. The security rules
 *                       read this field, so a task without it can only be
 *                       edited by an admin — which is the safe default, but it
 *                       also means the tags-only write path needs it present.
 *   tags: []            free-text labels, empty until someone adds one.
 *   seriesKey           slug of the task name. This is what groups the 128
 *                       dated one-off rows back under the recurring rule they
 *                       repeat, so a rotation reads as one duty with your dates
 *                       rather than thirteen rows called QPOW.
 *
 * Idempotent: fields already set are left alone, so re-running is harmless.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function seriesKeyOf(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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

const write = process.argv.includes("--write");
const env = loadConfig();

const { initializeApp } = await import("firebase/app");
const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
const { getFirestore, collection, getDocs, doc, writeBatch } = await import("firebase/firestore");

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app, "surveyprep");

if (!process.env.TP_ADMIN_EMAIL || !process.env.TP_ADMIN_PASSWORD) {
  console.error("\nTP_ADMIN_EMAIL and TP_ADMIN_PASSWORD are required (reading the roster needs a signed-in account).");
  process.exit(1);
}
await signInWithEmailAndPassword(getAuth(app), process.env.TP_ADMIN_EMAIL, process.env.TP_ADMIN_PASSWORD);

const snap = await getDocs(collection(db, "teamPlannerTasks"));
const updates = [];
const series = new Map();

snap.docs.forEach(d => {
  const t = d.data();
  const patch = {};
  if (t.origin === undefined) patch.origin = "assigned";
  if (t.tags === undefined) patch.tags = [];
  if (t.ownerEmail === undefined) patch.ownerEmail = "";
  const key = seriesKeyOf(t.name);
  if (t.seriesKey !== key) patch.seriesKey = key;
  series.set(key, (series.get(key) || 0) + 1);
  if (Object.keys(patch).length) updates.push({ ref: d.ref, id: d.id, name: t.name, patch });
});

console.log(`\ntasks in Firestore:  ${snap.size}`);
console.log(`needing a backfill:  ${updates.length}`);
console.log(`distinct series:     ${series.size}`);

const grouped = [...series.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
console.log(`\nseries with more than one task (these collapse into one row in My Tasks):`);
grouped.slice(0, 12).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
if (grouped.length > 12) console.log(`  … and ${grouped.length - 12} more`);
console.log(`\n${snap.size - grouped.reduce((a, [, n]) => a + n, 0) + grouped.length} rows total after grouping (from ${snap.size})`);

if (!write) {
  console.log(`\nDry run — nothing written. Re-run with --write to apply.`);
  process.exit(0);
}

for (let i = 0; i < updates.length; i += 400) {
  const batch = writeBatch(db);
  updates.slice(i, i + 400).forEach(u => batch.set(u.ref, u.patch, { merge: true }));
  await batch.commit();
}
console.log(`\nUpdated ${updates.length} task documents.`);
process.exit(0);
