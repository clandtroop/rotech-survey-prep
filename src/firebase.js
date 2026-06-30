import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Public client config — not a secret. Access is controlled by Firestore
// security rules (see firestore.rules), not by hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyA-tfOM9h3CRkKKBZlvlsS4t4bxdHURYWw",
  authDomain: "rotech-survey-prep.firebaseapp.com",
  projectId: "rotech-survey-prep",
  storageBucket: "rotech-survey-prep.firebasestorage.app",
  messagingSenderId: "547512204276",
  appId: "1:547512204276:web:fbf97b7705ec6bbdbcd7a1",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
