// Live "Location Readiness" data from the Semiannual App (rotech-semiannual).
//
// That app stores its data in a DIFFERENT Firebase project
// (rotech-location-readiness) from Survey Prep's own, so this module spins up
// a named secondary Firebase app pointing at it. Reads there require a
// signed-in user of THAT project (its Firestore rules are deny-by-default,
// auth-required, invite-only accounts), so specialists connect once with
// their Location Readiness Platform credentials; the session persists like
// the main app's.
//
// Schema notes (the real one, verified against rotech-semiannual source):
// - assessments docs: { locationId (= lawson #), assessmentType: 'OP541'|
//   'OP512'|'JC427', quarter: 'Q1-Q2 2026', status: 'submitted'|'rejected',
//   submittedAt, comments, ...per-form embedded responses }. There is NO
//   separate responses collection — answers are embedded maps:
//   OP541: facilityReview{section:{item:ans}}, warehouseReview, vehicles[]
//   OP512: responses{item:ans}          (ans: yes|no|na)
//   JC427: employees[{personnelRecord{item: complete|incomplete|na},
//          nonClinicalCompetencies{}, clinicalCompetencies{}, ...}]
// - locations docs are keyed by lawson number: { lawsonNumber, name, city,
//   state, regionId, areaId, jcSurveyDue? }.
import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

// Public web config of the rotech-location-readiness project (same values the
// Semiannual App ships in its own bundle — a Firebase web config is not a
// secret; security lives in the Firestore rules + auth).
const READINESS_CONFIG = {
  apiKey: "AIzaSyAwd5roTMV4YH64ZL6mRFTFWARa0fG7wK8",
  authDomain: "rotech-location-readiness.firebaseapp.com",
  projectId: "rotech-location-readiness",
  storageBucket: "rotech-location-readiness.firebasestorage.app",
  messagingSenderId: "766919297546",
  appId: "1:766919297546:web:f68bbc1cbfff383e3e2df3",
};

const APP_NAME = "location-readiness";

function readinessApp() {
  return getApps().find(a => a.name === APP_NAME) || initializeApp(READINESS_CONFIG, APP_NAME);
}

let _auth = null;
export function readinessAuth() {
  if (!_auth) {
    _auth = initializeAuth(readinessApp(), {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  }
  return _auth;
}

export function readinessDb() {
  return getFirestore(readinessApp()); // that project's "(default)" database
}

export function onReadinessAuthChanged(cb) {
  return onAuthStateChanged(readinessAuth(), cb);
}

export function signInToReadiness(email, password) {
  return signInWithEmailAndPassword(readinessAuth(), email, password);
}

export function signOutOfReadiness() {
  return signOut(readinessAuth());
}

export const READINESS_QUARTERS = ["Q1-Q2 2026", "Q3-Q4 2026"];
export const READINESS_FORM_TYPES = ["OP541", "OP512", "JC427"];

// ---- data fetching ---------------------------------------------------------

// All assessments a location has ever submitted, grouped[quarter][formType].
// One where-clause only, so no composite index is required.
export async function fetchLocationAssessments(lawson) {
  const q = query(
    collection(readinessDb(), "assessments"),
    where("locationId", "==", String(lawson))
  );
  const snap = await getDocs(q);
  const grouped = {};
  snap.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if (!data.quarter || !data.assessmentType) return;
    (grouped[data.quarter] ||= {})[data.assessmentType] = data;
  });
  return grouped;
}

export async function fetchReadinessLocation(lawson) {
  const snap = await getDoc(doc(readinessDb(), "locations", String(lawson)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// All locations registered in the readiness platform (for cross-referencing
// which roster locations have readiness data at all).
export async function fetchReadinessLocations() {
  const snap = await getDocs(collection(readinessDb(), "locations"));
  const arr = [];
  snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

// ---- stats over the embedded answer maps -----------------------------------

function isMap(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function tallyAnswers(map, tally) {
  Object.entries(map || {}).forEach(([key, v]) => {
    if (key.endsWith("_label")) return;
    if (v === "yes" || v === "complete") tally.positive++;
    else if (v === "no" || v === "incomplete") tally.negative++;
    else if (v === "na") tally.na++;
    else return;
    tally.total++;
  });
}

// Mirrors rotech-semiannual/src/utils/correctiveActions.js: a section is
// flagged for corrective action at 2+ negative answers.
export const CORRECTIVE_ACTION_THRESHOLD = 2;

// Per-assessment summary: answer counts, flagged sections, and (JC427)
// employee count. Works purely from the submitted data, no form schema needed.
export function summarizeAssessment(assessment) {
  const tally = { positive: 0, negative: 0, na: 0, total: 0 };
  const sections = []; // { label, negative }

  const addSection = (label, map) => {
    const t = { positive: 0, negative: 0, na: 0, total: 0 };
    tallyAnswers(map, t);
    tally.positive += t.positive; tally.negative += t.negative;
    tally.na += t.na; tally.total += t.total;
    sections.push({ label, negative: t.negative });
  };

  let employees = null;

  if (assessment.assessmentType === "OP541") {
    Object.entries(assessment.facilityReview || {}).forEach(([k, m]) => addSection(`Facility — ${k}`, m));
    if (assessment.warehouseReview?.included) {
      Object.entries(assessment.warehouseReview).forEach(([k, m]) => {
        if (k !== "included" && isMap(m)) addSection(`Warehouse — ${k}`, m);
      });
    }
    (assessment.vehicles || []).forEach((vehicle, i) => {
      Object.entries(vehicle).forEach(([k, m]) => {
        if (isMap(m)) addSection(`Vehicle ${i + 1}${vehicle.unitNumber ? ` (${vehicle.unitNumber})` : ""} — ${k}`, m);
      });
    });
  } else if (assessment.assessmentType === "OP512") {
    addSection("Safety Inspection", assessment.responses);
  } else if (assessment.assessmentType === "JC427") {
    employees = (assessment.employees || []).length;
    (assessment.employees || []).forEach((emp, i) => {
      addSection(`${emp.name || `Employee ${i + 1}`} — Personnel Record`, emp.personnelRecord);
    });
  }

  const flagged = sections.filter(s => s.negative >= CORRECTIVE_ACTION_THRESHOLD);
  const answered = tally.total;
  const positiveRate = answered > 0 ? Math.round(((tally.positive + tally.na) / answered) * 100) : null;

  return {
    status: assessment.status === "rejected" ? "rejected" : "submitted",
    submittedAt: assessment.submittedAt || null,
    answered,
    negative: tally.negative,
    positiveRate, // % of answers that are not negative
    flaggedSections: flagged,
    employees,
    comments: assessment.comments || "",
  };
}

// Location rollup for one quarter, same statuses the readiness dashboards use:
// pending (nothing), partial (some or a rejection), complete (all 3 accepted).
export function quarterRollup(byType) {
  const submitted = READINESS_FORM_TYPES.filter(
    t => byType?.[t] && byType[t].status !== "rejected"
  ).length;
  const any = READINESS_FORM_TYPES.some(t => byType?.[t]);
  const status = submitted === READINESS_FORM_TYPES.length ? "complete" : any ? "partial" : "pending";
  return { submitted, total: READINESS_FORM_TYPES.length, status };
}
