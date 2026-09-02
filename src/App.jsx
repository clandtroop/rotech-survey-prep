import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { useRegisterSW } from "virtual:pwa-register/react";
import { db, auth } from "./firebase";
import { doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, collection, deleteDoc, query as fsQuery, where, orderBy, limit, writeBatch } from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { T, cardStyle, Icon, metaLabel, metaField, btnPrimary, btnOutline, BRAND } from "./theme";
import { TREND_KEY, TRENDS_COLLECTION, loadTrendData } from "./trendData";
import TrendDashboard from "./TrendDashboard";
import ReadinessDashboard from "./ReadinessDashboard";
import TeamPlanner from "./TeamPlanner";
import SiteCircuit from "./SiteCircuit";

// What the assessment module is called in the nav, on its dashboard card, and
// in any CTA pointing at it. Kept in one place so renaming it is a one-line
// edit — this is NOT the follow-up checklist (ChecklistView), which is a
// separate artifact shared with managers and keeps its own name.
const MODULE_LABEL = "Survey Readiness Tool";

// Page widths. The design handoff specced 1160/1320, which leaves a lot of
// dead margin on a wide monitor and reads as zoomed-out; widened here.
const WIDTH_DASHBOARD = 1400;
const WIDTH_FORM      = 1600;
const WIDTH_REPORT    = 1040;

// Admins allowed to add/edit/delete Location Roster entries and Policy
// Revision Dates (everyone else, any signed-in specialist, gets read-only
// access). Must be kept in sync with the matching allowlist in
// firestore.rules, which enforces this server-side.
const ADMIN_EMAILS = ["tasmith@rotech.com", "cody.landtroop@rotech.com"];

// How long without an explicit "Save Progress" before the reminder pops up.
const SAVE_REMINDER_MS = 30 * 60 * 1000;

const DRAFT_KEY       = "rotech_survey_draft";
const VISITS_KEY      = "rotech_saved_visits";
const PDF_HISTORY_KEY = "rotech_pdf_history";

// Firestore collection holding per-visit follow-up checklists (see firestore.rules).
const CHECKLISTS_COLLECTION = "followUpChecklists";
// In-progress (not-yet-finalized) visits, synced per-specialist so "Save
// Progress" on one device can be picked back up with "Load" on another
// (e.g. starting a visit on an iPad, finishing it at a desk). Keyed by the
// same visit.id used in localStorage; scoped to the signed-in specialist via
// ownerUid (see firestore.rules — read/write is restricted to the owner).
const IN_PROGRESS_VISITS_COLLECTION = "inProgressVisits";

