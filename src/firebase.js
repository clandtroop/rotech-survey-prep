import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app, "surveyprep");

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
