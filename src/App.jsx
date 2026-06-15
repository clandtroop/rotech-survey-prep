import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

const BRAND = "#1a3a5c";
const ACCENT = "#2e6da4";

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
      { text: "Policy 2.1.29 Patient Complaints and OP 564 Patient Complaint Report" },
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
      { text: "Tab 1 — Location metrics and corrective action plan (as applicable)" },
      { text: "Tab 1 — EMR reviews (20 semi-annually) and corrective actions" },
      { text: "Tab 1 — OP 541 Location Readiness Tool completed January and July" },
      { text: "Tab 1 — JC 427 Personnel Records Review completed January and July" },
      { text: "Tab 1 — Quarterly Patient Perception of Care reports" },
      { text: "Tab 1 — Annual Referral Source Perception of Care report" },
      { text: "Tab 1 — Infection Control Targeted Surveillance Logs (OP 519)" },
      { text: "Tab 1 — Semi-annual Infectious Disease Trending Reports (OP 542)" },
      { text: "Tab 1 — Influenza Vaccination Data Collection (OP 752)" },
      { text: "Tab 1 — Quarterly Don't Bug Me newsletter and OP 520 attendance record" },
      { text: "Tab 1 — OP 201 Organizational Chart and Policy 1.1.2 Scope of Service" },
      { text: "Tab 1 — Key contact person name documented for surveyor tracer selection" },
      { text: "Tab 2 — Emergency Preparedness: Policy 2.2.2, OP 525, OP 857" },
      { text: "Tab 2 — Fire Prevention: Policy 2.4.13, RM 1240" },
      { text: "Tab 2 — FDA 001 Equipment Maintenance Log — smoke alarm checks (weekly)" },
      { text: "Tab 2 — FDA 001 — monthly emergency lighting / exit sign checks (as applicable)" },
      { text: "Tab 3 — Incidents: Policy 2.4.1, OP 518, RM 1202, copies of all incidents" },
      { text: "Tab 4 — Complaints: Policy 2.1.29, OP 522, OP 564, OP 566, copies of all complaints" },
      { text: "Tab 5 — Facility Safety Inspection OP 512 (Jan & July) with fire drill record" },
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
    id: "pst", label: "PST Home Visit", ref: "Form JC 426",
    items: [
      { text: "All equipment, supplies, and tanks secured in vehicle" },
      { text: "Testing equipment, gloves, Madawipes, hand gel, non-clear bags and red tags on vehicle" },
      { text: "Complete dosing instructions printed on delivery ticket (liter flow, route, duration)", note: "e.g. 2lpm NC Continuous" },
      { text: "Patient information not visible in vehicle" },
      { text: "Vehicle locked and secured when unattended (windows up, all doors locked)" },
      { text: "Hand gel applied prior to entering patient's home" },
      { text: "Back-up tank assembled to take into home" },
      { text: '"No Smoking" sign(s) posted at entrance to home', note: "Required if oxygen is in the home" },
      { text: "Correct patient confirmed using two patient identifiers" },
      { text: "Patient instructed on portable/back-up system per order; conserving device cycling verified" },
      { text: "Hand gel used between clean and dirty tasks; gloves changed appropriately" },
      { text: "Concentrator plugged in and minimum run times observed per OP 609" },
      { text: "Portable liquid oxygen or gaseous systems checked" },
      { text: "Back-up tanks verified and patient ability to operate confirmed (AMA on file if refused)", note: "Back-up tanks must have RHI 600 tag" },
      { text: "Cylinder storage safe — not in closets, not freestanding, 15 ft from heat/flame" },
      { text: "Concentrator oxygen percentage analyzed, minimum run time observed" },
      { text: "Oxygen flow checked at end of longest tubing" },
      { text: "Concentrator alarm checked; patient/caregiver can hear alarm" },
      { text: "Concentrator setting verified against current order" },
      { text: "Function, cleanliness, and location label checked on all Rotech equipment" },
      { text: "Patient asked about changing disposable supplies and cleaning filters", note: "Cannula every 2 weeks, tubing every 90 days" },
      { text: "OP 511 or CL 307 fully completed; open flames/heat sources addressed", note: "Concentrator % MUST be on these forms" },
      { text: "Supplies and serial/lot numbers documented on delivery ticket", note: "Cylinder lot numbers must be included" },
      { text: "Patient internet access confirmed; Rotech website reviewed; RHI 1080 card provided" },
      { text: "All paperwork complete (BL 401, patient survey, COPD assessment)" },
      { text: "Testing equipment cleaned before returning to bag or vehicle; gloves worn with Madawipes" },
      { text: "Hand gel used at completion of home visit" },
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

function initStates() {
  const s = {}, c = {};
  SECTIONS.forEach((sec, si) => sec.items.forEach((_, ii) => {
    s[`${si}-${ii}`] = null;
    c[`${si}-${ii}`] = "";
  }));
  return { states: s, comments: c };
}

const STATUS_COLORS = {
  yes: { bg: "#e8f5e9", border: "#66bb6a", text: "#2e7d32", label: "Y" },
  no:  { bg: "#ffebee", border: "#ef5350", text: "#c62828", label: "N" },
  na:  { bg: "#f5f5f5", border: "#bdbdbd", text: "#616161", label: "N/A" },
};

export default function App() {
  const [meta, setMeta] = useState({ location: "", city: "", specialist: "", date: new Date().toLocaleDateString("en-US"), followUpDate: "", followUpTime: "" });
  const [activeTab, setActiveTab] = useState(0);
  const [{ states, comments }, setForm] = useState(initStates);
  const [view, setView] = useState("form");
  const [emailText, setEmailText] = useState("");
  const [reportLines, setReportLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // OP 541 state
  const [op541Sections, setOp541Sections] = useState([]);
  const [op541States, setOp541States] = useState({});
  const [op541Comments, setOp541Comments] = useState({});
  const [op541FileName, setOp541FileName] = useState("");

  // OP 541T state
  const [op541tSections, setOp541tSections] = useState([]);
  const [op541tStates, setOp541tStates] = useState({});
  const [op541tComments, setOp541tComments] = useState({});
  const [op541tFileName, setOp541tFileName] = useState("");

  const setState = useCallback((key, val) => {
    setForm(prev => ({ ...prev, states: { ...prev.states, [key]: prev.states[key] === val ? null : val } }));
  }, []);

  const setComment = useCallback((key, val) => {
    setForm(prev => ({ ...prev, comments: { ...prev.comments, [key]: val } }));
  }, []);

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
      return { label: sec.label, ref: sec.ref, ...stats, issues, observations };
    });

    op541Sections.forEach(sec => {
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
      data.push({
        label: `OP 541 — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`,
        ref: "OP 541 Location Readiness Tool",
        yes, no, na, pending,
        total: sec.items.length,
        issues, observations,
      });
    });

    op541tSections.forEach(sec => {
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
      data.push({
        label: `OP 541T — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`,
        ref: "OP 541T Transfill Location Readiness Tool",
        yes, no, na, pending,
        total: sec.items.length,
        issues, observations,
      });
    });

    return data;
  }

  async function handleOp541Upload(file) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const allSections = [];
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
        let hRow = -1, cPolicy = 0, cDesc = 1, cLoc = 2, cComments = 4;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const upper = rows[i].map(c => String(c).toUpperCase().trim());
          const li = upper.findIndex(c => c === "LOCATION");
          if (li >= 0) {
            hRow = i;
            cLoc = li;
            cDesc = Math.max(0, li - 1);
            const ci = upper.findIndex(c => c.includes("COMMENT"));
            if (ci >= 0) cComments = ci;
            break;
          }
        }
        if (hRow < 0) continue;

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
            });
          }
        }
      }

      const ns = {}, nc = {};
      allSections.forEach(sec => sec.items.forEach(item => { ns[item.key] = null; nc[item.key] = ""; }));

      setOp541Sections(allSections);
      setOp541States(ns);
      setOp541Comments(nc);
      setOp541FileName(file.name);
    } catch {
      alert("Could not read the file. Make sure it is a valid .xlsx file.");
    }
  }

  async function handleOp541tUpload(file) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const allSections = [];
      let globalIdx = 0;

      for (const sheetName of wb.SheetNames) {
        if (sheetName === "Formula" || sheetName.startsWith("Additional Personnel")) continue;

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const isVehicle = sheetName.startsWith("Vehicle");
        const isPersonnel = sheetName === "Personnel Records";

        let sheetLabel = sheetName.replace(/_/g, " ");

        // For vehicle sheets, try to extract unit number from row 4 col C (index 3)
        if (isVehicle && rows.length > 4) {
          const unitNum = String(rows[4][3] || "").trim();
          sheetLabel = unitNum ? `Unit # ${unitNum}` : sheetName;
        }

        let hRow = -1, cDesc = 1, cLoc = 2, cComments = 4;

        if (isVehicle) {
          // Vehicle sheets: desc=col A(0), loc=col B(1), on-site=col C(2), comments=col D(3)
          hRow = 6; cDesc = 0; cLoc = 1; cComments = 3;
        } else if (isPersonnel) {
          // Personnel: desc=col A(0), loc answers across cols C-L, comments=col M(13)
          hRow = 6; cDesc = 0; cLoc = -1; cComments = 13;
        } else {
          // Facility sheet: policy=col A(0), desc=col B(1), loc=col C(2), on-site=col D(3), comments=col E(4)
          hRow = 5; cDesc = 1; cLoc = 2; cComments = 4;
        }

        if (hRow < 0 || hRow >= rows.length) continue;

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
            });
          }
        }
      }

      // Remove empty sections
      const filtered = allSections.filter(s => s.items.length > 0);
      const ns = {}, nc = {};
      filtered.forEach(sec => sec.items.forEach(item => { ns[item.key] = null; nc[item.key] = ""; }));

      setOp541tSections(filtered);
      setOp541tStates(ns);
      setOp541tComments(nc);
      setOp541tFileName(file.name);
    } catch {
      alert("Could not read the OP 541T file. Make sure it is a valid .xlsx file.");
    }
  }

  async function generateOutputs() {
    setLoading(true);
    const issues = getAllIssues();
    const summaryData = buildSummaryData();
    const loc  = meta.location  || "[Location]";
    const city = meta.city      || "[City, ST]";
    const spec = meta.specialist || "[Specialist]";
    const date = meta.date      || new Date().toLocaleDateString("en-US");

    const totalYes     = summaryData.reduce((a, s) => a + s.yes, 0);
    const totalNo      = summaryData.reduce((a, s) => a + s.no, 0);
    const totalNa      = summaryData.reduce((a, s) => a + s.na, 0);
    const totalPending = summaryData.reduce((a, s) => a + s.pending, 0);

    const issueBlock = issues.length === 0
      ? "No issues identified. All reviewed areas are compliant."
      : issues.map(i => `- [${i.section}] ${i.text}${i.comment ? ` — Note: ${i.comment}` : ""}`).join("\n");

    const prompt = `You are an accreditation compliance specialist at a home medical equipment company. Generate a professional follow-up email to the location manager based on the survey prep visit below.

Location: ${loc}, ${city}
Date: ${date}
Accreditation Specialist: ${spec}
Compliant items: ${totalYes} | Issues found: ${totalNo} | N/A: ${totalNa} | Not reviewed: ${totalPending}

Issues found:
${issueBlock}

Write a professional but direct email. If there are issues, list them clearly with requested corrective actions. Mention a follow-up teams call with LCM and Area/Region Manager will be scheduled. If no issues, write a brief congratulatory message. Do not use bullet symbols - use plain dashes. Sign off as ${spec}, Accreditation Specialist.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      setEmailText(text);
    } catch {
      setEmailText(`Subject: Accreditation Survey Prep Follow-Up — ${loc}, ${city} — ${date}\n\nHello,\n\nThank you for your time during the accreditation survey prep visit on ${date} for ${loc}, ${city}.\n\n${issues.length === 0 ? "All reviewed areas were found to be in compliance. No corrective action is required at this time." : `The following items require corrective action:\n\n${issueBlock}\n\nPlease address each item and report back with your findings. A follow-up Teams call with the LCM and Area/Region Manager will be scheduled.`}\n\nBest regards,\n${spec}\nAccreditation Specialist`);
    }

    setReportLines(summaryData);
    setLoading(false);
    setView("email");
  }

  function copyText(txt) {
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const isOp541Tab  = activeTab === SECTIONS.length;
  const isOp541tTab = activeTab === SECTIONS.length + 1;
  const sec = (isOp541Tab || isOp541tTab) ? null : SECTIONS[activeTab];
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

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", margin: "0 auto", background: "#fff", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: BRAND, color: "#fff", padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Rotech Healthcare</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>Accreditation Survey Prep Checklist</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {view !== "form" && (
              <button onClick={() => setView("form")} style={{ padding: "7px 14px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, cursor: "pointer" }}>
                ← Back to form
              </button>
            )}
            {view === "form" && (
              <button onClick={generateOutputs} disabled={loading} style={{ padding: "7px 14px", fontSize: 13, background: "#fff", color: BRAND, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                {loading ? "Generating…" : "Generate Email & Report"}
              </button>
            )}
            {view === "email" && (
              <button onClick={() => setView("report")} style={{ padding: "7px 14px", fontSize: 13, background: "#fff", color: BRAND, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                View Report →
              </button>
            )}
          </div>
        </div>

        {/* Meta fields */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 16 }}>
          {[["location", "Location / Lawson #"], ["city", "City / State"], ["specialist", "Accreditation Specialist"], ["date", "Visit Date"]].map(([k, label]) => (
            <div key={k}>
              <div style={{ fontSize: 10, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{label}</div>
              <input value={meta[k]} onChange={e => setMeta(p => ({ ...p, [k]: e.target.value }))} placeholder={label}
                style={{ width: "100%", padding: "7px 11px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 5, color: "#fff", outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 10, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Follow-Up Teams Call Scheduled</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input type="date" value={meta.followUpDate} onChange={e => setMeta(p => ({ ...p, followUpDate: e.target.value }))}
                style={{ flex: 1, padding: "7px 11px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 5, color: "#fff", outline: "none", boxSizing: "border-box", colorScheme: "dark" }} />
              <input type="time" value={meta.followUpTime} onChange={e => setMeta(p => ({ ...p, followUpTime: e.target.value }))}
                style={{ flex: 1, padding: "7px 11px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 5, color: "#fff", outline: "none", boxSizing: "border-box", colorScheme: "dark" }} />
            </div>
          </div>
        </div>
      </div>

      {/* FORM VIEW */}
      {view === "form" && (
        <div>
          {/* Summary bar */}
          <div style={{ display: "flex", background: "#f8f9fa", borderBottom: "1px solid #e0e0e0", padding: "10px 24px", flexWrap: "wrap", gap: 16 }}>
            {[["✓ Compliant", allStats.yes, "#2e7d32"], ["✗ Issues", allStats.no, "#c62828"], ["Pending", allStats.pending, "#616161"]].map(([l, n, c]) => (
              <div key={l} style={{ fontSize: 13 }}>
                <span style={{ color: c, fontWeight: 600 }}>{n}</span>
                <span style={{ color: "#757575", marginLeft: 5 }}>{l}</span>
              </div>
            ))}
            {op541Stats.mismatch > 0 && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "#e65100", fontWeight: 600 }}>{op541Stats.mismatch}</span>
                <span style={{ color: "#757575", marginLeft: 5 }}>⚠ OP 541 Mismatches</span>
              </div>
            )}
            {op541tStats.mismatch > 0 && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "#e65100", fontWeight: 600 }}>{op541tStats.mismatch}</span>
                <span style={{ color: "#757575", marginLeft: 5 }}>⚠ OP 541T Mismatches</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid #e0e0e0", background: "#fafafa" }}>
            {SECTIONS.map((s, i) => {
              const st = getSectionStats(i);
              return (
                <button key={i} onClick={() => setActiveTab(i)} style={{
                  padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap", background: "none",
                  border: "none", borderBottom: i === activeTab ? `2px solid ${BRAND}` : "2px solid transparent",
                  color: i === activeTab ? BRAND : "#616161", cursor: "pointer", fontWeight: i === activeTab ? 600 : 400,
                  display: "flex", alignItems: "center", gap: 6
                }}>
                  {s.label}
                  {st.no > 0 && <span style={{ background: "#ffebee", color: "#c62828", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{st.no}</span>}
                  {st.no === 0 && st.pending === 0 && <span style={{ background: "#e8f5e9", color: "#2e7d32", borderRadius: 10, padding: "1px 6px", fontSize: 11 }}>✓</span>}
                </button>
              );
            })}

            {/* OP 541 tab */}
            <button onClick={() => setActiveTab(SECTIONS.length)} style={{
              padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap", background: "none",
              border: "none", borderBottom: isOp541Tab ? `2px solid ${BRAND}` : "2px solid transparent",
              color: isOp541Tab ? BRAND : "#616161", cursor: "pointer", fontWeight: isOp541Tab ? 600 : 400,
              display: "flex", alignItems: "center", gap: 6
            }}>
              OP 541 Readiness
              {!op541FileName && <span style={{ fontSize: 11, color: "#9e9e9e" }}>+ Upload</span>}
              {op541FileName && op541Stats.no > 0 && <span style={{ background: "#ffebee", color: "#c62828", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{op541Stats.no}</span>}
              {op541FileName && op541Stats.mismatch > 0 && <span style={{ background: "#fff3e0", color: "#e65100", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>⚠ {op541Stats.mismatch}</span>}
              {op541FileName && op541Stats.no === 0 && op541Stats.pending === 0 && <span style={{ background: "#e8f5e9", color: "#2e7d32", borderRadius: 10, padding: "1px 6px", fontSize: 11 }}>✓</span>}
            </button>

            {/* OP 541T tab */}
            <button onClick={() => setActiveTab(SECTIONS.length + 1)} style={{
              padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap", background: "none",
              border: "none", borderBottom: isOp541tTab ? `2px solid ${BRAND}` : "2px solid transparent",
              color: isOp541tTab ? BRAND : "#616161", cursor: "pointer", fontWeight: isOp541tTab ? 600 : 400,
              display: "flex", alignItems: "center", gap: 6
            }}>
              OP 541T Transfill
              {!op541tFileName && <span style={{ fontSize: 11, color: "#9e9e9e" }}>+ Upload</span>}
              {op541tFileName && op541tStats.no > 0 && <span style={{ background: "#ffebee", color: "#c62828", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{op541tStats.no}</span>}
              {op541tFileName && op541tStats.mismatch > 0 && <span style={{ background: "#fff3e0", color: "#e65100", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>⚠ {op541tStats.mismatch}</span>}
              {op541tFileName && op541tStats.no === 0 && op541tStats.pending === 0 && <span style={{ background: "#e8f5e9", color: "#2e7d32", borderRadius: 10, padding: "1px 6px", fontSize: 11 }}>✓</span>}
            </button>
          </div>

          {/* Regular section content */}
          {!isOp541Tab && !isOp541tTab && (
            <div style={{ padding: "16px 24px" }}>
              <div style={{ fontSize: 11, color: "#9e9e9e", marginBottom: 12 }}>{sec.ref}</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                {[["yes", "Compliant"], ["no", "Issue found"], ["na", "N/A"]].map(([v, l]) => (
                  <button key={v} onClick={() => sec.items.forEach((_, ii) => setState(`${activeTab}-${ii}`, v))}
                    style={{ fontSize: 11, padding: "4px 12px", border: `1px solid ${STATUS_COLORS[v].border}`, background: STATUS_COLORS[v].bg, color: STATUS_COLORS[v].text, borderRadius: 5, cursor: "pointer" }}>
                    Mark all {l}
                  </button>
                ))}
              </div>

              {sec.items.map((item, ii) => {
                const key = `${activeTab}-${ii}`;
                const state = states[key];
                return (
                  <div key={ii} style={{
                    display: "flex", gap: 12, padding: "10px 12px", marginBottom: 6, borderRadius: 6,
                    border: `1px solid ${state === "no" ? "#ef9a9a" : state === "yes" ? "#a5d6a7" : "#e0e0e0"}`,
                    background: state === "no" ? "#fff8f8" : state === "yes" ? "#f9fff9" : "#fff",
                    alignItems: "flex-start"
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#212121" }}>{item.text}</div>
                          {item.note && <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 3, lineHeight: 1.4 }}>{item.note}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {["yes", "no", "na"].map(v => (
                            <button key={v} onClick={() => setState(key, v)} style={{
                              width: 38, height: 32, fontSize: 11, fontWeight: 600,
                              border: `1px solid ${state === v ? STATUS_COLORS[v].border : "#e0e0e0"}`,
                              background: state === v ? STATUS_COLORS[v].bg : "#fafafa",
                              color: state === v ? STATUS_COLORS[v].text : "#9e9e9e",
                              borderRadius: 5, cursor: "pointer"
                            }}>{STATUS_COLORS[v].label}</button>
                          ))}
                        </div>
                      </div>
                      {(state === "yes" || state === "no") && (
                        <textarea
                          placeholder={state === "no" ? "Describe the issue and required corrective action…" : "Add observation or note (optional)…"}
                          value={comments[key]} onChange={e => setComment(key, e.target.value)} rows={3}
                          style={{ marginTop: 8, width: "50%", fontSize: 12, padding: "7px 9px", border: `1px solid ${state === "no" ? "#ef9a9a" : "#a5d6a7"}`, borderRadius: 5, resize: "vertical", color: "#212121", background: "#fff", boxSizing: "border-box", display: "block" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* OP 541 tab content */}
          {isOp541Tab && (
            <div>
              {!op541FileName ? (
                <div style={{ padding: "64px 24px", textAlign: "center", color: "#616161" }}>
                  <div style={{ fontSize: 38, marginBottom: 12 }}>📂</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Upload the OP 541 Spreadsheet</div>
                  <div style={{ fontSize: 13, color: "#757575", marginBottom: 28, maxWidth: 480, margin: "0 auto 28px" }}>
                    Upload the .xlsx file filled out by the location. Their self-audit answers will appear alongside your on-site Y/N/NA assessment, with mismatches flagged automatically.
                  </div>
                  <label style={{ display: "inline-block", padding: "11px 28px", background: BRAND, color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    Choose .xlsx File
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541Upload(e.target.files[0])} />
                  </label>
                </div>
              ) : (
                <div>
                  {/* Info bar */}
                  <div style={{ padding: "10px 24px", background: "#f8f9fa", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: "#424242" }}>📄 {op541FileName}</span>
                      <span style={{ color: "#9e9e9e" }}>Loc: = location self-audit &nbsp;|&nbsp; Y / N / N/A = your on-site assessment</span>
                      {op541Stats.mismatch > 0 && (
                        <span style={{ color: "#e65100", fontWeight: 600 }}>⚠ {op541Stats.mismatch} mismatch{op541Stats.mismatch !== 1 ? "es" : ""} with location self-audit</span>
                      )}
                    </div>
                    <label style={{ fontSize: 12, color: BRAND, cursor: "pointer", textDecoration: "underline" }}>
                      Change file
                      <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541Upload(e.target.files[0])} />
                    </label>
                  </div>

                  <div style={{ padding: "16px 24px" }}>
                    {op541Sections.map((section, si) => {
                      const showSheetHeader = si === 0 || op541Sections[si - 1].sheetLabel !== section.sheetLabel;
                      return (
                        <div key={si} style={{ marginBottom: 20 }}>
                          {showSheetHeader && (
                            <div style={{ background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 8, borderRadius: 6, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em", marginTop: si > 0 ? 24 : 0 }}>
                              {section.sheetLabel}
                            </div>
                          )}
                          {section.label && (
                            <div style={{ background: "#e8eef4", padding: "8px 14px", marginBottom: 8, borderRadius: 5, fontWeight: 700, fontSize: 12, color: BRAND, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                                  border: `1px solid ${mismatch ? "#ffb300" : s === "no" ? "#ef9a9a" : s === "yes" ? "#a5d6a7" : "#e0e0e0"}`,
                                  background: mismatch ? "#fffde7" : s === "no" ? "#fff8f8" : s === "yes" ? "#f9fff9" : "#fff"
                                }}>
                                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {item.policy && <span style={{ fontSize: 11, color: "#9e9e9e", marginRight: 8 }}>{item.policy}</span>}
                                      <span style={{ fontSize: 13, color: "#212121", lineHeight: 1.5 }}>{item.text}</span>
                                      {item.locComment && <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 3 }}>{item.locComment}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                      <span style={{
                                        fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 4, whiteSpace: "nowrap",
                                        background: item.locAns === "Y" ? "#e8f5e9" : item.locAns === "N" ? "#ffebee" : item.locAns ? "#f5f5f5" : "#fafafa",
                                        color: item.locAns === "Y" ? "#2e7d32" : item.locAns === "N" ? "#c62828" : "#9e9e9e",
                                        border: `1px solid ${item.locAns === "Y" ? "#a5d6a7" : item.locAns === "N" ? "#ef9a9a" : "#e0e0e0"}`
                                      }}>
                                        Loc: {item.locAns || "—"}
                                      </span>
                                      {mismatch && <span title="Mismatch with location self-audit" style={{ color: "#e65100", fontSize: 15, fontWeight: 700 }}>⚠</span>}
                                      <div style={{ display: "flex", gap: 4 }}>
                                        {["yes", "no", "na"].map(v => (
                                          <button key={v} onClick={() => setOp541States(p => ({ ...p, [item.key]: p[item.key] === v ? null : v }))} style={{
                                            width: 38, height: 32, fontSize: 11, fontWeight: 600,
                                            border: `1px solid ${s === v ? STATUS_COLORS[v].border : "#e0e0e0"}`,
                                            background: s === v ? STATUS_COLORS[v].bg : "#fafafa",
                                            color: s === v ? STATUS_COLORS[v].text : "#9e9e9e",
                                            borderRadius: 5, cursor: "pointer"
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
                                      style={{ marginTop: 8, width: "50%", fontSize: 12, padding: "6px 8px", border: `1px solid ${s === "no" ? "#ef9a9a" : "#a5d6a7"}`, borderRadius: 5, resize: "vertical", color: "#212121", background: "#fff", boxSizing: "border-box", display: "block" }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
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
                <div style={{ padding: "64px 24px", textAlign: "center", color: "#616161" }}>
                  <div style={{ fontSize: 38, marginBottom: 12 }}>📂</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Upload the OP 541T Transfill Spreadsheet</div>
                  <div style={{ fontSize: 13, color: "#757575", marginBottom: 28, maxWidth: 480, margin: "0 auto 28px" }}>
                    Upload the .xlsx file filled out by the transfill location. Their self-audit answers will appear alongside your on-site Y/N/NA assessment, with mismatches flagged automatically.
                  </div>
                  <label style={{ display: "inline-block", padding: "11px 28px", background: BRAND, color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    Choose .xlsx File
                    <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541tUpload(e.target.files[0])} />
                  </label>
                </div>
              ) : (
                <div>
                  <div style={{ padding: "10px 24px", background: "#f8f9fa", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: "#424242" }}>📄 {op541tFileName}</span>
                      <span style={{ color: "#9e9e9e" }}>Loc: = location self-audit &nbsp;|&nbsp; Y / N / N/A = your on-site assessment</span>
                      {op541tStats.mismatch > 0 && (
                        <span style={{ color: "#e65100", fontWeight: 600 }}>⚠ {op541tStats.mismatch} mismatch{op541tStats.mismatch !== 1 ? "es" : ""} with location self-audit</span>
                      )}
                    </div>
                    <label style={{ fontSize: 12, color: BRAND, cursor: "pointer", textDecoration: "underline" }}>
                      Change file
                      <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleOp541tUpload(e.target.files[0])} />
                    </label>
                  </div>
                  <div style={{ padding: "16px 24px" }}>
                    {op541tSections.map((section, si) => {
                      const showSheetHeader = si === 0 || op541tSections[si - 1].sheetLabel !== section.sheetLabel;
                      return (
                        <div key={si} style={{ marginBottom: 20 }}>
                          {showSheetHeader && (
                            <div style={{ background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 8, borderRadius: 6, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em", marginTop: si > 0 ? 24 : 0 }}>
                              {section.sheetLabel}
                            </div>
                          )}
                          {section.label && (
                            <div style={{ background: "#e8eef4", padding: "8px 14px", marginBottom: 8, borderRadius: 5, fontWeight: 700, fontSize: 12, color: BRAND, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                                  border: `1px solid ${mismatch ? "#ffb300" : s === "no" ? "#ef9a9a" : s === "yes" ? "#a5d6a7" : "#e0e0e0"}`,
                                  background: mismatch ? "#fffde7" : s === "no" ? "#fff8f8" : s === "yes" ? "#f9fff9" : "#fff"
                                }}>
                                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {item.policy && <span style={{ fontSize: 11, color: "#9e9e9e", marginRight: 8 }}>{item.policy}</span>}
                                      <span style={{ fontSize: 13, color: "#212121", lineHeight: 1.5 }}>{item.text}</span>
                                      {item.locComment && <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 3 }}>{item.locComment}</div>}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                      <span style={{
                                        fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 4, whiteSpace: "nowrap",
                                        background: item.locAns === "Y" ? "#e8f5e9" : item.locAns === "N" ? "#ffebee" : item.locAns ? "#f5f5f5" : "#fafafa",
                                        color: item.locAns === "Y" ? "#2e7d32" : item.locAns === "N" ? "#c62828" : "#9e9e9e",
                                        border: `1px solid ${item.locAns === "Y" ? "#a5d6a7" : item.locAns === "N" ? "#ef9a9a" : "#e0e0e0"}`
                                      }}>
                                        Loc: {item.locAns || "—"}
                                      </span>
                                      {mismatch && <span title="Mismatch with location self-audit" style={{ color: "#e65100", fontSize: 15, fontWeight: 700 }}>⚠</span>}
                                      <div style={{ display: "flex", gap: 4 }}>
                                        {["yes", "no", "na"].map(v => (
                                          <button key={v} onClick={() => setOp541tStates(p => ({ ...p, [item.key]: p[item.key] === v ? null : v }))} style={{
                                            width: 38, height: 32, fontSize: 11, fontWeight: 600,
                                            border: `1px solid ${s === v ? STATUS_COLORS[v].border : "#e0e0e0"}`,
                                            background: s === v ? STATUS_COLORS[v].bg : "#fafafa",
                                            color: s === v ? STATUS_COLORS[v].text : "#9e9e9e",
                                            borderRadius: 5, cursor: "pointer"
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
                                      style={{ marginTop: 8, width: "50%", fontSize: 12, padding: "6px 8px", border: `1px solid ${s === "no" ? "#ef9a9a" : "#a5d6a7"}`, borderRadius: 5, resize: "vertical", color: "#212121", background: "#fff", boxSizing: "border-box", display: "block" }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* EMAIL VIEW */}
      {view === "email" && (
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#212121" }}>Manager Follow-Up Email</div>
            <button onClick={() => copyText(emailText)} style={{ padding: "7px 14px", fontSize: 13, background: copied ? "#e8f5e9" : "#fff", border: "1px solid #e0e0e0", borderRadius: 6, cursor: "pointer", color: copied ? "#2e7d32" : "#424242" }}>
              {copied ? "✓ Copied" : "Copy email"}
            </button>
          </div>
          <textarea value={emailText} onChange={e => setEmailText(e.target.value)}
            style={{ width: "100%", minHeight: 420, fontSize: 13, lineHeight: 1.7, padding: "14px", border: "1px solid #e0e0e0", borderRadius: 8, resize: "vertical", color: "#212121", boxSizing: "border-box" }} />
          <div style={{ marginTop: 12, fontSize: 12, color: "#9e9e9e" }}>You can edit this email before copying. Click "View Report →" for the full report.</div>
        </div>
      )}

      {/* REPORT VIEW */}
      {view === "report" && (
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#212121" }}>Survey Prep Report</div>
            <button onClick={() => window.print()} style={{ padding: "7px 14px", fontSize: 13, background: BRAND, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
              Print / Save as PDF
            </button>
          </div>

          <div style={{ border: `2px solid ${BRAND}`, borderRadius: 8, padding: "16px 20px", marginBottom: 20, background: "#f0f4f8" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 10 }}>Accreditation Survey Prep Report</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 13, color: "#424242" }}>
              <div><strong>Location / Lawson #:</strong> {meta.location || "—"}</div>
              <div><strong>City / State:</strong> {meta.city || "—"}</div>
              <div><strong>Accreditation Specialist:</strong> {meta.specialist || "—"}</div>
              <div><strong>Visit Date:</strong> {meta.date}</div>
            </div>
          </div>

          {(meta.followUpDate || meta.followUpTime) && (
            <div style={{ background: "#fff8c5", border: "2px solid #f0c000", borderRadius: 8, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18 }}>📅</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7a5c00", marginBottom: 2 }}>Follow-Up Teams Call Scheduled</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#3d2e00" }}>
                  {meta.followUpDate ? new Date(meta.followUpDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "—"}
                  {meta.followUpTime ? ` · ${meta.followUpTime}` : ""}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              ["Total Compliant", reportLines.reduce((a, s) => a + s.yes, 0), "#2e7d32", "#e8f5e9"],
              ["Total Issues",    reportLines.reduce((a, s) => a + s.no, 0),  "#c62828", "#ffebee"],
              ["Total N/A",       reportLines.reduce((a, s) => a + s.na, 0),  "#616161", "#f5f5f5"],
              ["Not Reviewed",    reportLines.reduce((a, s) => a + s.pending, 0), "#e65100", "#fff3e0"],
            ].map(([l, n, tc, bg]) => (
              <div key={l} style={{ background: bg, border: `1px solid ${tc}30`, borderRadius: 8, padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: tc }}>{n}</div>
                <div style={{ fontSize: 12, color: tc, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {reportLines.map((s, i) => (
            <div key={i} style={{ marginBottom: 16, border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: s.no > 0 ? "#ffebee" : s.pending > 0 ? "#fff8e1" : "#e8f5e9", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#212121" }}>{s.label}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                  <span style={{ color: "#2e7d32" }}>✓ {s.yes}</span>
                  <span style={{ color: "#c62828" }}>✗ {s.no}</span>
                  {s.na > 0 && <span style={{ color: "#616161" }}>N/A {s.na}</span>}
                  {s.pending > 0 && <span style={{ color: "#e65100" }}>? {s.pending}</span>}
                </div>
              </div>
              {s.issues.length > 0 && (
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#c62828", marginBottom: 8 }}>ITEMS REQUIRING CORRECTIVE ACTION:</div>
                  {s.issues.map((iss, j) => (
                    <div key={j} style={{ padding: "10px 12px", marginBottom: 6, background: iss.mismatch ? "#fffde7" : "#fff8f8", border: `1px solid ${iss.mismatch ? "#ffb300" : "#ef9a9a"}`, borderRadius: 5, fontSize: 13 }}>
                      <div style={{ color: "#212121", lineHeight: 1.5 }}>• {iss.text}</div>
                      {iss.mismatch && <div style={{ fontSize: 11, color: "#e65100", marginTop: 4, fontWeight: 600 }}>⚠ Mismatch — location self-audit marked compliant</div>}
                      {iss.comment && (
                        <div style={{ fontSize: 12, color: "#c62828", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${iss.mismatch ? "#ffe082" : "#f5c6c6"}`, lineHeight: 1.4 }}>
                          <strong>Note:</strong> {iss.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {s.observations && s.observations.length > 0 && (
                <div style={{ padding: "10px 16px", borderTop: s.issues.length > 0 ? "1px solid #e0e0e0" : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2e7d32", marginBottom: 6 }}>OBSERVATIONS:</div>
                  {s.observations.map((obs, j) => (
                    <div key={j} style={{ padding: "8px 10px", marginBottom: 4, background: "#f9fff9", border: "1px solid #a5d6a7", borderRadius: 5, fontSize: 13 }}>
                      <div style={{ color: "#212121", lineHeight: 1.5 }}>• {obs.text}</div>
                      {obs.comment && (
                        <div style={{ fontSize: 12, color: "#2e7d32", marginTop: 5, paddingTop: 5, borderTop: "1px solid #c8e6c9", lineHeight: 1.4 }}>
                          <strong>Note:</strong> {obs.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {s.issues.length === 0 && s.no === 0 && (
                <div style={{ padding: "8px 16px", fontSize: 13, color: "#2e7d32" }}>All items compliant — no corrective action required.</div>
              )}
            </div>
          ))}

          <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#212121", marginBottom: 6 }}>Additional Comments</div>
            <textarea placeholder="Add any additional notes or observations here…" rows={3}
              style={{ width: "100%", fontSize: 13, padding: "8px", border: "1px solid #e0e0e0", borderRadius: 5, resize: "vertical", color: "#212121", boxSizing: "border-box" }} />
          </div>
        </div>
      )}

      <style>{`@media print {
        button { display: none !important; }
        textarea { border: 1px solid #ccc !important; }
        body { margin: 0; }
      }`}</style>
    </div>
  );
}
