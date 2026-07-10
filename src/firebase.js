import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

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
export const auth = getAuth(app);