// Maps each SECTIONS id to its follow-up checklist category.
const SECTION_TO_CHECKLIST_CATEGORY = {
  morning: "Binders",
  inservice: "Binders",
  site: "Binders",
  jc: "Binders",
  sds: "Warehouse",
  pstSetup: "PST Visits",
  pstMaintenance: "PST Visits",
  clinician: "PST Visits",
  vent: "PST Visits",
};
// STANDING BACKUP of the location roster — the Firestore "locations"
// collection has been found wiped twice (2026-07-10) with no attributable
// cause: no app-level audit log entry, no console "delete collection"
// action, and no other script/integration touches this project. Root
// cause unresolved — likely something with direct Firestore API/admin
// access outside this app (check Google Cloud Console > IAM & Admin >
// Audit Logs > Data Access for the Firestore API, and Firestore's TTL
// policies page, since neither is visible from here). Kept permanently
// (not a one-time migration seed) so a restore is always self-service
// via the Location Roster tab's "Restore from backup" button — update
// this array if the roster changes and you want the backup current.
const LOCATIONS_BACKUP_SNAPSHOT = [
  { lawson: "200210", name: "BP Gamma Medical Supply", city: "Frederick", state: "MD", region: "R2", areaCode: "A1", areaManager: "Brenda Perry" },
  { lawson: "92110", name: "Rotech", city: "Glen Burnie", state: "MD", region: "R2", areaCode: "A1", areaManager: "Brenda Perry" },
  { lawson: "133210", name: "Medic-Aire Medical Equipment", city: "Prince Frederick", state: "MD", region: "R2", areaCode: "A1", areaManager: "Brenda Perry" },
  { lawson: "200510", name: "Best Home Medical", city: "Barboursville", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "123010", name: "Rotech", city: "Charleston", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "6810", name: "Rotech Home Medical Care", city: "Christiansburg", state: "VA", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "67510", name: "Laurel Mountain Medical", city: "Clarksburg", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "68010", name: "Pioneer Medical Services", city: "Man", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "67910", name: "Pioneer Medical Services", city: "Mount Hope", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "200410", name: "Best Medical Equipment", city: "Nitro", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "123210", name: "Andy Boyd's Inhome Medical", city: "Parkersburg", state: "WV", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "6610", name: "Rotech Home Medical Care", city: "Pearisburg", state: "VA", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "6410", name: "Rotech Home Medical Care", city: "Roanoke", state: "VA", region: "R2", areaCode: "A2", areaManager: "Buddy Volinski" },
  { lawson: "135010", name: "First Community Care", city: "Amherst", state: "NY", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "47510", name: "Rotech", city: "Bloomsburg", state: "PA", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "47310", name: "Rotech", city: "Dickson City", state: "PA", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "135210", name: "First Community Care", city: "East Syracuse", state: "NY", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "201320", name: "Better Living Now", city: "Hauppauge", state: "NY", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "135710", name: "North Country Medical", city: "Malone", state: "NY", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "48810", name: "Rotech", city: "Mifflinburg", state: "PA", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "135910", name: "North Country Medical", city: "Potsdam", state: "NY", region: "R2", areaCode: "A3", areaManager: "Dawn Ragukas" },
  { lawson: "46910", name: "Rotech", city: "Bensalem", state: "PA", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "200310", name: "American Home Medical Equipment and Supplies", city: "Bethlehem", state: "PA", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "133510", name: "CPO2", city: "Chambersburg", state: "PA", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "105310", name: "Rotech", city: "Lewistown", state: "PA", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "92010", name: "Rotech", city: "Marlton", state: "NJ", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "47410", name: "CPO2", city: "Mechanicsburg", state: "PA", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "133310", name: "Rotech", city: "Pottsville", state: "PA", region: "R2", areaCode: "A4", areaManager: "Michael Belmont" },
  { lawson: "35110", name: "Rotech", city: "Cincinnati", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "97310", name: "Hook's Oxygen & Medical Equipment", city: "Dayton", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "36110", name: "Rotech of Crestview Hills", city: "Erlanger", state: "KY", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "97610", name: "Hook's Oxygen & Medical Equipment", city: "Gahanna", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "97510", name: "Rotech", city: "Milford", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "97810", name: "Hook's Oxygen & Medical Equipment", city: "Springfield", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "156310", name: "Rotech", city: "Toledo", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "98010", name: "Rotech", city: "Washington Court House", state: "OH", region: "R2", areaCode: "A5", areaManager: "Scott Thompson" },
  { lawson: "120110", name: "Rotech", city: "Cambridge", state: "OH", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "91710", name: "Rotech", city: "Erie", state: "PA", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "99710", name: "Rotech", city: "Girard", state: "OH", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "116510", name: "HSM Medical", city: "Jamestown", state: "NY", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "135510", name: "Rotech", city: "Monroeville", state: "PA", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "99610", name: "Richards Medical", city: "New Philadelphia", state: "OH", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "47910", name: "Rotech", city: "Oil City", state: "PA", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "97410", name: "Rotech", city: "Valley View", state: "OH", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "120810", name: "Rotech", city: "Washington", state: "PA", region: "R2", areaCode: "A6", areaManager: "Lee Harris" },
  { lawson: "201610", name: "Rotech", city: "Auburn", state: "ME", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "201810", name: "Rotech", city: "Bedford", state: "NH", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "136510", name: "Rotech", city: "Cranston", state: "RI", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "121910", name: "Rotech", city: "Cromwell", state: "CT", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "155310", name: "Rotech", city: "Hampden", state: "ME", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "137410", name: "Rotech", city: "Methuen", state: "MA", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "155010", name: "Rotech", city: "Presque Isle", state: "ME", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "201710", name: "Rotech", city: "Southborough", state: "MA", region: "R2", areaCode: "A8", areaManager: "Tom Fontaine" },
  { lawson: "23410", name: "Rotech", city: "Clinton", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "14210", name: "Rotech", city: "Fayetteville", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "13410", name: "Sun Medical Supply", city: "Henderson", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "15810", name: "Rotech", city: "High Point", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "17510", name: "Rotech", city: "Myrtle Beach", state: "SC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "14010", name: "Rotech", city: "Raleigh", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "16710", name: "Ideal Home Medical", city: "Rocky Mount", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "14110", name: "Home Medical Systems", city: "Whiteville", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "201110", name: "Rotech", city: "Wilmington", state: "NC", region: "R3", areaCode: "A1", areaManager: "Mindy Mills" },
  { lawson: "37210", name: "Rotech of Corbin", city: "Corbin", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "7710", name: "Rotech of Central Kentucky", city: "Elizabethtown", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "37310", name: "Rotech of Frankfort", city: "Frankfort", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "37110", name: "Rotech of Hazard", city: "Hazard", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "8110", name: "Rotech", city: "Jeffersonville", state: "IN", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "37710", name: "Rotech of Lexington", city: "Lexington", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "7210", name: "Rotech of Central Kentucky", city: "Louisville", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "37610", name: "Rotech of Pikeville", city: "Pikeville", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "7510", name: "Rotech of Richmond", city: "Richmond", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "117710", name: "Rotech of Somerset", city: "Somerset", state: "KY", region: "R3", areaCode: "A2", areaManager: "Brandy Nalley" },
  { lawson: "15910", name: "Bluedot National Respiratory", city: "Charlotte", state: "NC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "13510", name: "Rotech", city: "Conover", state: "NC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "14910", name: "American Health Services", city: "Gastonia", state: "NC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "17210", name: "American Health Services", city: "Greenville", state: "SC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "18210", name: "Rotech", city: "Lancaster", state: "SC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "18610", name: "Rotech", city: "Lexington", state: "SC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "14410", name: "American Health Services", city: "Lincolnton", state: "NC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "16110", name: "Monroe Home Medical", city: "Monroe", state: "NC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "14510", name: "American Health Services", city: "Mooresville", state: "NC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "156010", name: "Home Medical Systems", city: "Summerville", state: "SC", region: "R3", areaCode: "A3", areaManager: "Aleksandr Povarich" },
  { lawson: "15210", name: "Rotech", city: "Asheville", state: "NC", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "22110", name: "Rotech", city: "Chattanooga", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "15510", name: "Kelley's Home Health Services", city: "Franklin", state: "NC", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "107510", name: "Rotech", city: "Johnson City", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "41010", name: "Rotech", city: "Knoxville", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "107110", name: "Rotech", city: "Lafollette", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "23110", name: "Rotech", city: "Morristown", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "41710", name: "Preferred Medical Equipment Company", city: "Murfreesboro", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "15410", name: "Kelley's Home Health Services", city: "Murphy", state: "NC", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "41210", name: "Rotech", city: "Nashville", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "107010", name: "Rotech", city: "Tazewell", state: "TN", region: "R3", areaCode: "A5", areaManager: "OPEN (R3-A5)" },
  { lawson: "26810", name: "Rotech Oxygen & Medical Equipment", city: "Fort Myers", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "138410", name: "Rotech Oxygen & Medical Equipment", city: "Hudson", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "510", name: "Rotech Oxygen & Medical Equipment", city: "Inverness", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "138510", name: "Rotech Oxygen & Medical Equipment", city: "Lakeland", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "138610", name: "Rotech Oxygen & Medical Equipment", city: "Largo", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "810", name: "Rotech Oxygen & Medical Equipment", city: "Leesburg", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "8410", name: "Rotech Oxygen & Medical Equipment", city: "Ocala", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "26410", name: "Rotech Oxygen & Medical Equipment", city: "Sarasota", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "1310", name: "Rotech Oxygen & Medical Equipment", city: "Tampa", state: "FL", region: "R5", areaCode: "A1", areaManager: "Mark Paul" },
  { lawson: "137910", name: "Abba Medical Equipment", city: "Cartersville", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "202420", name: "Rotech Oxygen & Medical Equipment", city: "Cumming", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "24310", name: "Home Medical Systems", city: "Duluth", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "23610", name: "Pickens Medical Supply", city: "Jasper", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "117410", name: "Corley Home Health Care", city: "Lagrange", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "16210", name: "Georgia Medical Resources", city: "Marietta", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "25110", name: "Rotech Oxygen & Medical Equipment", city: "Villa Rica", state: "GA", region: "R5", areaCode: "A2", areaManager: "Shannon Hutson" },
  { lawson: "8710", name: "Rotech Oxygen & Medical Equipment", city: "Davie", state: "FL", region: "R5", areaCode: "A3", areaManager: "Wanda Kavades" },
  { lawson: "310", name: "Rotech Oxygen & Medical Equipment", city: "Deland", state: "FL", region: "R5", areaCode: "A3", areaManager: "Wanda Kavades" },
  { lawson: "1910", name: "Rotech Oxygen & Medical Equipment", city: "Melbourne", state: "FL", region: "R5", areaCode: "A3", areaManager: "Wanda Kavades" },
  { lawson: "710", name: "Rotech Oxygen & Medical Equipment", city: "Orlando", state: "FL", region: "R5", areaCode: "A3", areaManager: "Wanda Kavades" },
  { lawson: "156110", name: "Rotech Oxygen & Medical Equipment", city: "Riviera Beach", state: "FL", region: "R5", areaCode: "A3", areaManager: "Wanda Kavades" },
  { lawson: "9610", name: "Rotech Oxygen & Medical Equipment", city: "Stuart", state: "FL", region: "R5", areaCode: "A3", areaManager: "Wanda Kavades" },
  { lawson: "22010", name: "1ST Choice Home Medical", city: "Adel", state: "GA", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "22510", name: "Southern Home Respiratory", city: "Brunswick", state: "GA", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "21610", name: "Rotech Oxygen & Medical Equipment", city: "Douglas", state: "GA", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "210", name: "Rotech Oxygen & Medical Equipment", city: "Gainesville", state: "FL", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "26010", name: "Rotech Oxygen & Medical Equipment", city: "Garden City", state: "GA", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "1510", name: "Rotech Oxygen & Medical Equipment", city: "Jacksonville", state: "FL", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "910", name: "Patient's Choice Medical Services", city: "Lynn Haven", state: "FL", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "1410", name: "Rotech Oxygen & Medical Equipment", city: "Marianna", state: "FL", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "9410", name: "Rotech Oxygen & Medical Equipment", city: "Pensacola", state: "FL", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "21010", name: "Medical Equipment Professionals", city: "Statesboro", state: "GA", region: "R5", areaCode: "A4", areaManager: "Amber Fulghum" },
  { lawson: "79910", name: "First Choice Medical", city: "Alexander City", state: "AL", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "80410", name: "Rotech Oxygen & Medical Equipment", city: "Anniston", state: "AL", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "202320", name: "Valentine's Diabetic Supply", city: "Birmingham", state: "AL", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "75010", name: "Baumann's Home Medical and Respiratory", city: "Dothan", state: "AL", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "633510", name: "RN Homecare", city: "Grenada", state: "MS", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "634110", name: "Rotech Oxygen & Medical Equipment", city: "Gulfport", state: "MS", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "633810", name: "Rotech Home Medical Equipment", city: "Hattiesburg", state: "MS", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "33010", name: "Stat Medical Equipment", city: "Meridian", state: "MS", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "633310", name: "Rotech Home Medical Equipment", city: "Richland", state: "MS", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "125810", name: "First Choice Medical", city: "Saraland", state: "AL", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "74910", name: "Community Healthcare", city: "Troy", state: "AL", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "633910", name: "Rotech Home Medical Equipment", city: "Tupelo", state: "MS", region: "R5", areaCode: "A5", areaManager: "Carla Ard" },
  { lawson: "70710", name: "Medical Technology of Louisiana", city: "Alexandria", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "670210", name: "Rotech Home Medical Equipment", city: "Baton Rouge", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "646110", name: "Samaritan Home Medical Equipment", city: "Bossier City", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "670310", name: "Taylor Home Health Supply", city: "Broussard", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "670410", name: "Taylor Home Health Supply", city: "Harahan", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "670110", name: "Rotech Home Medical Equipment", city: "Lake Charles", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "70810", name: "Medical Technology of Louisiana", city: "Monroe", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "646310", name: "Rotech Oxygen & Medical Equipment", city: "Natchitoches", state: "LA", region: "R5", areaCode: "A7", areaManager: "Damon Melton" },
  { lawson: "612110", name: "Rotech", city: "Austin", state: "TX", region: "R6", areaCode: "A1", areaManager: "Jeffrey Ford" },
  { lawson: "617410", name: "Rotech", city: "Corpus Christi", state: "TX", region: "R6", areaCode: "A1", areaManager: "Jeffrey Ford" },
  { lawson: "640310", name: "Major Medical", city: "Del Rio", state: "TX", region: "R6", areaCode: "A1", areaManager: "Jeffrey Ford" },
  { lawson: "612610", name: "Rotech", city: "San Antonio", state: "TX", region: "R6", areaCode: "A1", areaManager: "Jeffrey Ford" },
  { lawson: "610310", name: "Rotech", city: "Uvalde", state: "TX", region: "R6", areaCode: "A1", areaManager: "Jeffrey Ford" },
  { lawson: "690610", name: "Rotech", city: "Lake Havasu City", state: "AZ", region: "R6", areaCode: "A2", areaManager: "Debbie Stroud" },
  { lawson: "4710", name: "Rotech", city: "Las Vegas", state: "NV", region: "R6", areaCode: "A2", areaManager: "Debbie Stroud" },
  { lawson: "120510", name: "CalCare Medical", city: "Pasadena", state: "CA", region: "R6", areaCode: "A2", areaManager: "Debbie Stroud" },
  { lawson: "119710", name: "Rotech", city: "Santa Rosa", state: "CA", region: "R6", areaCode: "A2", areaManager: "Debbie Stroud" },
  { lawson: "4610", name: "Vital Care", city: "Sparks", state: "NV", region: "R6", areaCode: "A2", areaManager: "Debbie Stroud" },
  { lawson: "45510", name: "Rotech", city: "St. George", state: "UT", region: "R6", areaCode: "A2", areaManager: "Debbie Stroud" },
  { lawson: "668510", name: "Rotech", city: "Alamogordo", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "669610", name: "Rotech", city: "Albuquerque", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "615910", name: "Major Medical", city: "Clovis", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "640410", name: "Major Medical Supply", city: "El Paso", state: "TX", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "650810", name: "A-Med Supply", city: "Farmington", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "616410", name: "Major Medical", city: "Gallup", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "610510", name: "Rotech", city: "Las Cruces", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "669010", name: "Roswell Home Medical", city: "Roswell", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "623510", name: "Rotech", city: "Santa Fe", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "615710", name: "Rotech", city: "Silver City", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "667710", name: "Premier Medical", city: "Taos", state: "NM", region: "R6", areaCode: "A3", areaManager: "Michael Herrera" },
  { lawson: "613610", name: "Caremor Health Services", city: "Amarillo", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "642710", name: "Marshalls Home Medical Equip.", city: "Atlanta", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "658010", name: "Camden Medical Supply", city: "Camden", state: "AR", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "639310", name: "Rotech", city: "Hillsboro", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "659510", name: "Marshalls Home Medical Equip.", city: "Hope", state: "AR", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "610110", name: "Major Medical", city: "Lubbock", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "659610", name: "Marshalls Home Medical Equipment", city: "Magnolia", state: "AR", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "640110", name: "Rotech", city: "Odessa", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "602810", name: "Rotech", city: "Pampa", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "610210", name: "Rhema Medical", city: "Plainview", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "11510", name: "Rotech", city: "Temple", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "642910", name: "Marshalls Home Medical Equip.", city: "Texarkana", state: "TX", region: "R6", areaCode: "A4", areaManager: "Matthew Bailey" },
  { lawson: "642210", name: "Taylor Home Health Supply", city: "Beaumont", state: "TX", region: "R6", areaCode: "A5", areaManager: "Stephanie McEuen" },
  { lawson: "42510", name: "Rotech", city: "Bryan", state: "TX", region: "R6", areaCode: "A5", areaManager: "Stephanie McEuen" },
  { lawson: "642810", name: "Rotech", city: "Longview", state: "TX", region: "R6", areaCode: "A5", areaManager: "Stephanie McEuen" },
  { lawson: "642410", name: "Rotech", city: "Spring", state: "TX", region: "R6", areaCode: "A5", areaManager: "Stephanie McEuen" },
  { lawson: "642110", name: "Rotech", city: "Tyler", state: "TX", region: "R6", areaCode: "A5", areaManager: "Stephanie McEuen" },
  { lawson: "639910", name: "Rhema Medical", city: "Webster", state: "TX", region: "R6", areaCode: "A5", areaManager: "Stephanie McEuen" },
  { lawson: "610410", name: "Rotech", city: "Abilene", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "644210", name: "Rhema Medical", city: "Dallas", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "611610", name: "Rhema Medical", city: "Denton", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "644010", name: "Rhema Medical", city: "Fort Worth", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "639410", name: "Texstar Medical Equip.", city: "Granbury", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "611710", name: "Rhema Medical", city: "Greenville", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "604510", name: "Rhema Medical", city: "Irving", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "44610", name: "Rhema Medical", city: "Venus", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "639110", name: "Ellis County Home Medical", city: "Waxahachie", state: "TX", region: "R6", areaCode: "A9", areaManager: "Wendy Oxner" },
  { lawson: "659710", name: "Patient Rental Needs", city: "Fort Smith", state: "AR", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "663510", name: "American Medi-Serv", city: "Lawton", state: "OK", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "661010", name: "American Medical Services", city: "McAlester", state: "OK", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "666010", name: "Rotech", city: "Oklahoma City", state: "OK", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "661510", name: "Oxygen of Oklahoma", city: "Shawnee", state: "OK", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "660010", name: "Rotech", city: "Springdale", state: "AR", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "661410", name: "American Medical Rentals & Sales", city: "Tulsa", state: "OK", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "611910", name: "A-Plus Medical Equipment", city: "Wichita Falls", state: "TX", region: "R7", areaCode: "A1", areaManager: "John 'David' Webb" },
  { lawson: "73820", name: "First Care", city: "(WHS) Wichita", state: "KS", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "73310", name: "Home Care Medical Equipment", city: "Kansas City", state: "MO", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "4010", name: "Home Care Medical Equipment", city: "Lees Summit", state: "MO", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "73010", name: "Rotech", city: "Lenexa", state: "KS", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "118810", name: "PSI Health Care", city: "Omaha", state: "NE", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "73710", name: "First Care", city: "Pratt", state: "KS", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "3210", name: "Rotech", city: "Springfield", state: "MO", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "73810", name: "First Care", city: "Wichita", state: "KS", region: "R7", areaCode: "A2", areaManager: "Bryan Wink" },
  { lawson: "156910", name: "Health-Way Medical Supply", city: "(WHS) Jonesboro", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "156810", name: "Rotech", city: "(WHS) Memphis", state: "TN", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "660310", name: "Heartland Home Health Care", city: "Blytheville", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "603610", name: "Heartland Home Health Care", city: "Cape Girardeau", state: "MO", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "658410", name: "Rotech", city: "Conway", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "603410", name: "Heartland Home Health Care", city: "Kennett", state: "MO", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "58210", name: "Rotech", city: "Little Rock", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "641910", name: "Preferred Medical Equipment Company", city: "Memphis", state: "TN", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "659010", name: "Baxter Medical Equipment", city: "Mountain Home", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "29210", name: "Rotech of Mount Vernon", city: "Mt Vernon", state: "IL", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "36310", name: "Rotech of Western Kentucky", city: "Paducah", state: "KY", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "657910", name: "Health-Way Medical Supply", city: "Pocahontas", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "600410", name: "Health-Way Medical Supply", city: "Searcy", state: "AR", region: "R7", areaCode: "A3", areaManager: "Rebecca Green" },
  { lawson: "3910", name: "Rotech", city: "(WHS) Kirksville", state: "MO", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "98710", name: "Hook's Oxygen & Medical Equipment", city: "(WHS) Peoria", state: "IL", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "99310", name: "Rotech", city: "Jacksonville", state: "IL", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "29310", name: "Care Medical Supplies", city: "O'Fallon", state: "IL", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "98810", name: "Home Care Medical Equipment", city: "Quincy", state: "IL", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "603710", name: "Rotech", city: "Sikeston", state: "MO", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "98610", name: "Rotech", city: "Springfield", state: "IL", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "125210", name: "Rotech", city: "St Louis", state: "MO", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "29510", name: "Rotech of Urbana", city: "Urbana", state: "IL", region: "R7", areaCode: "A4", areaManager: "Michele Smith" },
  { lawson: "99910", name: "Rotech", city: "(WHS) Grand Rapids", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "102410", name: "ABC Medical Supply", city: "Cheboygan", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "105110", name: "Great Lakes Home Medical", city: "Iron River", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "4810", name: "Medwest Medical Supply", city: "Livonia", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "103710", name: "Great Lakes Home Medical", city: "Menominee", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "104910", name: "Rotech", city: "Midland", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "103910", name: "Great Lakes Home Medical", city: "Negaunee", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "7010", name: "Professional Breathing Associates", city: "Rochester Hills", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "114810", name: "Great Lakes Home Medical", city: "Traverse City", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "101910", name: "ABC Medical Supply", city: "West Branch", state: "MI", region: "R7", areaCode: "A5", areaManager: "OPEN (R7-A5)" },
  { lawson: "96110", name: "Hook's Oxygen & Medical Equipment", city: "(WHS) Mishawaka", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "97110", name: "Rotech", city: "Columbus", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "95810", name: "Rotech", city: "Fort Wayne", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "95410", name: "Hook's Oxygen & Medical Equipment", city: "Indianapolis", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "96210", name: "Hook's Oxygen & Medical Equipment", city: "Indianapolis", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "96510", name: "Rotech", city: "Kokomo", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "96810", name: "Hook's Oxygen & Medical Equipment", city: "Lafayette", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "96310", name: "Hook's Oxygen & Medical Equipment", city: "Merrillville", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "96910", name: "Hook's Oxygen & Medical Equipment", city: "Yorktown", state: "IN", region: "R7", areaCode: "A6", areaManager: "M 'Alex' Van Zant" },
  { lawson: "63910", name: "Rotech", city: "(WHS) Fort Dodge", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "144110", name: "Rotech", city: "Apple Valley", state: "MN", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "29910", name: "Rotech of Aurora", city: "Aurora", state: "IL", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "122210", name: "Specialty Home Med", city: "Baxter", state: "MN", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "63710", name: "Rotech", city: "Charles City", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "64810", name: "Rotech", city: "Dubuque", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "119210", name: "Rotech", city: "Duluth", state: "MN", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "110810", name: "Rotech of Elmhurst", city: "Elmhurst", state: "IL", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "64210", name: "Rotech", city: "Hiawatha", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "64110", name: "Rotech", city: "Marshalltown", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "104510", name: "Medwest", city: "Marshfield", state: "WI", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "63210", name: "Rotech", city: "Moline", state: "IL", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "64410", name: "Rotech", city: "Oelwein", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "144810", name: "Arrowhealth Medical Supply", city: "Rochester", state: "MN", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "113410", name: "Rotech", city: "Storm Lake", state: "IA", region: "R7", areaCode: "A7", areaManager: "Jeffrey 'Jeff' Trotman" },
  { lawson: "99410", name: "Rotech of Champaign", city: "(WHS) Champaign", state: "IL", region: "R7", areaCode: "A8", areaManager: "Cornell Covington" },
  { lawson: "105710", name: "Rotech", city: "(WHS) Tomah", state: "WI", region: "R7", areaCode: "A8", areaManager: "Cornell Covington" },
  { lawson: "110710", name: "Rotech of Elmhurst", city: "Elmhurst (VA only)", state: "IL", region: "R7", areaCode: "A8", areaManager: "Cornell Covington" },
  { lawson: "105610", name: "Rotech", city: "Watertown (VA only)", state: "WI", region: "R7", areaCode: "A8", areaManager: "Cornell Covington" },
  { lawson: "121510", name: "Rotech", city: "Beaverton", state: "OR", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "120310", name: "Rotech", city: "Eugene", state: "OR", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "72010", name: "Rotech", city: "Idaho Falls", state: "ID", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "120210", name: "Rotech", city: "Medford", state: "OR", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "74410", name: "Rotech", city: "Renton", state: "WA", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "619810", name: "Rotech", city: "Silverdale", state: "WA", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "72310", name: "Homecare Medical", city: "Soda Springs", state: "ID", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "619210", name: "Rotech", city: "Spokane", state: "WA", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "619110", name: "NCW Respiratory Care", city: "Wenatchee", state: "WA", region: "R8", areaCode: "A2", areaManager: "Cassidy Williams" },
  { lawson: "628410", name: "Rotech", city: "(WHS) Hardin", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "632210", name: "Rotech", city: "(WHS) Laramie", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "627010", name: "Rotech", city: "Billings", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "627130", name: "Rotech", city: "Bozeman", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "627210", name: "Rotech", city: "Butte", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "631310", name: "Rotech", city: "Casper", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "632810", name: "Rotech", city: "Cheyenne", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "631810", name: "Rotech", city: "Cody", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "627510", name: "Rotech", city: "Great Falls", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "627910", name: "Rotech", city: "Helena", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "628110", name: "Rotech", city: "Miles City", state: "MT", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "632510", name: "Rotech", city: "Rock Springs", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "632110", name: "Rotech", city: "Sheridan", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "632010", name: "Rotech", city: "Wheatland", state: "WY", region: "R8", areaCode: "A3", areaManager: "Lisa Durgain" },
  { lawson: "631010", name: "Rotech", city: "Flagstaff", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "10010", name: "Rotech", city: "Layton", state: "UT", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "690410", name: "Rotech", city: "Mesa", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "122310", name: "Rotech", city: "Orem", state: "UT", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "630410", name: "Rotech", city: "Payson", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "630610", name: "The Oxygen Store", city: "Peoria", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "690110", name: "Rotech", city: "Prescott", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "631110", name: "Sentry Home Health", city: "Show Low", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "630110", name: "Rotech", city: "Tucson", state: "AZ", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "137510", name: "Rotech", city: "West Valley City", state: "UT", region: "R8", areaCode: "A4", areaManager: "Brian Duffell" },
  { lawson: "76910", name: "Summit Respiratory", city: "Colorado Springs (N)", state: "CO", region: "R8", areaCode: "A6", areaManager: "Kristi Kellogg" },
  { lawson: "651310", name: "Summit Respiratory", city: "Colorado Springs (S)", state: "CO", region: "R8", areaCode: "A6", areaManager: "Kristi Kellogg" },
  { lawson: "651010", name: "Summit Respiratory", city: "Denver", state: "CO", region: "R8", areaCode: "A6", areaManager: "Kristi Kellogg" },
  { lawson: "91510", name: "Aloha Respiratory", city: "Honolulu", state: "HI", region: "R8", areaCode: "A6", areaManager: "Kristi Kellogg" },
  { lawson: "76810", name: "Summit Respiratory", city: "Lakewood", state: "CO", region: "R8", areaCode: "A6", areaManager: "Kristi Kellogg" },
  { lawson: "651110", name: "Roth Medical", city: "Westminster", state: "CO", region: "R8", areaCode: "A6", areaManager: "Kristi Kellogg" },
  { lawson: "652010", name: "Roth Medical", city: "(WHS) Lamar", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "650910", name: "Rotech", city: "Alamosa", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "651710", name: "A-Med Supply", city: "Cortez", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "608510", name: "G & G Medical", city: "Craig", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "662810", name: "Oxygen Plus", city: "Delta", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "650610", name: "A-Med Supply", city: "Durango", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "651210", name: "Roth Medical", city: "Ft. Collins", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "662910", name: "Don Paul Resp. Services", city: "Ft. Morgan", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "608310", name: "G & G Medical", city: "Grand Junction", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "651410", name: "Roth Medical", city: "Pueblo", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "662310", name: "Medco Professionals", city: "Trinidad", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "9310", name: "Valley Home Medical", city: "Vernal", state: "UT", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
  { lawson: "662210", name: "Don Paul Resp. Services", city: "Windsor", state: "CO", region: "R8", areaCode: "A7", areaManager: "Joetta Bryant" },
];



function findLocation(lawson, locations) {
  return locations.find(l => l.lawson === lawson);
}


function loadPdfHistory() {
  try { const r = localStorage.getItem(PDF_HISTORY_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function savePdfSnapshot(snapshot) {
  try {
    const history = loadPdfHistory();
    history.unshift(snapshot);
    localStorage.setItem(PDF_HISTORY_KEY, JSON.stringify(history.slice(0, 15)));
  } catch {}
}
function deletePdfSnapshot(id) {
  try {
    const history = loadPdfHistory().filter(s => s.id !== id);
    localStorage.setItem(PDF_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// Fail-safe: always push a real file to disk, independent of localStorage and
// independent of whether the user actually completes/saves the print dialog.
function downloadBackupFile(snapshot, prefix) {
  try {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const loc  = (snapshot.location || "Location").replace(/\s+/g, "_");
    const date = (snapshot.date || "").replace(/\//g, "-") || new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}_${loc}_${date}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error("Backup download failed", e);
    return false;
  }
}

// Continuous local autosave of the ENTIRE working visit (not just the core
// checklist) — this is what protects against the app's own PWA update
// silently reloading the page mid-visit (see UpdateBanner) and against
// accidental tab closes. It's separate from "Save Progress" (an explicit,
// named, cross-device checkpoint synced to Firestore) — this is a single
// always-current local safety net that needs no action from the specialist.
function saveDraft(data) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch {}
}
function loadDraft() {
  try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}
function loadVisits() {
  try { const r = localStorage.getItem(VISITS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveVisitToStorage(visit) {
  try {
    const visits = loadVisits();
    const idx = visits.findIndex(v => v.id === visit.id);
    if (idx >= 0) visits[idx] = visit; else visits.unshift(visit);
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits.slice(0, 20)));
  } catch {}
}
function deleteVisitFromStorage(id) {
  try {
    const visits = loadVisits().filter(v => v.id !== id);
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  } catch {}
}

// Cross-device counterparts to the localStorage functions above — same
// "visit" shape, plus ownerUid/ownerEmail so firestore.rules can restrict
// each specialist to their own in-progress visits. localStorage stays as an
// immediate local cache (saveProgress writes both); Firestore is what makes
// "Save Progress" on one device show up under "Load" on another.
// Answer maps keyed by question/employee id. Merged key-by-key so a device that
// never saw a section can't erase it.
const VISIT_ANSWER_MAPS = [
  "states", "comments",
  "op541States", "op541Comments", "op541tStates", "op541tComments",
  "personnelAnswers", "personnelDates", "personnelComments",
  "jc427Answers", "jc427Dates", "jc427Comments",
  "op541VehicleInfo", "meta",
];
// Maps of tab id -> a small object (or, for tabComments, a string), so they need
// one more level of merging than the flat answer maps above.
const VISIT_NESTED_MAPS = ["tabComments", "tabPatientInfo"];
// Structure parsed out of an uploaded workbook. These describe the *shape* of a
// section rather than answers, so merging them entry-by-entry would splice two
// different uploads together; take one side whole.
const VISIT_STRUCTURE_ARRAYS = [
  "op541Sections", "op541tSections",
  "personnelSlots", "personnelItems", "personnelSheetNames",
  "jc427Slots", "jc427Items", "jc427SheetNames",
];

const isBlank = v => v === undefined || v === null || v === "";
const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
// local wins, but only where local actually has something. A blank local value
// is treated as "this device never filled that in" rather than as an edit,
// because the failure being fixed here is work disappearing, not a stale value
// lingering. Deliberately clearing a field on one device can therefore be
// undone by another device's copy — an annoyance, and the safer direction to
// err in than losing an afternoon of answers.
const preferLocal = (remoteVal, localVal) => (isBlank(localVal) ? remoteVal : localVal);
function mergeMap(remoteMap, localMap) {
  if (!isPlainObject(remoteMap)) return localMap;
  if (!isPlainObject(localMap)) return remoteMap;
  const out = { ...remoteMap };
  for (const [k, v] of Object.entries(localMap)) out[k] = preferLocal(remoteMap[k], v);
  return out;
}

// Merges a visit read back from Firestore with the copy this device is about to
// write. Without this, saveVisitToFirestore's setDoc() is a blind whole-document
// overwrite: with the same visit open on an iPad and a desktop, whichever saves
// last silently erases every section the other device had filled in and it
// doesn't have locally. That is the reported "sections filled in on the iPad
// never showed up on desktop" bug.
function mergeVisitForWrite(remote, local) {
  if (!isPlainObject(remote)) return local;
  const merged = { ...remote, ...local };

  // Never introduce an undefined value that wasn't already there: Firestore
  // rejects undefined field values outright, and a field missing from both
  // sides should stay exactly as the plain spread above left it.
  const assign = (key, value) => { if (value !== undefined) merged[key] = value; };

  for (const key of VISIT_ANSWER_MAPS) {
    assign(key, mergeMap(remote[key], local[key]));
  }

  for (const key of VISIT_NESTED_MAPS) {
    const r = remote[key], l = local[key];
    if (!isPlainObject(r)) { assign(key, l); continue; }
    if (!isPlainObject(l)) { assign(key, r); continue; }
    const out = { ...r };
    for (const [tabId, localVal] of Object.entries(l)) {
      const remoteVal = r[tabId];
      // tabPatientInfo holds { globalId, currentRx }; tabComments holds a plain
      // string. Only recurse when both sides really are objects.
      out[tabId] = (isPlainObject(remoteVal) && isPlainObject(localVal))
        ? mergeMap(remoteVal, localVal)
        : preferLocal(remoteVal, localVal);
    }
    assign(key, out);
  }

  for (const key of VISIT_STRUCTURE_ARRAYS) {
    const r = Array.isArray(remote[key]) ? remote[key] : [];
    const l = Array.isArray(local[key]) ? local[key] : [];
    merged[key] = l.length ? l : r;
  }

  return merged;
}

async function saveVisitToFirestore(visit) {
  const ref = doc(db, IN_PROGRESS_VISITS_COLLECTION, visit.id);
  let toWrite = visit;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) toWrite = mergeVisitForWrite(snap.data(), visit);
  } catch {
    // Offline or the read was denied — fall through and write what this device
    // has. That is the old blind-overwrite behaviour, but only in the case
    // where we genuinely cannot see the remote copy to merge against.
  }
  await setDoc(ref, {
    ...toWrite,
    ownerUid: auth.currentUser?.uid || null,
    ownerEmail: auth.currentUser?.email || null,
    updatedAt: new Date().toISOString(),
  });
}
// The query behind the live subscription further down. Its ownerUid equality
// is also what makes the read legal under firestore.rules, which restricts
// each specialist to their own in-progress visits.
function visitsQueryFor(uid) {
  return fsQuery(collection(db, IN_PROGRESS_VISITS_COLLECTION), where("ownerUid", "==", uid));
}
async function deleteVisitFromFirestore(id) {
  await deleteDoc(doc(db, IN_PROGRESS_VISITS_COLLECTION, id));
}

// Builds the flat list of checkable follow-up items from a saved visit's failed
// findings. Each item carries a category and subheader so ChecklistView can
// group them under labelled sections (binder name, unit #, PST name, etc.).
function buildChecklistItems(visit) {
  const items = [];
  let n = 0;
  const { states = {}, comments = {}, op541Sections = [], op541States = {}, op541Comments = {},
          op541tSections = [], op541tStates = {}, op541tComments = {},
          op541VehicleInfo = {},
          personnelSlots = [], personnelItems = [], personnelAnswers = {}, personnelComments = {},
          jc427Slots = [], jc427Items = [], jc427Answers = {}, jc427Dates = {}, jc427Comments = {} } = visit;

  SECTIONS.forEach((sec, si) => {
    const category = SECTION_TO_CHECKLIST_CATEGORY[sec.id];
    if (!category) return;
    const subheader = category === "Binders" ? sec.label : sec.label;
    sec.items.forEach((item, ii) => {
      const key = `${si}-${ii}`;
      if (states[key] === "no") {
        items.push({ id: `i${n++}`, category, subheader, text: item.text, comment: comments[key] || "", done: false });
      }
    });
  });

  op541Sections.forEach(sec => {
    const vInfo = op541VehicleInfo[sec.sheetLabel] || {};
    let category, subheader;
    if (vInfo.vehicleNum) {
      category = "Vehicles";
      subheader = `Unit # ${vInfo.vehicleNum}${vInfo.pstName ? ` — ${vInfo.pstName}` : ""}`;
    } else {
      category = "PST Visits";
      subheader = vInfo.pstName ? `${vInfo.pstName} — OP 541` : `OP 541 — ${sec.sheetLabel}`;
    }
    sec.items.forEach(item => {
      if (op541States[item.key] === "no") {
        items.push({ id: `i${n++}`, category, subheader, text: item.text, comment: op541Comments[item.key] || "", done: false });
      }
    });
  });

  op541tSections.forEach(sec => {
    const vInfo = op541VehicleInfo[sec.sheetLabel] || {};
    let category, subheader;
    if (vInfo.vehicleNum) {
      category = "Vehicles";
      subheader = `Unit # ${vInfo.vehicleNum}${vInfo.pstName ? ` — ${vInfo.pstName}` : ""} (OP 541T)`;
    } else {
      category = "PST Visits";
      subheader = vInfo.pstName ? `${vInfo.pstName} — OP 541T` : `OP 541T — ${sec.sheetLabel}`;
    }
    sec.items.forEach(item => {
      if (op541tStates[item.key] === "no") {
        items.push({ id: `i${n++}`, category, subheader, text: item.text, comment: op541tComments[item.key] || "", done: false });
      }
    });
  });

  // Personnel/Medical File "No" answers, one follow-up item per (item, employee).
  // FDA File date items aren't included — there's no in-app validity ruleset to
  // judge a date as a "failure" (that's left to the file's own conditional
  // formatting on export), so there's no clean signal to surface here yet.
  personnelItems.forEach(item => {
    if (item.answerType !== "yn") return;
    personnelSlots.forEach(slot => {
      const key = `${item.key}|${slot.sheetName}|${slot.col}`;
      if (personnelAnswers[key] === "no") {
        items.push({ id: `i${n++}`, category: "Personnel", subheader: slot.name, text: item.text, comment: personnelComments[item.key] || "", done: false });
      }
    });
  });

  // JC 427: "No" answers, plus expired (red) or expiring-soon (yellow)
  // competency/date items — unlike OP 541T's FDA dates, JC 427 has a real
  // 3-year/6-month-warning ruleset (ported from the Semi Annual app), so
  // there's a clean signal to surface here.
  jc427Items.forEach(item => {
    jc427Slots.forEach(slot => {
      const key = `${item.id}|${slot.sheetName}|${slot.col}`;
      const subheader = slot.name || `Employee (col ${slot.col})`;
      if (item.answerType === "yn") {
        if (jc427Answers[key] === "no") {
          items.push({ id: `i${n++}`, category: "Personnel Records (JC 427)", subheader, text: item.text, comment: jc427Comments[item.id] || "", done: false });
        }
      } else {
        const status = getJC427ExpirationStatus(usDateToIso(jc427Dates[key] || ""));
        if (status === "red" || status === "yellow") {
          const label = status === "red" ? "EXPIRED" : "Expires within 6 months";
          items.push({ id: `i${n++}`, category: "Personnel Records (JC 427)", subheader, text: `${item.text} — ${label}`, comment: jc427Comments[item.id] || "", done: false });
        }
      }
    });
  });

  return items;
}

// Creates the Firestore checklist doc for a visit if it doesn't already exist,
// then returns the shareable checklist URL (?checklist=<visitId>).
// Creates or refreshes the Firestore checklist doc for a visit, then returns
// the shareable checklist URL (?checklist=<visitId>). Regenerating the link
// after updating findings always syncs the latest items, preserving any
// checkmarks already recorded (done flags come from the existing doc if present).
async function ensureChecklistDoc(visit, visitId) {
  const ref = doc(db, CHECKLISTS_COLLECTION, visitId);
  const existing = await getDoc(ref);
  const newItems = buildChecklistItems(visit);

  if (!existing.exists()) {
    await setDoc(ref, {
      meta: {
        location: visit.meta?.location || "",
        lawson: visit.meta?.lawson || "",
        date: visit.meta?.date || "",
        specialist: visit.meta?.specialist || "",
      },
      categories: newItems,
      notes: "",
      createdAt: Date.now(),
    });
  } else {
    // Merge: preserve done state for items that still exist by id
    const prevById = {};
    (existing.data().categories || []).forEach(it => { prevById[it.id] = it; });
    const merged = newItems.map(it => ({ ...it, done: prevById[it.id]?.done || false }));
    await updateDoc(ref, { categories: merged, updatedAt: Date.now() });
  }

  const url = new URL(window.location.href);
  url.search = `?checklist=${encodeURIComponent(visitId)}`;
  return url.toString();
}

// --- Direct OOXML cell patching -------------------------------------------
// An .xlsx is just a zip of XML files. Rather than asking a library to parse
// the whole workbook into an object model and reserialize it (which is how
// both SheetJS and ExcelJS lose fidelity — SheetJS's free build drops most
// cell styling on write, and ExcelJS can crash re-serializing conditional
// formatting rules it doesn't fully support), we patch only the exact <c>
// cell elements that need new values directly in each sheet's XML and leave
// every other file in the zip — styles.xml, conditional formatting, column
// widths, everything — completely untouched.

function colLettersToNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function numToColLetters(num) {
  let s = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

// Finds the <row r="rowNum"> element under <sheetData>, creating and
// inserting one at the correct numeric position if it doesn't exist yet.
// New elements are created with createElementNS in the sheet's own namespace
// (not plain createElement) — otherwise the browser creates them with no
// namespace at all, which forces the serializer to emit an explicit
// xmlns="" override that Excel silently fails to parse as real cell content.
function getOrCreateRow(doc, sheetDataEl, rowNum) {
  const ns = doc.documentElement.namespaceURI;
  const rows = sheetDataEl.getElementsByTagName("row");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rNum = parseInt(r.getAttribute("r"), 10);
    if (rNum === rowNum) return r;
    if (rNum > rowNum) {
      const newRow = doc.createElementNS(ns, "row");
      newRow.setAttribute("r", String(rowNum));
      sheetDataEl.insertBefore(newRow, r);
      return newRow;
    }
  }
  const newRow = doc.createElementNS(ns, "row");
  newRow.setAttribute("r", String(rowNum));
  sheetDataEl.appendChild(newRow);
  return newRow;
}

// Finds the <c r="address"> element under a row, creating and inserting one
// at the correct column position if it doesn't exist yet (rows are often
// sparse — a blank cell may have no <c> element at all in the original file).
function getOrCreateCell(doc, rowEl, address, colNum) {
  const ns = doc.documentElement.namespaceURI;
  const cells = rowEl.getElementsByTagName("c");
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.getAttribute("r") === address) return c;
    const cCol = colLettersToNum(c.getAttribute("r").match(/^[A-Z]+/)[0]);
    if (cCol > colNum) {
      const newCell = doc.createElementNS(ns, "c");
      newCell.setAttribute("r", address);
      rowEl.insertBefore(newCell, c);
      return newCell;
    }
  }
  const newCell = doc.createElementNS(ns, "c");
  newCell.setAttribute("r", address);
  rowEl.appendChild(newCell);
  return newCell;
}

// Overwrites a cell's value as an inline string — safely replaces whatever
// type it was before (number, shared string, formula) without needing to
// touch sharedStrings.xml, and preserves the cell's style-index (`s`)
// attribute since we only ever remove/set `t`, never `s`.
function setInlineStringValue(doc, cellEl, value) {
  const ns = doc.documentElement.namespaceURI;
  cellEl.removeAttribute("t");
  cellEl.setAttribute("t", "inlineStr");
  while (cellEl.firstChild) cellEl.removeChild(cellEl.firstChild);
  const isEl = doc.createElementNS(ns, "is");
  const tEl = doc.createElementNS(ns, "t");
  tEl.appendChild(doc.createTextNode(value));
  isEl.appendChild(tEl);
  cellEl.appendChild(isEl);
}

// Appends a new solid-fill entry to an existing styles.xml <fills> table,
// returning its fillId. Always appends rather than searching for a matching
// existing fill — simpler, and styles.xml only grows by at most 2 entries
// per export (one red, one yellow), reused via the cache in
// ensureHighlightCellXf below rather than re-added per cell.
function ensureFill(stylesDoc, hex6) {
  const ns = stylesDoc.documentElement.namespaceURI;
  const fillsEl = stylesDoc.getElementsByTagName("fills")[0];
  const newIndex = fillsEl.getElementsByTagName("fill").length;
  const fillEl = stylesDoc.createElementNS(ns, "fill");
  const patternEl = stylesDoc.createElementNS(ns, "patternFill");
  patternEl.setAttribute("patternType", "solid");
  const fgEl = stylesDoc.createElementNS(ns, "fgColor");
  fgEl.setAttribute("rgb", "00" + hex6);
  const bgEl = stylesDoc.createElementNS(ns, "bgColor");
  bgEl.setAttribute("rgb", "00" + hex6);
  patternEl.appendChild(fgEl);
  patternEl.appendChild(bgEl);
  fillEl.appendChild(patternEl);
  fillsEl.appendChild(fillEl);
  fillsEl.setAttribute("count", String(newIndex + 1));
  return newIndex;
}

// Clones the cell's CURRENT cellXf (preserving its number format, font,
// border, and alignment — everything the template's own designer already
// set for that cell) and appends a new cellXf with only the fill swapped to
// the given fillId. Memoized per (baseStyleIndex, fillId) pair via `cache` so
// re-highlighting many cells with the same starting style + color reuses one
// new cellXf instead of bloating styles.xml with a near-duplicate per cell.
function ensureHighlightCellXf(stylesDoc, baseStyleIndex, fillId, cache) {
  const key = `${baseStyleIndex}|${fillId}`;
  if (cache.has(key)) return cache.get(key);
  const cellXfsEl = stylesDoc.getElementsByTagName("cellXfs")[0];
  const xfs = cellXfsEl.getElementsByTagName("xf");
  const baseXf = xfs[baseStyleIndex] || xfs[0];
  const newXf = baseXf.cloneNode(true);
  newXf.setAttribute("fillId", String(fillId));
  newXf.setAttribute("applyFill", "1");
  const newIndex = xfs.length;
  cellXfsEl.appendChild(newXf);
  cellXfsEl.setAttribute("count", String(newIndex + 1));
  cache.set(key, newIndex);
  return newIndex;
}

// Resolves sheet names (e.g. "Binder_1") to their internal zip paths
// (e.g. "xl/worksheets/sheet3.xml") via workbook.xml + its rels file.
// DOMParser never throws on malformed XML — it silently returns a document
// containing a <parsererror> element instead. Catching that explicitly turns
// a silent "nothing got written" failure into a clear, visible error.
function assertParsedOk(doc, label) {
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(`Could not parse ${label} as XML: ${err.textContent.slice(0, 300)}`);
}

async function resolveSheetPaths(zip, sheetNames, parser) {
  const wbXmlStr = await zip.file("xl/workbook.xml").async("string");
  const relsXmlStr = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const wbDoc = parser.parseFromString(wbXmlStr, "application/xml");
  assertParsedOk(wbDoc, "xl/workbook.xml");
  const relsDoc = parser.parseFromString(relsXmlStr, "application/xml");
  assertParsedOk(relsDoc, "xl/_rels/workbook.xml.rels");
  const paths = {};
  const sheetEls = wbDoc.getElementsByTagName("sheet");
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i];
    const name = el.getAttribute("name");
    if (!sheetNames.has(name)) continue;
    const rId = el.getAttribute("r:id");
    const relEls = relsDoc.getElementsByTagName("Relationship");
    let target = null;
    for (let j = 0; j < relEls.length; j++) {
      if (relEls[j].getAttribute("Id") === rId) { target = relEls[j].getAttribute("Target"); break; }
    }
    if (!target) { console.warn(`[write-back] sheet "${name}" has r:id="${rId}" but no matching Relationship was found`); continue; }
    paths[name] = target.startsWith("/") ? target.slice(1) : "xl/" + target;
  }
  return paths;
}

// op541VehicleInfo is keyed by the computed sheet LABEL (e.g. "Unit # 123"),
// shared by every section parsed from that sheet — resolves each labeled
// entry back to the real Excel sheet name (item.sheetName) it belongs to, and
// drops any sheet with no PST name / vehicle # actually filled in.
function buildVehicleWrites(sections, vehicleInfoMap, cellMap) {
  const bySheetName = {};
  sections.forEach(sec => {
    const info = vehicleInfoMap[sec.sheetLabel];
    if (!info || (!info.pstName && !info.vehicleNum)) return;
    const sheetName = sec.items[0]?.sheetName;
    if (!sheetName) return;
    bySheetName[sheetName] = info;
  });
  return Object.entries(bySheetName).map(([sheetName, info]) => ({
    sheetName, pstName: info.pstName, vehicleNum: info.vehicleNum,
    nameCell: cellMap.name, numCell: cellMap.num,
  }));
}

// Builds the row content for a brand-new "Accreditation Specialist Responses"
// sheet — one block per employee (Name/Job Title/Hire Date, then each
// category's items with the specialist's answer/date and comment). This
// replaced an earlier version that patched answers directly into the
// original "Personnel Records"/"Additional Personnel Records" cells: that
// depended on guessed row/column positions in the real template and, in
// practice, exported with none of the specialist's answers actually written.
// A dedicated sheet the app fully controls (rather than reverse-engineered
// coordinates in someone else's template) sidesteps that failure mode
// entirely, while still keeping every employee's own name attached to their
// answers right next to them.
function buildPersonnelResponseSheetRows(slots, items, answers, dates, comments) {
  if (slots.length === 0) return [];
  const categories = ["Personnel File", "Medical File", "FDA File"];
  const rows = [["Accreditation Specialist Responses — Personnel Records Review"], []];

  slots.forEach((slot, idx) => {
    const sid = `${slot.sheetName}|${slot.col}`;
    rows.push([`Employee ${idx + 1}`]);
    rows.push(["Name", slot.name || ""]);
    rows.push(["Job Title", slot.jobTitle || ""]);
    rows.push(["Hire Date", slot.hireDate || ""]);
    rows.push([]);

    categories.forEach(cat => {
      const catItems = items.filter(it => it.category === cat);
      if (catItems.length === 0) return;
      rows.push([cat]);
      rows.push(["Item", "Response", "Comment"]);
      catItems.forEach(item => {
        const key = `${item.key}|${sid}`;
        let value = "";
        if (item.answerType === "yn") {
          const v = answers[key];
          value = v === "yes" ? "Y" : v === "no" ? "N" : v === "na" ? "N/A" : "";
        } else {
          value = dates[key] || "";
        }
        rows.push([item.text, value, comments[item.key] || ""]);
      });
      rows.push([]);
    });
  });

  return rows;
}

// Appends a brand-new worksheet (not part of the original template) to the
// zip: writes its sheetData part, then registers it in the three places
// OOXML requires — [Content_Types].xml, xl/_rels/workbook.xml.rels, and the
// <sheets> list in xl/workbook.xml — so Excel actually recognizes the new
// tab. All new elements use createElementNS/setAttributeNS (never plain
// createElement/setAttribute) for the same reason as everywhere else in this
// file: unnamespaced elements force an xmlns="" override that Excel silently
// fails to parse as real content.
async function addNewWorksheetFromRows(zip, parser, serializer, sheetName, rows) {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  const existingSheetNums = Object.keys(zip.files)
    .map(p => /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(p))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const nextNum = (existingSheetNums.length ? Math.max(...existingSheetNums) : 0) + 1;
  const newPath = `xl/worksheets/sheet${nextNum}.xml`;

  const sheetDoc = parser.parseFromString(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetData></sheetData></worksheet>`,
    "application/xml"
  );
  const sheetDataEl = sheetDoc.getElementsByTagName("sheetData")[0];
  rows.forEach((rowVals, rIdx) => {
    const rowNum = rIdx + 1;
    const rowEl = sheetDoc.createElementNS(NS, "row");
    rowEl.setAttribute("r", String(rowNum));
    (rowVals || []).forEach((val, cIdx) => {
      if (val === undefined || val === null || val === "") return;
      const address = numToColLetters(cIdx + 1) + rowNum;
      const cellEl = sheetDoc.createElementNS(NS, "c");
      cellEl.setAttribute("r", address);
      setInlineStringValue(sheetDoc, cellEl, String(val));
      rowEl.appendChild(cellEl);
    });
    sheetDataEl.appendChild(rowEl);
  });
  zip.file(newPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${serializer.serializeToString(sheetDoc)}`);

  // [Content_Types].xml
  const ctPath = "[Content_Types].xml";
  const ctDoc = parser.parseFromString(await zip.file(ctPath).async("string"), "application/xml");
  assertParsedOk(ctDoc, ctPath);
  const overrideEl = ctDoc.createElementNS(ctDoc.documentElement.namespaceURI, "Override");
  overrideEl.setAttribute("PartName", "/" + newPath);
  overrideEl.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml");
  ctDoc.documentElement.appendChild(overrideEl);
  zip.file(ctPath, serializer.serializeToString(ctDoc));

  // xl/_rels/workbook.xml.rels
  const relsPath = "xl/_rels/workbook.xml.rels";
  const relsDoc = parser.parseFromString(await zip.file(relsPath).async("string"), "application/xml");
  assertParsedOk(relsDoc, relsPath);
  const relEls = relsDoc.getElementsByTagName("Relationship");
  let maxRid = 0;
  for (let i = 0; i < relEls.length; i++) {
    const m = /^rId(\d+)$/.exec(relEls[i].getAttribute("Id"));
    if (m) maxRid = Math.max(maxRid, parseInt(m[1], 10));
  }
  const newRid = `rId${maxRid + 1}`;
  const newRelEl = relsDoc.createElementNS(relsDoc.documentElement.namespaceURI, "Relationship");
  newRelEl.setAttribute("Id", newRid);
  newRelEl.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet");
  newRelEl.setAttribute("Target", `worksheets/sheet${nextNum}.xml`);
  relsDoc.documentElement.appendChild(newRelEl);
  zip.file(relsPath, serializer.serializeToString(relsDoc));

  // xl/workbook.xml
  const wbPath = "xl/workbook.xml";
  const wbDoc = parser.parseFromString(await zip.file(wbPath).async("string"), "application/xml");
  assertParsedOk(wbDoc, wbPath);
  const sheetsEl = wbDoc.getElementsByTagName("sheets")[0];
  const sheetEls = wbDoc.getElementsByTagName("sheet");
  let maxSheetId = 0;
  for (let i = 0; i < sheetEls.length; i++) {
    const sid = parseInt(sheetEls[i].getAttribute("sheetId"), 10);
    if (!isNaN(sid)) maxSheetId = Math.max(maxSheetId, sid);
  }
  const newSheetEl = wbDoc.createElementNS(wbDoc.documentElement.namespaceURI, "sheet");
  newSheetEl.setAttribute("name", sheetName);
  newSheetEl.setAttribute("sheetId", String(maxSheetId + 1));
  newSheetEl.setAttributeNS(R_NS, "r:id", newRid);
  sheetsEl.appendChild(newSheetEl);
  zip.file(wbPath, serializer.serializeToString(wbDoc));
}

// Attaches native Excel cell notes (the classic red-corner-hover kind, not
// the newer "threaded comments") to specific cells on one worksheet. This is
// a legacy, VML-based mechanism with three moving parts per sheet: a
// comments{N}.xml part (the actual text), a vmlDrawing{N}.vml part (draws the
// little popup box), and a <legacyDrawing> element added to the worksheet
// itself pointing at the VML part via that sheet's own _rels file (which may
// not exist yet — printer-settings-only sheets typically don't have one).
// `sheetDoc` is mutated in place (adding <legacyDrawing>); the caller is
// responsible for re-serializing it into the zip afterward.
async function addLegacyCommentsToSheet(zip, parser, serializer, sheetPath, sheetDoc, notes) {
  const SS_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  const nextPartIndex = (prefix, ext) => {
    const nums = Object.keys(zip.files)
      .map(p => new RegExp(`^xl/(?:drawings/)?${prefix}(\\d+)\\.${ext}$`).exec(p))
      .filter(Boolean).map(m => parseInt(m[1], 10));
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };
  const commentsIdx = nextPartIndex("comments", "xml");
  const vmlIdx = nextPartIndex("vmlDrawing", "vml");
  const commentsPath = `xl/comments${commentsIdx}.xml`;
  const vmlPath = `xl/drawings/vmlDrawing${vmlIdx}.vml`;

  // ── comments{N}.xml ──
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<comments xmlns="${SS_NS}"><authors><author>Rotech Survey Prep</author></authors><commentList>` +
    notes.map(n => `<comment ref="${n.address}" authorId="0"><text><r><t>${esc(n.text)}</t></r></text></comment>`).join("") +
    `</commentList></comments>`;
  zip.file(commentsPath, commentsXml);

  // ── vmlDrawing{N}.vml — one v:shape per noted cell ──
  const shapes = notes.map((n, i) => {
    const m = n.address.match(/^([A-Z]+)(\d+)$/);
    const col = colLettersToNum(m[1]) - 1; // 0-indexed, VML convention
    const row = parseInt(m[2], 10) - 1;    // 0-indexed
    return `<v:shape id="_x0000_s${1000 + i}" type="#_x0000_t202" style='position:absolute;margin-left:59pt;margin-top:1pt;width:104pt;height:60pt;z-index:${i + 1};visibility:hidden' fillcolor="#ffffe1" o:insetmode="auto">` +
      `<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>` +
      `<v:textbox style='mso-direction-alt:auto'><div style='text-align:left'></div></v:textbox>` +
      `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/>` +
      `<x:Anchor>${col + 1}, 15, ${row}, 2, ${col + 3}, 15, ${row + 4}, 4</x:Anchor>` +
      `<x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${col}</x:Column></x:ClientData>` +
      `</v:shape>`;
  }).join("");
  const vmlXml = `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>` +
    `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">` +
    `<v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>` +
    shapes + `</xml>`;
  zip.file(vmlPath, vmlXml);

  // ── the sheet's own _rels file — may not exist yet ──
  const sheetFileName = sheetPath.split("/").pop(); // e.g. "sheet2.xml"
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFileName}.rels`;
  let relsDoc;
  const existingRelsStr = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath).async("string") : null;
  if (existingRelsStr) {
    relsDoc = parser.parseFromString(existingRelsStr, "application/xml");
    assertParsedOk(relsDoc, sheetRelsPath);
  } else {
    relsDoc = parser.parseFromString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"></Relationships>`, "application/xml");
  }
  const relEls = relsDoc.getElementsByTagName("Relationship");
  let maxRid = 0;
  for (let i = 0; i < relEls.length; i++) {
    const m = /^rId(\d+)$/.exec(relEls[i].getAttribute("Id"));
    if (m) maxRid = Math.max(maxRid, parseInt(m[1], 10));
  }
  const relsRoot = relsDoc.documentElement;
  const commentsRid = `rId${maxRid + 1}`;
  const vmlRid = `rId${maxRid + 2}`;
  const commentsRel = relsDoc.createElementNS(PKG_REL_NS, "Relationship");
  commentsRel.setAttribute("Id", commentsRid);
  commentsRel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments");
  commentsRel.setAttribute("Target", `../comments${commentsIdx}.xml`);
  relsRoot.appendChild(commentsRel);
  const vmlRel = relsDoc.createElementNS(PKG_REL_NS, "Relationship");
  vmlRel.setAttribute("Id", vmlRid);
  vmlRel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing");
  vmlRel.setAttribute("Target", `../drawings/vmlDrawing${vmlIdx}.vml`);
  relsRoot.appendChild(vmlRel);
  zip.file(sheetRelsPath, serializer.serializeToString(relsDoc));

  // ── <legacyDrawing> on the worksheet itself, referencing the VML part ──
  // Must come after everything else in CT_Worksheet's element sequence — the
  // safest legal position is appended last, unless an <extLst> is present,
  // which must stay the final child.
  const extLst = sheetDoc.getElementsByTagName("extLst")[0];
  const legacyDrawingEl = sheetDoc.createElementNS(SS_NS, "legacyDrawing");
  legacyDrawingEl.setAttributeNS(R_NS, "r:id", vmlRid);
  if (extLst) sheetDoc.documentElement.insertBefore(legacyDrawingEl, extLst);
  else sheetDoc.documentElement.appendChild(legacyDrawingEl);

  // ── [Content_Types].xml — register the new comments part + the vml extension ──
  const ctPath = "[Content_Types].xml";
  const ctDoc = parser.parseFromString(await zip.file(ctPath).async("string"), "application/xml");
  assertParsedOk(ctDoc, ctPath);
  const hasVmlDefault = Array.from(ctDoc.getElementsByTagName("Default")).some(el => el.getAttribute("Extension") === "vml");
  if (!hasVmlDefault) {
    const vmlDefault = ctDoc.createElementNS(ctDoc.documentElement.namespaceURI, "Default");
    vmlDefault.setAttribute("Extension", "vml");
    vmlDefault.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.vmlDrawing");
    ctDoc.documentElement.appendChild(vmlDefault);
  }
  const commentsOverride = ctDoc.createElementNS(ctDoc.documentElement.namespaceURI, "Override");
  commentsOverride.setAttribute("PartName", "/" + commentsPath);
  commentsOverride.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml");
  ctDoc.documentElement.appendChild(commentsOverride);
  zip.file(ctPath, serializer.serializeToString(ctDoc));
}

// Writes on-site Y/N/N/A answers + comments into the ORIGINAL uploaded
// workbook by patching only the specific cells that changed (see comment
// block above). Items without a known write target (item.cOnSite == null)
// are skipped rather than guessed at. vehicleWrites additionally writes PST Name
// into B4 and Vehicle # into B5 of each vehicle sheet that has one set.
// personnelResponseRows (if non-empty) gets appended as a brand-new
// "Accreditation Specialist Responses" sheet rather than patched into the
// original Personnel Records cells — see addNewWorksheetFromRows above.
async function writeBackToOriginalWorkbook(bufferBytes, sections, states, comments, vehicleWrites = [], personnelResponseRows = [], jc427Writes = []) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bufferBytes.buffer ?? bufferBytes);

  const neededSheetNames = new Set();
  sections.forEach(sec => sec.items.forEach(item => { if (item.cOnSite != null) neededSheetNames.add(item.sheetName); }));
  vehicleWrites.forEach(vw => neededSheetNames.add(vw.sheetName));
  jc427Writes.forEach(w => neededSheetNames.add(w.sheetName));

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const sheetPaths = await resolveSheetPaths(zip, neededSheetNames, parser);
  const docs = {}; // sheet path -> parsed Document (one per sheet, reused across items)

  for (const name of neededSheetNames) {
    const path = sheetPaths[name];
    if (!path) { console.warn(`[write-back] no resolved path for sheet "${name}" — its items will be skipped`); continue; }
    if (docs[path]) continue;
    const xmlStr = await zip.file(path).async("string");
    if (!xmlStr) { console.warn(`[write-back] zip has no entry at "${path}" for sheet "${name}"`); continue; }
    const doc = parser.parseFromString(xmlStr, "application/xml");
    assertParsedOk(doc, path);
    docs[path] = doc;
  }

  let cellsWritten = 0;
  sections.forEach(sec => sec.items.forEach(item => {
    if (item.cOnSite == null) return;
    const path = sheetPaths[item.sheetName];
    const doc = path && docs[path];
    if (!doc) return;
    const sheetDataEl = doc.getElementsByTagName("sheetData")[0];
    if (!sheetDataEl) { console.warn(`[write-back] no <sheetData> found in ${path}`); return; }

    const rowNum = item.rowIdx + 1;
    const state = states[item.key];
    const onSiteVal = state === "yes" ? "Y" : state === "no" ? "N" : state === "na" ? "N/A" : "";
    const comment = comments[item.key] || "";

    if (onSiteVal) {
      const colNum = item.cOnSite + 1;
      const address = numToColLetters(colNum) + rowNum;
      const rowEl = getOrCreateRow(doc, sheetDataEl, rowNum);
      setInlineStringValue(doc, getOrCreateCell(doc, rowEl, address, colNum), onSiteVal);
      cellsWritten++;
    }
    if (comment) {
      const colNum = item.cComments + 1;
      const address = numToColLetters(colNum) + rowNum;
      const rowEl = getOrCreateRow(doc, sheetDataEl, rowNum);
      setInlineStringValue(doc, getOrCreateCell(doc, rowEl, address, colNum), comment);
      cellsWritten++;
    }
  }));

  vehicleWrites.forEach(vw => {
    const path = sheetPaths[vw.sheetName];
    const doc = path && docs[path];
    if (!doc) return;
    const sheetDataEl = doc.getElementsByTagName("sheetData")[0];
    if (!sheetDataEl) return;
    if (vw.pstName) {
      const { row, col } = vw.nameCell;
      setInlineStringValue(doc, getOrCreateCell(doc, getOrCreateRow(doc, sheetDataEl, row), numToColLetters(col) + row, col), vw.pstName);
      cellsWritten++;
    }
    if (vw.vehicleNum) {
      const { row, col } = vw.numCell;
      setInlineStringValue(doc, getOrCreateCell(doc, getOrCreateRow(doc, sheetDataEl, row), numToColLetters(col) + row, col), vw.vehicleNum);
      cellsWritten++;
    }
  });

  // JC 427 competency dates can carry a baked-in highlight color (see
  // buildJC427Writes) — load+mutate styles.xml lazily, only if at least one
  // write actually needs it, since this is the only write path that ever
  // touches cell styling.
  const needsStyles = jc427Writes.some(w => w.style);
  let stylesDoc = null;
  const highlightFillIds = {};
  const highlightXfCache = new Map();
  if (needsStyles) {
    const stylesXmlStr = await zip.file("xl/styles.xml").async("string");
    stylesDoc = parser.parseFromString(stylesXmlStr, "application/xml");
    assertParsedOk(stylesDoc, "xl/styles.xml");
    highlightFillIds.red = ensureFill(stylesDoc, "FFEBEE");
    highlightFillIds.yellow = ensureFill(stylesDoc, "FFF9C4");
  }

  // Cell notes (native Excel red-corner comments) collected per sheet here,
  // then attached once at the end via addLegacyCommentsToSheet — that call
  // mutates each sheet's `doc` further (adding a <legacyDrawing> element), so
  // it has to happen before docs are serialized into the zip below.
  const notesBySheet = {};

  jc427Writes.forEach(w => {
    const path = sheetPaths[w.sheetName];
    const doc = path && docs[path];
    if (!doc) return;
    const sheetDataEl = doc.getElementsByTagName("sheetData")[0];
    if (!sheetDataEl) return;
    const rowNum = w.rowIdx + 1;
    const colNum = w.col + 1;
    const address = numToColLetters(colNum) + rowNum;
    const cellEl = getOrCreateCell(doc, getOrCreateRow(doc, sheetDataEl, rowNum), address, colNum);
    if (w.style && stylesDoc) {
      const baseStyleIndex = parseInt(cellEl.getAttribute("s"), 10) || 0;
      const newXfIndex = ensureHighlightCellXf(stylesDoc, baseStyleIndex, highlightFillIds[w.style], highlightXfCache);
      cellEl.setAttribute("s", String(newXfIndex));
    }
    setInlineStringValue(doc, cellEl, w.value);
    cellsWritten++;
    if (w.note) {
      (notesBySheet[w.sheetName] ??= []).push({ address, text: w.note });
    }
  });

  for (const [sheetName, notes] of Object.entries(notesBySheet)) {
    const path = sheetPaths[sheetName];
    const doc = docs[path];
    if (!doc || notes.length === 0) continue;
    await addLegacyCommentsToSheet(zip, parser, serializer, path, doc, notes);
  }

  Object.entries(docs).forEach(([path, doc]) => {
    const serialized = serializer.serializeToString(doc);
    const xml = serialized.startsWith("<?xml") ? serialized : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${serialized}`;
    zip.file(path, xml);
  });

  if (stylesDoc) {
    zip.file("xl/styles.xml", serializer.serializeToString(stylesDoc));
  }

  let sheetsWritten = Object.keys(docs).length;
  if (personnelResponseRows.length > 0) {
    await addNewWorksheetFromRows(zip, parser, serializer, "Accreditation Specialist Responses", personnelResponseRows);
    cellsWritten += personnelResponseRows.reduce((n, r) => n + (r || []).filter(v => v !== undefined && v !== null && v !== "").length, 0);
    sheetsWritten += 1;
  }

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return { buffer, cellsWritten, sheetsWritten };
}

// Parses "Personnel Records" / "Additional Personnel Records" sheets — a
// fundamentally different shape from every other OP 541T sheet: employees are
// COLUMNS (C-L, 0-indexed 2-11; up to 10 per sheet) rather than rows.
// Row positions are hardcoded from the real template (same convention as the
// Facility/Vehicle hRow constants above) since this shape doesn't fit the
// generic item-per-row parsing used everywhere else. Personnel File and
// Medical File items are Y/N per employee; FDA File items are a date per
// employee instead (validity is colored by the file's own conditional
// formatting — this app doesn't reimplement that ruleset, just captures and
// writes back whatever's entered).
//
// Only the employee Name is read from the uploaded file — Job Title, Hire
// Date, and every Personnel/Medical/FDA answer are entered fresh by the
// specialist in the app (per explicit request: there's no need to see
// whatever's already on file for a location, only who's already listed).
// None of the specialist-entered fields are patched back into these sheets'
// own cells on export — see buildPersonnelResponseSheetRows below for why.
const PERSONNEL_EMPLOYEE_COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // C-L
const PERSONNEL_COMMENTS_COL = 13; // N
const PERSONNEL_NAME_ROW_IDX = 4;  // row 5
const PERSONNEL_ITEM_ROWS = [
  ...[9, 10, 11, 12, 13, 14, 15, 16].map(rowIdx => ({ rowIdx, category: "Personnel File", answerType: "yn" })),
  { rowIdx: 18, category: "Medical File", answerType: "yn" },
  ...[20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(rowIdx => ({ rowIdx, category: "FDA File", answerType: "date" })),
];

function parsePersonnelSheet(rows, sheetName) {
  const nameRow = rows[PERSONNEL_NAME_ROW_IDX] || [];

  const slots = PERSONNEL_EMPLOYEE_COLS
    .map(col => ({
      sheetName, col,
      name: String(nameRow[col] || "").trim(),
      jobTitle: "",
      hireDate: "",
    }))
    .filter(s => s.name);

  const items = PERSONNEL_ITEM_ROWS.map(({ rowIdx, category, answerType }, n) => {
    const row = rows[rowIdx] || [];
    return {
      key: `personnel-${n}`,
      rowIdx,
      category,
      answerType,
      text: String(row[0] || "").trim(),
      comment: String(row[PERSONNEL_COMMENTS_COL] || "").trim(),
    };
  }).filter(it => it.text);

  return { slots, items };
}

async function writeTrendData(visitId, meta, locations, sections, states, comments, op541Sections, op541States, op541Comments, op541tSections, op541tStates, op541tComments, tabComments, personnelSlots = [], personnelItems = [], personnelAnswers = {}, personnelComments = {}, jc427Slots = [], jc427Items = [], jc427Answers = {}, jc427Dates = {}, jc427Comments = {}) {
  try {
    // Remove any prior records for this visitId so re-saves don't duplicate
    const existing = loadTrendData().filter(r => r.visitId !== visitId);
    const records = [];
    const locInfo = findLocation(meta.lawson || "", locations);
    const base = {
      visitId,
      lawson: meta.lawson || "",
      location: meta.location || "Unknown",
      city: meta.city || locInfo?.city || "",
      date: meta.date || "",
      specialist: meta.specialist || "",
      region: locInfo?.region || "",
      areaCode: locInfo?.areaCode || "",
      areaManager: locInfo?.areaManager || "Unassigned",
    };

    // Regular checklist sections
    SECTIONS.forEach((sec, si) => {
      sec.items.forEach((item, ii) => {
        const key = `${si}-${ii}`;
        const s = states[key];
        if (s === "no") {
          records.push({ ...base, section: sec.label, formRef: sec.ref, itemText: item.text, comment: comments[key] || "", visitType: "checklist" });
        }
      });
      // Tab-level comments for PST / PAP / Vent
      if (["pstSetup", "pstMaintenance", "clinician", "vent"].includes(sec.id) && tabComments[sec.id]) {
        records.push({ ...base, section: sec.label, formRef: sec.ref, itemText: "Visit Notes", comment: tabComments[sec.id], visitType: "note" });
      }
    });

    // OP 541
    op541Sections.forEach(sec => {
      sec.items.forEach(item => {
        if (op541States[item.key] === "no") {
          records.push({ ...base, section: `OP 541 — ${sec.sheetLabel}`, formRef: "OP 541", itemText: item.text, comment: op541Comments[item.key] || "", visitType: "op541" });
        }
      });
    });

    // OP 541T
    op541tSections.forEach(sec => {
      sec.items.forEach(item => {
        if (op541tStates[item.key] === "no") {
          records.push({ ...base, section: `OP 541T — ${sec.sheetLabel}`, formRef: "OP 541T", itemText: item.text, comment: op541tComments[item.key] || "", visitType: "op541t" });
        }
      });
    });

    // Personnel Records Review — Personnel/Medical File "No" answers, one
    // record per (item, employee). FDA File dates are excluded (no in-app
    // validity ruleset to judge them by — see buildChecklistItems).
    personnelItems.forEach(item => {
      if (item.answerType !== "yn") return;
      personnelSlots.forEach(slot => {
        const key = `${item.key}|${slot.sheetName}|${slot.col}`;
        if (personnelAnswers[key] === "no") {
          records.push({ ...base, section: `OP 541T — Personnel Records (${slot.name})`, formRef: "OP 541T Personnel Records", itemText: item.text, comment: personnelComments[item.key] || "", visitType: "op541t" });
        }
      });
    });

    // JC 427 — "No" answers, plus expired/expiring-soon competency dates
    // (real 3-year/6-month ruleset, unlike OP 541T's FDA dates).
    jc427Items.forEach(item => {
      jc427Slots.forEach(slot => {
        const key = `${item.id}|${slot.sheetName}|${slot.col}`;
        const who = slot.name || `Employee (col ${slot.col})`;
        if (item.answerType === "yn") {
          if (jc427Answers[key] === "no") {
            records.push({ ...base, section: `JC 427 — Personnel Records (${who})`, formRef: "JC 427 Personnel Records", itemText: item.text, comment: jc427Comments[item.id] || "", visitType: "jc427" });
          }
        } else {
          const status = getJC427ExpirationStatus(usDateToIso(jc427Dates[key] || ""));
          if (status === "red" || status === "yellow") {
            const label = status === "red" ? "EXPIRED" : "Expires within 6 months";
            records.push({ ...base, section: `JC 427 — Personnel Records (${who})`, formRef: "JC 427 Personnel Records", itemText: `${item.text} — ${label}`, comment: jc427Comments[item.id] || "", visitType: "jc427" });
          }
        }
      });
    });

    // Write a summary record even if no issues (for clean visit tracking)
    if (records.length === 0) {
      records.push({ ...base, section: "_summary", formRef: "", itemText: "_clean", comment: "", visitType: "summary" });
    }

    // Write to localStorage as offline backup
    localStorage.setItem(TREND_KEY, JSON.stringify([...existing, ...records].slice(-2000)));

    // Write to Firestore for company-wide visibility (one doc per visit)
    await setDoc(doc(db, TRENDS_COLLECTION, visitId), {
      visitId,
      finalizedAt: new Date().toISOString(),
      records,
    });
  } catch (e) {
    console.error("writeTrendData error:", e);
    throw e; // re-throw so finalizeVisit can surface the error
  }
}

async function deleteTrendVisit(visitId) {
  try {
    localStorage.setItem(TREND_KEY, JSON.stringify(loadTrendData().filter(r => r.visitId !== visitId)));
    await deleteDoc(doc(db, TRENDS_COLLECTION, visitId));
  } catch {}
}

// ─── JC 427 — Personnel Records Review ──────────────────────────────────────
// Item content ported from the "Semi Annual" app's JC427Form.jsx (repo
// clandtroop/rotech-semiannual) — that app submits straight to Firestore with
// no spreadsheet involved; this tab adapts the same content to this app's
// bundled-template + write-back pattern instead. The real blank template
// ships with this app (public/JC427_Template.xlsx) rather than being
// uploaded per visit, since there's no location self-audit data in it to
// compare against — nothing an upload would add over a bundled copy. The
// sheet's own category banner text differs slightly from that app's category
// labels (the sheet calls the first block "Personnel Record", the app calls
// it "Onboarding Documents") — banner text is only used below to locate each
// section in the template; the app's own labels are what's shown in the UI.
// Two items are DATE fields here even though JC427Form.jsx codes them as a
// plain Complete/Incomplete/N/A select — confirmed with the user against the
// real spreadsheet's own row text ("date only; blank if NA") and, for the
// N95 item, that same app's own instructions text (which contradicts its own
// form code on this one item).
const JC427_TEMPLATE_PATH = "/rotech-survey-prep/JC427_Template.xlsx";
const JC427_PERSONNEL_SECTIONS = [
  { category: "Onboarding Documents", sheetBanner: "personnel record", items: [
    { id: "welcome_email", text: "Welcome to Rotech (Okay to Hire) Email", note: "Applicable to employees hired after 2017" },
    { id: "job_description", text: "Job Description" },
    { id: "general_orientation", text: "General Orientation (HR 548)" },
    { id: "professional_licensure", text: "Professional Licensure" },
    { id: "drivers_license", text: "Driver's License" },
    { id: "policy_acknowledgment", text: "Policy Acknowledgment / Computer Password Confidentiality" },
  ]},
  { category: "Training", sheetBanner: "training", items: [
    { id: "mandatory_annual", text: "Mandatory Annual In-Services (SE 800)" },
    { id: "storage_distribution", text: "Storage and Distribution Training (FDA 019)", answerType: "date", note: "Date only — initial & every 3 years" },
    { id: "manufacturing_facility", text: "Manufacturing Facility Orientation (FDA 021)", note: "Only for locations manufacturing liquid oxygen (curbside filling)" },
    { id: "hazard_communication", text: "RM 1234 Hazard Communication Program Training", note: "Record with RM 1238 PPE Hazard Assessment attached (job description specific)" },
  ]},
  { category: "Performance Review", sheetBanner: "performance review", items: [
    { id: "employee_review", text: "Employee Performance Review" },
  ]},
  { category: "Medical Record", sheetBanner: "medical record", items: [
    { id: "hepatitis_b", text: "Hepatitis B Test or OP 515 Hepatitis B Vaccination Statement" },
    { id: "tb_test", text: "TB Test/Risk Assessment" },
    { id: "n95_fit_test", text: "Annual N95 Mask Fit Testing", answerType: "date", note: "For \"at risk\" employees — date only, blank if N/A" },
    { id: "respirator_clearance", text: "Confirmation of Medical Clearance for Respirator Use from 3M", note: "For initial fit testing after 2/1/2022" },
  ]},
];

const JC427_NON_CLINICAL_COMPETENCIES = {
  category: "Non-Clinical Competency Assessments", sheetBanner: "non-clinical competency assessments",
  comment: "Employees MUST complete online competencies, pertaining to their job responsibilities, on Docebo: My Training Not Completed - or use search tool. Completed Competency Assessment (SE form) and certificate are to be placed in employee file.",
  items: [
    { id: "aspirator", text: "Aspirator / Suction (SE 816)" },
    { id: "cpm", text: "Continuous Passive Motion - CPM (SE 904)" },
    { id: "pap_device", text: "PAP Device (SE 811)" },
    { id: "pap_mask", text: "PAP Mask Fitting (SE 851)" },
    { id: "high_pressure_cylinder", text: "High Pressure Cylinder (SE 805)" },
    { id: "hospital_bed", text: "Hospital Bed & Trapeze (SE 807)" },
    { id: "liquid_oxygen", text: "Liquid Oxygen (SE 809)" },
    { id: "lymphedema_pump", text: "Lymphedema Pump (SE 856)" },
    { id: "nebulizer_nc", text: "Nebulizer (SE 812)" },
    { id: "negative_pressure_wound", text: "Negative Pressure Wound Care System (SE 903)" },
    { id: "oxygen_analyzer", text: "Oxygen Analyzer (SE 801)" },
    { id: "oxygen_concentrator", text: "Oxygen Concentrator (SE 803)" },
    { id: "oxygen_concentrator_maintenance", text: "Oxygen Concentrator Maintenance", note: "Requires certificate only" },
    { id: "oxygen_conserving_device_nc", text: "Oxygen Conserving Device (SE 814)" },
    { id: "patient_lift", text: "Patient Lift (SE 818)" },
    { id: "field_poc_repair", text: "Field POC Repair & Maintenance Competency", note: "Requires certificate only" },
    { id: "power_wheelchair", text: "Power Wheelchair (SE 862)" },
    { id: "scooter", text: "Scooter (SE 863)" },
    { id: "warehouse_equipment_cleaning", text: "Warehouse Equipment Cleaning (SE 855)" },
    { id: "wheelchair_nc", text: "Wheelchair (SE 824)" },
  ],
};

const JC427_CLINICAL_COMPETENCIES = {
  category: "Clinical Competency Assessments", sheetBanner: "clinical competency assessment (cca) online trainings:",
  comment: "Clinicians MUST complete online competencies, pertaining to their job responsibilities, on Docebo: My Training Not Completed - or use search tool. Completed certificates are to be placed in employee file.",
  items: [
    { id: "afflovest", text: "AffloVest" },
    { id: "airvo2", text: "Airvo 2" },
    { id: "astral_ventilator", text: "Astral Ventilator" },
    { id: "attention_to_detail", text: "Attention to Detail" },
    { id: "breas_vivo", text: "Breas VIVO 45LS/50 Ventilator" },
    { id: "cough_assist", text: "Cough Assist (BiWaze)" },
    { id: "cpap_bipap", text: "CPAP & BIPAP" },
    { id: "infant_monitor", text: "Infant Monitor" },
    { id: "invasive_ventilator", text: "Invasive Ventilator" },
    { id: "ltv_ventilator", text: "LTV Ventilator" },
    { id: "luisa_ventilator", text: "Luisa Ventilator" },
    { id: "mpv", text: "Mouthpiece Ventilation (MPV)" },
    { id: "nebulizer_c", text: "Nebulizer" },
    { id: "oxygen_c", text: "Oxygen" },
    { id: "oxygen_conserving_device_c", text: "Oxygen Conserving Device" },
    { id: "pediatric_ventilator", text: "Pediatric Ventilator Management" },
    { id: "pulse_oximetry", text: "Pulse Oximetry" },
    { id: "respiratory_assist_device", text: "Respiratory Assist Device" },
    { id: "trilogy_evo", text: "Trilogy EVO Ventilator" },
    { id: "vocsn_ventilator", text: "VOCSN Ventilator (based on location)" },
    { id: "virtual_ventilator_visit", text: "Virtual Ventilator Visit" },
    { id: "vivo2_bipap_st", text: "VIVO2 - BiPAP ST" },
    { id: "other1", text: "Other", editableLabel: true },
    { id: "other2", text: "Other", editableLabel: true },
  ],
};

// Flat canonical item list, in real-sheet order, each tagged with its
// category/sheetBanner (for locating rows) and answerType ("yn" default).
const JC427_ALL_ITEMS = [
  ...JC427_PERSONNEL_SECTIONS.flatMap(sec => sec.items.map(it => ({ ...it, category: sec.category, sheetBanner: sec.sheetBanner, answerType: it.answerType || "yn" }))),
  ...JC427_NON_CLINICAL_COMPETENCIES.items.map(it => ({ ...it, category: JC427_NON_CLINICAL_COMPETENCIES.category, sheetBanner: JC427_NON_CLINICAL_COMPETENCIES.sheetBanner, answerType: "date" })),
  ...JC427_CLINICAL_COMPETENCIES.items.map(it => ({ ...it, category: JC427_CLINICAL_COMPETENCIES.category, sheetBanner: JC427_CLINICAL_COMPETENCIES.sheetBanner, answerType: "date" })),
];

const JC427_CATEGORY_ORDER = ["Onboarding Documents", "Training", "Performance Review", "Medical Record", "Non-Clinical Competency Assessments", "Clinical Competency Assessments"];

// Reference-only instructions, shown in a modal — ported verbatim.
const JC427_INSTRUCTIONS = [
  { title: "Welcome to Rotech (Okay to Hire) Email (applicable to employees hired after 2017)", body: "Must have a copy of \"Okay to hire\" email. Check LCM and AM email.\n\nIf email cannot be located:\n- Check ICIMS\n- Search by Requisition the employee was hired under\n- Email (may have to go to \"More\")\n- Shares (these are emails that have been sent to hiring managers)\n- Look for \"Cleared for hire\" or \"Welcome\" email - print email for employee file\n\nIf email cannot be located in ICIMS, answer \"N\"." },
  { title: "Job Description", body: "Print from ICIMS." },
  { title: "Printing New Hire Documents from ICIMS", body: "1. Click on the Employee\n2. Click on Forms\n3. Click on Download - two boxes pop up with arrows in between them." },
  { title: "General Orientation (HR 548)", body: "Review all policies on HR 548 with employee. Date and initial policies/processes as they are reviewed. Once completed, employee and manager must sign and date." },
  { title: "Professional Licensure", body: "Must have copy of current license for all clinicians." },
  { title: "Driver's License", body: "Required for ALL location employees at time of hire and every 3 years." },
  { title: "Policy Acknowledgment / Computer Password Confidentiality", body: "Print from ICIMS." },
  { title: "Mandatory Annual In-Services (SE 800)", body: "SE 800 is required annually for all employees." },
  { title: "Storage and Distribution Training (FDA 019)", body: "ENTER DATE ONLY (Initial & every 3 years). Required for ALL location employees at time of hire and every 3 years." },
  { title: "Manufacturing Facility Orientation (FDA 021)", body: "Only for those locations manufacturing liquid oxygen (curbside filling)." },
  { title: "RM 1234 Hazard Communication Program Training", body: "Record with RM 1238 PPE Hazard Assessment attached (job description specific)." },
  { title: "Employee Performance Review", body: "Print employee reviews. Be sure employee has signed off on review (green check mark on bottom of last page)." },
  { title: "Hepatitis B Test or OP 515 Hepatitis B Vaccination Statement", body: "Print from ICIMS - If employee accepts, must have proof of vaccination. If employee no longer wants vaccine, a new form (OP 515) must be signed, refusing the vaccine series.\n\nMEDICAL INFORMATION MUST BE KEPT IN SEPARATE FILE." },
  { title: "TB Test / Risk Assessment", body: "KY employees: TB test and risk assessment at hire & annually. Complete KY 641 annually.\nIL, MD, NC and PA employees: TB test at hire only.\nWA employees: TB test and risk assessment at hire & annually. Complete WA 641 annually." },
  { title: "Annual N95 Mask Fit Testing", body: "Required for all \"at risk\" employees (PST, CST and RT) at hire and annually. Date only; leave blank if N/A." },
  { title: "Confirmation of Medical Clearance for Respirator Use (3M)", body: "Medical Clearance documentation is required prior to fit testing (for initial fit testing after 2/1/2022)." },
  { title: "Non-Clinical Competency Assessments", body: "Employees MUST complete online competencies, pertaining to their job responsibilities, on Docebo: My Training Not Completed - or use search tool. Completed Competency Assessment (SE form) and certificate are to be placed in employee file.\n\nNON-CLINICAL COMPETENCIES ARE NOT REQUIRED FOR CLINICIANS." },
  { title: "Clinical Competency Assessment (CCA) Online Trainings", body: "Clinicians MUST complete online competencies, pertaining to their job responsibilities, on Docebo: My Training Not Completed - or use search tool. Completed certificates are to be placed in employee file." },
  { title: "File Requirements", body: "ALL employees MUST have a Personnel file and a SEPARATE Medical File.\nEmployees transfilling or curbside filling liquid oxygen MUST have a SEPARATE FDA File." },
];

// Competency/date items are valid for 3 years from the entered date, with a
// 6-month "expiring soon" warning window — ported from the Semi Annual app's
// getExpirationStatus. Returns null (no date entered), "red" (expired),
// "yellow" (expiring within 6 months), or "green" (current).
function getJC427ExpirationStatus(dateStr) {
  if (!dateStr) return null;
  const entered = new Date(`${dateStr}T00:00:00`);
  if (isNaN(entered.getTime())) return null;
  const expiration = new Date(entered);
  expiration.setFullYear(expiration.getFullYear() + 3);
  const warningStart = new Date(expiration);
  warningStart.setMonth(warningStart.getMonth() - 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today > expiration) return "red";
  if (today >= warningStart) return "yellow";
  return "green";
}

// Parses the real JC 427 "PERSONNEL RECORDS REVIEW" sheet by locating known
// label/category text rather than hardcoded row numbers — row positions
// weren't certain from a PDF render the way they were for OP 541T's real XML,
// so each item's row is found by matching its exact text. Column layout is
// confirmed, though: A = item label, B = a blank bordered spacer (no header
// text), employee slots start at C, ending wherever "Total" is found in the
// header row right after the first ("Personnel Record") banner. If a
// category banner or an item's exact text isn't found, that section/item is
// skipped rather than guessed at.
function parseJC427Sheet(rows, sheetName) {
  const norm = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

  let employeeNameRow = -1, jobTitleRow = -1, hireDateRow = -1;
  let totalCol = -1, commentsCol = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const a = norm(row[0]);
    if (a === "employee" && employeeNameRow === -1) employeeNameRow = r;
    if (a === "job title" && jobTitleRow === -1) jobTitleRow = r;
    if (a === "hire date" && hireDateRow === -1) hireDateRow = r;
    for (let c = 1; c < row.length; c++) {
      const v = norm(row[c]);
      if (v === "total" && totalCol === -1) totalCol = c;
      if (v === "comments" && commentsCol === -1) commentsCol = c;
    }
  }
  if (employeeNameRow === -1 || totalCol === -1) {
    return { ok: false, slots: [], items: [] };
  }

  // Column A is the item label, column B is a blank bordered spacer (no
  // header text of its own) — confirmed against the real file — so employee
  // slots start at column C (0-indexed 2), not immediately after the label.
  const employeeCols = [];
  for (let c = 2; c < totalCol; c++) employeeCols.push(c);

  const nameRow = rows[employeeNameRow] || [];
  const slots = employeeCols
    .map(col => ({ sheetName, col, name: String(nameRow[col] || "").trim(), jobTitle: "", hireDate: "" }))
    .filter(s => s.name);

  // Locate each category's banner row (first match only, in document order).
  const categoryBanners = [...new Set(JC427_ALL_ITEMS.map(it => it.sheetBanner))];
  const bannerRow = {};
  categoryBanners.forEach(banner => {
    for (let r = 0; r < rows.length; r++) {
      if (norm((rows[r] || [])[0]).startsWith(banner)) { bannerRow[banner] = r; break; }
    }
  });

  const items = [];
  categoryBanners.forEach((banner, bi) => {
    const startRow = bannerRow[banner];
    if (startRow === undefined) return; // section not found in this file
    const laterRows = categoryBanners.slice(bi + 1).map(b => bannerRow[b]).filter(r => r !== undefined);
    const endRow = laterRows.length ? Math.min(...laterRows) : rows.length;
    let cursor = startRow + 1;
    JC427_ALL_ITEMS.filter(it => it.sheetBanner === banner).forEach(it => {
      let rowIdx = -1;
      for (let r = cursor; r < endRow; r++) {
        if (norm((rows[r] || [])[0]).startsWith(norm(it.text))) { rowIdx = r; break; }
      }
      if (rowIdx === -1) return; // item text not found — skip rather than guess
      items.push({ ...it, rowIdx, comment: String((rows[rowIdx] || [])[commentsCol] ?? "").trim() });
      cursor = rowIdx + 1;
    });
  });

  return { ok: true, slots, items, employeeNameRow, jobTitleRow, hireDateRow, commentsCol, employeeCols };
}

// Builds the flat list of cell writes for JC 427 — mirrors buildVehicleWrites/
// the old personnel write-back: Name/Job Title/Hire Date per slot's column,
// each item's answer (Y/N/N/A, or a date string) per (item, employee), and
// each item's comment (shared across employees, one Comments column per row).
// Competency/date answers additionally carry a `style` ("red"/"yellow"/null)
// baked in from getJC427ExpirationStatus at export time — a snapshot of what
// the specialist saw color-coded in the app during this visit, not a live
// formula (dates are stored as plain text, and this app has been burned by
// conditional-formatting complexity before). Any answer cell whose item has
// a comment also carries a `note` — the same shared comment text as a native
// Excel cell note (red-corner hover), in addition to the plain-text Comments
// column write below.
function buildJC427Writes(slots, items, answers, dates, comments, meta) {
  const writes = [];
  const sheetNames = [...new Set(slots.map(s => s.sheetName))];

  slots.forEach(slot => {
    if (slot.name) writes.push({ sheetName: slot.sheetName, rowIdx: meta.employeeNameRow, col: slot.col, value: slot.name });
    if (slot.jobTitle && meta.jobTitleRow != null) writes.push({ sheetName: slot.sheetName, rowIdx: meta.jobTitleRow, col: slot.col, value: slot.jobTitle });
    if (slot.hireDate && meta.hireDateRow != null) writes.push({ sheetName: slot.sheetName, rowIdx: meta.hireDateRow, col: slot.col, value: slot.hireDate });
  });

  items.forEach(item => {
    const commentVal = (comments[item.id] || "").trim();
    slots.forEach(slot => {
      const key = `${item.id}|${slot.sheetName}|${slot.col}`;
      if (item.answerType === "yn") {
        const val = answers[key];
        const text = val === "yes" ? "Y" : val === "no" ? "N" : val === "na" ? "N/A" : "";
        if (text) writes.push({ sheetName: slot.sheetName, rowIdx: item.rowIdx, col: slot.col, value: text, note: commentVal || null });
      } else {
        const val = (dates[key] || "").trim();
        if (val) {
          const status = getJC427ExpirationStatus(usDateToIso(val));
          writes.push({
            sheetName: slot.sheetName, rowIdx: item.rowIdx, col: slot.col, value: val,
            style: (status === "red" || status === "yellow") ? status : null,
            note: commentVal || null,
          });
        }
      }
    });
    if (commentVal && meta.commentsCol != null) {
      sheetNames.forEach(sheetName => {
        writes.push({ sheetName, rowIdx: item.rowIdx, col: meta.commentsCol, value: commentVal });
      });
    }
  });

  return writes;
}

const SECTIONS = [
  {
    id: "morning", label: "Morning Meeting Binder", ref: "Binder 1 · OP 541 & OP 840",
    items: [
      { text: "Policy 1.1.25 Morning Meetings present" },
      { text: "OP 843 Morning Meeting Checklist current and complete" },
      { text: "OP 543 Morning Meeting Attendance Sheet on file" },
      { text: "OP 519 Targeted Surveillance Log (current log) present" },
      { text: "Separate OP 519 Employee Targeted Surveillance Log saved on LCM computer (confidential)", note: "Must be kept confidential on LCM computer, not in binder" },
    ]
  },
  {
    id: "inservice", label: "In-Service Binder", ref: "Binder 2 · OP 541 & OP 840",
    items: [
      { text: "Policy 1.1.21 Educational In-Services present" },
      { text: "OP 520 In-Service Attendance Record current" },
      { text: 'Quarterly "Safety Matters" newsletter filed' },
      { text: "Monthly safety meeting documentation present" },
      { text: "Annual policy review completed and filed" },
      { text: "Other staff education matters documented" },
    ]
  },
  {
    id: "site", label: "Site Inspection Binder", ref: "Binder 3 · OP 840",
    items: [
      { text: "Policy 1.1.14 Inspections, Audits & Investigations present" },
      { text: "All applicable licenses on file (pharmacy, health dept, sales tax, business, clinician, etc.)", note: "Board of Pharmacy or Dept of Health, Sales Tax, Business/Professional, County Occupational, Clinicians'" },
      { text: "Certificate of Insurance — Property and Liability" },
      { text: "Policy 2.1.29 Patient Complaints"},
      { text: "OP 564 Patient Complaint Report" },
      { text: "Policy 1.1.12 Medicare Supplier Standards" },
      { text: "Policy 6.5.10 Notice of Privacy Practices" },
      { text: "Patient Information Booklet (RHI 1000) with all required sections flagged", note: "Flag: Patient Rights, Delivery/Repair, Complaint Resolution, Financial/Billing, Terms of Agreement" },
      { text: "Phone listing — business section of white pages or print Google page" },
      { text: "OSHA 300 Logs present" },
      { text: "OP 201 Field Management Organizational Chart" },
    ]
  },
  {
    id: "jc", label: "JC / Operations Binder", ref: "Binder 4 · OP 541 & OP 840",
    items: [
      { text: "Tab 1 — Policy 1.1.22 Performance Improvement Program" },
      { text: "Tab 1 — Location metrics pulled from Tableau and reviewed monthly" },
      { text: "Tab 1 — EMR reviews (20 semi-annually) and corrective actions" },
      { text: "Tab 1 — OP 541 Location Readiness Tool completed January and July" },
      { text: "Tab 1 — JC 427 Personnel Records Review completed January and July" },
      { text: "Tab 1 — Quarterly Patient Perception of Care reports" },
      { text: "Tab 1 — Annual Referral Source Perception of Care report" },
      { text: "Tab 1 — Infection Control Targeted Surveillance Logs (OP 519)" },
      { text: "Tab 1 — Semi-annual Infectious Disease Trending Reports (OP 542)" },
      { text: "Tab 1 — Influenza Vaccination Data Collection (OP 752)" },
      { text: "Tab 1 — Quarterly Don't Bug Me newsletter and OP 520 attendance record" },
      { text: "Tab 1 — OP 201 Organizational Chart"}, 
      { text:  "Policy 1.1.2 Scope of Service" },
      { text: "Tab 1 — Key contact person name documented for surveyor tracer selection" },
      { text: "Tab 2 — Emergency Preparedness: Policy 2.2.2" },
      { text:  "OP 525 Emergency Preparedness Plan" },
      { text: "OP 857- Emergency documentation & recovery (AS - APPLICABLE - IF PLAN ACTIVATED)" },
      { text: "Tab 2 — Fire Prevention: Policy 2.4.13, RM 1240" },
      { text: "Tab 2 — FDA 001 Equipment Maintenance Log — smoke alarm checks (weekly)" },
      { text: "Tab 2 — FDA 001 — monthly emergency lighting / exit sign checks (as applicable)" },
      { text: "Tab 3 — Incidents: Policy 2.4.1, OP 518, RM 1202, copies of all incidents" },
      { text: "Tab 4 — Complaints: Policy 2.1.29, OP 522, OP 564, OP 566, copies of all complaints" },
      { text: "Tab 5 — Policy 2.2.1, Facility Safety Inspection OP 512 (Jan & July) with fire drill record" },
      { text: "Tab 5 — Policy 2.2.4 and maintenance/calibration docs for all instrumentation", note: "Self-calibrating analyzer FDA 025, O2 analyzer FDA 003, annual calibration records" },
    ]
  },
  {
    id: "sds", label: "SDS / Hazmat Binder", ref: "Binder 5 · JC 427, OP 541 & OP 840",
    items: [
      { text: "RM 1232 Hazardous Chemical Inventory List" },
      { text: "RM 1233 Site Specific Information Sheet" },
      { text: "RM 1234 Hazard Communication Program Training Record (copy also in employee file)" },
      { text: "RM 1238 PPE Hazard Assessment Form (copy also in employee file)" },
      { text: "SDS on file for every hazardous chemical stored or used at location" },
    ]
  },
  {
    id: "pstSetup", label: "PST Visit — Setup", ref: "Form JC 426 (Setup) — Rev. 2026.06.29",
    banner: "BEST PRACTICE - Evaluate home prior to equipment placement",
    items: [
      { text: "ALL equipment, supplies, and tanks secured in vehicle." },
      { text: "Testing equipment, gloves, Madawipes, hand gel, non-clear bags and red tags on the vehicle." },
      { text: "Complete dosing instructions are printed on the delivery ticket.", note: "Must include liter flow, route of delivery, and duration (2 lpm NC continuous)." },
      { text: "Patient information is not visible in the vehicle." },
      { text: "Vehicle is locked and secured when unattended.", note: "Windows must be up and all doors locked." },
      { text: "Hand gel applied prior to entering patient's home." },
      { text: "Confirm correct patient utilizing two patient identifiers (name, DOB, address, etc.).", note: "Verify patient's name before entering the home." },
      { text: "Back-up tank assembled to take in the home (cylinder, stand, regulator, supplies). Must obtain an AMA if patient refuses backup system.", note: "If continuous patient, be sure they have enough oxygen in their tank to last through the setup. If not on oxygen upon arrival, place patient on backup system." },
      { text: "Return to the vehicle for equipment that needs to be setup or swapped out." },
      { text: "Hand gel used between clean and dirty (e.g., home and vehicle); if gloves are used, gloves are changed between clean and dirty, and hand gel used between glove changes.", note: "* Trips between home and vehicle  * Between glove changes  * Remove all dirty items (filters and supplies) > hand gel > place new items" },
      { text: "Test outlet to ensure proper grounding. Use circuit tester.", note: "If there are no grounded outlets in the home, educate the patient on the need to have a grounded outlet installed, document this on the CL 307 Initial Plan of Care and proceed with setup." },
      { text: "Plug in and turn on the concentrator to start run time.", note: "Observe minimum run times (Refer to OP 609 - Oxygen Concentrator Specifications)." },
      { text: "Concentrator alarm checked by unplugging unit from power source; verify patient/caregiver can hear alarm.", note: "Verbally ask \"Can you hear the alarm?\" Educate patient why they might possibly hear an alarm, (ex: power outage, equipment failure, etc.) If patient cannot hear the alarm, ask if there is someone in the home who can hear it or move to a different room that is closer to patient. If patient is hearing impaired, show them to look for visual cues such as lights on the concentrator." },
      { text: "Deliver and instruct patient on use of portable gaseous system, portable liquid oxygen, portable concentrator and/or back-up system as necessary per order, and verify conserving device cycling. Also discuss Equipment Safety Instructions.", note: "Return demonstration is required to show you that the patient knows how to work their portable and backup systems. Verify concentration of POC by utilizing SmartCheck Analyzer. Must flag backup system with \"Backup Equipment Only\" tag (RHI 600)." },
      { text: "Instruct patient on cylinder storage for safety and security.", note: "Oxygen cylinders must NOT be stored in closets, left freestanding, placed within 15 feet of a heat source or open flame or stored in the trunk of the car. If issues are identified, correct issue, provide education to the patient and document education on CL 307 - Initial Plan of Care." },
      { text: "Verified concentrator setting matches current order. Patient must set liter flow as prescribed by physician.", note: "Educate patient on their prescription, how to set the flow for their prescription, and have them set equipment to prescribed liter flow. (Non-clinicians cannot set or adjust liter flow)." },
      { text: "Analyzed concentrator oxygen percentage, observing minimum run time (Refer to OP 609 - Oxygen Concentrator Specifications).", note: "Observe minimum run times (OP 609)." },
      { text: "Oxygen flow checked at the end of longest tubing.", note: "Must use flow pen to check this, not an analyzer with flow built in." },
      { text: "Educate patient on operation of equipment and changing disposable supplies and cleaning filter(s). Verify patient's ability to operate equipment.", note: "Be sure the patient is aware to change cannula every 2 weeks, tubing every 90 days, and humidifier bottles every 30 days. External filters and/or air intake vents must be cleaned weekly." },
      { text: "Completed all sections of Initial Plan of Care (CL 307). Pay attention to the surroundings in the home: fireplaces, cigarettes/vapes, lighters, ash trays, candles, stoves, or heaters. Educate to keep 15 ft. away from any open flames or heat source. Document issue and education.", note: "Each question on the CL 307 Initial Plan of Care, to include PCP, Pulmonologist, Emergency Contact, and Power Company, must be discussed with the patient. Educate on any issue identified. Document issue and education provided. The concentration % of the concentrator MUST be on these forms. Be sure to document \"Alarm Audible to Patient\". If patient has POC, ensure to check the concentration % of it and record on the CL 307." },
      { text: "\"No Smoking\" sign(s) left for patient to hang at entrance to home.", note: "If oxygen is in the home, \"No Smoking\" sign is required. Signage alerts first responders that there is oxygen in the home." },
      { text: "Checked the function, cleanliness and location label on all Rotech equipment." },
      { text: "Concentrator, Regulator, Portable System, Conserving Device, Tanks (including backup tank), and Supplies (serial, model, and/or lot numbers) documented on delivery ticket.", note: "Document all equipment, supplies, and cylinders delivered. Cylinder lot numbers must be on Delivery ticket and Lot Tank Form. Number of cylinders must match on Delivery Ticket, Initial Plan of Care, and Lot Tank Form." },
      { text: "Patient internet access confirmed; instructed to visit www.rotech.com, review what is available on website and provide Rotech Paperless Contact Card (RHI 1080) with all new setups (printed booklets provided if no internet access).", note: "Verbally ask the patient \"Do you have access to the internet?\" If no internet access, be prepared to give the patient printed copies of the RHI 1000 Patient Information Booklet and RHI 1001 Home Medical Equipment Booklet. If initial set up, provide with the RHI 1080 card." },
      { text: "Ensure ALL paperwork is filled out completely before leaving the home. (Delivery Ticket, Initial Plan of Care, Payment Authorization, etc.)." },
      { text: "Testing equipment cleaned prior to placing back into bag or vehicle; gloves must be worn when using Madawipes.", note: "Gloves must be worn when using any Mada products. Clean analyzer, flow pen, circuit tester and tablet before placing in bag or vehicle." },
      { text: "Used hand gel upon completion of home visit." },
    ]
  },
  {
    id: "pstMaintenance", label: "PST Visit — Maintenance", ref: "Form JC 426 (Maintenance) — Rev. 2026.06.29",
    banner: "BEST PRACTICE - Evaluate home prior to equipment placement",
    items: [
      { text: "ALL equipment, supplies, and tanks secured in vehicle." },
      { text: "Testing equipment, gloves, Madawipes, hand gel, non-clear bags and red tags on the vehicle." },
      { text: "Complete dosing instructions are printed on the maintenance or exchange ticket.", note: "Must include liter flow, route of delivery, and duration (2 lpm NC continuous)." },
      { text: "Patient information is not visible in the vehicle." },
      { text: "Vehicle is locked and secured when unattended.", note: "Windows must be up and all doors locked." },
      { text: "Hand gel applied prior to entering patient's home." },
      { text: "\"No Smoking\" sign(s) posted at entrance to home.", note: "If oxygen is in the home, \"No Smoking\" sign is required. Signage alerts first responders that there is oxygen in the home." },
      { text: "Confirm correct patient utilizing two patient identifiers (name, DOB, address, etc.).", note: "Verify patient's name before entering the home." },
      { text: "Gloves used if equipment/supplies are visibly contaminated.", note: "It is Rotech's policy (2.3.1) to observe Standard Precautions - wear gloves when coming in contact with equipment and/or supplies that are visibly contaminated. If the home is clean and tidy and the equipment is not visibly contaminated, gloves are not required. Practice good hand gel hygiene." },
      { text: "Instructed patient to use portable or back-up system as necessary per order, and verified conserving device cycling.", note: "Be sure patient has enough oxygen in their tank to last through the maintenance. This is a good opportunity for the patient to show you they know how to work their portable and backup systems." },
      { text: "Checked portable liquid oxygen, gaseous systems, or portable concentrator. (Conserving device, POC, regulator) and patient's ability to operate.", note: "If patient has POC, check the concentration % utilizing the SmartCheck analyzer and record on the OP 511 Equipment Maintenance Form." },
      { text: "Turn on the concentrator if it is not already running.", note: "Observe minimum run times (OP 609)." },
      { text: "Concentrator alarm checked by unplugging unit from power source; verify patient/caregiver can hear alarm.", note: "Verbally ask \"Can you hear the alarm?\" If patient cannot hear the alarm, ask if there is someone in the home who can hear it or move to a different room that is closer to patient. If patient is hearing impaired, show them to look for visual cues such as lights on the concentrator." },
      { text: "Verified back-up only tanks and patient's ability to operate (AMA on file if patient refuses back-up).", note: "Back-up tanks must be tagged with a Back-up Equipment Only tag (RHI 600)." },
      { text: "Identified cylinder storage for safety and security, address as necessary.", note: "Oxygen cylinders must NOT be stored in closets, left freestanding, placed within 15 feet of a heat source or open flame or stored in the trunk of the car. If issues are identified, correct issue, provide education to the patient and document education on OP 511 Equipment Maintenance Record." },
      { text: "Analyzed concentrator oxygen percentage, observing minimum run time (OP 609 Oxygen Concentrator Specifications).", note: "Observe minimum run times and concentration (OP 609)." },
      { text: "Hand gel used between clean and dirty (e.g., home and vehicle); if gloves are used, gloves are changed between clean and dirty, and hand gel used between glove changes.", note: "* Trips between home and vehicle  * Between glove changes  * Remove all dirty items (filters and supplies) > hand gel > place new items" },
      { text: "Verified concentrator setting matches current order, address as necessary.", note: "If the concentrator is not set to the prescription we have on file (dosing instructions), ask patient why it is set differently than the prescription. If they state there has been a change in the prescription, leave the liter flow as is. Let the LCM know we will need to get an updated prescription. If the prescription is correct, have patient adjust to correct liter flow. PATIENT MUST MAKE ALL CHANGES TO LITER FLOW, PST CANNOT ADJUST." },
      { text: "Oxygen flow checked at the end of longest tubing.", note: "Must use flow pen to check this, not an analyzer with flow built in." },
      { text: "Checked the function, cleanliness and location label on all Rotech equipment.", note: "All equipment must have a location label on it." },
      { text: "Asked patient about changing disposable supplies and cleaning filter(s).", note: "Be sure the patient is aware to change cannula every 2 weeks, tubing every 90 days, humidifier bottles every 30 days and filters per manufacturer guidelines. External filters and/or air intake vents must be cleaned weekly." },
      { text: "Completed all sections of Equipment Maintenance Record (OP 511). Pay attention to the surroundings in the home: fireplaces, cigarettes/vapes, lighters, ash trays, candles, stoves, or heaters. Educate to keep 15 ft. away from any open flames or heat source. Document issue and education.", note: "All 16 questions on the Safety Assessment of the OP 511 Equipment Maintenance Record must be discussed with the patient. Educate on any issue identified. Document issue and education provided. The concentration % of the concentrator MUST be on these forms." },
      { text: "If fire risk is identified, a PE 662 High-Risk Smoking & Education Packet must be provided to the patient.", note: "Back page must be signed by the patient and returned to the location to be scanned into the EMR." },
      { text: "Supplies and serial/lot numbers documented on delivery ticket.", note: "Document all supplies and cylinders delivered. Cylinder lot numbers must be on Delivery Ticket and the Lot Tank Form." },
      { text: "Ensure ALL paperwork is filled out completely before leaving the home. (BL 401, COPD assessment and \"Are You Tired of Being Tired?\")" },
      { text: "Testing equipment MUST be cleaned prior to placing back into bag or vehicle; gloves must be worn when using Madawipes.", note: "Gloves must be worn when using any Mada products. Clean analyzer, flow pen, circuit tester and tablet before placing in bag or vehicle." },
      { text: "Used hand gel upon completion of home visit." },
    ]
  },
  {
    id: "clinician", label: "PAP Setup", ref: "Form JC 424",
    items: [
      { text: "Physician order verified (can be completed prior to setup)" },
      { text: "Correct patient confirmed using two identifiers (name, DOB, address, etc.)" },
      { text: "PAP pressure checked with manometer (can be completed prior to setup)" },
      { text: "Hand gel applied at start of visit" },
      { text: "Sleep study results discussed (clinician only)" },
      { text: "Diagnosis and benefits of PAP therapy discussed (clinician only)" },
      { text: "Outlet tested or grounded outlets discussed with patient" },
      { text: "Operation of PAP device, humidifier, and accessories demonstrated" },
      { text: "Return demonstration received from patient for device/humidifier and accessories" },
      { text: "Mask options discussed if specific mask not ordered" },
      { text: "Magnetic PAP mask risk discussed — pacemaker, defibrillator, cochlear implant (6 inch rule)", note: "Applies on setup or mask exchange" },
      { text: "Mask fitting performed; device turned on during fitting to reduce rebreathing risk", note: "Do not use sample masks; direct patient to self-fit if non-clinician" },
      { text: "Tubing/mask connection to PAP/humidifier demonstrated" },
      { text: "PAP device turned on so patient can experience pressures", note: "Non-clinician: patient turns on device; do not touch the patient" },
      { text: "Return demonstration: patient connects tubing and puts on mask correctly" },
      { text: "Hand gel used after handling patient's mask" },
      { text: "Fall risk education provided (if mask worn when getting up at night)" },
      { text: "Cleaning and replacement schedule educated (per RHI 1001)" },
      { text: "Humidifier emptying daily (distilled water) and before transport discussed" },
      { text: "Compliance requirements discussed" },
      { text: "All equipment/supplies and serial/lot numbers documented on ticket" },
      { text: "Initial Plan of Care (CL 307) fully completed — home safety and fall risk included" },
      { text: "Patient internet access confirmed; Rotech website reviewed; RHI 1080 card provided" },
      { text: "Credentials used when signing (clinician only)" },
      { text: "Hand gel applied at end of visit; table wiped down" },
    ]
  },
  {
    id: "vent", label: "Ventilator Home Visit", ref: "Form JC 423",
    items: [
      { text: "Physician order verified by reviewing chart (EMR)", note: "Clinician must review the most current order before leaving the office." },
      { text: "Verify current ventilator order listed on top of forms", note: "Dosing instructions must match most current order. If using All-In-Order, ranges must be listed. If oxygen or MPV settings are ordered, they must also be listed." },
      { text: "Patient information is not visible in vehicle." },
      { text: "Vehicle is locked and secured when unattended." },
      { text: '"No Smoking" sign(s) posted at entrance to home if oxygen in use.', note: 'If oxygen is in the home, "No Smoking" sign is required. Signage alerts first responders that there is oxygen in the home.' },
      { text: "Confirm correct patient utilizing two patient identifiers (name, DOB, address, etc.)", note: "Verify patient's name before entering the home." },
      { text: "Hand gel applied at the start of the visit." },
      { text: "Gloves used if equipment/supplies are visibly contaminated (PPE kit available if needed)." },
      { text: "Hand gel used between clean and dirty (e.g., home and vehicle).", note: "Trips between the home and vehicle; between glove changes; remove all dirty items (filters and supplies) → hand gel → place new items." },
      { text: "On setup or mask exchange, discuss the use of magnetic PAP masks by patients or bed partner who have medical devices (pacemaker, defibrillator, cochlear implant). Magnets must be kept at least 6 inches away from active medical device." },
      { text: "Enter the clinical menu." },
      { text: "Go to: Settings and alarms — verify all settings match current order; Options — verify menu access is on limited and document hours of use; Alarm log — document and address findings, clear log; Event Log — document and address findings; Complete Download (if one was not completed via the cloud system before leaving the office)." },
      { text: "Test tidal volume by placing mask on NIV patient; invasive patients use test lung — visually verify tidal volumes set are being met on digital screen." },
      { text: "Verify Respiratory rate." },
      { text: "Circuit Test performed if new circuit and filter applied." },
      { text: "Test battery — turn on unit, unplug power cord; verify change to internal battery; reattach power cord, verify batteries charging (lightning bolt icon).", note: "Ensure the patient knows how long their battery will last should the electricity go out." },
      { text: "Test alarms by removing mask from patient or removing test lung. Verify circuit disconnect, low inspiratory pressure.", note: 'Must ask the patient "Can you hear that alarm?"' },
      { text: "Complete all sections of Ventilator Function Check (CL 317 or CL 337), Initial Plan of Care (CL 307) or Clinical Visit Report (CL 303), OP 511 Equipment Maintenance Form, or Ongoing Plan of Care (CL 309) if applicable.", note: "All documents must be completed in their entirety. Ventilator Function Check: don't forget the alarms section and questions regarding filters, circuit test, and humidifier — these cannot be blank." },
      { text: "If patient is on oxygen, identify cylinder storage for safety and security, address as necessary.", note: "Tanks may NOT be stored in closets, left freestanding, within 15 feet of a heat source/open flame, or stored in the trunk of the car. If issues are identified, correct issue, provide education to the patient and document." },
      { text: "If patient is non-compliant, discuss reasons for non-usage and ways to assist patient to become compliant with device; document non-compliance on Ongoing Plan of Care (CL 309).", note: "Non-compliance must be addressed and documented." },
      { text: "Supplies and serial/lot numbers documented on delivery ticket.", note: "Two tickets are required — one for the vent setup or maintenance and a second ticket for supplies. Supplies are listed as 'no charge - included with rental'." },
      { text: "Patient internet access confirmed; instructed to visit www.rotech.com; reviewed what is available on website and provided Rotech Paperless Contact Card (RHI 1080) with all new setups.", note: "Verbally ask the patient 'Do you have access to the internet?' If no internet access, be prepared to give the patient printed copies of the RHI 1000 and RHI 1001." },
      { text: "Testing equipment cleaned prior to placing back into bag or vehicle; gloves must be worn when using Madawipes.", note: "Gloves must be worn when using any Mada product. Clean analyzer, flow pen, circuit tester, stethoscope, pulse ox, and tablet before placing in bag or vehicle." },
      { text: "Used hand gel upon completion of home visit." },
    ]
  }
];

// The checklist tab rail runs SECTIONS first, then these fixed extras. Named
// so the dashboard and header nav can jump straight to one without every
// call site re-deriving `SECTIONS.length + n`.
const TAB = {
  op541:    SECTIONS.length,
  op541t:   SECTIONS.length + 1,
  jc427:    SECTIONS.length + 2,
  policy:   SECTIONS.length + 3,
  trends:   SECTIONS.length + 4,
  followUp: SECTIONS.length + 5,
  roster:   SECTIONS.length + 6,
  readiness: SECTIONS.length + 7,
};
// Reference tabs are read-only lookups rather than part of the visit's
// checklist — "Checklist" in the header nav bounces off these back to tab 0.
const REFERENCE_TABS = [TAB.policy, TAB.trends, TAB.followUp, TAB.roster, TAB.readiness];

// Per-patient forms, as opposed to the location's own binders — they group
// separately in the binder picker and carry Global ID / Current RX.
const PATIENT_FORM_IDS = ["pstSetup", "pstMaintenance", "clinician", "vent"];
// Group headings for the binder dropdown, in the order they're listed.
const TAB_GROUPS = ["Checklist Binders", "Patient Visit Forms", "Self-Audits & Personnel", "Reference"];

function initStates() {
  const s = {}, c = {};
  SECTIONS.forEach((sec, si) => sec.items.forEach((_, ii) => {
    s[`${si}-${ii}`] = null;
    c[`${si}-${ii}`] = "";
  }));
  return { states: s, comments: c };
}

// `aria` is what a screen reader announces — "Y"/"N"/"N/A" alone are
// meaningless out of context, so every answer button carries the long form.
const STATUS_COLORS = {
  yes: { bg: T.successBg, border: T.successBorder, text: T.success, label: "Y",   aria: "Mark compliant" },
  no:  { bg: T.errorBg,   border: T.errorBorder,   text: T.error,   label: "N",   aria: "Mark as issue" },
  na:  { bg: T.gray100,   border: T.gray300,       text: T.gray600, label: "N/A", aria: "Mark not applicable" },
};

// ─── POLICY REVISION DATES ────────────────────────────────────────────────────
// Seed/fallback data only — the live values now live in the Firestore
// "policyDates" collection and are editable by admins from the Policy Dates
// tab (no code changes/redeploys needed for a routine date update anymore).
// This object is what an admin's "Load starting policy dates" button writes
// into Firestore the first time, and what the app falls back to if Firestore
// is unreachable. Format: "MM.DD.YYYY" — appears as a tooltip badge on
// checklist items and in the Policy Dates reference tab.
// ─────────────────────────────────────────────────────────────────────────────
const POLICY_DATES_SEED = {
  // Binder 1 — Morning Meeting
  "Policy 1.1.25": { name: "Morning Meetings",                          rev: "01.01.2026" },
  
  // Binder 2 — In-Service
  "Policy 1.1.21": { name: "Educational In-Services",                   rev: "07.02.2024" },

  // Binder 3 — Site Inspection
  "Policy 1.1.14": { name: "Inspections, Audits & Investigations",      rev: "02.12.2025" },
  "Policy 2.1.29": { name: "Patient Complaints",                        rev: "06.15.2021" },
  "Policy 1.1.12": { name: "Medicare Supplier Standards",               rev: "01.01.2025" },
  "Policy 6.5.10": { name: "Notice of Privacy Practices",               rev: "01.01.2017" },

  // Binder 4 — JC / Operations
  "Policy 1.1.22": { name: "Performance Improvement Program",           rev: "01.01.2025" },
  "Policy 1.1.2":  { name: "Scope of Service",                         rev: "05.22.2026" },
  "Policy 2.2.1":  { name: "Environmental Safety",                      rev: "01.01.2026" },
  "Policy 2.2.2":  { name: "Emergency Preparedness",                   rev: "11.17.2025" },
  "Policy 2.4.13": { name: "Fire Prevention",                           rev: "01.01.2026" },
  "Policy 2.4.1":  { name: "Incidents",                                 rev: "01.01.2026" },
  "Policy 2.2.4":  { name: "Instrumentation Maintenance & Calibration", rev: "03.17.2026" },
};

// Returns all policyDates keys found anywhere in the given text string
// Uses word-boundary check so "Policy 1.1.2" won't match inside "Policy 1.1.22"
function getPolicyMatches(text, policyDates) {
  return Object.keys(policyDates).filter(key => {
    const idx = text.indexOf(key);
    if (idx === -1) return false;
    const after = text[idx + key.length];
    // Ensure the character after the match is not a digit or dot (prevents 1.1.2 matching 1.1.22)
    return !after || !/[\d.]/.test(after);
  });
}

function formatFollowUpTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function ChecklistQrCode({ value }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: 160, margin: 1 }, () => {});
  }, [value]);
  if (!value) return null;
  return <canvas ref={canvasRef} style={{ display: "block", marginTop: 12, border: `1px solid ${T.gray200}`, borderRadius: 6 }} />;
}

// Standalone follow-up checklist page, opened via ?checklist=<visitId>. Used by
// both the location manager (checking items off) and the accreditation
// specialist (watching live progress) — no auth, the visit ID is the secret.
const CHECKLIST_CATEGORY_ORDER = ["Warehouse", "Vehicles", "PST Visits", "Personnel", "Personnel Records (JC 427)", "Binders"];

// Branded shell shared by all three ChecklistView states (loading / not-found /
// ready) so the unauthenticated page carries the same header chrome as the
// main app instead of dropping straight into bare content.
function ChecklistPageShell({ children }) {
  return (
    <div style={{ fontFamily: T.font, background: T.gray50, minHeight: "100vh", color: T.ink }}>
      <div style={{ background: T.blue600, color: T.white, padding: "14px 28px", display: "flex", alignItems: "center", gap: 14 }}>
        <img src="/rotech-survey-prep/rotech-logo.jpg" alt="Rotech Healthcare" style={{ height: 34, width: "auto", background: T.white, borderRadius: T.radius, padding: "4px 10px" }} />
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{MODULE_LABEL}</div>
      </div>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        {children}
      </div>
    </div>
  );
}

function ChecklistView({ visitId }) {
  const [doc_, setDoc_] = useState(undefined); // undefined = loading, null = not found
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesTimer = useRef(null);

  useEffect(() => {
    const ref = doc(db, CHECKLISTS_COLLECTION, visitId);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) { setDoc_(null); return; }
      const data = snap.data();
      setDoc_(data);
      setNotes(prev => (notesTimer.current ? prev : data.notes || ""));
    }, () => setDoc_(null));
    return () => unsub();
  }, [visitId]);

  function toggleItem(itemId) {
    if (!doc_) return;
    const categories = doc_.categories.map(it => it.id === itemId ? { ...it, done: !it.done } : it);
    updateDoc(doc(db, CHECKLISTS_COLLECTION, visitId), { categories, updatedAt: Date.now() }).catch(() => {});
  }

  function onNotesChange(value) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      setSavingNotes(true);
      updateDoc(doc(db, CHECKLISTS_COLLECTION, visitId), { notes: value, updatedAt: Date.now() })
        .finally(() => { setSavingNotes(false); notesTimer.current = null; });
    }, 600);
  }

  if (doc_ === undefined) {
    return (
      <ChecklistPageShell>
        <div style={{ ...cardStyle(), padding: 40, textAlign: "center", color: T.gray500 }}>Loading checklist…</div>
      </ChecklistPageShell>
    );
  }
  if (doc_ === null) {
    return (
      <ChecklistPageShell>
        <div style={{ ...cardStyle(), padding: 40, textAlign: "center", color: T.error }}>Checklist not found. Double-check the link.</div>
      </ChecklistPageShell>
    );
  }

  const total = doc_.categories.length;
  const done = doc_.categories.filter(it => it.done).length;

  return (
    <ChecklistPageShell>
      <div style={cardStyle(T.blue600)}>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>Follow-Up Checklist</div>
          <div style={{ fontSize: 13, color: T.gray600, marginTop: 4 }}>
            {doc_.meta?.location} {doc_.meta?.lawson ? `(#${doc_.meta.lawson})` : ""} — visited {doc_.meta?.date}
          </div>
          <div style={{ fontSize: 13, color: T.gray600, marginTop: 2 }}>Specialist: {doc_.meta?.specialist}</div>

          <div style={{ background: T.blue50, border: `1px solid ${T.blueBorder}`, borderRadius: T.radius, padding: "10px 14px", margin: "16px 0", fontSize: 13, fontWeight: 600, color: BRAND }}>
            {total === 0 ? "No outstanding items — nice work!" : `${done} of ${total} items complete`}
          </div>

          {total === 0 ? null : CHECKLIST_CATEGORY_ORDER.map(cat => {
            const catItems = doc_.categories.filter(it => it.category === cat);
            if (catItems.length === 0) return null;
            // Group items by subheader, preserving insertion order
            const subheaders = [];
            const bySubheader = {};
            catItems.forEach(item => {
              const sh = item.subheader || "";
              if (!bySubheader[sh]) { subheaders.push(sh); bySubheader[sh] = []; }
              bySubheader[sh].push(item);
            });
            return (
              <div key={cat} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{cat}</div>
                {subheaders.map(sh => (
                  <div key={sh} style={{ marginBottom: 12 }}>
                    {sh && <div style={{ fontSize: 13, fontWeight: 600, color: T.gray700, marginBottom: 4, paddingBottom: 3, borderBottom: `2px solid ${BRAND}` }}>{sh}</div>}
                    {bySubheader[sh].map(item => (
                      <label key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.gray200}`, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!item.done} onChange={() => toggleItem(item.id)} style={{ marginTop: 3, width: 16, height: 16 }} />
                        <span style={{ fontSize: 14, color: item.done ? T.gray500 : T.ink, textDecoration: item.done ? "line-through" : "none" }}>
                          {item.text}{item.comment ? <span style={{ color: T.gray600 }}> — {item.comment}</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Notes {savingNotes ? <span style={{ fontWeight: 400, color: T.gray500, textTransform: "none" }}>(saving…)</span> : null}
            </div>
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              rows={4}
              placeholder="Add any notes for the accreditation specialist…"
              style={{ width: "100%", fontSize: 13, padding: 10, border: `1px solid ${T.gray200}`, borderRadius: T.radius, resize: "vertical", boxSizing: "border-box", color: T.ink, fontFamily: "inherit" }}
            />
          </div>
        </div>
      </div>
    </ChecklistPageShell>
  );
}

// In-app editor for the company-wide Policy Revision Dates (Firestore
// "policyDates" collection), replacing the old code-only workflow where an
// admin had to edit POLICY_DATES_SEED in App.jsx and wait for a redeploy.
// Mirrors LocationRoster's admin-allowlist + audit-log pattern.
function PolicyDatesPanel({ policyDates, onReload }) {
  const isAdmin = ADMIN_EMAILS.includes(auth.currentUser?.email);
  const [query, setQuery] = useState("");
  const [editingKey, setEditingKey] = useState(null); // policy # being edited, or "new"
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);

  useEffect(() => {
    if (!showChanges) return;
    const q = fsQuery(collection(db, "auditLog"), orderBy("at", "desc"), limit(50));
    const unsub = onSnapshot(q, snap => {
      setAuditEntries(snap.docs.map(d => d.data()).filter(e => e.collection === "policyDates"));
    }, () => setAuditEntries([]));
    return () => unsub();
  }, [showChanges]);

  const entries = Object.entries(policyDates).sort(([a], [b]) => a.localeCompare(b));
  const filtered = query.trim()
    ? entries.filter(([key, val]) =>
        key.toLowerCase().includes(query.toLowerCase()) ||
        val.name.toLowerCase().includes(query.toLowerCase()) ||
        val.rev.includes(query)
      )
    : entries;

  function startEdit(key, val) { setEditingKey(key); setDraft({ key, name: val.name, rev: val.rev }); }
  function startNew() { setEditingKey("new"); setDraft({ key: "", name: "", rev: "" }); }
  function cancelEdit() { setEditingKey(null); setDraft(null); }

  async function saveEdit() {
    if (!draft.key.trim() || !draft.name.trim() || !draft.rev.trim()) { alert("Policy #, Name, and Last Revised are all required."); return; }
    setSaving(true);
    try {
      const key = draft.key.trim();
      const ref = doc(db, "policyDates", key);
      const existing = await getDoc(ref);
      const after = { name: draft.name.trim(), rev: draft.rev.trim() };
      await setDoc(ref, after);
      await logAudit("policyDates", key, existing.exists() ? "update" : "create", existing.exists() ? existing.data() : null, after);
      await onReload();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  async function removePolicy(key) {
    if (!window.confirm(`Remove ${key} from the Policy Dates list?`)) return;
    const ref = doc(db, "policyDates", key);
    const existing = await getDoc(ref);
    await deleteDoc(ref);
    await logAudit("policyDates", key, "delete", existing.exists() ? existing.data() : null, null);
    await onReload();
  }

  // One-time bootstrap for a fresh/empty Firestore collection — only adds
  // policies that aren't already there, so it's safe to click more than once
  // and never overwrites an admin's live edits.
  async function loadMissingDefaults() {
    const missing = Object.entries(POLICY_DATES_SEED).filter(([key]) => !policyDates[key]);
    if (missing.length === 0) { alert("Nothing to load — every default policy is already in the list."); return; }
    if (!window.confirm(`Add ${missing.length} default polic${missing.length !== 1 ? "ies" : "y"} not currently in the list? Existing entries won't be touched.`)) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      missing.forEach(([key, val]) => batch.set(doc(db, "policyDates", key), val));
      await batch.commit();
      await logAudit("policyDates", "*", "load-defaults", null, { count: missing.length });
      await onReload();
    } finally {
      setSeeding(false);
    }
  }

  const inputStyle = { fontSize: 12, padding: "5px 8px", border: `1px solid ${T.gray200}`, borderRadius: 5, color: T.ink, background: "#fff", width: "100%", boxSizing: "border-box" };
  const cols = isAdmin ? "140px 1fr 130px 90px" : "140px 1fr 130px";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: T.gray500 }}>
          {entries.length} polic{entries.length !== 1 ? "ies" : "y"}{isAdmin ? " — edits apply immediately for all specialists" : " — read-only (contact an admin to request changes)"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && (
            <button onClick={loadMissingDefaults} disabled={seeding} title="Add any built-in default policies that aren't in this list yet" style={{ padding: "7px 14px", fontSize: 12, background: "#fff", color: T.warning, border: `1px solid ${T.warning}`, borderRadius: 6, cursor: "pointer", fontWeight: 600, opacity: seeding ? 0.7 : 1 }}>
              {seeding ? "Loading…" : "Load missing defaults"}
            </button>
          )}
          <button onClick={() => setShowChanges(v => !v)} style={{ padding: "7px 14px", fontSize: 12, background: showChanges ? BRAND : "#fff", color: showChanges ? "#fff" : T.gray600, border: `1px solid ${T.gray200}`, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            {showChanges ? "Hide" : "Show"} Recent Changes
          </button>
          {isAdmin && (
            <button onClick={startNew} style={{ padding: "7px 14px", fontSize: 12, background: BRAND, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              + Add Policy
            </button>
          )}
        </div>
      </div>

      {showChanges && (
        <div style={{ background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${T.gray200}` }}>
            Recent Changes
          </div>
          {auditEntries.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: T.gray500 }}>No changes recorded yet.</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {auditEntries.map((e, i) => {
                const isBulk = e.action === "load-defaults";
                const label = isBulk ? `${e.after?.count ?? "?"} default polic${e.after?.count !== 1 ? "ies" : "y"} loaded` : (e.action === "delete" ? e.before?.name : e.after?.name);
                const actionColor = e.action === "delete" ? T.error : e.action === "create" ? T.success : T.warning;
                return (
                  <div key={i} style={{ padding: "8px 14px", fontSize: 12, borderTop: i > 0 ? "1px solid #f0f0f0" : "none", display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <span style={{ fontWeight: 700, color: actionColor, textTransform: "uppercase", marginRight: 6 }}>{e.action}</span>
                      <span style={{ color: T.gray700 }}>{isBulk ? label : `${e.docId}${label ? ` — ${label}` : ""}`}</span>
                    </div>
                    <div style={{ color: T.gray500, whiteSpace: "nowrap" }}>
                      {e.user || e.userEmail || "unknown"} · {e.at ? new Date(e.at).toLocaleString("en-US") : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <input
        value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search by policy #, name, or date…"
        style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.gray200}`, borderRadius: 6, marginBottom: 14, boxSizing: "border-box", outline: "none", color: T.ink }}
      />

      {editingKey && (
        <div style={{ background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, marginBottom: 10 }}>{editingKey === "new" ? "New policy" : `Editing ${editingKey}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: T.gray600, marginBottom: 3 }}>Policy #</div>
              <input value={draft.key} disabled={editingKey !== "new"} placeholder="Policy 2.2.1" onChange={e => setDraft(d => ({ ...d, key: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.gray600, marginBottom: 3 }}>Name</div>
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.gray600, marginBottom: 3 }}>Last Revised</div>
              <input value={draft.rev} placeholder="MM.DD.YYYY" onChange={e => setDraft(d => ({ ...d, rev: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEdit} disabled={saving} style={{ padding: "6px 14px", fontSize: 12, background: BRAND, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={cancelEdit} style={{ padding: "6px 14px", fontSize: 12, background: "#fff", border: `1px solid ${T.gray200}`, borderRadius: 5, cursor: "pointer", color: T.gray600 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${T.gray200}`, borderRadius: 8, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: cols, background: T.blue800, color: "#fff", padding: "9px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <div>Policy #</div>
          <div>Name</div>
          <div style={{ textAlign: "center" }}>Last Revised</div>
          {isAdmin && <div></div>}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: T.gray500, fontSize: 13 }}>No policies match "{query}"</div>
        )}
        {filtered.map(([key, val], i) => (
          <div key={key} style={{
            display: "grid", gridTemplateColumns: cols,
            padding: "9px 14px", fontSize: 13, alignItems: "center",
            background: i % 2 === 0 ? "#fff" : T.gray50,
            borderTop: "1px solid #f0f0f0"
          }}>
            <div style={{ fontWeight: 600, color: T.blue800, fontFamily: "monospace", fontSize: 12 }}>{key}</div>
            <div style={{ color: T.gray700 }}>{val.name}</div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: T.blue50, color: T.blue800, border: `1px solid ${T.blueBorder}` }}>
                {val.rev}
              </span>
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => startEdit(key, val)} style={{ fontSize: 11, padding: "3px 8px", background: "#fff", border: `1px solid ${T.gray200}`, borderRadius: 4, cursor: "pointer" }}>Edit</button>
                <button onClick={() => removePolicy(key)} style={{ fontSize: 11, padding: "3px 8px", background: "#fff", border: "1px solid #ffcdd2", color: T.error, borderRadius: 4, cursor: "pointer" }}>✕</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: T.gray300, textAlign: "right" }}>{filtered.length} of {entries.length} policies shown</div>
    </div>
  );
}

// Lists every followUpChecklists doc across all locations so a specialist can
// triage outstanding follow-ups instead of hunting down individual old
// ?checklist=<id> links one at a time.
function FollowUpDashboard() {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, CHECKLISTS_COLLECTION),
      snap => {
        const rows = snap.docs.map(d => {
          const data = d.data();
          const total = data.categories?.length || 0;
          const done = data.categories?.filter(c => c.done).length || 0;
          return {
            id: d.id, meta: data.meta || {}, total, done, remaining: total - done,
            createdAt: data.createdAt || 0, updatedAt: data.updatedAt || data.createdAt || 0,
          };
        });
        setChecklists(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const open = checklists.filter(c => c.remaining > 0).sort((a, b) => a.createdAt - b.createdAt);
  const completed = checklists.filter(c => c.remaining === 0).sort((a, b) => b.updatedAt - a.updatedAt);

  function linkFor(id) {
    const url = new URL(window.location.href);
    url.search = `?checklist=${encodeURIComponent(id)}`;
    return url.toString();
  }

  function copyLink(id) {
    navigator.clipboard.writeText(linkFor(id)).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 2000);
    });
  }

  const rowStyle = { background: "#fff", border: `1px solid ${T.gray200}`, borderRadius: 8, padding: "12px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };

  function Row({ c }) {
    return (
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
            {c.meta.location || "Unknown location"} {c.meta.lawson ? `(#${c.meta.lawson})` : ""}
          </div>
          <div style={{ fontSize: 12, color: T.gray600, marginTop: 2 }}>
            Visited {c.meta.date || "—"} · {c.meta.specialist || "—"} · created {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US") : "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10,
            background: c.remaining === 0 ? T.successBg : T.warningBg,
            color: c.remaining === 0 ? T.success : T.warning,
          }}>
            {c.remaining === 0 ? "✓ All complete" : `${c.remaining} of ${c.total} open`}
          </span>
          <button onClick={() => copyLink(c.id)} style={{ padding: "6px 12px", fontSize: 12, background: copiedId === c.id ? T.successBg : "#fff", border: `1px solid ${T.gray200}`, borderRadius: 5, cursor: "pointer", color: copiedId === c.id ? T.success : T.gray700 }}>
            {copiedId === c.id ? "✓ Copied" : "Copy link"}
          </button>
          <a href={linkFor(c.id)} target="_blank" rel="noreferrer" style={{ padding: "6px 12px", fontSize: 12, background: BRAND, color: "#fff", borderRadius: 5, textDecoration: "none", fontWeight: 600 }}>
            Open →
          </a>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray500 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <div style={{ fontSize: 14, color: T.gray600 }}>Loading follow-up checklists…</div>
    </div>
  );

  if (checklists.length === 0) return (
    <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray500 }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>📌</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.gray700, marginBottom: 8 }}>No follow-up checklists yet</div>
      <div style={{ fontSize: 13 }}>Generate one from a visit's Report view — "Generate Follow-Up Checklist Link".</div>
    </div>
  );

  return (
    <div style={{ padding: "16px 24px" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: BRAND, marginBottom: 4 }}>Follow-Up Dashboard</div>
      <div style={{ fontSize: 12, color: T.gray500, marginBottom: 16 }}>
        {open.length} open · {completed.length} completed — every follow-up checklist ever generated, across all locations
      </div>

      {open.length === 0 && (
        <div style={{ fontSize: 13, color: T.gray600, padding: "12px 0" }}>No open follow-ups — everything's been checked off. 🎉</div>
      )}
      {open.map(c => <Row key={c.id} c={c} />)}

      {completed.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => setShowCompleted(v => !v)} style={{ fontSize: 12, color: BRAND, background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>
            {showCompleted ? "▾" : "▸"} {completed.length} completed checklist{completed.length !== 1 ? "s" : ""}
          </button>
          {showCompleted && <div style={{ marginTop: 10 }}>{completed.map(c => <Row key={c.id} c={c} />)}</div>}
        </div>
      )}
    </div>
  );
}

// In-app editor for the company-wide location roster (Firestore "locations"
// collection), replacing the old hardcoded array + code-redeploy workflow.
// Appends an immutable audit entry — before/after are full document snapshots
// (not just a diff summary) so a future deletion is instantly recoverable
// without digging through git history, unlike a bare updatedBy/updatedAt field.
async function logAudit(collectionName, docId, action, before, after) {
  try {
    await setDoc(doc(collection(db, "auditLog")), {
      collection: collectionName,
      docId,
      action,
      before: before ?? null,
      after: after ?? null,
      user: auth.currentUser?.displayName || "",
      userEmail: auth.currentUser?.email || "",
      at: Date.now(),
    });
  } catch (err) {
    console.error("Audit log write failed (change was still applied):", err);
  }
}

function LocationRoster({ locations, onReload }) {
  const isAdmin = ADMIN_EMAILS.includes(auth.currentUser?.email);
  const [query, setQuery] = useState("");
  const [editingLawson, setEditingLawson] = useState(null); // lawson being edited, or "new"
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);

  useEffect(() => {
    if (!showChanges) return;
    const q = fsQuery(collection(db, "auditLog"), orderBy("at", "desc"), limit(50));
    const unsub = onSnapshot(q, snap => {
      setAuditEntries(snap.docs.map(d => d.data()).filter(e => e.collection === "locations"));
    }, () => setAuditEntries([]));
    return () => unsub();
  }, [showChanges]);

  const filtered = query.trim()
    ? locations.filter(l => [l.lawson, l.name, l.city, l.state, l.region, l.areaManager].some(v => (v || "").toLowerCase().includes(query.toLowerCase())))
    : locations;
  const sorted = [...filtered].sort((a, b) => (a.region + a.areaCode + a.city).localeCompare(b.region + b.areaCode + b.city));

  function startEdit(loc) { setEditingLawson(loc.lawson); setDraft({ ...loc }); }
  function startNew() { setEditingLawson("new"); setDraft({ lawson: "", name: "", city: "", state: "", region: "", areaCode: "", areaManager: "" }); }
  function cancelEdit() { setEditingLawson(null); setDraft(null); }

  async function saveEdit() {
    if (!draft.lawson.trim()) { alert("Lawson # is required."); return; }
    setSaving(true);
    try {
      const lawson = draft.lawson.trim();
      const ref = doc(db, "locations", lawson);
      const existing = await getDoc(ref);
      const after = { ...draft, lawson };
      await setDoc(ref, after);
      await logAudit("locations", lawson, existing.exists() ? "update" : "create", existing.exists() ? existing.data() : null, after);
      await onReload();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  async function removeLocation(lawson) {
    if (!window.confirm(`Remove location #${lawson} from the roster?`)) return;
    const ref = doc(db, "locations", lawson);
    const existing = await getDoc(ref);
    await deleteDoc(ref);
    await logAudit("locations", lawson, "delete", existing.exists() ? existing.data() : null, null);
    await onReload();
  }

  const [restoring, setRestoring] = useState(false);
  async function restoreFromBackup() {
    if (!window.confirm(`Restore all ${LOCATIONS_BACKUP_SNAPSHOT.length} locations from the standing backup? Safe to re-run — matching Lawson #s are just overwritten; nothing is deleted.`)) return;
    setRestoring(true);
    try {
      const batch = writeBatch(db);
      LOCATIONS_BACKUP_SNAPSHOT.forEach(loc => batch.set(doc(db, "locations", loc.lawson), loc));
      await batch.commit();
      await logAudit("locations", "*", "restore-from-backup", null, { count: LOCATIONS_BACKUP_SNAPSHOT.length });
      await onReload();
      alert("Restore complete.");
    } finally {
      setRestoring(false);
    }
  }

  const inputStyle = { fontSize: 12, padding: "5px 8px", border: `1px solid ${T.gray200}`, borderRadius: 5, color: T.ink, background: "#fff", width: "100%", boxSizing: "border-box" };
  const fields = [["lawson", "Lawson #"], ["name", "Name"], ["city", "City"], ["state", "State"], ["region", "Region"], ["areaCode", "Area Code"], ["areaManager", "Area Manager"]];

  return (
    <div style={{ padding: "16px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND }}>Location Roster</div>
          <div style={{ fontSize: 12, color: T.gray500, marginTop: 2 }}>
            {locations.length} location{locations.length !== 1 ? "s" : ""}{isAdmin ? " — edits apply immediately for all specialists" : " — read-only (contact an admin to request changes)"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && (
            <button onClick={restoreFromBackup} disabled={restoring} title={`Restore all ${LOCATIONS_BACKUP_SNAPSHOT.length} locations from the standing backup`} style={{ padding: "7px 14px", fontSize: 12, background: "#fff", color: T.warning, border: `1px solid ${T.warning}`, borderRadius: 6, cursor: "pointer", fontWeight: 600, opacity: restoring ? 0.7 : 1 }}>
              {restoring ? "Restoring…" : "Restore from backup"}
            </button>
          )}
          <button onClick={() => setShowChanges(v => !v)} style={{ padding: "7px 14px", fontSize: 12, background: showChanges ? BRAND : "#fff", color: showChanges ? "#fff" : T.gray600, border: `1px solid ${T.gray200}`, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            {showChanges ? "Hide" : "Show"} Recent Changes
          </button>
          {isAdmin && (
            <button onClick={startNew} style={{ padding: "7px 14px", fontSize: 12, background: BRAND, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              + Add Location
            </button>
          )}
        </div>
      </div>

      {showChanges && (
        <div style={{ background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${T.gray200}` }}>
            Recent Changes
          </div>
          {auditEntries.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: T.gray500 }}>No changes recorded yet.</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {auditEntries.map((e, i) => {
                const isRestore = e.action === "restore-from-backup";
                const label = isRestore ? `${e.after?.count ?? "?"} location(s) restored` : (e.action === "delete" ? e.before?.name : e.after?.name);
                const actionColor = e.action === "delete" ? T.error : e.action === "create" ? T.success : T.warning;
                return (
                  <div key={i} style={{ padding: "8px 14px", fontSize: 12, borderTop: i > 0 ? "1px solid #f0f0f0" : "none", display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <span style={{ fontWeight: 700, color: actionColor, textTransform: "uppercase", marginRight: 6 }}>{e.action}</span>
                      <span style={{ color: T.gray700 }}>{isRestore ? label : `#${e.docId}${label ? ` — ${label}` : ""}`}</span>
                    </div>
                    <div style={{ color: T.gray500, whiteSpace: "nowrap" }}>
                      {e.user || e.userEmail || "unknown"} · {e.at ? new Date(e.at).toLocaleString("en-US") : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, city, region, Lawson #, Area Manager…"
        style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.gray200}`, borderRadius: 6, marginBottom: 14, boxSizing: "border-box", color: T.ink }} />

      {editingLawson && (
        <div style={{ background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, marginBottom: 10 }}>{editingLawson === "new" ? "New location" : `Editing #${editingLawson}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {fields.map(([k, label]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: T.gray600, marginBottom: 3 }}>{label}</div>
                <input value={draft[k]} disabled={k === "lawson" && editingLawson !== "new"} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEdit} disabled={saving} style={{ padding: "6px 14px", fontSize: 12, background: BRAND, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={cancelEdit} style={{ padding: "6px 14px", fontSize: 12, background: "#fff", border: `1px solid ${T.gray200}`, borderRadius: 5, cursor: "pointer", color: T.gray600 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${T.gray200}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 140px 70px 70px 1fr 90px", background: BRAND, color: "#fff", padding: "9px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          <div>Lawson #</div><div>Name</div><div>City, State</div><div>Region</div><div>Area</div><div>Area Manager</div><div></div>
        </div>
        {sorted.length === 0 && <div style={{ padding: 24, textAlign: "center", color: T.gray500, fontSize: 13 }}>No locations match "{query}"</div>}
        {sorted.map((l, i) => (
          <div key={l.lawson} style={{ display: "grid", gridTemplateColumns: "90px 1fr 140px 70px 70px 1fr 90px", padding: "8px 14px", fontSize: 13, alignItems: "center", background: i % 2 === 0 ? "#fff" : T.gray50, borderTop: "1px solid #f0f0f0" }}>
            <div style={{ fontFamily: "monospace", fontSize: 12 }}>{l.lawson}</div>
            <div>{l.name}</div>
            <div>{l.city}, {l.state}</div>
            <div>{l.region}</div>
            <div>{l.areaCode}</div>
            <div>{l.areaManager}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {isAdmin && <button onClick={() => startEdit(l)} style={{ fontSize: 11, padding: "3px 8px", background: "#fff", border: `1px solid ${T.gray200}`, borderRadius: 4, cursor: "pointer" }}>Edit</button>}
              {isAdmin && <button onClick={() => removeLocation(l.lawson)} style={{ fontSize: 11, padding: "3px 8px", background: "#fff", border: "1px solid #ffcdd2", color: T.error, borderRadius: 4, cursor: "pointer" }}>✕</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Card-per-employee layout modeled directly on the real "Location Readiness
// Platform" Personnel Files form (OP 541's reference UI — OP 541T's sheet is
// the same shape with different item wording). Name is pre-filled if it was
// already in the uploaded file; Job Title, Hire Date, and every item answer
// are always specialist-entered here, never read from the file. Each item's
// comment lives inline on its own line (one comment cell per item row in the
// real file, shared across every employee, so editing it in any one
// employee's card updates the same value everywhere it appears).
// FDA date fields use a native date picker; the underlying stored value stays
// a plain MM/DD/YYYY string (same convention as Hire Date and every other
// date in this app) so write-back doesn't need any special-casing — a blank
// picker just means nothing gets written, same as leaving the field empty.
function isoToUsDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}
function usDateToIso(us) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us || "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
}

function PersonnelRecordsPanel({ slots, items, answers, setAnswers, dates, setDates, comments, setComments, onAddEmployee, onRemoveEmployee, onUpdateSlot, canAddEmployee }) {
  const slotId = s => `${s.sheetName}|${s.col}`;
  const categories = ["Personnel File", "Medical File", "FDA File"];
  const groups = categories
    .map(cat => ({ cat, items: items.filter(it => it.category === cat) }))
    .filter(g => g.items.length > 0);

  const fieldStyle = { width: "100%", fontSize: 13, padding: "6px 8px", border: `1px solid ${T.gray200}`, borderRadius: 4, boxSizing: "border-box", color: T.ink };
  const labelStyle = { fontSize: 11, color: T.gray600, marginBottom: 4, fontWeight: 600 };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 12, borderRadius: 6, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em" }}>
        Personnel Records Review
      </div>

      {slots.map((s, idx) => {
        const sid = slotId(s);
        return (
          <div key={sid} style={{ border: `1px solid ${T.gray200}`, borderRadius: 8, padding: 16, marginBottom: 16, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: BRAND, fontSize: 14 }}>Employee {idx + 1}</div>
              <button onClick={() => onRemoveEmployee(s)} style={{ fontSize: 11, color: T.error, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Remove
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <label style={{ flex: "2 1 220px" }}>
                <div style={labelStyle}>Name</div>
                <input value={s.name} onChange={e => onUpdateSlot(s.sheetName, s.col, "name", e.target.value)} style={fieldStyle} />
              </label>
              <label style={{ flex: "2 1 220px" }}>
                <div style={labelStyle}>Job Title</div>
                <input value={s.jobTitle} onChange={e => onUpdateSlot(s.sheetName, s.col, "jobTitle", e.target.value)} style={fieldStyle} />
              </label>
              <label style={{ flex: "1 1 160px" }}>
                <div style={labelStyle}>Hire Date</div>
                <input value={s.hireDate} onChange={e => onUpdateSlot(s.sheetName, s.col, "hireDate", e.target.value)} placeholder="MM/DD/YYYY" style={fieldStyle} />
              </label>
            </div>

            {groups.map(({ cat, items: catItems }) => (
              <div key={cat} style={{ background: T.successBg, border: "1px solid #c8e6c9", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: T.success, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{cat}</div>
                {catItems.map(item => {
                  const key = `${item.key}|${sid}`;
                  return (
                    <div key={item.key} style={{ padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 12, color: T.ink, flex: 1 }}>{item.text}</div>
                        {item.answerType === "yn" ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            {["yes", "no", "na"].map(v => {
                              const sc = STATUS_COLORS[v];
                              const active = answers[key] === v;
                              return (
                                <button key={v} onClick={() => setAnswers(p => ({ ...p, [key]: v }))} aria-label={sc.aria} aria-pressed={active}
                                  style={{ width: 40, padding: "4px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${active ? sc.border : T.gray200}`, background: active ? sc.bg : T.white, color: active ? sc.text : T.gray400 }}>
                                  {sc.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            type="date"
                            value={usDateToIso(dates[key])}
                            onChange={e => setDates(p => ({ ...p, [key]: isoToUsDate(e.target.value) }))}
                            style={{ fontSize: 12, padding: "4px 6px", border: `1px solid ${T.gray200}`, borderRadius: 4, boxSizing: "border-box", color: T.ink }}
                          />
                        )}
                      </div>
                      <textarea
                        value={comments[item.key] ?? ""}
                        onChange={e => setComments(p => ({ ...p, [item.key]: e.target.value }))}
                        rows={1}
                        placeholder="Comments (shared across all employees)…"
                        style={{ width: "100%", marginTop: 6, fontSize: 11, padding: "4px 6px", border: `1px solid ${T.gray200}`, borderRadius: 4, resize: "vertical", boxSizing: "border-box", color: T.ink }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}

      <button
        onClick={onAddEmployee}
        disabled={!canAddEmployee}
        style={{ width: "100%", padding: "10px", border: `2px dashed ${canAddEmployee ? BRAND : "#c0c0c0"}`, borderRadius: 6, background: "none", color: canAddEmployee ? BRAND : "#c0c0c0", fontWeight: 700, cursor: canAddEmployee ? "pointer" : "not-allowed" }}>
        + Add Employee
      </button>
    </div>
  );
}

// Card-per-employee layout for JC 427, ported from the Semi Annual app's
// JC427Form.jsx (see the constants above it). Date items get the same
// 3-year/6-month-warning red/yellow/green coloring that app uses; per-item
// comments are shared across employees (one Comments column per row in the
// real file, same convention as OP 541T's Personnel Records).
const JC427_STATUS_BG     = { red: T.errorBg, yellow: "#fff9c4", green: T.successBg };
const JC427_STATUS_BORDER = { red: T.errorBorder, yellow: "#fff59d", green: T.successBorder };

function JC427Panel({ slots, items, answers, setAnswers, dates, setDates, comments, setComments, onAddEmployee, onRemoveEmployee, onUpdateSlot, canAddEmployee }) {
  const slotId = s => `${s.sheetName}|${s.col}`;
  const groups = JC427_CATEGORY_ORDER
    .map(cat => ({ cat, items: items.filter(it => it.category === cat) }))
    .filter(g => g.items.length > 0);
  const [showInstructions, setShowInstructions] = useState(false);

  const fieldStyle = { width: "100%", fontSize: 13, padding: "6px 8px", border: `1px solid ${T.gray200}`, borderRadius: 4, boxSizing: "border-box", color: T.ink };
  const labelStyle = { fontSize: 11, color: T.gray600, marginBottom: 4, fontWeight: 600 };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 12, borderRadius: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.04em" }}>JC 427 — Personnel Records Review</div>
        <button onClick={() => setShowInstructions(true)} style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>
          📖 View Instructions
        </button>
      </div>

      <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.warning, textAlign: "center" }}>
        ALL employees MUST have a Personnel File and a SEPARATE Medical File. Employees transfilling or curbside filling liquid oxygen MUST have a SEPARATE FDA File.
      </div>

      {slots.map((s, idx) => {
        const sid = slotId(s);
        return (
          <div key={sid} style={{ border: `2px solid ${BRAND}`, borderRadius: 8, padding: 16, marginBottom: 16, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: BRAND, fontSize: 14 }}>Employee {idx + 1}{s.name ? `: ${s.name}` : ""}</div>
              <button onClick={() => onRemoveEmployee(s)} style={{ fontSize: 11, color: T.error, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Remove
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <label style={{ flex: "2 1 220px" }}>
                <div style={labelStyle}>Name</div>
                <input value={s.name} onChange={e => onUpdateSlot(s.sheetName, s.col, "name", e.target.value)} style={fieldStyle} />
              </label>
              <label style={{ flex: "2 1 220px" }}>
                <div style={labelStyle}>Job Title</div>
                <input value={s.jobTitle} onChange={e => onUpdateSlot(s.sheetName, s.col, "jobTitle", e.target.value)} style={fieldStyle} />
              </label>
              <label style={{ flex: "1 1 160px" }}>
                <div style={labelStyle}>Hire Date</div>
                <input value={s.hireDate} onChange={e => onUpdateSlot(s.sheetName, s.col, "hireDate", e.target.value)} placeholder="MM/DD/YYYY" style={fieldStyle} />
              </label>
            </div>

            {groups.map(({ cat, items: catItems }) => (
              <div key={cat} style={{ background: T.successBg, border: "1px solid #c8e6c9", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: T.success, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{cat}</div>
                {catItems.map(item => {
                  const key = `${item.id}|${sid}`;
                  const dateVal = dates[key] || "";
                  const status = item.answerType === "date" ? getJC427ExpirationStatus(usDateToIso(dateVal)) : null;
                  return (
                    <div key={item.id} style={{ padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 12, color: T.ink, flex: 1 }}>
                          {item.text}
                          {item.note && <div style={{ fontSize: 10, color: T.gray500, fontStyle: "italic", marginTop: 2 }}>{item.note}</div>}
                        </div>
                        {item.answerType === "yn" ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            {["yes", "no", "na"].map(v => {
                              const sc = STATUS_COLORS[v];
                              const active = answers[key] === v;
                              return (
                                <button key={v} onClick={() => setAnswers(p => ({ ...p, [key]: v }))} aria-label={sc.aria} aria-pressed={active}
                                  style={{ width: 40, padding: "4px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${active ? sc.border : T.gray200}`, background: active ? sc.bg : T.white, color: active ? sc.text : T.gray400 }}>
                                  {sc.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            type="date"
                            value={usDateToIso(dateVal)}
                            onChange={e => setDates(p => ({ ...p, [key]: isoToUsDate(e.target.value) }))}
                            style={{
                              fontSize: 12, padding: "4px 6px", borderRadius: 4, boxSizing: "border-box", color: T.ink,
                              border: `1px solid ${status ? JC427_STATUS_BORDER[status] : T.gray200}`,
                              background: status ? JC427_STATUS_BG[status] : "#fff",
                            }}
                          />
                        )}
                      </div>
                      <textarea
                        value={comments[item.id] ?? ""}
                        onChange={e => setComments(p => ({ ...p, [item.id]: e.target.value }))}
                        rows={1}
                        placeholder="Comments (added as a note on each employee's cell for this item)…"
                        style={{ width: "100%", marginTop: 6, fontSize: 11, padding: "4px 6px", border: `1px solid ${T.gray200}`, borderRadius: 4, resize: "vertical", boxSizing: "border-box", color: T.ink }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}

      <button
        onClick={onAddEmployee}
        disabled={!canAddEmployee}
        style={{ width: "100%", padding: "10px", border: `2px dashed ${canAddEmployee ? BRAND : "#c0c0c0"}`, borderRadius: 6, background: "none", color: canAddEmployee ? BRAND : "#c0c0c0", fontWeight: 700, cursor: canAddEmployee ? "pointer" : "not-allowed" }}>
        + Add Employee
      </button>

      {showInstructions && (
        <div onClick={() => setShowInstructions(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: `1px solid ${T.gray200}`, paddingBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>JC 427 Instructions</div>
              <button onClick={() => setShowInstructions(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: T.gray600, lineHeight: 1 }}>×</button>
            </div>
            {JC427_INSTRUCTIONS.map((s, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{s.title}</div>
                <div style={{ fontSize: 12, color: T.gray600, whiteSpace: "pre-line", marginTop: 3 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Shows a banner instead of silently reloading when a new version is
// deployed — the previous "autoUpdate" behavior reloaded the page the moment
// it detected an update, with no warning, which wiped whatever a specialist
// had open mid-visit before they'd clicked "Save Progress." Answers are now
// autosaved continuously (see the draft effect in SurveyPrepApp) so an
// update is no longer destructive even if tapped immediately, but a prompt
// is still better than an unannounced reload.
function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // The browser only checks for a new service worker on its own schedule
    // (roughly once a day) — for a home-screen PWA that's rarely fully
    // closed, that's too slow to matter. Poll explicitly while the app is
    // open so the banner shows up within the hour instead of the next day.
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      setInterval(() => registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 1000, background: T.warning, color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span>A new version of Survey Prep is available.</span>
      <button onClick={() => updateServiceWorker(true)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: "#fff", color: T.warning, border: "none", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap" }}>
        Update Now
      </button>
    </div>
  );
}

export default function App() {
  const checklistVisitId = new URLSearchParams(window.location.search).get("checklist");
  if (checklistVisitId) {
    return <ChecklistView visitId={checklistVisitId} />;
  }
  return (
    <>
      <UpdateBanner />
      <AuthGate>
        <SurveyPrepApp />
      </AuthGate>
    </>
  );
}

// Gates the specialist-facing app behind Firebase email/password sign-in.
// The public follow-up checklist (?checklist=<id>) is handled entirely above
// this in App() and never reaches AuthGate — location managers never see a
// login screen. Accounts are created manually (Firebase console) per specialist;
// there's no self-signup form here on purpose.
function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError("Sign-in failed. Check your email and password and try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSetName(e) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await updateProfile(auth.currentUser, { displayName: nameInput.trim() });
      setUser({ ...auth.currentUser }); // onAuthStateChanged doesn't refire on profile updates
    } finally {
      setSavingName(false);
    }
  }

  // Named authCard rather than cardStyle so it doesn't shadow the shared
  // card helper — this one is the narrow centred sign-in panel.
  const authCard = { background: T.white, border: `1px solid ${T.gray200}`, borderTop: `5px solid ${T.blue600}`, borderRadius: T.radiusCard, padding: "32px 28px", width: 340, boxShadow: T.shadowCard };
  const fieldLabel = { display: "block", fontSize: 11.5, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 };
  const fieldInput = { width: "100%", padding: "9px 11px", fontSize: 14.5, border: `1.5px solid ${T.gray300}`, borderRadius: T.radius, boxSizing: "border-box", color: T.ink, fontFamily: "inherit", outline: "none" };
  const submitBtn = busy => ({ width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 700, background: T.blue600, color: T.white, border: "none", borderRadius: T.radius, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "inherit" });

  if (user === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.gray500, fontFamily: T.font }}>Loading…</div>;
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.gray50, fontFamily: T.font, padding: 16 }}>
        <form onSubmit={handleSignIn} style={authCard}>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, marginBottom: 4, letterSpacing: "-0.01em" }}>Rotech Survey Prep</div>
          <div style={{ fontSize: 13, color: T.gray600, marginBottom: 20 }}>Sign in with your specialist account</div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="auth-email" style={fieldLabel}>Email</label>
            <input id="auth-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={fieldInput} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="auth-password" style={fieldLabel}>Password</label>
            <input id="auth-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={fieldInput} />
          </div>
          {error && <div role="alert" style={{ fontSize: 12.5, color: T.error, background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: T.radius, padding: "8px 10px", marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={signingIn} style={submitBtn(signingIn)}>{signingIn ? "Signing in…" : "Sign In"}</button>
          <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 16, textAlign: "center" }}>No account? Request one by emailing accreditation@rotech.com</div>
        </form>
      </div>
    );
  }

  if (!user.displayName) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.gray50, fontFamily: T.font, padding: 16 }}>
        <form onSubmit={handleSetName} style={authCard}>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, marginBottom: 4, letterSpacing: "-0.01em" }}>Welcome</div>
          <div style={{ fontSize: 13, color: T.gray600, marginBottom: 20 }}>What's your name? This appears as the Accreditation Specialist on reports and trend data.</div>
          <label htmlFor="auth-name" style={fieldLabel}>Full name</label>
          <input id="auth-name" required value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Full name" style={{ ...fieldInput, marginBottom: 16 }} />
          <button type="submit" disabled={savingName} style={submitBtn(savingName)}>{savingName ? "Saving…" : "Continue"}</button>
        </form>
      </div>
    );
  }

  return children;
}

function SurveyPrepApp() {
  const draft = loadDraft();

  const [meta, setMeta] = useState(() => ({
    lawson: "", location: "", city: "", date: new Date().toLocaleDateString("en-US"), followUpDate: "", followUpTime: "",
    ...draft?.meta,
    specialist: auth.currentUser?.displayName || "", // identity comes from the logged-in account, not free text
  }));
  const [locations, setLocations] = useState([]);
  const reloadLocations = useCallback(() => {
    return getDocs(collection(db, "locations")).then(snap => {
      setLocations(snap.docs.map(d => d.data()));
    }).catch(() => {});
  }, []);
  useEffect(() => { reloadLocations(); }, [reloadLocations]);

  // Policy Revision Dates — starts from the code-level seed (POLICY_DATES_SEED)
  // so badges/the reference tab never look empty, then gets replaced by
  // whatever's actually in Firestore once it loads (admins edit there now,
  // not in code — see PolicyDatesPanel).
  const [policyDates, setPolicyDates] = useState(POLICY_DATES_SEED);
  const reloadPolicyDates = useCallback(() => {
    return getDocs(collection(db, "policyDates")).then(snap => {
      if (snap.empty) return; // collection not bootstrapped yet — keep the seed showing
      const obj = {};
      snap.docs.forEach(d => { obj[d.id] = d.data(); });
      setPolicyDates(obj);
    }).catch(() => {});
  }, []);
  useEffect(() => { reloadPolicyDates(); }, [reloadPolicyDates]);
  const [activeTab, setActiveTab] = useState(0);
  const [{ states, comments }, setForm] = useState(() => {
    if (draft?.states) return { states: draft.states, comments: draft.comments ?? {} };
    return initStates();
  });
  // Landing screen after auth. The dashboard is the entry point for a fresh
  // session, but someone resuming a visit in progress wants the checklist —
  // making them click through a summary of work they're mid-way through is a
  // speed bump. "In progress" means the draft already has an answer or a
  // location on it, not merely that autosave has fired.
  const [view, setView] = useState(() => {
    const started = draft && (
      Object.values(draft.states ?? {}).some(Boolean) || !!draft.meta?.location
    );
    return started ? "form" : "dashboard";
  });
  // Live filter over the binder list — UI-only, never persisted.
  const [tabSearch, setTabSearch] = useState("");
  // Binder picker. Sixteen tabs in a scrolling rail was the busiest thing on
  // the page, so navigation collapses into this one dropdown; the progress
  // strip underneath is what keeps the rail's at-a-glance status.
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const sectionMenuRef = useRef(null);
  useEffect(() => {
    if (!showSectionMenu) return;
    const onDocClick = e => {
      if (!sectionMenuRef.current?.contains(e.target)) setShowSectionMenu(false);
    };
    const onEsc = e => { if (e.key === "Escape") setShowSectionMenu(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showSectionMenu]);
  // Overflow menu holding the destructive "Clear & Start Over" action.
  const [showMoreActions, setShowMoreActions] = useState(false);
  const moreActionsRef = useRef(null);
  useEffect(() => {
    if (!showMoreActions) return;
    const onDocClick = e => {
      if (!moreActionsRef.current?.contains(e.target)) setShowMoreActions(false);
    };
    const onEsc = e => { if (e.key === "Escape") setShowMoreActions(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showMoreActions]);
  const [emailText, setEmailText] = useState("");
  const [reportLines, setReportLines] = useState([]);
  const [copied, setCopied] = useState(false);
  const [hasDraft, setHasDraft] = useState(!!draft);
  const [savedAt, setSavedAt] = useState(draft?.savedAt ?? null);
  const [savedVisits, setSavedVisits] = useState(loadVisits);

  // Floating Save Progress button — the header's Save button scrolls out of
  // view on long checklists, so surface a fixed one once it's off-screen.
  const [showFloatingSave, setShowFloatingSave] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowFloatingSave(window.scrollY > 260);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pop a reminder every 30 minutes without an explicit "Save Progress" —
  // the continuous draft autosave only protects this device; the explicit
  // save is what syncs to the cloud. The clock resets on save or dismiss.
  const [showSaveReminder, setShowSaveReminder] = useState(false);
  const saveReminderAnchor = useRef(Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - saveReminderAnchor.current >= SAVE_REMINDER_MS) setShowSaveReminder(true);
    }, 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // Pull this specialist's in-progress visits from Firestore and merge them
  // into the localStorage-seeded list — this is what makes a visit saved on
  // one device (e.g. an iPad) show up under "Load" on another (e.g. a
  // desktop). Firestore wins for any id present in both; anything local-only
  // (not yet synced, e.g. saved while offline) still shows up.
  //
  // This is a live subscription, not a fetch. Earlier versions re-read the
  // list with a one-shot getDocs() — first only on mount, then also whenever
  // "Saved Visits" was opened. Both still left a window where the desktop
  // showed a stale list, and one that matters in practice: the dashboard.
  // "Recent Visits" lives there, the dashboard is where a desktop sits all
  // day, and it has no "Saved Visits" button to trigger a re-fetch — so a
  // visit saved on the iPad stayed invisible there until a full page reload,
  // which is the most likely reason this still looked broken after the last
  // fix. onSnapshot removes the whole class of problem: there is no longer a
  // moment at which this list can be out of date.
  const [visitSyncError, setVisitSyncError] = useState("");
  useEffect(() => {
    let unsubVisits = null;
    const stopVisits = () => { if (unsubVisits) { unsubVisits(); unsubVisits = null; } };
    // Subscribing to auth rather than reading auth.currentUser: restoring a
    // persisted session is async, so the uid may not exist yet at mount.
    const unsubAuth = onAuthStateChanged(auth, user => {
      stopVisits();
      if (!user) return;
      unsubVisits = onSnapshot(visitsQueryFor(user.uid), snap => {
        const remoteVisits = snap.docs.map(d => d.data());
        setSavedVisits(local => {
          const remoteIds = new Set(remoteVisits.map(v => v.id));
          const merged = [...remoteVisits, ...local.filter(v => !remoteIds.has(v.id))]
            .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
          try { localStorage.setItem(VISITS_KEY, JSON.stringify(merged.slice(0, 20))); } catch {}
          return merged;
        });
        setVisitSyncError("");
      }, e => {
        // Previously swallowed with an empty catch. A read failure is exactly
        // the case where the specialist needs to be told that the list in
        // front of them is missing visits saved on another device — silence
        // here is indistinguishable from "you have no other visits".
        setVisitSyncError(e?.message || "Could not reach the cloud.");
      });
    });
    return () => { stopVisits(); unsubAuth(); };
  }, []);
  const [pdfHistory, setPdfHistory]   = useState(loadPdfHistory);
  const [showVisits, setShowVisits] = useState(false);
  const [showPdfReminder, setShowPdfReminder] = useState(false);
  const [checklistLink, setChecklistLink] = useState("");
  const [checklistLinkCopied, setChecklistLinkCopied] = useState(false);
  const [checklistLinkLoading, setChecklistLinkLoading] = useState(false);
  // Restored from the draft too — otherwise a silent reload would forget
  // which saved visit is "current," and the next "Save Progress" click would
  // create a stray duplicate entry instead of updating the right one.
  const [currentVisitId, setCurrentVisitId] = useState(() => draft?.currentVisitId ?? null);
  const [visitFinalized, setVisitFinalized] = useState(false);
  // The write-side counterpart to visitSyncError above, and deliberately a
  // separate flag: that one means "the visit list you are looking at may be
  // incomplete" (a read failed), this one means "what you are typing is not
  // reaching the cloud" (a write failed). Same underlying connection, but the
  // specialist needs to be told different things, in different places — so
  // folding them into one state would put the wrong message on screen.
  // Set on any failed write, cleared on the next success, and surfaced on the
  // checklist screen so it is seen before the tab is closed.
  const [visitSaveError, setVisitSaveError] = useState(false);

  // Fail-safe: the browser print dialog never tells JS whether the user actually
  // saved a PDF or hit cancel, so once it closes, prompt them to double check.
  useEffect(() => {
    const handler = () => setShowPdfReminder(true);
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  // OP 541 state — seeded from the local draft (see the big autosave effect
  // below) so a silent app reload mid-visit doesn't lose Y/N answers, only
  // the raw uploaded file bytes (op541BufferBytes), which are never
  // persisted anywhere and always require a re-upload to restore.
  const [op541Sections, setOp541Sections] = useState(() => draft?.op541Sections ?? []);
  const [op541States, setOp541States] = useState(() => draft?.op541States ?? {});
  const [op541Comments, setOp541Comments] = useState(() => draft?.op541Comments ?? {});
  const [op541FileName, setOp541FileName] = useState(() => draft?.op541FileName ?? "");
  const [op541VehicleInfo, setOp541VehicleInfo] = useState(() => draft?.op541VehicleInfo ?? {}); // { sheetLabel: { pstName, vehicleNum } }
  const [op541BufferBytes, setOp541BufferBytes] = useState(null); // original file bytes for write-back export — never persisted

  // OP 541T state
  const [op541tSections, setOp541tSections] = useState(() => draft?.op541tSections ?? []);
  const [op541tStates, setOp541tStates] = useState(() => draft?.op541tStates ?? {});
  const [op541tComments, setOp541tComments] = useState(() => draft?.op541tComments ?? {});
  const [op541tFileName, setOp541tFileName] = useState(() => draft?.op541tFileName ?? "");
  const [op541tBufferBytes, setOp541tBufferBytes] = useState(null); // original file bytes for write-back export — never persisted

  // Personnel Records Review state — employees are columns, not rows (see
  // parsePersonnelSheet). personnelSlots covers both "Personnel Records" and
  // "Additional Personnel Records" sheets combined; personnelAnswers/Dates are
  // keyed by `${item.key}|${slot.sheetName}|${slot.col}`.
  const [personnelSlots, setPersonnelSlots] = useState(() => draft?.personnelSlots ?? []);
  const [personnelItems, setPersonnelItems] = useState(() => draft?.personnelItems ?? []);
  const [personnelAnswers, setPersonnelAnswers] = useState(() => draft?.personnelAnswers ?? {});
  const [personnelDates, setPersonnelDates] = useState(() => draft?.personnelDates ?? {});
  const [personnelComments, setPersonnelComments] = useState(() => draft?.personnelComments ?? {});
  // Sheet names (in order) that actually carry Personnel Records slots in the
  // uploaded file — used to find the next free (sheetName, col) when a
  // specialist adds an employee that wasn't already listed on the file.
  const [personnelSheetNames, setPersonnelSheetNames] = useState(() => draft?.personnelSheetNames ?? []);

  // JC 427 Personnel Records Review state — same "employees as columns"
  // shape as OP 541T's Personnel Records, but the template ships with the
  // app itself (public/JC427_Template.xlsx) instead of being uploaded per
  // visit — there's no location self-audit data to compare against, so
  // there's nothing an upload would add over a bundled copy. Written
  // directly back into a fresh copy of that template's own cells (see
  // parseJC427Sheet/buildJC427Writes).
  const [jc427Slots, setJc427Slots] = useState(() => draft?.jc427Slots ?? []);
  const [jc427Items, setJc427Items] = useState(() => draft?.jc427Items ?? []);
  const [jc427Answers, setJc427Answers] = useState(() => draft?.jc427Answers ?? {});
  const [jc427Dates, setJc427Dates] = useState(() => draft?.jc427Dates ?? {});
  const [jc427Comments, setJc427Comments] = useState(() => draft?.jc427Comments ?? {});
  // Sheet names (in order) that actually carry Personnel Records slots in
  // the template — the real file has a main sheet plus "Additional Page"
  // overflow sheets (2/3/4), each offering 10 more employee columns, same
  // convention as OP 541T's Personnel Records + Additional Personnel Records.
  const [jc427SheetNames, setJc427SheetNames] = useState(() => draft?.jc427SheetNames ?? []);
  const [jc427Meta, setJc427Meta] = useState(() => draft?.jc427Meta ?? null); // { employeeNameRow, jobTitleRow, hireDateRow, commentsCol, employeeCols }
  const [jc427BufferBytes, setJc427BufferBytes] = useState(null); // template bytes for write-back export — never persisted, refetched each session
  const [jc427TemplateStatus, setJc427TemplateStatus] = useState("loading"); // "loading" | "ready" | "error"

  // Fetch + parse the bundled JC 427 template once per session (bytes are
  // never persisted, same convention as OP 541/541T's uploaded buffers).
  // Every sheet that parses successfully contributes its own 10 employee
  // columns; item text/row layout is identical across all of them, so
  // that's only taken from the first successful sheet. Only sets
  // items/meta/sheetNames if a draft hadn't already restored them, since the
  // template's content is static and shouldn't fight with restored state.
  useEffect(() => {
    fetch(JC427_TEMPLATE_PATH)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.arrayBuffer(); })
      .then(buf => {
        setJc427BufferBytes(new Uint8Array(buf));
        const wb = XLSX.read(buf, { type: "array" });
        let firstParsed = null;
        const foundSheetNames = [];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const result = parseJC427Sheet(rows, name);
          if (!result.ok) continue;
          foundSheetNames.push(name);
          if (!firstParsed) firstParsed = result;
        }
        if (!firstParsed) throw new Error("template not recognized");
        if (firstParsed.items.length < JC427_ALL_ITEMS.length) {
          console.warn(`[JC 427] Bundled template only matched ${firstParsed.items.length} of ${JC427_ALL_ITEMS.length} expected items — some row text may not exactly match what this app expects.`);
        }
        setJc427Items(prev => prev.length > 0 ? prev : firstParsed.items);
        setJc427SheetNames(prev => prev.length > 0 ? prev : foundSheetNames);
        setJc427Meta(prev => prev || {
          employeeNameRow: firstParsed.employeeNameRow, jobTitleRow: firstParsed.jobTitleRow, hireDateRow: firstParsed.hireDateRow,
          commentsCol: firstParsed.commentsCol, employeeCols: firstParsed.employeeCols,
        });
        setJc427TemplateStatus("ready");
      })
      .catch(() => setJc427TemplateStatus("error"));
  }, []);

  // Tab-level comments for PST Home Visit, PAP Setup, Ventilator Home Visit
  const [tabComments, setTabComments] = useState(() => draft?.tabComments ?? { pstSetup: "", pstMaintenance: "", clinician: "", vent: "" });
  const setTabComment = (id, val) => setTabComments(prev => ({ ...prev, [id]: val }));
  // Patient info (Global ID + Current RX) per PST/PAP/Vent tab
  const [tabPatientInfo, setTabPatientInfo] = useState(() => draft?.tabPatientInfo ?? { pstSetup: { globalId: "", currentRx: "" }, pstMaintenance: { globalId: "", currentRx: "" }, clinician: { globalId: "", currentRx: "" }, vent: { globalId: "", currentRx: "" } });
  const setTabPatient = (id, field, val) => setTabPatientInfo(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  // Additional comments shown at bottom of report
  const [additionalComments, setAdditionalComments] = useState(() => draft?.additionalComments ?? "");

  const setState = useCallback((key, val) => {
    setForm(prev => ({ ...prev, states: { ...prev.states, [key]: prev.states[key] === val ? null : val } }));
  }, []);

  const setComment = useCallback((key, val) => {
    setForm(prev => ({ ...prev, comments: { ...prev.comments, [key]: val } }));
  }, []);

  // Auto-save the whole working visit on any change — covers every tab, not
  // just the core checklist, so an unannounced app update (see UpdateBanner)
  // or an accidental tab close can't silently erase OP 541/541T or Personnel
  // Records answers before the specialist gets a chance to "Save Progress."
  // The one thing this can't protect is the raw uploaded file bytes
  // (op541BufferBytes/op541tBufferBytes) — those were never persisted by
  // design and always need a re-upload, which now safely merges instead of
  // wiping (see handleOp541Upload/handleOp541tUpload).
  useEffect(() => {
    saveDraft({
      meta, states, comments,
      op541Sections, op541States, op541Comments, op541FileName, op541VehicleInfo,
      op541tSections, op541tStates, op541tComments, op541tFileName,
      personnelSlots, personnelItems, personnelAnswers, personnelDates, personnelComments, personnelSheetNames,
      jc427Slots, jc427Items, jc427Answers, jc427Dates, jc427Comments, jc427SheetNames, jc427Meta,
      tabComments, tabPatientInfo, additionalComments, currentVisitId,
    });
    setSavedAt(new Date().toISOString());
  }, [meta, states, comments,
      op541Sections, op541States, op541Comments, op541FileName, op541VehicleInfo,
      op541tSections, op541tStates, op541tComments, op541tFileName,
      personnelSlots, personnelItems, personnelAnswers, personnelDates, personnelComments, personnelSheetNames,
      jc427Slots, jc427Items, jc427Answers, jc427Dates, jc427Comments, jc427SheetNames, jc427Meta,
      tabComments, tabPatientInfo, additionalComments, currentVisitId]);

  function getSectionStats(si) {
    let yes = 0, no = 0, na = 0, pending = 0;
    SECTIONS[si].items.forEach((_, ii) => {
      const s = states[`${si}-${ii}`];
      if (s === "yes") yes++; else if (s === "no") no++; else if (s === "na") na++; else pending++;
    });
    return { yes, no, na, pending, total: SECTIONS[si].items.length };
  }

  function getOp541Stats() {
    let yes = 0, no = 0, na = 0, pending = 0, mismatch = 0;
    op541Sections.forEach(sec => sec.items.forEach(item => {
      const s = op541States[item.key];
      if (s === "yes") yes++; else if (s === "no") no++; else if (s === "na") na++; else pending++;
      if (s && item.locAns && ((item.locAns === "Y" && s === "no") || (item.locAns === "N" && s === "yes"))) mismatch++;
    }));
    return { yes, no, na, pending, mismatch };
  }

  function getOp541tStats() {
    let yes = 0, no = 0, na = 0, pending = 0, mismatch = 0;
    op541tSections.forEach(sec => sec.items.forEach(item => {
      const s = op541tStates[item.key];
      if (s === "yes") yes++; else if (s === "no") no++; else if (s === "na") na++; else pending++;
      if (s && item.locAns && ((item.locAns === "Y" && s === "no") || (item.locAns === "N" && s === "yes"))) mismatch++;
    }));
    return { yes, no, na, pending, mismatch };
  }

  function getJC427Stats() {
    let no = 0, expired = 0, expiring = 0;
    jc427Items.forEach(item => {
      jc427Slots.forEach(slot => {
        const key = `${item.id}|${slot.sheetName}|${slot.col}`;
        if (item.answerType === "yn") {
          if (jc427Answers[key] === "no") no++;
        } else {
          const status = getJC427ExpirationStatus(usDateToIso(jc427Dates[key] || ""));
          if (status === "red") expired++;
          else if (status === "yellow") expiring++;
        }
      });
    });
    return { no, expired, expiring };
  }

  function getAllIssues() {
    const existing = SECTIONS.flatMap((sec, si) =>
      sec.items.flatMap((item, ii) => {
        const key = `${si}-${ii}`;
        if (states[key] === "no") return [{ section: sec.label, text: item.text, comment: comments[key] }];
        return [];
      })
    );
    const op541 = op541Sections.flatMap(sec =>
      sec.items.flatMap(item => {
        if (op541States[item.key] === "no")
          return [{ section: `OP 541 — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`, text: item.text, comment: op541Comments[item.key] }];
        return [];
      })
    );
    const op541t = op541tSections.flatMap(sec =>
      sec.items.flatMap(item => {
        if (op541tStates[item.key] === "no")
          return [{ section: `OP 541T — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`, text: item.text, comment: op541tComments[item.key] }];
        return [];
      })
    );
    return [...existing, ...op541, ...op541t];
  }

  function buildSummaryData() {
    const data = SECTIONS.map((sec, si) => {
      const stats = getSectionStats(si);
      const issues = sec.items.flatMap((item, ii) => {
        const key = `${si}-${ii}`;
        if (states[key] === "no") return [{ text: item.text, comment: comments[key], type: "no" }];
        return [];
      });
      const observations = sec.items.flatMap((item, ii) => {
        const key = `${si}-${ii}`;
        if (states[key] === "yes" && comments[key]) return [{ text: item.text, comment: comments[key] }];
        return [];
      });
      const compliantItems = sec.items.flatMap((item, ii) => {
        const key = `${si}-${ii}`;
        if (states[key] === "yes" && !comments[key]) return [{ text: item.text }];
        return [];
      });
      const isPSTTab = ["pstSetup", "pstMaintenance", "clinician", "vent"].includes(sec.id);
      return {
        label: sec.label, ref: sec.ref, ...stats, issues, observations, compliantItems,
        tabComment: isPSTTab ? (tabComments[sec.id] || null) : null,
        globalId:   isPSTTab ? (tabPatientInfo[sec.id]?.globalId || null) : null,
        currentRx:  isPSTTab ? (tabPatientInfo[sec.id]?.currentRx || null) : null,
      };
    });

    op541Sections.forEach(sec => {
      const vInfo = op541VehicleInfo[sec.sheetLabel] || {};
      const issues = sec.items
        .filter(item => op541States[item.key] === "no")
        .map(item => ({
          text: item.text,
          comment: op541Comments[item.key],
          type: "no",
          mismatch: item.locAns === "Y",
        }));
      const yes = sec.items.filter(item => op541States[item.key] === "yes").length;
      const no  = sec.items.filter(item => op541States[item.key] === "no").length;
      const na  = sec.items.filter(item => op541States[item.key] === "na").length;
      const pending = sec.items.filter(item => !op541States[item.key]).length;
      const observations = sec.items
        .filter(item => op541States[item.key] === "yes" && op541Comments[item.key])
        .map(item => ({ text: item.text, comment: op541Comments[item.key] }));
      const compliantItems = sec.items
        .filter(item => op541States[item.key] === "yes" && !op541Comments[item.key])
        .map(item => ({ text: item.text }));
      data.push({
        label: `OP 541 — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`,
        ref: "OP 541 Location Readiness Tool",
        pstName: vInfo.pstName || "",
        vehicleNum: vInfo.vehicleNum || "",
        yes, no, na, pending,
        total: sec.items.length,
        issues, observations, compliantItems,
      });
    });

    op541tSections.forEach(sec => {
      const vInfo = op541VehicleInfo[sec.sheetLabel] || {};
      const issues = sec.items
        .filter(item => op541tStates[item.key] === "no")
        .map(item => ({
          text: item.text,
          comment: op541tComments[item.key],
          type: "no",
          mismatch: item.locAns === "Y",
        }));
      const yes = sec.items.filter(item => op541tStates[item.key] === "yes").length;
      const no  = sec.items.filter(item => op541tStates[item.key] === "no").length;
      const na  = sec.items.filter(item => op541tStates[item.key] === "na").length;
      const pending = sec.items.filter(item => !op541tStates[item.key]).length;
      const observations = sec.items
        .filter(item => op541tStates[item.key] === "yes" && op541tComments[item.key])
        .map(item => ({ text: item.text, comment: op541tComments[item.key] }));
      const compliantItems = sec.items
        .filter(item => op541tStates[item.key] === "yes" && !op541tComments[item.key])
        .map(item => ({ text: item.text }));
      data.push({
        label: `OP 541T — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`,
        ref: "OP 541T Transfill Location Readiness Tool",
        driverName: vInfo.pstName || "",
        vehicleNum: vInfo.vehicleNum || "",
        yes, no, na, pending,
        total: sec.items.length,
        issues, observations, compliantItems,
      });
    });

    return data;
  }

  async function handleOp541Upload(file) {
    try {
      const buf = await file.arrayBuffer();
      setOp541BufferBytes(new Uint8Array(buf)); // store for write-back export
      const wb = XLSX.read(buf, { type: "array" });
      const allSections = [];
      const skippedSheets = [];
      let globalIdx = 0;

      for (const sheetName of wb.SheetNames) {
        if (sheetName === "Formula") continue;

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Determine sheet label: vehicle sheets have "UNIT NUMBER" label at row 4 col D (index 3)
        let sheetLabel = sheetName.replace(/_/g, " ");
        if (rows.length > 4 && String(rows[4][3] || "").toUpperCase().includes("UNIT NUMBER")) {
          const unitNum = String(rows[4][4] || "").trim();
          sheetLabel = unitNum ? `Unit # ${unitNum}` : sheetName.replace(/_/g, " ");
        }

        // Find header row by locating the "LOCATION" column header
        let hRow = -1, cPolicy = 0, cDesc = 1, cLoc = 2, cOnSite = 3, cComments = 4;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const upper = rows[i].map(c => String(c).toUpperCase().trim());
          const li = upper.findIndex(c => c === "LOCATION");
          if (li >= 0) {
            hRow = i;
            cLoc = li;
            cDesc = Math.max(0, li - 1);
            // On-Site Visit is the column immediately after Location
            cOnSite = li + 1;
            // Search explicitly for "ON-SITE" or "VISIT" header first
            const osi = upper.findIndex(c => c.includes("ON-SITE") || c.includes("ON SITE") || (c.includes("VISIT") && c !== "LOCATION"));
            if (osi >= 0) cOnSite = osi;
            const ci = upper.findIndex(c => c.includes("COMMENT"));
            if (ci >= 0) cComments = ci;
            break;
          }
        }
        if (hRow < 0) { skippedSheets.push(sheetName); continue; }

        let curSection = null;
        for (let i = hRow + 1; i < rows.length; i++) {
          const row = rows[i];
          const policy   = String(row[cPolicy]   || "").trim();
          const desc     = String(row[cDesc]     || "").trim();
          const locAns   = String(row[cLoc]      || "").trim().toUpperCase();
          const locComment = String(row[cComments] || "").trim();

          if (!desc && !policy) continue;
          if (desc.toUpperCase() === "TOTAL") continue;

          const hasPolicyNum = /^\d+\.\d+/.test(policy);
          const isHeader = !hasPolicyNum && desc && desc === desc.toUpperCase() && desc.length > 3 && !/^\d/.test(desc);

          if (isHeader) {
            curSection = { sheetLabel, label: desc, items: [] };
            allSections.push(curSection);
          } else if (desc) {
            if (!curSection) {
              curSection = { sheetLabel, label: "", items: [] };
              allSections.push(curSection);
            }
            curSection.items.push({
              key: `op-${globalIdx++}`,
              policy,
              text: desc,
              locAns,
              locComment,
              rowIdx: i,      // row index in the sheet (for write-back)
              sheetName,      // actual Excel sheet name (for write-back)
              cOnSite,        // On-Site Visit column index (for write-back)
              cComments,      // Comments column index (for write-back)
            });
          }
        }
      }

      setOp541Sections(allSections);
      // Re-uploading the same file (e.g. after loading a visit synced from
      // another device, where the original file bytes aren't available) must
      // not wipe answers already entered — item.key is assigned deterministically
      // by parse order, so it lines up across uploads of the same file and any
      // existing answer/comment for that key is kept; only genuinely new items
      // (key not seen before) start blank.
      setOp541States(prev => {
        const ns = {};
        allSections.forEach(sec => sec.items.forEach(item => { ns[item.key] = prev[item.key] ?? null; }));
        return ns;
      });
      setOp541Comments(prev => {
        const nc = {};
        allSections.forEach(sec => sec.items.forEach(item => { nc[item.key] = prev[item.key] ?? ""; }));
        return nc;
      });
      setOp541FileName(file.name);

      if (skippedSheets.length > 0) {
        const parsedCount = wb.SheetNames.length - skippedSheets.length - (wb.SheetNames.includes("Formula") ? 1 : 0);
        alert(`Uploaded — parsed ${parsedCount} sheet(s) successfully.\n\nCouldn't find a "LOCATION" column header on ${skippedSheets.length} sheet(s), so they were skipped: ${skippedSheets.join(", ")}.\n\nIf that sheet should have data, check its header row matches the expected format.`);
      }
    } catch {
      alert("Could not read the file. Make sure it is a valid .xlsx file.");
    }
  }

  async function exportUpdatedOp541() {
    if (!op541BufferBytes) {
      alert("The original OP 541 file isn't in this browser session (this happens after loading a visit that was saved on another device — the file itself isn't synced, only your answers).\n\nUse \"Change file\" above to re-upload the same OP 541 file, then export again. Your existing answers and comments will be kept.");
      return;
    }
    if (op541Sections.length === 0) {
      alert("No OP 541 data to export.");
      return;
    }

    try {
      const { buffer, cellsWritten, sheetsWritten } = await writeBackToOriginalWorkbook(op541BufferBytes, op541Sections, op541States, op541Comments, buildVehicleWrites(op541Sections, op541VehicleInfo, { name: { row: 4, col: 2 }, num: { row: 5, col: 2 } }));
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = op541FileName.replace(/\.xlsx?$/i, "");
      a.download = `${baseName}_OnSite_${meta.date ? meta.date.replace(/\//g, "-") : "completed"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (cellsWritten === 0) {
        alert("Downloaded, but no matching answers were written — check that you've marked at least one Y/N/N/A on this tab.");
      } else {
        alert(`Export complete — wrote ${cellsWritten} value${cellsWritten !== 1 ? "s" : ""} across ${sheetsWritten} sheet${sheetsWritten !== 1 ? "s" : ""}.`);
      }
    } catch (err) {
      console.error("Write-back export failed. Full stack:\n" + (err.stack || err));
      alert("Export failed. The file may be password-protected or use an unsupported format.\n\n" + err.message + "\n\n(Full details logged to the browser console — press F12.)");
    }
  }

  async function exportUpdatedOp541t() {
    if (!op541tBufferBytes) {
      alert("The original OP 541T file isn't in this browser session (this happens after loading a visit that was saved on another device — the file itself isn't synced, only your answers).\n\nUse \"Change file\" above to re-upload the same OP 541T file, then export again. Your existing answers and comments will be kept.");
      return;
    }
    if (op541tSections.length === 0) {
      alert("No OP 541T data to export.");
      return;
    }

    try {
      const { buffer, cellsWritten, sheetsWritten } = await writeBackToOriginalWorkbook(
        op541tBufferBytes, op541tSections, op541tStates, op541tComments,
        buildVehicleWrites(op541tSections, op541VehicleInfo, { name: { row: 2, col: 1 }, num: { row: 3, col: 1 } }),
        buildPersonnelResponseSheetRows(personnelSlots, personnelItems, personnelAnswers, personnelDates, personnelComments)
      );
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = op541tFileName.replace(/\.xlsx?$/i, "");
      a.download = `${baseName}_OnSite_${meta.date ? meta.date.replace(/\//g, "-") : "completed"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (cellsWritten === 0) {
        alert("Downloaded, but no matching answers were written — check that you've marked at least one Y/N/N/A on this tab.");
      } else {
        alert(`Export complete — wrote ${cellsWritten} value${cellsWritten !== 1 ? "s" : ""} across ${sheetsWritten} sheet${sheetsWritten !== 1 ? "s" : ""}.`);
      }
    } catch (err) {
      console.error("Write-back export failed. Full stack:\n" + (err.stack || err));
      alert("Export failed. The file may be password-protected or use an unsupported format.\n\n" + err.message + "\n\n(Full details logged to the browser console — press F12.)");
    }
  }

  // Adds a new employee card, assigning it the next free (sheetName, col) slot
  // across whichever Personnel Records sheet(s) actually exist in the uploaded
  // file (checked in file order, so "Personnel Records" fills before
  // "Additional Personnel Records"). Name/Job Title/Hire Date start blank —
  // the specialist types them in, same as any employee not already on file.
  function addPersonnelEmployee() {
    const used = new Set(personnelSlots.map(s => `${s.sheetName}|${s.col}`));
    for (const sheetName of personnelSheetNames) {
      for (const col of PERSONNEL_EMPLOYEE_COLS) {
        const k = `${sheetName}|${col}`;
        if (!used.has(k)) {
          setPersonnelSlots(prev => [...prev, { sheetName, col, name: "", jobTitle: "", hireDate: "" }]);
          return;
        }
      }
    }
    const max = personnelSheetNames.length * PERSONNEL_EMPLOYEE_COLS.length;
    alert(`This file has room for ${max} employees across ${personnelSheetNames.join(" / ") || "its Personnel Records sheet(s)"}, and all slots are filled.`);
  }

  function removePersonnelEmployee(slot) {
    const sid = `${slot.sheetName}|${slot.col}`;
    setPersonnelSlots(prev => prev.filter(s => `${s.sheetName}|${s.col}` !== sid));
    setPersonnelAnswers(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.endsWith(`|${sid}`)) delete next[k]; });
      return next;
    });
    setPersonnelDates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.endsWith(`|${sid}`)) delete next[k]; });
      return next;
    });
  }

  function updatePersonnelSlot(sheetName, col, field, value) {
    setPersonnelSlots(prev => prev.map(s => (s.sheetName === sheetName && s.col === col) ? { ...s, [field]: value } : s));
  }

  async function handleOp541tUpload(file) {
    try {
      const buf = await file.arrayBuffer();
      setOp541tBufferBytes(new Uint8Array(buf)); // store for write-back export
      const wb = XLSX.read(buf, { type: "array" });
      const allSections = [];
      const skippedSheets = [];
      let globalIdx = 0;
      let parsedPersonnelSlots = [];
      let parsedPersonnelItems = null;
      const parsedPersonnelSheetNames = [];

      for (const sheetName of wb.SheetNames) {
        if (sheetName === "Formula") continue;

        if (sheetName === "Personnel Records" || sheetName === "Additional Personnel Records") {
          parsedPersonnelSheetNames.push(sheetName);
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const parsed = parsePersonnelSheet(rows, sheetName);
          parsedPersonnelSlots = parsedPersonnelSlots.concat(parsed.slots);
          if (!parsedPersonnelItems && parsed.items.length > 0) parsedPersonnelItems = parsed.items;
          continue;
        }

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const isVehicle = sheetName.startsWith("Vehicle");

        let sheetLabel = sheetName.replace(/_/g, " ");

        // For vehicle sheets, try to extract unit number from row 4 col C (index 3)
        if (isVehicle && rows.length > 4) {
          const unitNum = String(rows[4][3] || "").trim();
          sheetLabel = unitNum ? `Unit # ${unitNum}` : sheetName;
        }

        let hRow = -1, cDesc = 1, cLoc = 2, cComments = 4, cOnSite = null;

        if (isVehicle) {
          // Vehicle sheets: desc=col A(0), loc=col B(1), on-site=col C(2), comments=col D(3)
          hRow = 6; cDesc = 0; cLoc = 1; cComments = 3; cOnSite = 2;
        } else {
          // Facility sheet: policy=col A(0), desc=col B(1), loc=col C(2), on-site=col D(3), comments=col E(4)
          hRow = 5; cDesc = 1; cLoc = 2; cComments = 4; cOnSite = 3;
        }

        if (hRow < 0 || hRow >= rows.length) { skippedSheets.push(sheetName); continue; }

        let curSection = null;
        for (let i = hRow + 1; i < rows.length; i++) {
          const row = rows[i];
          const desc     = String(row[cDesc]   || "").trim();
          const locAns   = cLoc >= 0 ? String(row[cLoc] || "").trim().toUpperCase() : "";
          const locComment = String(row[cComments] || "").trim();
          const policy   = cDesc > 0 ? String(row[0] || "").trim() : "";

          if (!desc) continue;
          if (desc.toUpperCase() === "TOTAL" || desc.startsWith("=")) continue;

          // Detect section headers: all-caps, no policy number
          const hasPolicyNum = /^\d+\.\d+/.test(policy);
          const isHeader = !hasPolicyNum && desc === desc.toUpperCase() && desc.length > 2 && !/^\d/.test(desc) && !["Y", "N", "NA", "N/A"].includes(desc);

          if (isHeader) {
            curSection = { sheetLabel, label: desc, items: [] };
            allSections.push(curSection);
          } else {
            if (!curSection) {
              curSection = { sheetLabel, label: "", items: [] };
              allSections.push(curSection);
            }
            // Skip formula rows
            if (locAns.startsWith("=")) continue;
            curSection.items.push({
              key: `op541t-${globalIdx++}`,
              policy,
              text: desc,
              locAns: ["Y","N","NA","N/A"].includes(locAns) ? locAns : "",
              locComment,
              rowIdx: i,        // row index in the sheet (for write-back)
              sheetName,        // actual Excel sheet name (for write-back)
              cOnSite,          // On-Site Visit column index (for write-back)
              cComments,        // Comments column index (for write-back)
            });
          }
        }
      }

      // Remove empty sections
      const filtered = allSections.filter(s => s.items.length > 0);

      setOp541tSections(filtered);
      // Re-uploading the same file (e.g. after loading a visit synced from
      // another device, where the original file bytes aren't available) must
      // not wipe answers already entered — see the matching comment in
      // handleOp541Upload above.
      setOp541tStates(prev => {
        const ns = {};
        filtered.forEach(sec => sec.items.forEach(item => { ns[item.key] = prev[item.key] ?? null; }));
        return ns;
      });
      setOp541tComments(prev => {
        const nc = {};
        filtered.forEach(sec => sec.items.forEach(item => { nc[item.key] = prev[item.key] ?? ""; }));
        return nc;
      });
      setOp541tFileName(file.name);

      // Merge parsed Personnel Records slots with whatever's already in state
      // (from this session, or restored from a saved/synced visit) instead of
      // replacing wholesale — otherwise re-uploading the file after loading a
      // visit on a new device would silently discard any employee added via
      // "+ Add Employee" and every specialist-entered field/answer, since none
      // of that lives in the uploaded file to be re-parsed.
      const existingBySid = new Map(personnelSlots.map(s => [`${s.sheetName}|${s.col}`, s]));
      parsedPersonnelSlots.forEach(ps => {
        const sid = `${ps.sheetName}|${ps.col}`;
        if (!existingBySid.has(sid)) existingBySid.set(sid, ps);
      });
      const mergedSlots = Array.from(existingBySid.values());
      const mergedItems = parsedPersonnelItems || personnelItems;

      setPersonnelSlots(mergedSlots);
      setPersonnelItems(mergedItems);
      setPersonnelSheetNames(prevNames => {
        const merged = new Set([...prevNames, ...parsedPersonnelSheetNames]);
        return Array.from(merged);
      });
      const pa = {}, pd = {}, pc = {};
      mergedItems.forEach(item => {
        pc[item.key] = personnelComments[item.key] ?? (item.comment || "");
        mergedSlots.forEach(slot => {
          const key = `${item.key}|${slot.sheetName}|${slot.col}`;
          if (item.answerType === "yn") pa[key] = personnelAnswers[key] ?? null;
          else pd[key] = personnelDates[key] ?? "";
        });
      });
      setPersonnelAnswers(pa);
      setPersonnelDates(pd);
      setPersonnelComments(pc);

      if (skippedSheets.length > 0) {
        const parsedCount = wb.SheetNames.length - skippedSheets.length;
        alert(`Uploaded — parsed ${parsedCount} sheet(s) successfully.\n\n${skippedSheets.length} sheet(s) didn't match the expected header layout and were skipped: ${skippedSheets.join(", ")}.\n\nIf that sheet should have data, check its header row matches the expected format.`);
      }
    } catch {
      alert("Could not read the OP 541T file. Make sure it is a valid .xlsx file.");
    }
  }

  // Adds a new employee card to the JC 427 tab, assigning it the next free
  // column in the uploaded sheet (up to however many employee columns
  // parseJC427Sheet actually found — this file has no overflow sheet like
  // OP 541T's Personnel Records, so it's a hard cap).
  function addJC427Employee() {
    if (!jc427Meta) return;
    const used = new Set(jc427Slots.map(s => `${s.sheetName}|${s.col}`));
    for (const sheetName of jc427SheetNames) {
      for (const col of jc427Meta.employeeCols) {
        const k = `${sheetName}|${col}`;
        if (!used.has(k)) {
          setJc427Slots(prev => [...prev, { sheetName, col, name: "", jobTitle: "", hireDate: "" }]);
          return;
        }
      }
    }
    const max = jc427SheetNames.length * jc427Meta.employeeCols.length;
    alert(`This template has room for ${max} employees, and all slots are filled.`);
  }

  function removeJC427Employee(slot) {
    const sid = `${slot.sheetName}|${slot.col}`;
    setJc427Slots(prev => prev.filter(s => `${s.sheetName}|${s.col}` !== sid));
    setJc427Answers(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.endsWith(`|${sid}`)) delete next[k]; });
      return next;
    });
    setJc427Dates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.endsWith(`|${sid}`)) delete next[k]; });
      return next;
    });
  }

  function updateJC427Slot(sheetName, col, field, value) {
    setJc427Slots(prev => prev.map(s => (s.sheetName === sheetName && s.col === col) ? { ...s, [field]: value } : s));
  }

  async function exportUpdatedJC427() {
    if (!jc427BufferBytes) {
      alert("The JC 427 template hasn't finished loading yet — check your connection and try again in a moment. If this keeps happening, reload the page.");
      return;
    }
    if (jc427Items.length === 0) {
      alert("No JC 427 data to export.");
      return;
    }
    try {
      const { buffer, cellsWritten, sheetsWritten } = await writeBackToOriginalWorkbook(
        jc427BufferBytes, [], {}, {}, [], [],
        buildJC427Writes(jc427Slots, jc427Items, jc427Answers, jc427Dates, jc427Comments, jc427Meta)
      );
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const loc = (meta.location || "Location").replace(/\s+/g, "_");
      a.download = `JC427_${loc}_${meta.date ? meta.date.replace(/\//g, "-") : "completed"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (cellsWritten === 0) {
        alert("Downloaded, but no matching answers were written — check that you've entered at least one item on this tab.");
      } else {
        alert(`Export complete — wrote ${cellsWritten} value${cellsWritten !== 1 ? "s" : ""} across ${sheetsWritten} sheet${sheetsWritten !== 1 ? "s" : ""}.`);
      }
    } catch (err) {
      console.error("Write-back export failed. Full stack:\n" + (err.stack || err));
      alert("Export failed. The file may be password-protected or use an unsupported format.\n\n" + err.message + "\n\n(Full details logged to the browser console — press F12.)");
    }
  }

  function startFresh() {
    if (!window.confirm("Clear all data and start a new visit? This cannot be undone.")) return;
    clearDraft();
    const b = initStates();
    setMeta({ lawson: "", location: "", city: "", specialist: auth.currentUser?.displayName || "", date: new Date().toLocaleDateString("en-US"), followUpDate: "", followUpTime: "" });
    setForm(b);
    setOp541Sections([]); setOp541States({}); setOp541Comments({}); setOp541FileName(""); setOp541VehicleInfo({}); setOp541BufferBytes(null);
    setOp541tSections([]); setOp541tStates({}); setOp541tComments({}); setOp541tFileName(""); setOp541tBufferBytes(null);
    setPersonnelSlots([]); setPersonnelItems([]); setPersonnelAnswers({}); setPersonnelDates({}); setPersonnelComments({}); setPersonnelSheetNames([]);
    // jc427Items/SheetName/Meta/BufferBytes describe the bundled template
    // itself (not per-visit data) and are left alone — only the employees
    // and their answers reset for the new visit.
    setJc427Slots([]); setJc427Answers({}); setJc427Dates({}); setJc427Comments({});
    setTabComments({ pstSetup: "", pstMaintenance: "", clinician: "", vent: "" });
    setActiveTab(0); setView("form"); setEmailText(""); setReportLines([]); setHasDraft(false); setSavedAt(null);
    setCurrentVisitId(null); setVisitFinalized(false);
    setTabPatientInfo({ pstSetup: { globalId: "", currentRx: "" }, pstMaintenance: { globalId: "", currentRx: "" }, clinician: { globalId: "", currentRx: "" }, vent: { globalId: "", currentRx: "" } });
    setAdditionalComments("");
  }

  // The visit document as this device currently sees it. Shared by the explicit
  // "Save Progress" button and the periodic background sync below so the two can
  // never drift into writing different shapes.
  function buildVisitPayload(id) {
    return {
      id,
      label: `${meta.location || "Unknown Location"} — ${meta.date}`,
      savedAt: new Date().toISOString(),
      meta, states, comments,
      op541Sections, op541States, op541Comments, op541FileName, op541VehicleInfo,
      op541tSections, op541tStates, op541tComments, op541tFileName,
      personnelSlots, personnelItems, personnelAnswers, personnelDates, personnelComments, personnelSheetNames,
      jc427Slots, jc427Items, jc427Answers, jc427Dates, jc427Comments, jc427SheetNames, jc427Meta,
      tabComments, tabPatientInfo, additionalComments,
    };
  }

  async function saveProgress() {
    // Reuse the existing visit ID so repeated saves update in place rather than creating duplicates
    const id = currentVisitId || `visit_${meta.location?.replace(/\s+/g,"_") || "unknown"}_${Date.now()}`;
    const visit = buildVisitPayload(id);
    saveVisitToStorage(visit);
    // Trend data is NOT written here — use "Finalize Visit" to commit to trend tracking
    setSavedVisits(loadVisits());
    setCurrentVisitId(id);
    saveReminderAnchor.current = Date.now();
    setShowSaveReminder(false);
    try {
      await saveVisitToFirestore(visit);
      setVisitSaveError(false);
      alert(`Visit saved: ${visit.label}`);
    } catch {
      setVisitSaveError(true);
      alert(`Visit saved on this device: ${visit.label}\n\nCould not sync to the cloud, so it won't show up on another device yet — check your connection and save again once you're back online.`);
    }
  }

  // Silent cloud autosave.
  //
  // Auth persistence is already handled (see the comment in firebase.js), but
  // Safari on iPad purges site storage after roughly a week idle or under
  // storage pressure, and that takes the local draft with it. Anything the
  // specialist had not explicitly "Save Progress"-ed at that moment has no
  // cloud copy left to fall back on — which is how a whole section filled in on
  // an iPad disappeared after a "timeout". This shrinks that exposure to ~90s.
  //
  // It writes through the same merge-safe saveVisitToFirestore path as the
  // button, so a background write can never clobber another device's sections.
  const autosaveRef = useRef(null);
  useEffect(() => {
    // Refreshed after every render so the interval below never closes over a
    // stale payload builder or visit id.
    autosaveRef.current = { currentVisitId, location: meta.location, buildVisitPayload };
  });
  useEffect(() => {
    const t = setInterval(() => {
      const snap = autosaveRef.current;
      if (!snap?.location || !auth.currentUser) return;
      const id = snap.currentVisitId || `visit_${snap.location.replace(/\s+/g, "_")}_${Date.now()}`;
      const visit = snap.buildVisitPayload(id);
      saveVisitToStorage(visit);
      setSavedVisits(loadVisits());
      // Claim the generated id so the next autosave updates in place instead of
      // creating a second document for the same visit.
      setCurrentVisitId(id);
      saveVisitToFirestore(visit)
        .then(() => setVisitSaveError(false))
        .catch(() => setVisitSaveError(true));
    }, 90 * 1000);
    return () => clearInterval(t);
  }, []);

  async function finalizeVisit() {
    if (!currentVisitId) {
      alert("Save the visit first before finalizing.");
      return;
    }
    if (!window.confirm("Mark this visit as finalized? This will record it in your trend data.\n\nYou can re-finalize after making changes to update the trend entry.")) return;
    try {
      await writeTrendData(currentVisitId, meta, locations, SECTIONS, states, comments, op541Sections, op541States, op541Comments, op541tSections, op541tStates, op541tComments, tabComments, personnelSlots, personnelItems, personnelAnswers, personnelComments, jc427Slots, jc427Items, jc427Answers, jc427Dates, jc427Comments);
      setVisitFinalized(true);
      alert("Visit finalized and recorded in trend data.");
    } catch {
      alert("Trend data saved locally but could not sync to the company database. Check your internet connection and try again.");
    }
  }

  function generateChecklistLink() {
    if (!currentVisitId) { alert('Save this visit first ("Save Progress") so it has a visit ID to link the checklist to.'); return; }
    const visit = { meta, states, comments, op541Sections, op541States, op541Comments, op541tSections, op541tStates, op541tComments, op541VehicleInfo, personnelSlots, personnelItems, personnelAnswers, personnelComments, jc427Slots, jc427Items, jc427Answers, jc427Dates, jc427Comments };
    setChecklistLinkLoading(true);
    ensureChecklistDoc(visit, currentVisitId)
      .then(url => setChecklistLink(url))
      .catch(() => alert("Couldn't create the checklist. Check your internet connection and try again."))
      .finally(() => setChecklistLinkLoading(false));
  }

  function loadVisit(visit) {
    setCurrentVisitId(visit.id ?? null);
    setChecklistLink("");
    setMeta(visit.meta ?? {});
    setForm({ states: visit.states ?? {}, comments: visit.comments ?? {} });
    setOp541Sections(visit.op541Sections ?? []);
    setOp541States(visit.op541States ?? {});
    setOp541Comments(visit.op541Comments ?? {});
    setOp541FileName(visit.op541FileName ?? "");
    setOp541VehicleInfo(visit.op541VehicleInfo ?? {});
    setOp541tSections(visit.op541tSections ?? []);
    setOp541tStates(visit.op541tStates ?? {});
    setOp541tComments(visit.op541tComments ?? {});
    setOp541tFileName(visit.op541tFileName ?? "");
    setPersonnelSlots(visit.personnelSlots ?? []);
    setPersonnelItems(visit.personnelItems ?? []);
    setPersonnelAnswers(visit.personnelAnswers ?? {});
    setPersonnelDates(visit.personnelDates ?? {});
    setPersonnelComments(visit.personnelComments ?? {});
    setPersonnelSheetNames(visit.personnelSheetNames ?? []);
    // jc427Items/SheetName/Meta describe the bundled template itself, always
    // sourced live from the fetch effect — not restored from the saved visit.
    setJc427Slots(visit.jc427Slots ?? []);
    setJc427Answers(visit.jc427Answers ?? {});
    setJc427Dates(visit.jc427Dates ?? {});
    setJc427Comments(visit.jc427Comments ?? {});
    setTabComments(visit.tabComments ?? { pstSetup: "", pstMaintenance: "", clinician: "", vent: "" });
    setTabPatientInfo(visit.tabPatientInfo ?? { pstSetup: { globalId: "", currentRx: "" }, pstMaintenance: { globalId: "", currentRx: "" }, clinician: { globalId: "", currentRx: "" }, vent: { globalId: "", currentRx: "" } });
    setAdditionalComments(visit.additionalComments ?? "");
    // jc427BufferBytes is left alone — it's the bundled template's bytes,
    // not per-visit data, and stays valid across a visit load.
    setActiveTab(0); setView("form"); setEmailText(""); setReportLines([]); setOp541BufferBytes(null); setOp541tBufferBytes(null);
    setVisitFinalized(false);
    setShowVisits(false);
  }

  function deleteVisit(id) {
    deleteVisitFromStorage(id);
    deleteTrendVisit(id);
    setSavedVisits(loadVisits());
    deleteVisitFromFirestore(id).catch(() => {}); // best-effort — it's already gone locally either way
  }

  function generateOutputs() {
    const issues = getAllIssues();
    const summaryData = buildSummaryData();
    const loc  = meta.location  || "[Location]";
    const city = meta.city      || "[City, ST]";
    const spec = meta.specialist || "[Specialist]";
    const date = meta.date      || new Date().toLocaleDateString("en-US");

    const issueBlock = issues.length === 0
      ? "No issues identified. All reviewed areas are compliant."
      : issues.map(i => `- [${i.section}] ${i.text}${i.comment ? ` — Note: ${i.comment}` : ""}`).join("\n");

    setEmailText(`Subject: Accreditation Survey Prep Follow-Up — ${loc}, ${city} — ${date}\n\nHello,\n\nThank you for your time during the accreditation survey prep visit on ${date} for ${loc}, ${city}.\n\n${issues.length === 0 ? "All reviewed areas were found to be in compliance. No corrective action is required at this time." : `The following items require corrective action:\n\n${issueBlock}\n\nPlease address each item and report back with your findings. A follow-up Teams call with the LCM and Area/Region Manager will be scheduled.`}\n\nBest regards,\n${spec}\nAccreditation Specialist`);
    setReportLines(summaryData);
    setView("email");
  }

  async function exportFollowUpXLSX() {
    // ── Collect issues grouped by tab ──
    // Each tab becomes one Excel sheet. Only tabs that have at least one "no" appear.
    const tabGroups = [];

    // Regular checklist sections
    SECTIONS.forEach((sec, si) => {
      const issues = sec.items.flatMap((item, ii) => {
        const key = `${si}-${ii}`;
        if (states[key] === "no") return [{ text: item.text, comment: comments[key] || "" }];
        return [];
      });
      if (issues.length > 0) tabGroups.push({ label: sec.label, ref: sec.ref, issues });
    });

    // OP 541 sheets
    op541Sections.forEach(sec => {
      const issues = sec.items.flatMap(item => {
        if (op541States[item.key] === "no")
          return [{ text: item.text, comment: op541Comments[item.key] || "", mismatch: item.locAns === "Y" }];
        return [];
      });
      if (issues.length > 0)
        tabGroups.push({ label: `OP 541 — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`, ref: "OP 541 Location Readiness Tool", issues });
    });

    // OP 541T sheets
    op541tSections.forEach(sec => {
      const issues = sec.items.flatMap(item => {
        if (op541tStates[item.key] === "no")
          return [{ text: item.text, comment: op541tComments[item.key] || "", mismatch: item.locAns === "Y" }];
        return [];
      });
      if (issues.length > 0)
        tabGroups.push({ label: `OP 541T — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`, ref: "OP 541T Transfill", issues });
    });

    if (tabGroups.length === 0) { alert("No issues found to export."); return; }

    try {
      const JSZip = (await import("jszip")).default;

      // ── XML helpers ──
      const esc = s => String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      // styleId indexes into the cellXfs table built below — 0 is the plain
      // default, everything else is one of the named looks (title band,
      // meta row, column header, bordered data cell, etc).
      const strCell = (addr, val, styleId = 0) =>
        `<c r="${addr}" s="${styleId}" t="inlineStr"><is><t>${esc(val)}</t></is></c>`;

      // Build one worksheet XML for a given tab's issues
      // Columns: A=Item Description  B=Corrective Action Status (dropdown)  C=Notes
      // Row layout: 1=title band, 2-3=visit meta, 4=column headers, 5+=data.
      // Style ids (the "s" on each <c>) reference the cellXfs table in
      // stylesXml below: 1=title, 3=meta, 4=column header, 5=data (wrap),
      // 6=data (centered, for the dropdown). Style id 2 (subtitle band) is
      // no longer used on a row of its own but stays defined in stylesXml
      // since renumbering the cellXfs table would require re-indexing every
      // other style id too.
      const DATA_START_ROW = 5;
      const buildSheetXml = (issues) => {
        const maxRow = issues.length + DATA_START_ROW - 1;

        const titleRow = `<row r="1" ht="26" customHeight="1" spans="1:3">` +
          strCell("A1", "Rotech Survey Prep Virtual Follow-Up Tracker", 1) +
          `<c r="B1" s="1"/><c r="C1" s="1"/>` +
          `</row>`;

        const metaRow1 = `<row r="2" spans="1:3">` +
          strCell("A2", `Location: ${meta.location || "—"}`, 3) +
          strCell("B2", `Visit Date: ${meta.date || "—"}`, 3) +
          strCell("C2", `Specialist: ${meta.specialist || "—"}`, 3) +
          `</row>`;

        const metaRow2 = `<row r="3" spans="1:3">` +
          strCell("A3", `City / State: ${meta.city || "—"}`, 3) +
          strCell("B3", `Export Date: ${new Date().toLocaleDateString("en-US")}`, 3) +
          strCell("C3", "Rotech Survey Prep", 3) +
          `</row>`;

        const colHeaderRow = `<row r="4" ht="20" customHeight="1" spans="1:3">` +
          strCell("A4", "Item / Finding", 4) +
          strCell("B4", "Corrected? (Yes / No / Pending)", 4) +
          strCell("C4", "Notes / Comments", 4) +
          `</row>`;

        const dataRows = issues.map((iss, idx) => {
          const r = idx + DATA_START_ROW;
          const noteText = [iss.comment, iss.mismatch ? "⚠ Mismatch — location self-audit marked compliant" : ""]
            .filter(Boolean).join(" | ");
          return `<row r="${r}" spans="1:3">` +
            strCell(`A${r}`, iss.text, 5) +
            `<c r="B${r}" s="6" t="inlineStr"><is><t></t></is></c>` +
            strCell(`C${r}`, noteText, 5) +
            `</row>`;
        }).join("");

        const mergeCells = `<mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>`;

        // CF: green for Yes, red for No, amber for Pending — applied to col B data rows
        const cfSqref = `B${DATA_START_ROW}:B${Math.max(maxRow, DATA_START_ROW + 199)}`;
        const cf = `<conditionalFormatting sqref="${cfSqref}">` +
          `<cfRule type="containsText" priority="1" operator="containsText" dxfId="0" text="Yes"><formula>NOT(ISERROR(SEARCH("Yes",B${DATA_START_ROW})))</formula></cfRule>` +
          `<cfRule type="containsText" priority="2" operator="containsText" dxfId="1" text="No"><formula>NOT(ISERROR(SEARCH("No",B${DATA_START_ROW})))</formula></cfRule>` +
          `<cfRule type="containsText" priority="3" operator="containsText" dxfId="2" text="Pending"><formula>NOT(ISERROR(SEARCH("Pending",B${DATA_START_ROW})))</formula></cfRule>` +
          `</conditionalFormatting>`;

        // Data validation: Yes/No/Pending dropdown on col B data rows
        const dvSqref = cfSqref;
        const dv = `<dataValidations count="1">` +
          `<dataValidation sqref="${dvSqref}" showDropDown="0" showInputMessage="1" showErrorMessage="1" allowBlank="1" ` +
          `errorTitle="Invalid Entry" error="Please select &quot;Yes&quot;, &quot;No&quot;, or &quot;Pending&quot;." ` +
          `promptTitle="Item Corrected?" prompt="Select &quot;Yes&quot; if resolved, &quot;No&quot; if still open, &quot;Pending&quot; if in progress." ` +
          `type="list"><formula1>"Yes,No,Pending"</formula1></dataValidation>` +
          `</dataValidations>`;

        // Col widths: A=58, B=30, C=45
        const cols = `<cols><col min="1" max="1" width="58" customWidth="1"/>` +
          `<col min="2" max="2" width="30" customWidth="1"/>` +
          `<col min="3" max="3" width="45" customWidth="1"/></cols>`;

        // Freeze everything above the data rows so the title/meta/column
        // headers stay put while scrolling through a long findings list.
        const frozenRows = DATA_START_ROW - 1;
        const sheetViews = `<sheetViews><sheetView tabSelected="0" workbookViewId="0">` +
          `<pane ySplit="${frozenRows}" topLeftCell="A${DATA_START_ROW}" activePane="bottomLeft" state="frozen"/>` +
          `<selection pane="bottomLeft" activeCell="A${DATA_START_ROW}" sqref="A${DATA_START_ROW}"/>` +
          `</sheetView></sheetViews>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          sheetViews +
          cols +
          `<sheetData>` +
          titleRow + metaRow1 + metaRow2 + colHeaderRow + dataRows +
          `</sheetData>` +
          mergeCells +
          cf + dv +
          `</worksheet>`;
      };

      // ── Build styles.xml: brand-colored title/subtitle bands, a shaded
      // meta row, bordered column headers, and bordered/wrapped data cells —
      // plus the 3 dxf entries the Corrected? dropdown's conditional
      // formatting needs. Colors match the app's own STATUS_COLORS palette
      // for Yes/No so the exported sheet reads consistently with the app.
      const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="5">` +
          `<font><sz val="11"/><name val="Calibri"/></font>` +
          `<font><b val="1"/><sz val="14"/><color rgb="00FFFFFF"/><name val="Calibri"/></font>` +
          `<font><i val="1"/><sz val="10"/><color rgb="00FFFFFF"/><name val="Calibri"/></font>` +
          `<font><b val="1"/><sz val="10"/><color rgb="001A3A5C"/><name val="Calibri"/></font>` +
          `<font><b val="1"/><sz val="11"/><color rgb="00FFFFFF"/><name val="Calibri"/></font>` +
        `</fonts>` +
        `<fills count="5">` +
          `<fill><patternFill patternType="none"/></fill>` +
          `<fill><patternFill patternType="gray125"/></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="001A3A5C"/><bgColor rgb="001A3A5C"/></patternFill></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="002E6DA4"/><bgColor rgb="002E6DA4"/></patternFill></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="00F5F5F5"/><bgColor rgb="00F5F5F5"/></patternFill></fill>` +
        `</fills>` +
        `<borders count="2">` +
          `<border><left/><right/><top/><bottom/><diagonal/></border>` +
          `<border>` +
            `<left style="thin"><color rgb="00CCCCCC"/></left>` +
            `<right style="thin"><color rgb="00CCCCCC"/></right>` +
            `<top style="thin"><color rgb="00CCCCCC"/></top>` +
            `<bottom style="thin"><color rgb="00CCCCCC"/></bottom>` +
            `<diagonal/>` +
          `</border>` +
        `</borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="7">` +
          `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0: default
          `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>` + // 1: title band
          `<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>` + // 2: subtitle band
          `<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>` + // 3: meta row
          `<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 4: column header
          `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>` + // 5: data cell (wrap)
          `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 6: data cell (centered dropdown)
        `</cellXfs>` +
        `<dxfs count="3">` +
          `<dxf><font><b val="1"/><color rgb="002E7D32"/></font><fill><patternFill patternType="solid"><fgColor rgb="00E8F5E9"/><bgColor rgb="00E8F5E9"/></patternFill></fill></dxf>` +
          `<dxf><font><b val="1"/><color rgb="00C62828"/></font><fill><patternFill patternType="solid"><fgColor rgb="00FFEBEE"/><bgColor rgb="00FFEBEE"/></patternFill></fill></dxf>` +
          `<dxf><font><b val="1"/><color rgb="00F57F17"/></font><fill><patternFill patternType="solid"><fgColor rgb="00FFF9C4"/><bgColor rgb="00FFF9C4"/></patternFill></fill></dxf>` +
        `</dxfs>` +
        `</styleSheet>`;

      // ── Truncate sheet names to 31 chars (Excel limit) and deduplicate ──
      const usedNames = {};
      const sheetMeta = tabGroups.map(tg => {
        let name = tg.label.replace(/[\\/*?[\]]/g, "").slice(0, 31);
        if (usedNames[name] !== undefined) {
          usedNames[name]++;
          name = name.slice(0, 28) + ` (${usedNames[name]})`;
        } else {
          usedNames[name] = 0;
        }
        return { ...tg, sheetName: name };
      });

      // ── Build workbook.xml ──
      const sheetsXml = sheetMeta.map((s, i) =>
        `<sheet name="${esc(s.sheetName)}" sheetId="${i + 1}" r:id="rId${i + 2}"/>`
      ).join("");

      const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${sheetsXml}</sheets></workbook>`;

      // ── Build workbook relationships ──
      // rId1 = styles, rId2+ = sheets
      const wbRelsEntries = [
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
        ...sheetMeta.map((_, i) =>
          `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
      ].join("");

      const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRelsEntries}</Relationships>`;

      // ── Content types ──
      const sheetContentTypes = sheetMeta.map((_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      ).join("");

      const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheetContentTypes +
        `</Types>`;

      // ── Root .rels ──
      const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`;

      // ── Assemble zip ──
      const zip = new JSZip();
      zip.file("[Content_Types].xml", contentTypesXml);
      zip.file("_rels/.rels", rootRelsXml);
      zip.file("xl/workbook.xml", workbookXml);
      zip.file("xl/_rels/workbook.xml.rels", wbRelsXml);
      zip.file("xl/styles.xml", stylesXml);
      sheetMeta.forEach((s, i) => {
        zip.file(`xl/worksheets/sheet${i + 1}.xml`, buildSheetXml(s.issues));
      });

      // ── Download ──
      const outBuf = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
      const blob   = new Blob([outBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      const loc    = (meta.location || "Location").replace(/\s+/g, "_");
      // meta.city is a single free-text "City / State" field (e.g. "Springfield, IL")
      const city   = (meta.city || "").replace(/[\\/:*?"<>|]/g, "").replace(/,\s*/g, "_").replace(/\s+/g, "_");
      const date   = (meta.date     || "").replace(/\//g, "-");
      a.href     = url;
      a.download = `FollowUp_${loc}${city ? `_${city}` : ""}_${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error(e);
      alert("Could not generate Follow-Up XLSX. Check console for details.");
    }
  }

  function exportPDF() {
    const snapshot = {
      id: `pdf_${Date.now()}`,
      label: `${meta.location || "Unknown Location"} — ${meta.date || "No Date"}`,
      location: meta.location || "",
      city: meta.city || "",
      specialist: meta.specialist || "",
      date: meta.date || "",
      generatedAt: new Date().toISOString(),
      meta, states, comments, tabComments, tabPatientInfo, additionalComments, op541VehicleInfo,
    };
    savePdfSnapshot(snapshot);
    setPdfHistory(loadPdfHistory());
    const backupOk = downloadBackupFile(snapshot, "Rotech_Backup");
    if (!backupOk) alert("Warning: automatic backup download failed. Please make sure to save the PDF from the print dialog.");

    // Browsers suggest document.title as the default filename in the
    // "Save as PDF" print dialog — swap it in just for the print, then
    // restore it, so the suggested name actually reflects this visit
    // instead of the app's static page title.
    const loc = meta.location || "Unknown Location";
    const dateStr = (meta.date || "").replace(/\//g, "-");
    const prevTitle = document.title;
    document.title = `${loc} - Survey Prep Visit Overview${dateStr ? ` - ${dateStr}` : ""}`;
    const restoreTitle = () => { document.title = prevTitle; window.removeEventListener("afterprint", restoreTitle); };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    setTimeout(restoreTitle, 5000); // fallback in case afterprint doesn't fire
  }

  function copyText(txt) {
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const isOp541Tab    = activeTab === TAB.op541;
  const isOp541tTab   = activeTab === TAB.op541t;
  const isJc427Tab    = activeTab === TAB.jc427;
  const isPolicyTab   = activeTab === TAB.policy;
  const isTrendsTab   = activeTab === TAB.trends;
  const isFollowUpTab = activeTab === TAB.followUp;
  const isRosterTab   = activeTab === TAB.roster;
  const isReadinessTab = activeTab === TAB.readiness;
  const isExtraTab = isOp541Tab || isOp541tTab || isJc427Tab || isPolicyTab || isTrendsTab || isFollowUpTab || isRosterTab;
  const sec = isExtraTab ? null : SECTIONS[activeTab];
  const op541Stats  = getOp541Stats();
  const op541tStats = getOp541tStats();

  const sectionTotals = SECTIONS.reduce((a, _, si) => {
    const s = getSectionStats(si);
    return { yes: a.yes + s.yes, no: a.no + s.no, pending: a.pending + s.pending };
  }, { yes: 0, no: 0, pending: 0 });

  const allStats = {
    yes:     sectionTotals.yes     + op541Stats.yes     + op541tStats.yes,
    no:      sectionTotals.no      + op541Stats.no      + op541tStats.no,
    pending: sectionTotals.pending + (op541Sections.length ? op541Stats.pending : 0) + (op541tSections.length ? op541tStats.pending : 0),
  };

  // ── Navigation helpers ──────────────────────────────────────────────────
  function goTab(idx) {
    setActiveTab(idx);
    setView("form");
    window.scrollTo({ top: 0 });
  }
  function goChecklist() {
    // Bounce off the read-only reference tabs so "Checklist" always lands on
    // something the specialist can actually fill in.
    if (REFERENCE_TABS.includes(activeTab)) setActiveTab(0);
    setView("form");
    window.scrollTo({ top: 0 });
  }
  function goReport() {
    // Same generation as the email flow, but landing on the report instead.
    generateOutputs();
    setView("report");
    window.scrollTo({ top: 0 });
  }
  // The Team Planner is its own module rather than a checklist tab — it has
  // nothing to do with the visit in progress, so it never touches activeTab.
  function goPlanner() {
    setView("planner");
    window.scrollTo({ top: 0 });
  }
  // Site Circuit reads the planner's site visits and writes the leadership
  // email — same standalone-module rule as the planner, no checklist state.
  function goCircuit() {
    setView("circuit");
    window.scrollTo({ top: 0 });
  }

  // The report is empty until something has actually been marked — drives the
  // empty state instead of rendering a report full of zeroes. N/A counts as
  // answered, and has to be counted for the OP 541/541T sheets too: a visit
  // where the only work done was marking uploaded self-audit rows N/A still
  // has a report worth showing.
  const answeredCount = allStats.yes + allStats.no
    + SECTIONS.reduce((a, _, si) => a + getSectionStats(si).na, 0)
    + op541Stats.na + op541tStats.na;

  // Only the OP 541 sheet's own mismatches — this is what the card prints, so
  // the highlight and the number have to agree. 541T has its own count.
  const op541Mismatches = op541Stats.mismatch;

  // A section where every item is N/A — usually the "Mark All N/A" bulk toggle
  // on a sheet that doesn't apply to this location — has nothing to report, so
  // it's dropped from the report/PDF entirely: no header, no counts, no items.
  const isAllNaSection = s => s.total > 0 && s.na === s.total;
  const visibleReportLines = reportLines.filter(s => !isAllNaSection(s));

  const specialistFirstName = (meta.specialist || "").trim().split(/\s+/)[0] || "there";

  // Shown wherever the saved-visit list is. Without it a failed read looks
  // exactly like "you have no visits from other devices", which is how a sync
  // problem stays invisible for weeks.
  const visitSyncBanner = visitSyncError ? (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, background: T.warningBg,
      color: T.warning, borderRadius: T.radius, padding: "9px 13px", fontSize: 12.5, marginBottom: 12 }}>
      <Icon name="alert-circle" size={14} />
      <span>Visits saved on another device may be missing from this list — {visitSyncError}</span>
    </div>
  ) : null;

  const navItems = [
    { key: "dashboard", label: "Dashboard",    icon: "home",            active: view === "dashboard",                     onClick: () => { setView("dashboard"); window.scrollTo({ top: 0 }); } },
    { key: "form",      label: MODULE_LABEL,   icon: "clipboard-list",  active: view === "form" && !REFERENCE_TABS.includes(activeTab), onClick: goChecklist },
    { key: "report",    label: "Report",       icon: "file-text",       active: view === "report" || view === "email",     onClick: goReport },
    { key: "trends",    label: "Issue Trends", icon: "trending-up",     active: view === "form" && isTrendsTab,            onClick: () => goTab(TAB.trends) },
    { key: "planner",   label: "Team Planner", icon: "calendar",        active: view === "planner",                        onClick: goPlanner },
    { key: "circuit",   label: "Site Circuit", icon: "mail",            active: view === "circuit",                        onClick: goCircuit },
  ];

  const headerBtn = {
    padding: "7px 14px", fontSize: 12.5, background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.3)", color: T.white, borderRadius: T.radius,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  // ── Tab rail model ──────────────────────────────────────────────────────
  // One description per tab so the rail can render, filter and measure
  // progress uniformly instead of repeating a button block per tab.
  function tabBadge(key, bg, fg, content) {
    return <span key={key} style={{ background: bg, color: fg, borderRadius: T.radiusPill, padding: "1px 7px", fontSize: 10.5, fontWeight: 600, marginLeft: 6 }}>{content}</span>;
  }
  const okBadge   = k => tabBadge(k, T.successBg, T.success, "✓");
  const doneBadge = (st, k) => (st.no === 0 && st.pending === 0 ? [okBadge(k)] : []);

  const jc427Stats = jc427TemplateStatus === "ready" ? getJC427Stats() : null;

  const tabDefs = [
    ...SECTIONS.map((s, i) => {
      const st = getSectionStats(i);
      return {
        idx: i, label: s.label, progress: st,
        group: PATIENT_FORM_IDS.includes(s.id) ? "Patient Visit Forms" : "Checklist Binders",
        badges: [
          ...(st.no > 0 ? [tabBadge("no", T.errorBg, T.error, st.no)] : []),
          ...doneBadge(st, "ok"),
        ],
      };
    }),
    {
      idx: TAB.op541, label: "OP 541 Readiness", group: "Self-Audits & Personnel",
      progress: op541Sections.length ? { ...op541Stats, total: op541Stats.yes + op541Stats.no + op541Stats.na + op541Stats.pending } : null,
      badges: [
        ...(!op541FileName ? [<span key="up" style={{ fontSize: 11, color: T.gray500, marginLeft: 6 }}>+ Upload</span>] : []),
        ...(op541FileName && op541Stats.no > 0 ? [tabBadge("no", T.errorBg, T.error, op541Stats.no)] : []),
        ...(op541FileName && op541Stats.mismatch > 0 ? [tabBadge("mm", T.warningBg, T.warning, `⚠ ${op541Stats.mismatch}`)] : []),
        ...(op541FileName ? doneBadge(op541Stats, "ok") : []),
      ],
    },
    {
      idx: TAB.op541t, label: "OP 541T Transfill", group: "Self-Audits & Personnel",
      progress: op541tSections.length ? { ...op541tStats, total: op541tStats.yes + op541tStats.no + op541tStats.na + op541tStats.pending } : null,
      badges: [
        ...(!op541tFileName ? [<span key="up" style={{ fontSize: 11, color: T.gray500, marginLeft: 6 }}>+ Upload</span>] : []),
        ...(op541tFileName && op541tStats.no > 0 ? [tabBadge("no", T.errorBg, T.error, op541tStats.no)] : []),
        ...(op541tFileName && op541tStats.mismatch > 0 ? [tabBadge("mm", T.warningBg, T.warning, `⚠ ${op541tStats.mismatch}`)] : []),
        ...(op541tFileName ? doneBadge(op541tStats, "ok") : []),
      ],
    },
    {
      idx: TAB.jc427, label: "JC 427 Personnel", progress: null, group: "Self-Audits & Personnel",
      badges: [
        ...(jc427TemplateStatus === "loading" ? [<span key="ld" style={{ fontSize: 11, color: T.gray500, marginLeft: 6 }}>Loading…</span>] : []),
        ...(jc427TemplateStatus === "error"   ? [<span key="er" style={{ fontSize: 11, color: T.error, marginLeft: 6 }}>⚠ Load failed</span>] : []),
        ...(jc427Stats && jc427Stats.no > 0       ? [tabBadge("no", T.errorBg, T.error, jc427Stats.no)] : []),
        ...(jc427Stats && jc427Stats.expired > 0  ? [tabBadge("ex", T.errorBg, T.error, `⏰ ${jc427Stats.expired}`)] : []),
        ...(jc427Stats && jc427Stats.expiring > 0 ? [tabBadge("eg", T.warningBg, T.warning, `⏰ ${jc427Stats.expiring}`)] : []),
        ...(jc427Stats && jc427Stats.no === 0 && jc427Stats.expired === 0 && jc427Stats.expiring === 0 ? [okBadge("ok")] : []),
      ],
    },
    { idx: TAB.policy,   label: "Policy Dates",     progress: null, badges: [], group: "Reference" },
    { idx: TAB.trends,   label: "Issue Trends",     progress: null, badges: [], group: "Reference" },
    { idx: TAB.followUp, label: "Follow-Ups",       progress: null, badges: [], group: "Reference" },
    { idx: TAB.roster,   label: "Location Roster",  progress: null, badges: [], group: "Reference" },
    { idx: TAB.readiness, label: "Location Readiness", progress: null, badges: [], group: "Reference" },
  ];

  const tabQuery = tabSearch.trim().toLowerCase();
  const visibleTabs = tabQuery ? tabDefs.filter(t => t.label.toLowerCase().includes(tabQuery)) : tabDefs;
  const activeTabDef = tabDefs.find(t => t.idx === activeTab) || tabDefs[0];
  // Only the tabs that track answers get a segment in the progress strip —
  // the reference lookups have nothing to be partway through.
  const progressTabs = tabDefs.filter(t => t.progress);

  function selectTab(idx) {
    setActiveTab(idx);
    setShowSectionMenu(false);
    setTabSearch("");
  }

  return (
    <div style={{ fontFamily: T.font, margin: "0 auto", background: T.gray50, minHeight: "100vh", color: T.ink }}>

      {/* Header */}
      <div className="no-print app-header" style={{ background: T.blue600, color: T.white, padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/rotech-survey-prep/rotech-logo.jpg" alt="Rotech Healthcare" style={{ height: 34, width: "auto", background: T.white, borderRadius: T.radius, padding: "4px 10px" }} />
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>Accreditation Survey Prep</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <nav aria-label="Main" style={{ display: "flex", background: "rgba(255,255,255,0.14)", borderRadius: T.radiusPill, padding: 4, gap: 2 }}>
            {navItems.map(n => (
              <button key={n.key} onClick={n.onClick} aria-current={n.active ? "page" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", fontSize: 12.5,
                  fontWeight: n.active ? 700 : 500, borderRadius: T.radiusPill, border: "none", cursor: "pointer",
                  fontFamily: "inherit", whiteSpace: "nowrap",
                  background: n.active ? T.white : "transparent",
                  color: n.active ? T.blue600 : "rgba(255,255,255,0.85)",
                }}>
                <Icon name={n.icon} size={14} />{n.label}
              </button>
            ))}
          </nav>
          {savedAt && (
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
              Auto-saved {new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, paddingLeft: 6, whiteSpace: "nowrap" }}>{meta.specialist}</span>
          <button onClick={() => signOut(auth)} style={headerBtn}>Sign out</button>
        </div>
      </div>

      {showPdfReminder && (
        <div style={{ background: T.warningBg, borderBottom: `2px solid ${T.warning}`, padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: T.warning }}>
            ⚠️ <strong>Double-check your PDF saved.</strong> A backup snapshot was downloaded to your device and stored in PDF History as a fail-safe — if the print dialog didn't actually save a PDF, reopen it with "Print / PDF" again, or recover the data anytime from PDF History below.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowVisits(true)} style={{ ...btnOutline, padding: "5px 12px", fontSize: 12, color: T.warning, borderColor: T.warning }}>View PDF History</button>
            <button onClick={() => setShowPdfReminder(false)} style={{ ...btnOutline, padding: "5px 12px", fontSize: 12, background: "transparent", color: T.warning, borderColor: T.warning, fontWeight: 500 }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Saved Visits Panel */}
      {showVisits && (
        <div style={{ background: T.white, borderBottom: `1px solid ${T.gray200}`, padding: "16px 28px" }}>
          {/* The toggle that opens this lives on the checklist screen, but the
              PDF reminder banner can open it from anywhere — so the panel has
              to carry its own way out. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.blue600 }}>Saved Visits</div>
            <button onClick={() => setShowVisits(false)} aria-label="Close saved visits"
              style={{ ...btnOutline, padding: "5px 12px", fontSize: 12, color: T.gray600, borderColor: T.gray300, fontWeight: 500 }}>
              Close
            </button>
          </div>
          {visitSyncBanner}
          {savedVisits.length === 0 ? (
            <div style={{ fontSize: 13, color: T.gray500 }}>No saved visits yet. Use "Save Progress" to save the current visit.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {savedVisits.map(v => (
                <div key={v.id} style={{ background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{v.label}</div>
                      <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 2 }}>Saved {new Date(v.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => loadVisit(v)} style={{ padding: "6px 14px", fontSize: 12, background: T.blue600, color: T.white, border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Load</button>
                      <button onClick={() => { if (window.confirm("Delete this saved visit?")) deleteVisit(v.id); }} aria-label="Delete saved visit" style={{ padding: "6px 10px", fontSize: 12, background: T.errorBg, color: T.error, border: `1px solid ${T.errorBorder}`, borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PDF History */}
          <div style={{ fontWeight: 700, fontSize: 14, color: T.blue600, marginTop: 20, marginBottom: 10 }}>PDF History <span style={{ fontSize: 11, fontWeight: 400, color: T.gray500 }}>(last 15 generated)</span></div>
          {pdfHistory.length === 0 ? (
            <div style={{ fontSize: 13, color: T.gray500 }}>No PDFs generated yet. Click "⬇ Download PDF" in the Report view to generate and auto-save a snapshot.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pdfHistory.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{s.label}</div>
                    <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 2 }}>
                      Generated {new Date(s.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      {s.specialist ? ` · ${s.specialist}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => {
                      // Load snapshot state
                      const snapStates        = s.states        || {};
                      const snapComments      = s.comments      || {};
                      const snapTabComments   = s.tabComments   || {};
                      const snapTabPatientInfo = s.tabPatientInfo || {};
                      setMeta(s.meta || {});
                      setStates(snapStates);
                      setComments(snapComments);
                      if (s.tabComments)     setTabComments(s.tabComments);
                      if (s.tabPatientInfo)  setTabPatientInfo(s.tabPatientInfo);
                      if (s.additionalComments !== undefined) setAdditionalComments(s.additionalComments);
                      if (s.op541VehicleInfo) setOp541VehicleInfo(s.op541VehicleInfo);
                      // Build reportLines directly from snapshot so report isn't blank
                      const lines = SECTIONS.map((sec, si) => {
                        const items = sec.items || [];
                        const yes     = items.filter((_, ii) => snapStates[`${si}-${ii}`] === "yes").length;
                        const no      = items.filter((_, ii) => snapStates[`${si}-${ii}`] === "no").length;
                        const na      = items.filter((_, ii) => snapStates[`${si}-${ii}`] === "na").length;
                        const pending = items.filter((_, ii) => !snapStates[`${si}-${ii}`]).length;
                        const issues  = items.flatMap((item, ii) =>
                          snapStates[`${si}-${ii}`] === "no"
                            ? [{ text: item.text, comment: snapComments[`${si}-${ii}`], type: "no" }] : []);
                        const observations = items.flatMap((item, ii) =>
                          snapStates[`${si}-${ii}`] === "yes" && snapComments[`${si}-${ii}`]
                            ? [{ text: item.text, comment: snapComments[`${si}-${ii}`] }] : []);
                        const compliantItems = items.flatMap((item, ii) =>
                          snapStates[`${si}-${ii}`] === "yes" && !snapComments[`${si}-${ii}`]
                            ? [{ text: item.text }] : []);
                        const isPSTTab = ["pstSetup", "pstMaintenance", "clinician", "vent"].includes(sec.id);
                        return {
                          label: sec.label, ref: sec.ref, yes, no, na, pending, total: items.length,
                          issues, observations, compliantItems,
                          tabComment: isPSTTab ? (snapTabComments[sec.id] || null) : null,
                          globalId:   isPSTTab ? (snapTabPatientInfo[sec.id]?.globalId || null) : null,
                          currentRx:  isPSTTab ? (snapTabPatientInfo[sec.id]?.currentRx || null) : null,
                        };
                      });
                      setReportLines(lines);
                      setView("report");
                      setShowVisits(false);
                    }} style={{ padding: "6px 14px", fontSize: 12, background: T.blue600, color: T.white, border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
                      Regenerate
                    </button>
                    <button onClick={() => { if (window.confirm("Remove this PDF record?")) { deletePdfSnapshot(s.id); setPdfHistory(loadPdfHistory()); }}} aria-label="Remove PDF record" style={{ padding: "6px 10px", fontSize: 12, background: T.errorBg, color: T.error, border: `1px solid ${T.errorBorder}`, borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DASHBOARD VIEW — landing screen after auth */}
      {view === "dashboard" && (
        <div style={{ maxWidth: WIDTH_DASHBOARD, margin: "0 auto", padding: "28px 28px 80px" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>Welcome back, {specialistFirstName}</div>
            <div style={{ fontSize: 14.5, color: T.gray600, marginTop: 3 }}>Accreditation Survey Prep Dashboard</div>
          </div>

          {/* Current visit */}
          <div style={{ ...cardStyle(T.blue600), marginBottom: 20 }}>
            <div style={{ padding: "18px 22px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Your Current Visit</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                {[
                  ["Location Name", meta.location],
                  ["Lawson #",      meta.lawson],
                  ["City / State",  meta.city],
                  ["Visit Date",    meta.date],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11.5, color: T.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: value ? T.ink : T.gray400 }}>{value || "Not set"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              [allStats.yes,     "Compliant", T.successBg, T.success],
              [allStats.no,      "Issues",    T.errorBg,   T.error],
              [allStats.pending, "Pending",   T.gray100,   T.gray600],
            ].map(([n, label, bg, fg]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, background: bg, color: fg, padding: "6px 14px", borderRadius: T.radiusPill, fontSize: 14, fontWeight: 600 }}>
                <span>{n}</span><span style={{ fontWeight: 400 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Outside the card below, which only renders when there is at least
              one visit — a sync failure with an empty local list is exactly
              when this warning most needs to be visible. */}
          {visitSyncBanner}

          {/* Recent visits */}
          {savedVisits.length > 0 && (
            <div style={{ background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radiusCard, overflow: "hidden", boxShadow: T.shadowSoft, marginBottom: 20 }}>
              <div style={{ padding: "16px 20px 6px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name="history" size={15} style={{ color: T.gray600 }} />Recent Visits
              </div>
              <div style={{ padding: "6px 12px 12px" }}>
                {savedVisits.slice(0, 5).map(v => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", margin: "2px 0", borderRadius: T.radius }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.label}</div>
                      <div style={{ fontSize: 12.5, color: T.gray500, marginTop: 2 }}>
                        Saved {new Date(v.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => { loadVisit(v); setView("form"); }}
                        style={{ padding: "6px 14px", fontSize: 13, fontWeight: 600, background: T.blue600, color: T.white, border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>Load</button>
                      <button onClick={() => { if (window.confirm("Delete this saved visit?")) deleteVisit(v.id); }} aria-label="Delete saved visit"
                        style={{ padding: "6px 10px", fontSize: 13, background: T.errorBg, color: T.error, border: `1px solid ${T.errorBorder}`, borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action cards. flex-wrap rather than css-grid so a partial last row
              spreads to fill instead of leaving empty column gaps. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[
              { accent: T.blue600, titleColor: T.blue600,  icon: "clipboard-list", title: MODULE_LABEL,           desc: `${SECTIONS.length} binders / visit forms · Morning Meeting through Ventilator Visit`, stat: `${allStats.pending} items pending`,                                    cta: "Continue Assessment", onClick: goChecklist },
              { accent: T.success, titleColor: T.success,  icon: "file-text",      title: "Survey Prep Report",   desc: "Generate the visit summary, PDF export, and follow-up checklist link",              stat: `${allStats.no} issues found so far`,                                   cta: "View Report",         onClick: goReport },
              { accent: T.warning, titleColor: T.warning,  icon: "trending-up",    title: "Issue Trend Analysis", desc: "Company-wide recurring issues, top locations, and monthly trend",                   stat: "Across all finalized visits",                                          cta: "View Trends",         onClick: () => goTab(TAB.trends) },
              { accent: T.teal,    titleColor: T.tealDeep, icon: "book-open",      title: "Policy Dates",         desc: "Reference revision dates for policies cited in the checklist",                      stat: `${Object.keys(policyDates).length} policies on file`,                  cta: "View Policy Dates",   onClick: () => goTab(TAB.policy) },
              { accent: T.blue400, titleColor: T.blue600,  icon: "list-checks",    title: "Follow-Ups",           desc: "Company-wide progress on open follow-up checklists by location",                    stat: "Open items by location",                                               cta: "View Follow-Ups",     onClick: () => goTab(TAB.followUp) },
              { accent: T.gray600, titleColor: T.ink,      icon: "map-pin",        title: "Location Roster",      desc: "Reference lookup of locations, Lawson #s, and area managers",                       stat: `${locations.length} locations on file`,                                cta: "View Roster",         onClick: () => goTab(TAB.roster) },
              { accent: T.blue600, titleColor: T.blue600,  icon: "bar-chart",      title: "Location Readiness",   desc: "Live OP 541 / OP 512 / JC 427 semiannual status per location, with PDF export",     stat: "From the Location Readiness Platform",                                 cta: "View Readiness",      onClick: () => goTab(TAB.readiness) },
              { accent: T.tealDeep, titleColor: T.tealDeep, icon: "calendar",      title: "Team Planner",         desc: "Recurring duties, team whereabouts, PTO and visit planning",                        stat: "Replaces the Team Planner spreadsheet",                                cta: "Open Team Planner",   onClick: goPlanner },
              { accent: T.blue700, titleColor: T.blue700,  icon: "mail",           title: "Site Circuit",         desc: "Email leadership one consolidated schedule of the month's virtual and onsite visits", stat: "Built from Team Planner site visits",                                  cta: "Open Site Circuit",   onClick: goCircuit },
              // Mismatches are the highest-signal thing in the app, so this card
              // goes amber and shouts the count the moment there is one.
              { accent: op541Mismatches > 0 ? T.warning : T.error, titleColor: op541Mismatches > 0 ? T.warning : T.error, icon: "git-compare", title: "OP 541 Self-Audit", desc: "Compares the location's uploaded self-audit against your on-site findings", stat: op541FileName ? `${op541Stats.mismatch} mismatches flagged` : "No self-audit uploaded yet", alert: op541Mismatches > 0, cta: "View Self-Audit", onClick: () => goTab(TAB.op541) },
            ].map(c => (
              <div key={c.title} style={{ ...cardStyle(c.accent), flex: "1 1 260px" }}>
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.titleColor, marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
                    <Icon name={c.icon} size={16} />{c.title}
                  </div>
                  <div style={{ fontSize: 13.5, color: T.gray600, marginBottom: 4 }}>{c.desc}</div>
                  {c.alert ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.warningBg, color: T.warning, fontSize: 12.5, fontWeight: 700, padding: "3px 10px", borderRadius: T.radiusPill, marginBottom: 16 }}>
                      <Icon name="alert-circle" size={13} />{c.stat}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: T.gray500, marginBottom: 16 }}>{c.stat}</div>
                  )}
                  <button onClick={c.onClick}
                    style={{ width: "100%", padding: 11, fontSize: 15, fontWeight: 700, background: c.accent, color: T.white, border: "none", borderRadius: T.radius, cursor: "pointer", fontFamily: "inherit" }}>
                    {c.cta}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TEAM PLANNER — separate module, no shared state with the checklist */}
      {view === "planner" && <TeamPlanner />}

      {/* SITE CIRCUIT — reads the planner's site visits, owns no visit data */}
      {view === "circuit" && <SiteCircuit onOpenPlanner={goPlanner} />}

      {/* FORM VIEW */}
      {view === "form" && (
        <div>
          {/* Visit meta — moved off the header band onto its own card so the
              fields read as editable inputs rather than header chrome. */}
          <div style={{ maxWidth: WIDTH_FORM, margin: "20px auto 0", padding: "0 28px" }}>
            <div style={cardStyle(T.blue600)}>
              <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 18 }}>
                <div>
                  <label htmlFor="meta-lawson" style={metaLabel}>Lawson #</label>
                  <select id="meta-lawson" value={meta.lawson} onChange={e => {
                      const lw = e.target.value;
                      const info = findLocation(lw, locations);
                      setMeta(p => ({ ...p, lawson: lw, location: info ? info.name : p.location, city: info ? `${info.city}, ${info.state}` : p.city }));
                    }}
                    style={metaField}>
                    <option value="">— Select Lawson # —</option>
                    {[...new Set(locations.map(l => l.region))].sort().map(region => (
                      <optgroup key={region} label={region}>
                        {locations.filter(l => l.region === region).map(l => (
                          <option key={l.lawson} value={l.lawson}>
                            {l.lawson} — {l.name}, {l.city} {l.state} ({l.areaCode})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="other">Other / Not Listed</option>
                  </select>
                </div>
                {[["location", "Location Name"], ["city", "City / State"], ["date", "Visit Date"]].map(([k, label]) => (
                  <div key={k}>
                    <label htmlFor={`meta-${k}`} style={metaLabel}>{label}</label>
                    <input id={`meta-${k}`} value={meta[k]} onChange={e => setMeta(p => ({ ...p, [k]: e.target.value }))} placeholder={label}
                      style={metaField} />
                  </div>
                ))}
                <div>
                  <div style={metaLabel}>Accreditation Specialist</div>
                  <div style={{ ...metaField, background: T.gray50, border: `1.5px solid ${T.gray200}`, color: T.gray700 }}>
                    {meta.specialist || "—"}
                  </div>
                </div>
                {/* Two controls in one cell, so it needs two columns' worth of
                    room — without the span it wraps onto a row of its own and
                    strands below the five single-field cells. */}
                <div style={{ gridColumn: "span 2", minWidth: 0 }}>
                  <div style={metaLabel}>Follow-Up Teams Call Scheduled</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="date" aria-label="Follow-up call date" value={meta.followUpDate} onChange={e => setMeta(p => ({ ...p, followUpDate: e.target.value }))}
                      style={{ ...metaField, flex: "1 1 0", minWidth: 0 }} />
                    <input type="time" aria-label="Follow-up call time" value={meta.followUpTime} onChange={e => setMeta(p => ({ ...p, followUpTime: e.target.value }))}
                      style={{ ...metaField, flex: "1 1 0", minWidth: 0 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Unified stat card + visit actions */}
          <div className="no-print" style={{ maxWidth: WIDTH_FORM, margin: "16px auto 0", padding: "0 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10, overflow: "hidden", boxShadow: T.shadowSoft }}>
              {[
                { n: allStats.yes,     label: "Compliant", icon: "check-circle", bg: T.successBg, fg: T.success },
                { n: allStats.no,      label: "Issues",    icon: "alert-circle", bg: T.errorBg,   fg: T.error },
                { n: allStats.pending, label: "Pending",   icon: "clock",        bg: T.gray100,   fg: T.gray600 },
                ...(op541Stats.mismatch  > 0 ? [{ n: op541Stats.mismatch,  label: "OP 541 Mismatches",  icon: "git-compare", bg: T.warningBg, fg: T.warning }] : []),
                ...(op541tStats.mismatch > 0 ? [{ n: op541tStats.mismatch, label: "OP 541T Mismatches", icon: "git-compare", bg: T.warningBg, fg: T.warning }] : []),
              ].map((s, i, arr) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderRight: i < arr.length - 1 ? `1px solid ${T.gray100}` : "none" }}>
                  <div style={{ width: 30, height: 30, borderRadius: T.radius, background: s.bg, color: s.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={s.icon} size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: s.fg, lineHeight: 1.1 }}>{s.n}</div>
                    <div style={{ fontSize: 12, color: T.gray500, whiteSpace: "nowrap" }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={saveProgress} style={btnOutline}>Save Progress</button>
              {currentVisitId && (
                <button onClick={finalizeVisit}
                  style={visitFinalized
                    ? { ...btnOutline, background: T.successBg, color: T.success, borderColor: T.successBorder }
                    : btnOutline}>
                  {visitFinalized ? "✓ Visit Finalized" : "Finalize Visit"}
                </button>
              )}
              {/* No re-fetch on open any more — the list is live (see the
                  onSnapshot subscription above), so it is already current. */}
              <button
                onClick={() => setShowVisits(v => !v)}
                style={showVisits ? { ...btnOutline, background: T.blue50 } : btnOutline}>
                Saved Visits{savedVisits.length > 0 ? ` (${savedVisits.length})` : ""}
              </button>
              <button onClick={generateOutputs} style={btnPrimary}>Generate Email &amp; Report</button>
              {/* Destructive and rarely used — kept out of thumb's reach of
                  "Save Progress" rather than sitting next to it. */}
              <div ref={moreActionsRef} style={{ position: "relative" }}>
                <button onClick={() => setShowMoreActions(v => !v)} aria-label="More actions"
                  aria-expanded={showMoreActions} aria-haspopup="menu"
                  style={{ ...btnOutline, color: T.gray600, borderColor: T.gray300, padding: "9px 13px", fontSize: 15, lineHeight: 1 }}>
                  ⋯
                </button>
                {showMoreActions && (
                  <div role="menu" style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 1000, minWidth: 190,
                    background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(19,25,34,.16)", overflow: "hidden",
                  }}>
                    <button role="menuitem" onClick={() => { setShowMoreActions(false); startFresh(); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 13,
                        fontWeight: 600, background: "none", border: "none", color: T.error, cursor: "pointer",
                        fontFamily: "inherit", whiteSpace: "nowrap",
                      }}>
                      Clear &amp; Start Over
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Binder picker — one dropdown in place of the old 16-tab rail,
              with the progress strip below carrying the status the rail used
              to show all at once. */}
          <div style={{ maxWidth: WIDTH_FORM, margin: "18px auto 0", padding: "0 28px" }}>
            <div ref={sectionMenuRef} style={{ position: "relative", maxWidth: 440 }}>
              <button onClick={() => setShowSectionMenu(v => !v)}
                aria-haspopup="menu" aria-expanded={showSectionMenu} aria-label={`Binder: ${activeTabDef.label}. Change binder`}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "10px 14px", fontSize: 14.5, fontWeight: 700, fontFamily: "inherit",
                  background: T.white, color: T.ink, textAlign: "left", cursor: "pointer",
                  border: `1.5px solid ${showSectionMenu ? T.blue600 : T.gray300}`,
                  borderRadius: 10, boxShadow: T.shadowSoft, boxSizing: "border-box",
                }}>
                <Icon name="list-checks" size={16} style={{ color: T.blue600, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeTabDef.label}</span>
                {activeTabDef.badges}
                <span aria-hidden="true" style={{ marginLeft: "auto", paddingLeft: 8, color: T.gray500, fontSize: 11, flexShrink: 0 }}>▼</span>
              </button>

              {showSectionMenu && (
                <div role="menu" aria-label="Checklist binders" style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 1000,
                  background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10,
                  boxShadow: "0 10px 28px rgba(19,25,34,.18)", overflow: "hidden",
                }}>
                  <div style={{ position: "relative", padding: 8, borderBottom: `1px solid ${T.gray100}` }}>
                    <Icon name="search" size={14} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: T.gray400, pointerEvents: "none" }} />
                    {/* Enter picks the top hit so the whole thing is keyboard-
                        driveable: open, type three letters, Enter. */}
                    <input autoFocus value={tabSearch} aria-label="Search binders" placeholder="Search binders…"
                      onChange={e => setTabSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && visibleTabs.length) selectTab(visibleTabs[0].idx); }}
                      style={{ width: "100%", padding: "7px 10px 7px 30px", fontSize: 13.5, border: `1.5px solid ${T.gray300}`, borderRadius: T.radiusPill, fontFamily: "inherit", boxSizing: "border-box", color: T.ink, outline: "none" }} />
                  </div>
                  <div style={{ maxHeight: "58vh", overflowY: "auto", padding: "4px 0 6px" }}>
                    {TAB_GROUPS.map(group => {
                      const rows = visibleTabs.filter(t => t.group === group);
                      if (!rows.length) return null;
                      return (
                        <div key={group}>
                          <div style={{ padding: "8px 14px 4px", fontSize: 10.5, fontWeight: 700, color: T.gray500, textTransform: "uppercase", letterSpacing: "0.07em" }}>{group}</div>
                          {rows.map(t => {
                            const active = activeTab === t.idx;
                            // Same two-segment fill the rail used: answered
                            // (Y/N) then N/A, as a share of the item count.
                            const p = t.progress;
                            const total = p?.total || 0;
                            const answeredPct = total ? ((p.yes + p.no) / total) * 100 : 0;
                            const naPct       = total ? (p.na / total) * 100 : 0;
                            const complete    = total > 0 && p.pending === 0;
                            return (
                              <button key={t.idx} role="menuitem" aria-current={active} onClick={() => selectTab(t.idx)}
                                style={{
                                  display: "block", width: "100%", textAlign: "left", padding: "7px 14px 8px",
                                  background: active ? T.blue50 : "none", border: "none", cursor: "pointer",
                                  fontFamily: "inherit", borderLeft: `3px solid ${active ? T.blue600 : "transparent"}`,
                                }}>
                                <div style={{ display: "flex", alignItems: "center", fontSize: 13.5, color: active ? T.blue600 : T.ink, fontWeight: active ? 700 : 500 }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                                  {t.badges}
                                </div>
                                {p && (
                                  <div aria-hidden="true" style={{ height: 4, background: T.gray300, borderRadius: 2, marginTop: 5, overflow: "hidden", display: "flex" }}>
                                    <div style={{ width: `${answeredPct}%`, background: complete ? T.success : T.blue600 }} />
                                    <div style={{ width: `${naPct}%`, background: T.gray400 }} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {visibleTabs.length === 0 && (
                      <div style={{ padding: "14px", fontSize: 13.5, color: T.gray500 }}>No binders match “{tabSearch}”</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Progress strip — one segment per answerable binder, in tab
                order, so closing the dropdown doesn't cost the overview the
                rail gave. Segments are clickable shortcuts. */}
            <div style={{ display: "flex", gap: 3, marginTop: 10, paddingBottom: 12, borderBottom: `1px solid ${T.gray200}` }}>
              {progressTabs.map(t => {
                const active = activeTab === t.idx;
                const p = t.progress;
                const total = p.total || 0;
                const answeredPct = total ? ((p.yes + p.no) / total) * 100 : 0;
                const naPct       = total ? (p.na / total) * 100 : 0;
                const complete    = total > 0 && p.pending === 0;
                // The rail put issue counts in a badge next to each label; with
                // the labels gone, the fill itself has to carry that — red for
                // a binder with open issues, green once it's fully answered.
                const fill = p.no > 0 ? T.error : complete ? T.success : T.blue600;
                const summary = `${t.label} — ${p.yes} compliant, ${p.no} issue${p.no === 1 ? "" : "s"}, ${p.na} N/A, ${p.pending} pending`;
                return (
                  <button key={t.idx} onClick={() => setActiveTab(t.idx)} title={summary} aria-label={`Go to ${summary}`}
                    style={{
                      flex: 1, minWidth: 12, height: 8, padding: 0, display: "flex", overflow: "hidden",
                      background: T.gray300, border: "none", borderRadius: 3, cursor: "pointer",
                      // Ring the active segment with a shadow rather than an
                      // outline so the browser's focus outline still shows.
                      boxShadow: active ? `0 0 0 2px ${T.blue600}` : "none",
                    }}>
                    <div style={{ width: `${answeredPct}%`, background: fill }} />
                    <div style={{ width: `${naPct}%`, background: T.gray400 }} />
                  </button>
                );
              })}
            </div>
          </div>
          {/* Regular section content */}
          {!isExtraTab && (
            <div style={{ maxWidth: WIDTH_FORM, margin: "0 auto", padding: "20px 28px 80px" }}>
              <div style={{ fontSize: 12.5, color: T.gray500, marginBottom: 6, fontWeight: 600 }}>{sec.ref}</div>
              {sec.banner && (
                <div style={{ background: T.blue600, color: T.white, padding: "9px 16px", borderRadius: T.radius, fontSize: 13.5, fontWeight: 700, marginBottom: 16, letterSpacing: "0.02em" }}>
                  {sec.banner}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                {[["yes", "Compliant"], ["no", "Issue"], ["na", "N/A"]].map(([v, l]) => (
                  <button key={v} onClick={() => sec.items.forEach((_, ii) => setState(`${activeTab}-${ii}`, v))}
                    style={{ fontSize: 13, padding: "6px 14px", border: `1.5px solid ${STATUS_COLORS[v].text}`, background: STATUS_COLORS[v].bg, color: STATUS_COLORS[v].text, borderRadius: T.radiusPill, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
                    Mark all {l}
                  </button>
                ))}
              </div>

              {sec.items.map((item, ii) => {
                const key = `${activeTab}-${ii}`;
                const state = states[key];
                return (
                  <div key={ii} style={{
                    display: "flex", gap: 14, padding: "12px 14px", marginBottom: 8, borderRadius: 10,
                    border: `1px solid ${state === "no" ? T.errorBorder : state === "yes" ? T.successBorder : T.gray200}`,
                    background: state === "no" ? "#fffafa" : state === "yes" ? "#f9fff9" : T.white,
                    alignItems: "flex-start"
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, lineHeight: 1.55, color: T.ink }}>{item.text}</div>
                          {item.note && <div style={{ fontSize: 13, color: T.gray500, marginTop: 4, lineHeight: 1.5 }}>{item.note}</div>}
                          {(() => {
                            const matches = getPolicyMatches(item.text, policyDates);
                            if (!matches.length) return null;
                            return (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                {matches.map(key => (
                                  <span key={key} title={`${policyDates[key].name} — Rev: ${policyDates[key].rev}`} style={{
                                    fontSize: 11.5, padding: "2px 9px", borderRadius: T.radiusPill,
                                    background: "#dbe8f6", color: T.blue600, border: "1px solid #b3cdec",
                                    cursor: "default", fontWeight: 600, letterSpacing: "0.02em"
                                  }}>
                                    {key} · Rev {policyDates[key].rev}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {["yes", "no", "na"].map(v => (
                            <button key={v} onClick={() => setState(key, v)} aria-label={STATUS_COLORS[v].aria} aria-pressed={state === v} style={{
                              width: 40, height: 34, fontSize: 12.5, fontWeight: 700,
                              border: `1.5px solid ${state === v ? STATUS_COLORS[v].border : T.gray200}`,
                              background: state === v ? STATUS_COLORS[v].bg : T.white,
                              color: state === v ? STATUS_COLORS[v].text : T.gray400,
                              borderRadius: T.radius, cursor: "pointer", fontFamily: "inherit"
                            }}>{STATUS_COLORS[v].label}</button>
                          ))}
                        </div>
                      </div>
                      {(state === "yes" || state === "no") && (
                        <textarea
                          placeholder={state === "no" ? "Describe the issue and required corrective action…" : "Add observation or note (optional)…"}
                          aria-label={state === "no" ? "Issue description" : "Observation note"}
                          value={comments[key]} onChange={e => setComment(key, e.target.value)} rows={2}
                          style={{ marginTop: 10, width: "60%", minWidth: 260, fontSize: 13.5, padding: "8px 10px", border: `1.5px solid ${state === "no" ? T.errorBorder : T.successBorder}`, borderRadius: T.radius, resize: "vertical", color: T.ink, background: T.white, boxSizing: "border-box", display: "block", fontFamily: "inherit" }} />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Tab-level comments for PST, PAP Setup, Vent */}
              {["pstSetup", "pstMaintenance", "clinician", "vent"].includes(sec.id) && (
                <div style={{ marginTop: 18, padding: "18px 20px", background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radiusCard, boxShadow: T.shadowSoft }}>
                  {/* Global ID + Current RX */}
                  <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 200px" }}>
                      <label htmlFor={`gid-${sec.id}`} style={{ ...metaLabel, letterSpacing: "0.06em", marginBottom: 5 }}>Global ID</label>
                      <input
                        id={`gid-${sec.id}`}
                        value={tabPatientInfo[sec.id]?.globalId || ""}
                        onChange={e => setTabPatient(sec.id, "globalId", e.target.value)}
                        placeholder="Patient Global ID"
                        style={{ ...metaField, fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: "1 1 200px" }}>
                      <label htmlFor={`rx-${sec.id}`} style={{ ...metaLabel, letterSpacing: "0.06em", marginBottom: 5 }}>Current RX</label>
                      <input
                        id={`rx-${sec.id}`}
                        value={tabPatientInfo[sec.id]?.currentRx || ""}
                        onChange={e => setTabPatient(sec.id, "currentRx", e.target.value)}
                        placeholder="Current prescription / order"
                        style={{ ...metaField, fontSize: 13 }}
                      />
                    </div>
                  </div>
                  <label htmlFor={`notes-${sec.id}`} style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.blue600, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Visit Notes / Unable to Complete Reason
                  </label>
                  <textarea
                    id={`notes-${sec.id}`}
                    value={tabComments[sec.id]}
                    onChange={e => setTabComment(sec.id, e.target.value)}
                    placeholder="Note any reason this visit could not be completed (e.g. patient not available, location closed, PST unavailable) or general visit observations…"
                    rows={3}
                    style={{ ...metaField, fontSize: 14, padding: "9px 11px", resize: "vertical", background: T.gray50 }}
                  />
                </div>
              )}
            </div>
          )}

          {/* OP 541 tab content */}
          {isOp541Tab && (
            <div>
              {!op541FileName ? (
                <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray600 }}>
                  <div style={{ fontSize: 38, marginBottom: 12 }}>📂</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Upload the OP 541 Spreadsheet</div>
                  <div style={{ fontSize: 14, color: T.gray600, marginBottom: 28, maxWidth: 480, margin: "0 auto 28px" }}>
                    Upload the .xlsx file filled out by the location. Their self-audit answers will appear alongside your on-site Y/N/NA assessment, with mismatches flagged automatically.
                  </div>
                  <label style={{ display: "inline-block", padding: "11px 28px", background: BRAND, color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
                    Choose .xlsx File
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541Upload(e.target.files[0])} />
                  </label>
                </div>
              ) : (
                <div>
                  {/* Info bar */}
                  <div style={{ padding: "10px 24px", background: T.gray50, borderBottom: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: T.gray700 }}>📄 {op541FileName}</span>
                      <span style={{ color: T.gray500 }}>Loc: = location self-audit &nbsp;|&nbsp; Y / N / N/A = your on-site assessment</span>
                      {op541Stats.mismatch > 0 && (
                        <span style={{ color: T.warning, fontWeight: 600 }}>⚠ {op541Stats.mismatch} mismatch{op541Stats.mismatch !== 1 ? "es" : ""} with location self-audit</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        onClick={exportUpdatedOp541}
                        title={op541BufferBytes ? undefined : "The original file isn't in this browser session (e.g. after loading a saved visit on a new device) — click to see how to bring it back"}
                        style={{ fontSize: 13, padding: "5px 12px", background: op541BufferBytes ? T.success : T.gray500, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>
                        ⬇ Export Updated OP 541
                      </button>
                      <label style={{ fontSize: 13, color: BRAND, cursor: "pointer", textDecoration: "underline" }}>
                        Change file
                        <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541Upload(e.target.files[0])} />
                      </label>
                    </div>
                  </div>

                  <div style={{ padding: "16px 24px" }}>
                    {op541Sections.map((section, si) => {
                      const showSheetHeader = si === 0 || op541Sections[si - 1].sheetLabel !== section.sheetLabel;
                      const isVehicleSheet = section.sheetLabel.startsWith("Vehicle") || section.sheetLabel.startsWith("Unit");
                      const vInfo = op541VehicleInfo[section.sheetLabel] || { pstName: "", vehicleNum: "" };
                      const setVInfo = (field, val) => setOp541VehicleInfo(prev => ({
                        ...prev,
                        [section.sheetLabel]: { ...prev[section.sheetLabel], pstName: prev[section.sheetLabel]?.pstName || "", vehicleNum: prev[section.sheetLabel]?.vehicleNum || "", [field]: val }
                      }));
                      return (
                        <div key={si} style={{ marginBottom: 20 }}>
                          {showSheetHeader && (
                            <div style={{ background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 8, borderRadius: 6, fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", marginTop: si > 0 ? 24 : 0, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                              <span>{section.sheetLabel}</span>
                              {isVehicleSheet && (
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>PST Name:</label>
                                    <input
                                      value={vInfo.pstName}
                                      onChange={e => setVInfo("pstName", e.target.value)}
                                      placeholder="Enter name"
                                      style={{ fontSize: 13, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", width: 130 }}
                                    />
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Vehicle #:</label>
                                    <input
                                      value={vInfo.vehicleNum}
                                      onChange={e => setVInfo("vehicleNum", e.target.value)}
                                      placeholder="Enter #"
                                      style={{ fontSize: 13, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", width: 80 }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {section.label && (
                            <div style={{ background: T.blue50, padding: "8px 14px", marginBottom: 8, borderRadius: 5, fontWeight: 700, fontSize: 13, color: BRAND, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {section.label}
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {section.items.map(item => {
                              const s = op541States[item.key];
                              const mismatch = s && item.locAns && ((item.locAns === "Y" && s === "no") || (item.locAns === "N" && s === "yes"));
                              return (
                                <div key={item.key} style={{
                                  padding: "10px 12px", borderRadius: 6,
                                  border: `1px solid ${mismatch ? T.warning : s === "no" ? T.errorBorder : s === "yes" ? T.successBorder : T.gray200}`,
                                  background: mismatch ? "#fffde7" : s === "no" ? "#fff8f8" : s === "yes" ? "#f9fff9" : "#fff"
                                }}>
                                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {item.policy && <span style={{ fontSize: 12, color: T.gray500, marginRight: 8 }}>{item.policy}</span>}
                                      <span style={{ fontSize: 14, color: T.ink, lineHeight: 1.5 }}>{item.text}</span>
                                      {item.locComment && <div style={{ fontSize: 12, color: T.gray500, marginTop: 3 }}>{item.locComment}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                      <span style={{
                                        fontSize: 12, fontWeight: 700, padding: "4px 9px", borderRadius: 4, whiteSpace: "nowrap",
                                        background: item.locAns === "Y" ? T.successBg : item.locAns === "N" ? T.errorBg : item.locAns ? T.gray100 : T.gray50,
                                        color: item.locAns === "Y" ? T.success : item.locAns === "N" ? T.error : T.gray500,
                                        border: `1px solid ${item.locAns === "Y" ? T.successBorder : item.locAns === "N" ? T.errorBorder : T.gray200}`
                                      }}>
                                        Loc: {item.locAns || "—"}
                                      </span>
                                      {mismatch && <span title="Mismatch with location self-audit" style={{ color: T.warning, fontSize: 16, fontWeight: 700 }}>⚠</span>}
                                      <div style={{ display: "flex", gap: 4 }}>
                                        {["yes", "no", "na"].map(v => (
                                          <button key={v} onClick={() => setOp541States(p => ({ ...p, [item.key]: p[item.key] === v ? null : v }))} aria-label={STATUS_COLORS[v].aria} aria-pressed={s === v} style={{
                                            width: 40, height: 34, fontSize: 12.5, fontWeight: 700,
                                            border: `1.5px solid ${s === v ? STATUS_COLORS[v].border : T.gray200}`,
                                            background: s === v ? STATUS_COLORS[v].bg : T.white,
                                            color: s === v ? STATUS_COLORS[v].text : T.gray400,
                                            borderRadius: T.radius, cursor: "pointer", fontFamily: "inherit"
                                          }}>{STATUS_COLORS[v].label}</button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  {(s === "yes" || s === "no") && (
                                    <textarea
                                      placeholder={s === "no" ? "Describe the issue and required corrective action…" : "Add observation or note (optional)…"}
                                      value={op541Comments[item.key]}
                                      onChange={e => setOp541Comments(p => ({ ...p, [item.key]: e.target.value }))}
                                      rows={2}
                                      style={{ marginTop: 8, width: "50%", fontSize: 13, padding: "6px 8px", border: `1px solid ${s === "no" ? T.errorBorder : T.successBorder}`, borderRadius: 5, resize: "vertical", color: T.ink, background: "#fff", boxSizing: "border-box", display: "block" }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Mark all N/A toggle */}
                          {(() => {
                            const allNa = section.items.length > 0 && section.items.every(item => op541States[item.key] === "na");
                            return (
                              <button
                                onClick={() => {
                                  const update = {};
                                  section.items.forEach(item => { update[item.key] = allNa ? null : "na"; });
                                  setOp541States(p => ({ ...p, ...update }));
                                }}
                                style={{
                                  marginTop: 8, padding: "5px 14px", fontSize: 12, fontWeight: 600,
                                  background: allNa ? T.gray100 : T.gray50,
                                  color: allNa ? T.gray600 : T.gray600,
                                  border: `1px solid ${allNa ? T.gray300 : T.gray200}`,
                                  borderRadius: 5, cursor: "pointer", letterSpacing: "0.02em"
                                }}
                              >
                                {allNa ? "✕ Unmark All N/A" : "Mark All N/A"}
                              </button>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OP 541T tab content */}
          {isOp541tTab && (
            <div>
              {!op541tFileName ? (
                <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray600 }}>
                  <div style={{ fontSize: 38, marginBottom: 12 }}>📂</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Upload the OP 541T Transfill Spreadsheet</div>
                  <div style={{ fontSize: 14, color: T.gray600, marginBottom: 28, maxWidth: 480, margin: "0 auto 28px" }}>
                    Upload the .xlsx file filled out by the transfill location. Their self-audit answers will appear alongside your on-site Y/N/NA assessment, with mismatches flagged automatically.
                  </div>
                  <label style={{ display: "inline-block", padding: "11px 28px", background: BRAND, color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
                    Choose .xlsx File
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541tUpload(e.target.files[0])} />
                  </label>
                </div>
              ) : (
                <div>
                  <div style={{ padding: "10px 24px", background: T.gray50, borderBottom: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: T.gray700 }}>📄 {op541tFileName}</span>
                      <span style={{ color: T.gray500 }}>Loc: = location self-audit &nbsp;|&nbsp; Y / N / N/A = your on-site assessment</span>
                      {op541tStats.mismatch > 0 && (
                        <span style={{ color: T.warning, fontWeight: 600 }}>⚠ {op541tStats.mismatch} mismatch{op541tStats.mismatch !== 1 ? "es" : ""} with location self-audit</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        onClick={exportUpdatedOp541t}
                        title={op541tBufferBytes ? undefined : "The original file isn't in this browser session (e.g. after loading a saved visit on a new device) — click to see how to bring it back"}
                        style={{ fontSize: 13, padding: "5px 12px", background: op541tBufferBytes ? T.success : T.gray500, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>
                        ⬇ Export Updated OP 541T
                      </button>
                      <label style={{ fontSize: 13, color: BRAND, cursor: "pointer", textDecoration: "underline" }}>
                        Change file
                        <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541tUpload(e.target.files[0])} />
                      </label>
                    </div>
                  </div>
                  <div style={{ padding: "16px 24px" }}>
                    {op541tSections.map((section, si) => {
                      const showSheetHeader = si === 0 || op541tSections[si - 1].sheetLabel !== section.sheetLabel;
                      const isVehicleSheet = section.sheetLabel.startsWith("Vehicle") || section.sheetLabel.startsWith("Unit");
                      const vInfo = op541VehicleInfo[section.sheetLabel] || { pstName: "", vehicleNum: "" };
                      const setVInfo = (field, val) => setOp541VehicleInfo(prev => ({
                        ...prev,
                        [section.sheetLabel]: { ...prev[section.sheetLabel], pstName: prev[section.sheetLabel]?.pstName || "", vehicleNum: prev[section.sheetLabel]?.vehicleNum || "", [field]: val }
                      }));
                      return (
                        <div key={si} style={{ marginBottom: 20 }}>
                          {showSheetHeader && (
                            <div style={{ background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 8, borderRadius: 6, fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", marginTop: si > 0 ? 24 : 0, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                              <span>{section.sheetLabel}</span>
                              {isVehicleSheet && (
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Driver Name:</label>
                                    <input
                                      value={vInfo.pstName}
                                      onChange={e => setVInfo("pstName", e.target.value)}
                                      placeholder="Enter name"
                                      style={{ fontSize: 13, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", width: 130 }}
                                    />
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Vehicle #:</label>
                                    <input
                                      value={vInfo.vehicleNum}
                                      onChange={e => setVInfo("vehicleNum", e.target.value)}
                                      placeholder="Enter #"
                                      style={{ fontSize: 13, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", width: 80 }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {section.label && (
                            <div style={{ background: T.blue50, padding: "8px 14px", marginBottom: 8, borderRadius: 5, fontWeight: 700, fontSize: 13, color: BRAND, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {section.label}
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {section.items.map(item => {
                              const s = op541tStates[item.key];
                              const mismatch = s && item.locAns && ((item.locAns === "Y" && s === "no") || (item.locAns === "N" && s === "yes"));
                              return (
                                <div key={item.key} style={{
                                  padding: "10px 12px", borderRadius: 6,
                                  border: `1px solid ${mismatch ? T.warning : s === "no" ? T.errorBorder : s === "yes" ? T.successBorder : T.gray200}`,
                                  background: mismatch ? "#fffde7" : s === "no" ? "#fff8f8" : s === "yes" ? "#f9fff9" : "#fff"
                                }}>
                                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {item.policy && <span style={{ fontSize: 12, color: T.gray500, marginRight: 8 }}>{item.policy}</span>}
                                      <span style={{ fontSize: 14, color: T.ink, lineHeight: 1.5 }}>{item.text}</span>
                                      {item.locComment && <div style={{ fontSize: 12, color: T.gray500, marginTop: 3 }}>{item.locComment}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                      <span style={{
                                        fontSize: 12, fontWeight: 700, padding: "4px 9px", borderRadius: 4, whiteSpace: "nowrap",
                                        background: item.locAns === "Y" ? T.successBg : item.locAns === "N" ? T.errorBg : item.locAns ? T.gray100 : T.gray50,
                                        color: item.locAns === "Y" ? T.success : item.locAns === "N" ? T.error : T.gray500,
                                        border: `1px solid ${item.locAns === "Y" ? T.successBorder : item.locAns === "N" ? T.errorBorder : T.gray200}`
                                      }}>
                                        Loc: {item.locAns || "—"}
                                      </span>
                                      {mismatch && <span title="Mismatch with location self-audit" style={{ color: T.warning, fontSize: 16, fontWeight: 700 }}>⚠</span>}
                                      <div style={{ display: "flex", gap: 4 }}>
                                        {["yes", "no", "na"].map(v => (
                                          <button key={v} onClick={() => setOp541tStates(p => ({ ...p, [item.key]: p[item.key] === v ? null : v }))} aria-label={STATUS_COLORS[v].aria} aria-pressed={s === v} style={{
                                            width: 40, height: 34, fontSize: 12.5, fontWeight: 700,
                                            border: `1.5px solid ${s === v ? STATUS_COLORS[v].border : T.gray200}`,
                                            background: s === v ? STATUS_COLORS[v].bg : T.white,
                                            color: s === v ? STATUS_COLORS[v].text : T.gray400,
                                            borderRadius: T.radius, cursor: "pointer", fontFamily: "inherit"
                                          }}>{STATUS_COLORS[v].label}</button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  {(s === "yes" || s === "no") && (
                                    <textarea
                                      placeholder={s === "no" ? "Describe the issue and required corrective action…" : "Add observation or note (optional)…"}
                                      value={op541tComments[item.key]}
                                      onChange={e => setOp541tComments(p => ({ ...p, [item.key]: e.target.value }))}
                                      rows={2}
                                      style={{ marginTop: 8, width: "50%", fontSize: 13, padding: "6px 8px", border: `1px solid ${s === "no" ? T.errorBorder : T.successBorder}`, borderRadius: 5, resize: "vertical", color: T.ink, background: "#fff", boxSizing: "border-box", display: "block" }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {personnelItems.length > 0 && (
                      <PersonnelRecordsPanel
                        slots={personnelSlots}
                        items={personnelItems}
                        answers={personnelAnswers}
                        setAnswers={setPersonnelAnswers}
                        dates={personnelDates}
                        setDates={setPersonnelDates}
                        comments={personnelComments}
                        setComments={setPersonnelComments}
                        onAddEmployee={addPersonnelEmployee}
                        onRemoveEmployee={removePersonnelEmployee}
                        onUpdateSlot={updatePersonnelSlot}
                        canAddEmployee={personnelSlots.length < personnelSheetNames.length * PERSONNEL_EMPLOYEE_COLS.length}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* JC 427 tab content — no upload step; the real template ships
              with the app (public/JC427_Template.xlsx) and is fetched once
              per session (see the useEffect near the jc427 state above). */}
          {isJc427Tab && (
            <div>
              {jc427TemplateStatus === "loading" && (
                <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray500 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                  <div style={{ fontSize: 15, color: T.gray600 }}>Loading JC 427 template…</div>
                </div>
              )}
              {jc427TemplateStatus === "error" && (
                <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray600 }}>
                  <div style={{ fontSize: 38, marginBottom: 12 }}>⚠</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.error, marginBottom: 8 }}>Couldn't load the JC 427 template</div>
                  <div style={{ fontSize: 14, color: T.gray600, maxWidth: 440, margin: "0 auto" }}>
                    Check your internet connection and reload the page. If this keeps happening, the template file may be missing from the deployment.
                  </div>
                </div>
              )}
              {jc427TemplateStatus === "ready" && (
                <div>
                  <div style={{ padding: "10px 24px", background: T.gray50, borderBottom: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 13, color: T.gray500 }}>{jc427Items.length} of {JC427_ALL_ITEMS.length} items recognized</span>
                    <button
                      onClick={exportUpdatedJC427}
                      style={{ fontSize: 13, padding: "5px 12px", background: T.success, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>
                      ⬇ Export Updated JC 427
                    </button>
                  </div>
                  <div style={{ padding: "16px 24px" }}>
                    {jc427Items.length === 0 ? (
                      <div style={{ padding: "40px 24px", textAlign: "center", color: T.gray500 }}>
                        Couldn't recognize any items in the bundled template. Contact support.
                      </div>
                    ) : (
                      <JC427Panel
                        slots={jc427Slots}
                        items={jc427Items}
                        answers={jc427Answers}
                        setAnswers={setJc427Answers}
                        dates={jc427Dates}
                        setDates={setJc427Dates}
                        comments={jc427Comments}
                        setComments={setJc427Comments}
                        onAddEmployee={addJC427Employee}
                        onRemoveEmployee={removeJC427Employee}
                        onUpdateSlot={updateJC427Slot}
                        canAddEmployee={!!jc427Meta && jc427Slots.length < jc427SheetNames.length * jc427Meta.employeeCols.length}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Policy Dates tab content */}
          {isPolicyTab && (
            <div style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: BRAND, marginBottom: 4 }}>Policy Revision Reference</div>
                <div style={{ fontSize: 13, color: T.gray600 }}>
                  Admins can add, edit, or remove policies directly below — changes apply immediately for every specialist and reflect on the checklist badges automatically. No code changes or redeploys needed.
                </div>
              </div>

              <PolicyDatesPanel policyDates={policyDates} onReload={reloadPolicyDates} />
            </div>
          )}
          {/* Issue Trends tab content */}
          {isTrendsTab && <TrendDashboard />}
          {/* Follow-Up Dashboard tab content */}
          {isFollowUpTab && <FollowUpDashboard />}
          {/* Location Roster tab content */}
          {isRosterTab && <LocationRoster locations={locations} onReload={reloadLocations} />}

          {isReadinessTab && <ReadinessDashboard />}
        </div>
      )}

      {/* EMAIL VIEW */}
      {view === "email" && (
        <div style={{ maxWidth: WIDTH_REPORT, margin: "0 auto", padding: "24px 28px 80px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Manager Follow-Up Email</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => copyText(emailText)}
                style={copied ? { ...btnOutline, background: T.successBg, color: T.success, borderColor: T.successBorder } : btnOutline}>
                {copied ? "✓ Copied" : "Copy email"}
              </button>
              <button onClick={() => setView("report")} style={btnPrimary}>View Report →</button>
            </div>
          </div>
          <textarea value={emailText} onChange={e => setEmailText(e.target.value)} aria-label="Follow-up email body"
            style={{ width: "100%", minHeight: 420, fontSize: 14, lineHeight: 1.7, padding: 14, border: `1.5px solid ${T.gray300}`, borderRadius: T.radius, resize: "vertical", color: T.ink, background: T.white, boxSizing: "border-box", fontFamily: "inherit" }} />
          <div style={{ marginTop: 12, fontSize: 13, color: T.gray500 }}>You can edit this email before copying. Click “View Report →” for the full report.</div>
        </div>
      )}

      {/* REPORT VIEW — empty state. Every action on the populated report
          exports or shares it, so with nothing answered there is nothing to
          offer but the way back to the checklist. */}
      {view === "report" && answeredCount === 0 && (
        <div style={{ maxWidth: WIDTH_REPORT, margin: "0 auto", padding: "24px 28px 80px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>Survey Prep Report</div>
          <div style={{ background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radiusCard, padding: "64px 24px", textAlign: "center", boxShadow: T.shadowCard }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: T.blue50, color: T.blue600, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Icon name="file-text" size={26} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No checklist items answered yet</div>
            <div style={{ fontSize: 13, color: T.gray600, marginBottom: 20, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
              Mark items Compliant, Issue, or N/A in the checklist to build this visit's report.
            </div>
            <button onClick={goChecklist} style={{ ...btnPrimary, padding: "10px 20px", fontSize: 13.5, fontWeight: 700 }}>Go to {MODULE_LABEL}</button>
          </div>
        </div>
      )}

      {/* REPORT VIEW */}
      {view === "report" && answeredCount > 0 && (
        <div style={{ maxWidth: WIDTH_REPORT, margin: "0 auto", padding: "24px 28px 80px" }}>

          {/* Screen-only toolbar */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Survey Prep Report</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={exportFollowUpXLSX} style={{ ...btnPrimary, background: T.success }}>
                Export Follow-Up XLSX
              </button>
              <button onClick={exportPDF} style={btnPrimary}>
                Download PDF
              </button>
              <button onClick={generateChecklistLink} disabled={checklistLinkLoading}
                style={{ ...btnOutline, cursor: checklistLinkLoading ? "default" : "pointer", opacity: checklistLinkLoading ? 0.6 : 1 }}>
                {checklistLinkLoading ? "Generating…" : "Follow-Up Checklist Link"}
              </button>
            </div>
          </div>

          {checklistLink && (
            <div className="no-print" style={{ background: T.blue50, border: `1px solid #c5d9ef`, borderRadius: T.radiusCard, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.blue600, marginBottom: 8 }}>Follow-Up Checklist Link</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input readOnly value={checklistLink} onFocus={e => e.target.select()} aria-label="Follow-up checklist link"
                  style={{ ...metaField, flex: 1, fontSize: 12 }} />
                <button onClick={() => { navigator.clipboard.writeText(checklistLink).then(() => { setChecklistLinkCopied(true); setTimeout(() => setChecklistLinkCopied(false), 2000); }); }}
                  style={checklistLinkCopied ? { ...btnOutline, background: T.successBg, color: T.success, borderColor: T.successBorder } : btnOutline}>
                  {checklistLinkCopied ? "✓ Copied" : "Copy link"}
                </button>
              </div>
              <ChecklistQrCode value={checklistLink} />
            </div>
          )}

          {/* ── HEADER BAND ── */}
          <div style={{ background: BRAND, borderRadius: "6px 6px 0 0", padding: "12px 20px", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: "0.01em" }}>Accreditation Survey Prep Overview</div>
          </div>

          {/* ── META TABLE ── */}
          <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${T.blueBorder}`, borderTop: "none", marginBottom: 0 }}>
            <tbody>
              <tr>
                <td style={{ padding: "7px 14px", fontSize: 13, color: T.gray700, borderRight: `1px solid ${T.blueBorder}`, borderBottom: `1px solid ${T.blueBorder}`, background: T.blue50, width: "50%" }}>
                  <span style={{ color: T.gray500, fontSize: 11, display: "block", marginBottom: 1 }}>Location {meta.lawson ? `(Lawson # ${meta.lawson})` : ""}</span>
                  <strong style={{ color: T.blue800 }}>{meta.location || "—"}</strong>
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, color: T.gray700, borderBottom: `1px solid ${T.blueBorder}`, background: T.blue50 }}>
                  <span style={{ color: T.gray500, fontSize: 11, display: "block", marginBottom: 1 }}>City / State</span>
                  <strong style={{ color: T.blue800 }}>{meta.city || "—"}</strong>
                </td>
              </tr>
              <tr>
                <td style={{ padding: "7px 14px", fontSize: 13, color: T.gray700, borderRight: `1px solid ${T.blueBorder}`, background: T.blue50 }}>
                  <span style={{ color: T.gray500, fontSize: 11, display: "block", marginBottom: 1 }}>Accreditation Specialist</span>
                  <strong style={{ color: T.blue800 }}>{meta.specialist || "—"}</strong>
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, color: T.gray700, background: T.blue50 }}>
                  <span style={{ color: T.gray500, fontSize: 11, display: "block", marginBottom: 1 }}>Visit Date</span>
                  <strong style={{ color: T.blue800 }}>{meta.date || "—"}</strong>
                </td>
              </tr>
              {(meta.followUpDate || meta.followUpTime) && (
                <tr>
                  <td colSpan={2} style={{ padding: "7px 14px", fontSize: 13, background: T.warningBg, borderTop: `1px solid ${T.blueBorder}` }}>
                    <span style={{ color: T.warning, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 1 }}>Follow-Up Teams Call Scheduled</span>
                    <strong style={{ color: T.ink, fontSize: 14 }}>
                      {meta.followUpDate ? new Date(meta.followUpDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "—"}
                      {meta.followUpTime ? ` · ${formatFollowUpTime(meta.followUpTime)}` : ""}
                    </strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── SUMMARY SCORES ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 0, marginBottom: 20, marginTop: 16 }}>
            {[
              ["Total Compliant", visibleReportLines.reduce((a, s) => a + s.yes, 0), T.success, T.successBg, `2px solid ${T.success}`],
              ["Total Issues",    visibleReportLines.reduce((a, s) => a + s.no, 0),  T.error, T.errorBg, `2px solid ${T.error}`],
            ].map(([l, n, tc, bg, border]) => (
              <div key={l} style={{ background: bg, borderBottom: border, padding: "10px 12px", textAlign: "center", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: tc }}>{n}</div>
                <div style={{ fontSize: 11, color: tc, marginTop: 1 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: T.gray600, fontStyle: "italic", marginBottom: 20, marginTop: -12 }}>
            Friendly reminder: please refer back to the Follow-Up Checklist regularly and mark items off as they're completed.
          </div>

          {/* ── SECTION DIVIDER ── */}
          {visibleReportLines.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `2px solid ${BRAND}`, paddingBottom: 4, marginBottom: 10, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
              Section Detail
            </div>
          )}

          {/* ── SECTION CARDS ── */}
          {visibleReportLines.map((s, i) => {
            const hasIssues = s.no > 0 || s.issues.length > 0;
            const hasPending = s.pending > 0;
            const accentColor = hasIssues ? T.error : hasPending ? T.warning : T.success;
            const isCompliant = !hasIssues && !hasPending;
            return (
              <div key={i} style={{ marginBottom: 10, borderRadius: "0 6px 6px 0`, border: `1px solid ${T.gray200}`, borderLeft: `4px solid ${accentColor}`, pageBreakInside: `avoid", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
                {/* Section header */}
                <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: isCompliant ? "#f6fbf6" : hasIssues ? "#fdf4f4" : "#fffbf2", borderBottom: isCompliant ? "none" : "1px solid #ede0e0" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.ink }}>{s.label}</div>
                    {(s.pstName || s.driverName || s.vehicleNum) && (
                      <div style={{ display: "flex", gap: 14, marginTop: 2, fontSize: 11, color: "#555" }}>
                        {s.pstName    && <span>PST: <strong>{s.pstName}</strong></span>}
                        {s.driverName && <span>Driver: <strong>{s.driverName}</strong></span>}
                        {s.vehicleNum && <span>Vehicle #: <strong>{s.vehicleNum}</strong></span>}
                      </div>
                    )}
                    {(s.globalId || s.currentRx) && (
                      <div style={{ display: "flex", gap: 14, marginTop: 2, fontSize: 11, color: "#555" }}>
                        {s.globalId  && <span>Global ID: <strong>{s.globalId}</strong></span>}
                        {s.currentRx && <span>Current RX: <strong>{s.currentRx}</strong></span>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, whiteSpace: "nowrap" }}>
                    <span style={{ color: T.success }}>✓ {s.yes}</span>
                    <span style={{ color: T.error }}>✗ {s.no}</span>
                    {s.na > 0      && <span style={{ color: T.gray600 }}>N/A {s.na}</span>}
                    {s.pending > 0 && <span style={{ color: T.warning }}>? {s.pending}</span>}
                  </div>
                </div>

                {/* Issues */}
                {s.issues.length > 0 && (
                  <div style={{ padding: "10px 14px 6px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.error, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Items requiring corrective action</div>
                    {s.issues.map((iss, j) => (
                      <div key={j} style={{ padding: "8px 10px", marginBottom: 5, background: iss.mismatch ? "#fffde7" : "#fff8f8", borderLeft: `3px solid ${iss.mismatch ? "#f0a500" : "#e57373"}`, borderRadius: "0 4px 4px 0", fontSize: 13, pageBreakInside: "avoid" }}>
                        <div style={{ color: T.ink, lineHeight: 1.5 }}>• {iss.text}</div>
                        {iss.mismatch && (
                          <div style={{ fontSize: 11, color: T.warning, marginTop: 3, fontWeight: 600 }}>⚠ Mismatch — location self-audit marked compliant</div>
                        )}
                        {iss.comment && (
                          <div style={{ fontSize: 12, color: "#7a3a3a", marginTop: 5, paddingTop: 5, borderTop: `1px solid ${iss.mismatch ? "#ffe082" : "#f5c6c6"}`, lineHeight: 1.4 }}>
                            <strong>Note:</strong> {iss.comment}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Observations — Y items with notable notes */}
                {s.observations && s.observations.length > 0 && (
                  <div style={{ padding: "8px 14px 8px", borderTop: s.issues.length > 0 ? "1px solid #ede8e8" : "none" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1565c0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Observations</div>
                    {s.observations.map((obs, j) => (
                      <div key={j} style={{ padding: "7px 10px", marginBottom: 4, background: "#f3f8ff", borderLeft: "3px solid #64b5f6", borderRadius: "0 4px 4px 0", fontSize: 13, pageBreakInside: "avoid" }}>
                        <div style={{ color: T.ink, lineHeight: 1.5 }}>✓ {obs.text}</div>
                        {obs.comment && (
                          <div style={{ fontSize: 12, color: "#1565c0", marginTop: 4, paddingTop: 4, borderTop: "1px solid #bbdefb", lineHeight: 1.4 }}>
                            <strong>Note:</strong> {obs.comment}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Compliant Items — compact two-column green list */}
                {s.compliantItems && s.compliantItems.length > 0 && (
                  <div style={{ padding: "8px 14px 10px", borderTop: (s.issues.length > 0 || (s.observations && s.observations.length > 0)) ? "1px solid #e8f0e8" : "none", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.success, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Compliant Items ({s.compliantItems.length})
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 20px" }}>
                      {s.compliantItems.map((item, j) => (
                        <div key={j} style={{ fontSize: 11, color: "#33691e", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 4 }}>
                          <span style={{ color: T.success, flexShrink: 0, marginTop: 1 }}>✓</span>
                          <span>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visit Notes — PST / PAP / Vent tab-level comment */}
                {s.tabComment && (
                  <div style={{ padding: "8px 14px 10px", borderTop: "1px solid #ede8f5" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#4a148c", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Visit Notes</div>
                    <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.5, padding: "6px 10px", background: "#f8f4ff", borderLeft: "3px solid #9c27b0", borderRadius: "0 4px 4px 0" }}>
                      {s.tabComment}
                    </div>
                  </div>
                )}

                {/* All-compliant banner (no issues AND no pending) */}
                {isCompliant && (!s.compliantItems || s.compliantItems.length === 0) && (
                  <div style={{ padding: "6px 14px", fontSize: 12, color: T.success }}>All items compliant — no corrective action required.</div>
                )}
              </div>
            );
          })}

          {/* ── ADDITIONAL COMMENTS ── */}
          <div style={{ border: `1px solid ${T.gray200}`, borderRadius: 6, padding: "12px 14px", marginTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Additional Comments</div>
            <textarea
              placeholder="Add any additional notes or observations here…"
              rows={3}
              value={additionalComments}
              onChange={e => setAdditionalComments(e.target.value)}
              style={{ width: "100%", fontSize: 13, padding: "8px", border: `1px solid ${T.gray200}`, borderRadius: 4, resize: "vertical", color: T.ink, boxSizing: "border-box" }} />
          </div>

        </div>
      )}

      {/* Cloud sync warning — sits on the checklist screen itself. The specialist
          spends the whole visit here, so a sync failure that only showed on the
          dashboard could go unnoticed until the work was already gone. Offset
          above the floating save button so the two never overlap. */}
      {view === "form" && visitSaveError && (
        <div className="no-print" role="status"
          style={{ position: "fixed", bottom: showFloatingSave ? 88 : 24, right: 24, zIndex: 1099, maxWidth: 340, padding: "12px 16px", background: T.warningBg, color: T.warning, border: `1px solid ${T.warning}`, borderRadius: T.radiusCard, boxShadow: "0 8px 20px rgba(19,25,34,0.18)", fontSize: 13, lineHeight: 1.45, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Icon name="alert-circle" size={17} />
          <span>
            <strong>Not syncing to the cloud.</strong> Your work is saved on this device only,
            so it won't reach your other devices yet. Check your connection — it will sync
            automatically once you're back online.
          </span>
        </div>
      )}

      {/* Floating Save Progress — stays reachable once the header scrolls away */}
      {view === "form" && showFloatingSave && (
        <button className="no-print" onClick={saveProgress}
          style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1100, padding: "14px 24px", fontSize: 15, fontWeight: 700, background: T.blue600, color: T.white, border: "none", borderRadius: T.radiusPill, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,58,112,0.35)", fontFamily: "inherit", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="save" size={17} />Save Progress
        </button>
      )}

      {/* 30-minute save reminder */}
      {showSaveReminder && (
        <div className="no-print" role="dialog" aria-modal="true" aria-labelledby="save-reminder-title"
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(19,25,34,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: T.white, borderRadius: T.radiusCard, padding: "26px 24px", width: 380, maxWidth: "100%", boxShadow: "0 18px 40px rgba(19,25,34,0.35)", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: T.blue50, color: T.blue600, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Icon name="save" size={24} />
            </div>
            <div id="save-reminder-title" style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Don't forget to save</div>
            <div style={{ fontSize: 13, color: T.gray600, lineHeight: 1.5, marginBottom: 18 }}>
              It's been 30 minutes since your progress was last saved to the cloud. Save Progress syncs this visit so it can't be lost and shows up on your other devices.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={saveProgress} style={{ ...btnPrimary, padding: "9px 18px", fontWeight: 700 }}>
                Save Progress
              </button>
              <button onClick={() => { saveReminderAnchor.current = Date.now(); setShowSaveReminder(false); }}
                style={{ ...btnOutline, color: T.gray600, borderColor: T.gray300, fontWeight: 500 }}>
                Remind me later
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #report-print-area { display: block !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          textarea { border: 1px solid #ccc !important; }
        }
      `}</style>
    </div>
  );
}
