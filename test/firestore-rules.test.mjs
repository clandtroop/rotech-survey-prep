// Firestore security-rules tests for Rotech Survey Prep, run against the
// Firestore emulator. Nothing here touches production.
//
// The focus is the follow-up checklist: it is deliberately reachable with no
// login, so the rules are the only thing standing between a shared link and the
// compliance findings behind it — findings that name individual employees.

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
} from 'firebase/firestore';

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId: 'rotech-survey-prep-test',
  firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
});

const ADMIN = 'cody.landtroop@rotech.com';
const SPECIALIST = 'specialist@rotech.com';
const SHARE_ID = '7b9c1e42-0f3a-4d55-9a1b-2c8e6f0d4a11'; // stands in for crypto.randomUUID()

const CHECKLIST = {
  meta: { location: 'Alpha', lawson: '100', date: '2026-07-01', specialist: 'Cody' },
  categories: [
    { id: 'i0', category: 'Personnel', subheader: 'Jane Doe', text: 'TB test missing', comment: '' },
    { id: 'i1', category: 'Binders', subheader: 'Safety', text: 'OP 512 not filed', comment: '' },
  ],
  done: {},
  notes: '',
  createdAt: Date.now(),
};

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'followUpChecklists', SHARE_ID), CHECKLIST);
  await setDoc(doc(db, 'checklistShares', 'visit_Alpha_1750000000000'), {
    shareId: SHARE_ID, visitId: 'visit_Alpha_1750000000000', createdAt: Date.now(),
  });
  await setDoc(doc(db, 'visitTrends', 'v1'), {
    visitId: 'v1', records: [{ item: 'x' }], finalizedAt: Date.now(),
  });
  await setDoc(doc(db, 'locations', '100'), { lawson: '100', name: 'Alpha' });
});

const anon = () => testEnv.unauthenticatedContext().firestore();
const asUser = (email) => testEnv.authenticatedContext(email.replace(/\W/g, ''), { email }).firestore();

let passed = 0, failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n          ${String(err).split('\n')[0]}`);
  }
}

console.log('\n== Follow-up checklist: the link is the credential ==');
await check('someone with the link can read the checklist', () =>
  assertSucceeds(getDoc(doc(anon(), 'followUpChecklists', SHARE_ID))));
await check('checklists CANNOT be enumerated without the link', () =>
  assertFails(getDocs(collection(anon(), 'followUpChecklists'))));
await check('a signed-in specialist CAN enumerate them for the roll-up', () =>
  assertSucceeds(getDocs(collection(asUser(SPECIALIST), 'followUpChecklists'))));
await check('the visit-id -> share-id map is NOT public', () =>
  assertFails(getDoc(doc(anon(), 'checklistShares', 'visit_Alpha_1750000000000'))));
await check('a signed-in specialist can resolve a share id', () =>
  assertSucceeds(getDoc(doc(asUser(SPECIALIST), 'checklistShares', 'visit_Alpha_1750000000000'))));

console.log('\n== Follow-up checklist: what a link-holder may write ==');
await check('can tick an item off', () =>
  assertSucceeds(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID),
    { done: { i0: true }, updatedAt: Date.now() })));
await check('can leave notes', () =>
  assertSucceeds(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID),
    { notes: 'Corrected on 7/2', updatedAt: Date.now() })));
await check('CANNOT rewrite the findings text', () =>
  assertFails(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID), {
    categories: [{ id: 'i0', category: 'Personnel', subheader: 'Jane Doe', text: 'nothing wrong here', comment: '' }],
    updatedAt: Date.now(),
  })));
await check('CANNOT delete the findings', () =>
  assertFails(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID),
    { categories: [], updatedAt: Date.now() })));
await check('CANNOT rewrite the location/specialist metadata', () =>
  assertFails(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID),
    { meta: { location: 'Somewhere else' }, updatedAt: Date.now() })));
await check('CANNOT stuff the doc with unbounded notes', () =>
  assertFails(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID),
    { notes: 'x'.repeat(25000), updatedAt: Date.now() })));
await check('CANNOT smuggle an extra field alongside a valid tick', () =>
  assertFails(updateDoc(doc(anon(), 'followUpChecklists', SHARE_ID),
    { done: { i0: true }, categories: [], updatedAt: Date.now() })));
await check('CANNOT delete the checklist', () =>
  assertFails(deleteDoc(doc(anon(), 'followUpChecklists', SHARE_ID))));
await check('CANNOT create a checklist without signing in', () =>
  assertFails(setDoc(doc(anon(), 'followUpChecklists', 'made-up-id'), CHECKLIST)));
await check('a signed-in specialist CAN refresh the findings', () =>
  assertSucceeds(updateDoc(doc(asUser(SPECIALIST), 'followUpChecklists', SHARE_ID), {
    categories: [{ id: 'i0', category: 'Personnel', subheader: 'Jane Doe', text: 'TB test still missing', comment: '' }],
    done: {},
    updatedAt: Date.now(),
  })));

console.log('\n== Visit trend records ==');
await check('anonymous cannot read finalized visits', () =>
  assertFails(getDoc(doc(anon(), 'visitTrends', 'v1'))));
await check('signed-in specialist can read them', () =>
  assertSucceeds(getDoc(doc(asUser(SPECIALIST), 'visitTrends', 'v1'))));
await check('a non-admin CANNOT delete a finalized visit', () =>
  assertFails(deleteDoc(doc(asUser(SPECIALIST), 'visitTrends', 'v1'))));
await check('an admin can delete a finalized visit', () =>
  assertSucceeds(deleteDoc(doc(asUser(ADMIN), 'visitTrends', 'v1'))));

console.log('\n== Roster and reference data ==');
await check('anonymous cannot read the location roster', () =>
  assertFails(getDoc(doc(anon(), 'locations', '100'))));
await check('a non-admin specialist cannot write the roster', () =>
  assertFails(setDoc(doc(asUser(SPECIALIST), 'locations', '999'), { lawson: '999', name: 'Rogue' })));
await check('an admin can write the roster', () =>
  assertSucceeds(setDoc(doc(asUser(ADMIN), 'locations', '999'), { lawson: '999', name: 'New Branch' })));

console.log('\n== Catch-all ==');
await check('an undeclared collection is closed to everyone', async () => {
  await assertFails(setDoc(doc(anon(), 'somethingElse', 'x'), { a: 1 }));
  await assertFails(getDoc(doc(asUser(SPECIALIST), 'somethingElse', 'x')));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
await testEnv.cleanup();
process.exit(failed > 0 ? 1 : 0);
