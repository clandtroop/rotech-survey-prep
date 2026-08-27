// Moves existing follow-up checklists off their guessable document ids and onto
// random share ids, and splits completion state out of the findings array.
//
// WHY
// ---
// Checklists were stored under the visit id — `visit_<LocationName>_<epoch-ms>`
// — and served to anyone with the URL, with no login. That id is a public branch
// name plus a timestamp, so it was derivable rather than secret, and the
// documents name individual employees alongside their compliance findings. Every
// document still sitting at one of those ids is exposed until it is moved.
//
// WHAT IT DOES
//   followUpChecklists/visit_Alpha_1750000000000   (guessable)
//     -> followUpChecklists/<random uuid>          (unguessable)
//     -> checklistShares/visit_Alpha_1750000000000 = { shareId: <random uuid> }
//
//   and rewrites each document from
//     categories: [{ id, text, ..., done: true }]
//   to
//     categories: [{ id, text, ... }], done: { id: true }
//   so the security rules can allow a link-holder to tick items off without
//   also allowing them to reword the finding.
//
// HEADS UP: THIS INVALIDATES CHECKLIST LINKS ALREADY SENT OUT.
// That is the point — the old links are the exposure. Any location manager
// working from an old link will need a fresh one: open the visit in Survey Prep
// and use "Generate checklist link" again, which returns the new URL. The script
// prints the old -> new mapping so you can send replacements.
//
// USAGE
//   npm install firebase-admin
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//     node scripts/migrate-checklist-share-ids.mjs --dry-run
//   ...review the plan, then re-run without --dry-run.
//
// Documents are copied first and only deleted once the copy is confirmed
// written, so an interrupted run leaves the original in place.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const CHECKLISTS = 'followUpChecklists';
const SHARES = 'checklistShares';

// This project has no "(default)" database — only "surveyprep".
initializeApp({ credential: applicationDefault() });
const db = getFirestore('surveyprep');

// A document already at a random id has been migrated; one at a visit id has not.
function looksLikeShareId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Pull completion out of the findings array into its own map.
function splitDoneState(data) {
  const categories = (data.categories || []).map(({ done, ...item }) => item);
  const doneMap = { ...(data.done || {}) };
  (data.categories || []).forEach(item => {
    if (doneMap[item.id] === undefined && item.done) doneMap[item.id] = true;
  });
  return { categories, done: doneMap };
}

const snap = await db.collection(CHECKLISTS).get();
console.log(`Found ${snap.size} checklist document(s).\n`);

let migrated = 0, alreadyDone = 0;
const mapping = [];

for (const docSnap of snap.docs) {
  const oldId = docSnap.id;

  if (looksLikeShareId(oldId)) {
    // Already on a random id; just make sure the shape is current.
    const data = docSnap.data();
    const needsSplit = (data.categories || []).some(item => 'done' in item);
    if (needsSplit && !DRY_RUN) {
      await docSnap.ref.update(splitDoneState(data));
    }
    alreadyDone++;
    continue;
  }

  const data = docSnap.data();
  const shareId = randomUUID();
  const rewritten = { ...data, ...splitDoneState(data) };

  console.log(`  ${oldId}`);
  console.log(`    -> ${shareId}   (${data.meta?.location || 'unknown location'}, ${data.meta?.date || 'no date'})`);
  mapping.push({ oldId, shareId, location: data.meta?.location || '', date: data.meta?.date || '' });

  if (!DRY_RUN) {
    // Copy first. Only remove the original once the new document is readable,
    // so an interrupted run never loses a checklist.
    await db.collection(CHECKLISTS).doc(shareId).set(rewritten);
    const confirm = await db.collection(CHECKLISTS).doc(shareId).get();
    if (!confirm.exists) {
      console.log(`    !! copy not confirmed — leaving ${oldId} in place`);
      continue;
    }
    await db.collection(SHARES).doc(oldId).set({
      shareId, visitId: oldId, createdAt: data.createdAt || Date.now(), migratedAt: Date.now(),
    });
    await docSnap.ref.delete();
  }
  migrated++;
}

console.log(
  `\n${DRY_RUN ? 'Would migrate' : 'Migrated'} ${migrated} checklist(s); ` +
  `${alreadyDone} already on a random id.`
);

if (mapping.length > 0) {
  console.log('\nOld links are now dead. Re-send a fresh link for each of these:');
  for (const m of mapping) {
    console.log(`  ${m.location} (${m.date}) -> ?checklist=${m.shareId}`);
  }
}
console.log(DRY_RUN ? '\nDry run — nothing was written.' : '\nMigration complete.');
