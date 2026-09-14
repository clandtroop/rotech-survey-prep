import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
// Named Firestore database — this project has no "(default)" database at all
// (confirmed via console: only "surveyprep" exists, and creating a second one
// needs a Blaze upgrade). A prior refactor accidentally dropped this back to
// the default, which silently broke every write — Firestore's client SDK
// queues writes locally and reflects them immediately in-session even when
// the target database doesn't exist, so it looked like it worked until the
// session/cache reset and the phantom data vanished.
//
// KEEP THE "surveyprep" ARGUMENT. It is the third argument to
// initializeFirestore(app, settings, databaseId) — the same database name that
// getFirestore(app, "surveyprep") carried before. Dropping it points the app at
// a "(default)" database that does not exist in this project, which is the
// exact regression described above.
//
// ignoreUndefinedProperties: a single undefined anywhere in the visit makes
// Firestore reject the entire write with "invalid-argument". The visit is
// assembled by merging two devices' copies, and preferLocal() hands back the
// remote value whenever the local one is blank — which is itself undefined when
// neither side has the key. Dropping those fields is what the merge already
// intends ("a field missing from both sides should stay as it was"); this makes
// the SDK enforce it everywhere rather than only at the top level.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, "surveyprep");

// Sign-ins never expire on their own — Firebase keeps sessions alive
// indefinitely by refreshing tokens, as long as its stored credentials
// survive in the browser. Specialists getting signed out "after a short
// timeout" is the browser evicting site storage (Safari on iPads deletes
// script-writable storage after ~7 days without a visit, and any browser
// may evict under storage pressure). Two defenses:
//   1. Pin auth to IndexedDB (localStorage fallback) explicitly.
//   2. Ask the browser to mark this origin's storage as persistent, which
//      exempts it from automatic eviction. Granted silently for installed
//      PWAs on iOS/Android; best-effort elsewhere.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}
