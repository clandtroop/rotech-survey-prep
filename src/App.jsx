import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

const BRAND = "#1a3a5c";
const ACCENT = "#2e6da4";

const DRAFT_KEY       = "rotech_survey_draft";
const VISITS_KEY      = "rotech_saved_visits";
const TREND_KEY       = "rotech_trend_data";
const PDF_HISTORY_KEY = "rotech_pdf_history";

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

function saveDraft(meta, states, comments) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, states, comments, savedAt: new Date().toISOString() })); } catch {}
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

function loadTrendData() {
  try { const r = localStorage.getItem(TREND_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function writeTrendData(visitId, meta, sections, states, comments, op541Sections, op541States, op541Comments, op541tSections, op541tStates, op541tComments, tabComments) {
  try {
    // Remove any prior records for this visitId so re-saves don't duplicate
    const existing = loadTrendData().filter(r => r.visitId !== visitId);
    const records = [];
    const base = {
      visitId,
      location: meta.location || "Unknown",
      city: meta.city || "",
      date: meta.date || "",
      specialist: meta.specialist || "",
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
      if (["pst_setup", "pst_maintenance", "clinician", "vent"].includes(sec.id) && tabComments[sec.id]) {
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

    // Write a summary record even if no issues (for clean visit tracking)
    if (records.length === 0) {
      records.push({ ...base, section: "_summary", formRef: "", itemText: "_clean", comment: "", visitType: "summary" });
    }

    localStorage.setItem(TREND_KEY, JSON.stringify([...existing, ...records].slice(-2000)));
  } catch {}
}

function deleteTrendVisit(visitId) {
  try {
    localStorage.setItem(TREND_KEY, JSON.stringify(loadTrendData().filter(r => r.visitId !== visitId)));
  } catch {}
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
    id: "pst_setup", label: "PST Home Visit — Setup", ref: "Form JC 426 (Setup)",
    items: [
      { text: "ALL equipment, supplies, and tanks secured in vehicle." },
      { text: "Testing equipment, gloves, Madawipes, hand gel, non-clear bags and red tags on the vehicle." },
      { text: "Complete dosing instructions are printed on the delivery ticket.", note: "Must include liter flow, route of delivery, and duration (2lpm NC Continuous)." },
      { text: "Patient information is not visible in the vehicle." },
      { text: "Vehicle is locked and secured when unattended.", note: "Windows must be up and all doors locked." },
      { text: "Hand gel applied prior to entering patient's home." },
      { text: "Confirm correct patient utilizing two patient identifiers (name, DOB, address, etc.).", note: "Verify patient's name before entering the home." },
      { text: "Back-up tank assembled to take in the home (cylinder, stand, regulator, supplies). Must obtain an AMA if patient refuses backup system.", note: "If continuous patient, be sure they have enough oxygen in their tank to last through the setup. If not on oxygen upon arrival, place patient on backup system." },
      { text: "Return to the vehicle for equipment that needs to be setup or swapped out." },
      { text: "Hand gel used between clean and dirty (e.g., home and vehicle); if gloves are used, gloves are changed between clean and dirty, and hand gel used between glove changes.", note: "Trips between home and vehicle; between glove changes; remove all dirty items (filters and supplies) → hand gel → place new items." },
      { text: "Test outlet to ensure proper grounding. Use circuit tester.", note: "If there are no grounded outlets in the home, educate the patient on the need to have a grounded outlet installed, document this on the CL 307 Initial Plan of Care and proceed with setup." },
      { text: "Plug in and turn on the concentrator to start run time.", note: "Observe minimum run times (Refer to OP 609 - Oxygen Concentrator Specifications)." },
      { text: "Concentrator alarm checked by unplugging unit from power source; verify patient/caregiver can hear alarm.", note: 'Verbally ask "Can you hear the alarm?" Educate patient why they might possibly hear an alarm (ex: power outage, equipment failure, etc.) If patient cannot hear the alarm, ask if there is someone in the home who can hear it or move to a different room closer to patient. If hearing impaired, show them to look for visual cues such as lights on the concentrator.' },
      { text: "Deliver and instruct patient on use of portable gaseous system, portable liquid oxygen, portable concentrator and/or back-up system as necessary per order, and verify conserving device cycling. Also discuss Equipment Safety Instructions.", note: 'Return demonstration is required to show patient knows how to work their portable and backup systems. Verify concentration of POC by utilizing SmartCheck Analyzer. Must flag backup system with "Backup Equipment Only" tag (RHI 600).' },
      { text: "Instruct patient on cylinder storage for safety and security.", note: "Oxygen cylinders must NOT be stored in closets, left freestanding, placed within 15 feet of a heat source or open flame or stored in the trunk of the car. If issues are identified, correct issue, provide education to the patient and document on CL 307 - Initial Plan of Care." },
      { text: "Verified concentrator setting matches current order. Patient must set liter flow as prescribed by physician.", note: "Educate patient on their prescription, how to set the flow, and have them set equipment to prescribed liter flow. (Non-clinicians cannot set or adjust liter flow)." },
      { text: "Analyzed concentrator oxygen percentage, observing minimum run time (Refer to OP 609 - Oxygen Concentrator Specifications).", note: "Observe minimum run times (OP 609)." },
      { text: "Oxygen flow checked at the end of longest tubing.", note: "Must use flow pen to check this, not an analyzer with flow built in." },
      { text: "Educate patient on operation of equipment and changing disposable supplies and cleaning filter(s). Verify patient's ability to operate equipment.", note: "Be sure the patient is aware to change cannula every 2 weeks, tubing every 90 days, and humidifier bottles every 30 days. External filters and/or air intake vents must be cleaned weekly." },
      { text: "Completed all sections of Initial Plan of Care (CL 307). Pay attention to the surroundings in the home: fireplaces, cigarettes/vapes, lighters, ash trays, candles, stoves, or heaters. Educate to keep 15 ft. away from any open flames or heat source. Document issue and education.", note: "Each question on CL 307, to include PCP, Pulmonologist, Emergency Contact, and Power Company, must be discussed with the patient. Educate on any issue identified. Document issue and education provided. The concentration % of the concentrator MUST be on these forms. Document \"Alarm Audible to Patient\". If patient has POC, ensure to check its concentration % and record on the CL 307." },
      { text: '"No Smoking" sign(s) left for patient to hang at entrance to home.', note: "If oxygen is in the home, \"No Smoking\" sign is required. Signage alerts first responders that there is oxygen in the home." },
      { text: "Checked the function, cleanliness and location label on all Rotech equipment." },
      { text: "Concentrator, Regulator, Portable System, Conserving Device, Tanks (including backup tank), and Supplies (serial, model, and/or lot numbers) documented on delivery ticket.", note: "Document all equipment, supplies, and cylinders delivered. Cylinder lot numbers must be on Delivery Ticket and Lot Tank Form. Number of cylinders must match on Delivery Ticket, Initial Plan of Care, and Lot Tank Form." },
      { text: "Patient internet access confirmed; instructed to visit www.rotech.com, review what is available on website and provide Rotech Paperless Contact Card (RHI 1080) with all new setups (printed booklets provided if no internet access).", note: 'Verbally ask the patient "Do you have access to the internet?" If no internet access, be prepared to give the patient printed copies of the RHI 1000 Patient Information Booklet and RHI 1001 Home Medical Equipment Booklet. If initial set up, provide with the RHI 1080 card.' },
      { text: "Ensure ALL paperwork is filled out completely before leaving the home. (Delivery Ticket, Initial Plan of Care, Payment Authorization, etc.)" },
      { text: "Testing equipment cleaned prior to placing back into bag or vehicle; gloves must be worn when using Madawipes.", note: "Gloves must be worn when using any Mada products. Clean analyzer, flow pen, circuit tester and tablet before placing in bag or vehicle." },
      { text: "Used hand gel upon completion of home visit." },
    ]
  },
  {
    id: "pst_maintenance", label: "PST Home Visit — Maintenance", ref: "Form JC 426 (Maintenance)",
    items: [
      { text: "ALL equipment, supplies, and tanks secured in vehicle." },
      { text: "Testing equipment, gloves, Madawipes, hand gel, non-clear bags and red tags on the vehicle." },
      { text: "Complete dosing instructions are printed on the maintenance or exchange ticket.", note: "Must include liter flow, route of delivery, and duration (2lpm NC Continuous)." },
      { text: "Patient information is not visible in the vehicle." },
      { text: "Vehicle is locked and secured when unattended.", note: "Windows must be up and all doors locked." },
      { text: "Hand gel applied prior to entering patient's home." },
      { text: '"No Smoking" sign(s) posted at entrance to home.', note: "If oxygen is in the home, \"No Smoking\" sign is required. Signage alerts first responders that there is oxygen in the home." },
      { text: "Confirm correct patient utilizing two patient identifiers (name, DOB, address, etc.).", note: "Verify patient's name before entering the home." },
      { text: "Gloves used if equipment/supplies are visibly contaminated.", note: "It is Rotech's policy (2.3.1) to observe Standard Precautions — wear gloves when coming in contact with equipment and/or supplies that are visibly contaminated. If the home is clean and tidy and the equipment is not visibly contaminated, gloves are not required. Practice good hand gel hygiene." },
      { text: "Instructed patient to use portable or back-up system as necessary per order, and verified conserving device cycling.", note: "Be sure patient has enough oxygen in their tank to last through the maintenance. This is a good opportunity for the patient to show you they know how to work their portable and backup systems." },
      { text: "Checked portable liquid oxygen, gaseous systems, or portable concentrator (conserving device, POC, regulator) and patient's ability to operate.", note: "If patient has POC, check the concentration % utilizing the SmartCheck analyzer and record on the OP 511 Equipment Maintenance Form." },
      { text: "Turn on the concentrator if it is not already running.", note: "Observe minimum run times (OP 609)." },
      { text: "Concentrator alarm checked by unplugging unit from power source; verify patient/caregiver can hear alarm.", note: 'Verbally ask "Can you hear the alarm?" If patient cannot hear the alarm, ask if there is someone in the home who can hear it or move to a different room closer to patient. If hearing impaired, show them to look for visual cues such as lights on the concentrator.' },
      { text: "Verified back-up only tanks and patient's ability to operate (AMA on file if patient refuses back-up).", note: "Back-up tanks must be tagged with a Back-up Equipment Only tag (RHI 600)." },
      { text: "Identified cylinder storage for safety and security, address as necessary.", note: "Oxygen cylinders must NOT be stored in closets, left freestanding, placed within 15 feet of a heat source or open flame or stored in the trunk of the car. If issues are identified, correct issue, provide education to the patient and document on OP 511 Equipment Maintenance Record." },
      { text: "Analyzed concentrator oxygen percentage, observing minimum run time (OP 609 Oxygen Concentrator Specifications).", note: "Observe minimum run times and concentration (OP 609)." },
      { text: "Hand gel used between clean and dirty (e.g., home and vehicle); if gloves are used, gloves are changed between clean and dirty, and hand gel used between glove changes.", note: "Trips between home and vehicle; between glove changes; remove all dirty items (filters and supplies) → hand gel → place new items." },
      { text: "Verified concentrator setting matches current order, address as necessary.", note: "If the concentrator is not set to the prescription on file (dosing instructions), ask patient why it is set differently. If there has been a change in the prescription, leave the liter flow as is and notify the LCM that an updated prescription is needed. If the prescription is correct, have patient adjust to correct liter flow. PATIENT MUST MAKE ALL CHANGES TO LITER FLOW, PST CANNOT ADJUST." },
      { text: "Oxygen flow checked at the end of longest tubing.", note: "Must use flow pen to check this, not an analyzer with flow built in." },
      { text: "Checked the function, cleanliness and location label on all Rotech equipment.", note: "All equipment must have a location label on it." },
      { text: "Asked patient about changing disposable supplies and cleaning filter(s).", note: "Be sure the patient is aware to change cannula every 2 weeks, tubing every 90 days, humidifier bottles every 30 days, and filters per manufacturer guidelines. External filters and/or air intake vents must be cleaned weekly." },
      { text: "Completed all sections of Equipment Maintenance Record (OP 511). Pay attention to the surroundings in the home: fireplaces, cigarettes/vapes, lighters, ash trays, candles, stoves, or heaters. Educate to keep 15 ft. away from any open flames or heat source. Document issue and education.", note: "All 16 questions on the Safety Assessment of the OP 511 Equipment Maintenance Record must be discussed with the patient. Educate on any issue identified. Document issue and education provided. The concentration % of the concentrator MUST be on these forms." },
      { text: "If fire risk is identified, a PE 662 High-Risk Smoking & Education Packet must be provided to the patient.", note: "Back page must be signed by the patient and returned to the location to be scanned into the EMR." },
      { text: "Supplies and serial/lot numbers documented on delivery ticket.", note: "Document all supplies and cylinders delivered. Cylinder lot numbers must be on Delivery Ticket and the Lot Tank Form." },
      { text: "Ensure ALL paperwork is filled out completely before leaving the home. (BL 401, COPD assessment and Are You Tired of Being Tired?)" },
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

// ─── POLICY REVISION DATES ────────────────────────────────────────────────────
// Update the date strings below whenever a policy is revised.
// Format: "MM.DD.YYYY" — appears as a tooltip badge on checklist items
//         and in the Policy Dates reference tab.
// ─────────────────────────────────────────────────────────────────────────────
const POLICY_DATES = {
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
  "Policy 2.2.2":  { name: "Emergency Preparedness",                   rev: "11.17.2025" },
  "Policy 2.4.13": { name: "Fire Prevention",                           rev: "01.01.2026" },
  "Policy 2.4.1":  { name: "Incidents",                                 rev: "01.01.2026" },
  "Policy 2.2.4":  { name: "Instrumentation Maintenance & Calibration", rev: "03.17.2026" },
};

// Returns all POLICY_DATES keys found anywhere in the given text string
// Uses word-boundary check so "Policy 1.1.2" won't match inside "Policy 1.1.22"
function getPolicyMatches(text) {
  return Object.keys(POLICY_DATES).filter(key => {
    const idx = text.indexOf(key);
    if (idx === -1) return false;
    const after = text[idx + key.length];
    // Ensure the character after the match is not a digit or dot (prevents 1.1.2 matching 1.1.22)
    return !after || !/[\d.]/.test(after);
  });
}

function PolicyDateSearch() {
  const [query, setQuery] = useState("");
  const entries = Object.entries(POLICY_DATES);
  const filtered = query.trim()
    ? entries.filter(([key, val]) =>
        key.toLowerCase().includes(query.toLowerCase()) ||
        val.name.toLowerCase().includes(query.toLowerCase()) ||
        val.rev.includes(query)
      )
    : entries;

  return (
    <div>
      <input
        value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search by policy #, name, or date…"
        style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: 14, boxSizing: "border-box", outline: "none", color: "#212121" }}
      />
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 130px", background: "#1a3a5c", color: "#fff", padding: "9px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <div>Policy #</div>
          <div>Name</div>
          <div style={{ textAlign: "center" }}>Last Revised</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#9e9e9e", fontSize: 13 }}>No policies match "{query}"</div>
        )}
        {filtered.map(([key, val], i) => (
          <div key={key} style={{
            display: "grid", gridTemplateColumns: "140px 1fr 130px",
            padding: "9px 14px", fontSize: 13, alignItems: "center",
            background: i % 2 === 0 ? "#fff" : "#f8f9fa",
            borderTop: "1px solid #f0f0f0"
          }}>
            <div style={{ fontWeight: 600, color: "#1a3a5c", fontFamily: "monospace", fontSize: 12 }}>{key}</div>
            <div style={{ color: "#424242" }}>{val.name}</div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: "#e8eef4", color: "#1a3a5c", border: "1px solid #c5d5e8" }}>
                {val.rev}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#bdbdbd", textAlign: "right" }}>{filtered.length} of {entries.length} policies shown</div>
    </div>
  );
}

function TrendTracker() {
  const [data] = useState(loadTrendData);
  const [filterLoc, setFilterLoc] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterSpec, setFilterSpec] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const issues = data.filter(r => r.itemText !== "_clean" && r.section !== "_summary" && r.visitType !== "note");

  const filtered = issues.filter(r => {
    if (filterLoc     && !r.location.toLowerCase().includes(filterLoc.toLowerCase())) return false;
    if (filterSection && r.section !== filterSection) return false;
    if (filterSpec    && r.specialist !== filterSpec) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo   && r.date > dateTo)   return false;
    return true;
  });

  // Unique visits in filtered set
  const visitIds = [...new Set(filtered.map(r => r.visitId))];
  const totalVisits = [...new Set(data.map(r => r.visitId))].length;

  // Top failing items
  const itemFreq = {};
  filtered.forEach(r => { itemFreq[r.itemText] = (itemFreq[r.itemText] || 0) + 1; });
  const topItems = Object.entries(itemFreq).sort((a,b) => b[1]-a[1]).slice(0, 15);

  // Top failing locations
  const locFreq = {};
  filtered.forEach(r => { locFreq[r.location] = (locFreq[r.location] || 0) + 1; });
  const topLocs = Object.entries(locFreq).sort((a,b) => b[1]-a[1]).slice(0, 10);

  // Recurring — same item + same location, 2+ times
  const recurring = {};
  filtered.forEach(r => {
    const k = `${r.location}||${r.itemText}`;
    recurring[k] = (recurring[k] || 0) + 1;
  });
  const recurringItems = Object.entries(recurring)
    .filter(([,count]) => count >= 2)
    .sort((a,b) => b[1]-a[1])
    .map(([k, count]) => { const [loc, item] = k.split("||"); return { loc, item, count }; });

  // Sections breakdown
  const secFreq = {};
  filtered.forEach(r => { secFreq[r.section] = (secFreq[r.section] || 0) + 1; });
  const topSections = Object.entries(secFreq).sort((a,b) => b[1]-a[1]);

  const allLocations  = [...new Set(data.map(r => r.location))].sort();
  const allSections   = [...new Set(data.map(r => r.section).filter(s => s !== "_summary"))].sort();
  const allSpecialists = [...new Set(data.map(r => r.specialist).filter(Boolean))].sort();

  function exportXLSX() {
    const rows = [["Visit ID","Location","City","Date","Specialist","Section","Form Ref","Item","Comment"]];
    filtered.forEach(r => rows.push([r.visitId, r.location, r.city, r.date, r.specialist, r.section, r.formRef, r.itemText, r.comment]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Issue Trends");
    XLSX.writeFile(wb, `Rotech_IssueTrends_${new Date().toLocaleDateString("en-US").replace(/\//g,"-")}.xlsx`);
  }

  function exportPDF() {
    // Save snapshot to localStorage before printing
    const snapshot = {
      id: `pdf_${Date.now()}`,
      label: `${meta.location || "Unknown Location"} — ${meta.date || "No Date"}`,
      location: meta.location || "",
      city: meta.city || "",
      specialist: meta.specialist || "",
      date: meta.date || "",
      generatedAt: new Date().toISOString(),
      meta,
      states,
      comments,
      tabComments,
      op541VehicleInfo,
    };
    savePdfSnapshot(snapshot);
    setPdfHistory(loadPdfHistory());
    const backupOk = downloadBackupFile(snapshot, "Rotech_TrendBackup");
    if (!backupOk) alert("Warning: automatic backup download failed. Please make sure to save the PDF from the print dialog.");
    window.print();
  }
  const inputStyle = { fontSize: 12, padding: "5px 8px", border: "1px solid #e0e0e0", borderRadius: 5, color: "#212121", background: "#fff", width: "100%" };
  const cardStyle  = { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden", marginBottom: 16 };
  const headStyle  = { background: BRAND, color: "#fff", padding: "10px 16px", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" };

  if (totalVisits === 0) return (
    <div style={{ padding: "64px 24px", textAlign: "center", color: "#9e9e9e" }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#424242", marginBottom: 8 }}>No trend data yet</div>
      <div style={{ fontSize: 13 }}>Complete a visit and click "💾 Save Progress" to start tracking issue trends.</div>
    </div>
  );

  return (
    <div style={{ padding: "16px 24px" }}>
      {/* Header + export */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND }}>Issue Trend Analysis</div>
          <div style={{ fontSize: 12, color: "#9e9e9e", marginTop: 2 }}>{totalVisits} visit{totalVisits !== 1 ? "s" : ""} tracked · {issues.length} total issues recorded</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportXLSX} style={{ padding: "7px 14px", fontSize: 12, background: "#1a6e35", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>⬇ Export XLSX</button>
          <button onClick={exportPDF}  style={{ padding: "7px 14px", fontSize: 12, background: BRAND,     color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>🖨 Print / PDF</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#f8f9fa", border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Filter</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "#757575", marginBottom: 3 }}>Location</div>
            <input list="locs" value={filterLoc} onChange={e => setFilterLoc(e.target.value)} placeholder="All locations" style={inputStyle} />
            <datalist id="locs">{allLocations.map(l => <option key={l} value={l} />)}</datalist>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#757575", marginBottom: 3 }}>Section</div>
            <select value={filterSection} onChange={e => setFilterSection(e.target.value)} style={inputStyle}>
              <option value="">All sections</option>
              {allSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#757575", marginBottom: 3 }}>Specialist</div>
            <select value={filterSpec} onChange={e => setFilterSpec(e.target.value)} style={inputStyle}>
              <option value="">All specialists</option>
              {allSpecialists.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#757575", marginBottom: 3 }}>Date From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#757575", marginBottom: 3 }}>Date To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={() => { setFilterLoc(""); setFilterSection(""); setFilterSpec(""); setDateFrom(""); setDateTo(""); }}
              style={{ width: "100%", padding: "5px 8px", fontSize: 12, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 5, cursor: "pointer", color: "#616161" }}>
              Clear Filters
            </button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 8 }}>Showing {filtered.length} issue{filtered.length !== 1 ? "s" : ""} across {visitIds.length} visit{visitIds.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Recurring Issues — most important, show first */}
      {recurringItems.length > 0 && (
        <div style={cardStyle}>
          <div style={{ ...headStyle, background: "#b71c1c" }}>🔁 Recurring Issues — Same Item Failing at Same Location ({recurringItems.length})</div>
          <div style={{ padding: "12px 16px" }}>
            {recurringItems.map((r, i) => (
              <div key={i} style={{ padding: "8px 12px", marginBottom: 6, background: "#fff8f8", border: "1px solid #ef9a9a", borderRadius: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#c62828", marginBottom: 2 }}>{r.loc}</div>
                    <div style={{ fontSize: 13, color: "#212121", lineHeight: 1.4 }}>{r.item}</div>
                  </div>
                  <span style={{ background: "#ffebee", color: "#c62828", borderRadius: 10, padding: "2px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{r.count}× failed</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Top failing items */}
        <div style={cardStyle}>
          <div style={headStyle}>Top Failing Items</div>
          <div style={{ padding: "12px 16px" }}>
            {topItems.length === 0 && <div style={{ fontSize: 13, color: "#9e9e9e" }}>No issues in selected range.</div>}
            {topItems.map(([text, count], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < topItems.length - 1 ? "1px solid #f5f5f5" : "none", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#212121", lineHeight: 1.4, flex: 1 }}>{text}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <div style={{ width: Math.max(4, (count / (topItems[0]?.[1] || 1)) * 60), height: 6, background: "#ef5350", borderRadius: 3 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#c62828", minWidth: 20, textAlign: "right" }}>{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top locations */}
        <div style={cardStyle}>
          <div style={headStyle}>Locations by Issue Count</div>
          <div style={{ padding: "12px 16px" }}>
            {topLocs.length === 0 && <div style={{ fontSize: 13, color: "#9e9e9e" }}>No issues in selected range.</div>}
            {topLocs.map(([loc, count], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < topLocs.length - 1 ? "1px solid #f5f5f5" : "none", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#212121", flex: 1 }}>{loc}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <div style={{ width: Math.max(4, (count / (topLocs[0]?.[1] || 1)) * 60), height: 6, background: BRAND, borderRadius: 3 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: BRAND, minWidth: 20, textAlign: "right" }}>{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Issues by section */}
      <div style={cardStyle}>
        <div style={headStyle}>Issues by Checklist Section</div>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {topSections.length === 0 && <div style={{ fontSize: 13, color: "#9e9e9e" }}>No issues in selected range.</div>}
          {topSections.map(([sec, count], i) => (
            <div key={i} style={{ padding: "8px 12px", background: "#f8f9fa", borderRadius: 6, border: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#424242" }}>{sec}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: BRAND, background: "#e8eef4", borderRadius: 10, padding: "1px 8px" }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full issue log */}
      <div style={cardStyle}>
        <div style={headStyle}>Full Issue Log ({filtered.length} items)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                {["Date","Location","Section","Item","Comment","Specialist"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#424242", borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#9e9e9e" }}>No issues match the current filters.</td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f5f5f5", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "7px 12px", whiteSpace: "nowrap", color: "#616161" }}>{r.date}</td>
                  <td style={{ padding: "7px 12px", fontWeight: 600, color: BRAND }}>{r.location}</td>
                  <td style={{ padding: "7px 12px", color: "#616161", whiteSpace: "nowrap" }}>{r.section}</td>
                  <td style={{ padding: "7px 12px", color: "#212121", lineHeight: 1.4 }}>{r.itemText}</td>
                  <td style={{ padding: "7px 12px", color: "#757575", fontStyle: r.comment ? "normal" : "italic" }}>{r.comment || "—"}</td>
                  <td style={{ padding: "7px 12px", color: "#616161", whiteSpace: "nowrap" }}>{r.specialist}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const draft = loadDraft();

  const [meta, setMeta] = useState(draft?.meta ?? { location: "", city: "", specialist: "", date: new Date().toLocaleDateString("en-US"), followUpDate: "", followUpTime: "" });
  const [activeTab, setActiveTab] = useState(0);
  const [{ states, comments }, setForm] = useState(() => {
    if (draft?.states) return { states: draft.states, comments: draft.comments ?? {} };
    return initStates();
  });
  const [view, setView] = useState("form");
  const [emailText, setEmailText] = useState("");
  const [reportLines, setReportLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasDraft, setHasDraft] = useState(!!draft);
  const [savedAt, setSavedAt] = useState(draft?.savedAt ?? null);
  const [savedVisits, setSavedVisits] = useState(loadVisits);
  const [pdfHistory, setPdfHistory]   = useState(loadPdfHistory);
  const [showVisits, setShowVisits] = useState(false);
  const [showPdfReminder, setShowPdfReminder] = useState(false);

  // Fail-safe: the browser print dialog never tells JS whether the user actually
  // saved a PDF or hit cancel, so once it closes, prompt them to double check.
  useEffect(() => {
    const handler = () => setShowPdfReminder(true);
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  // OP 541 state
  const [op541Sections, setOp541Sections] = useState([]);
  const [op541States, setOp541States] = useState({});
  const [op541Comments, setOp541Comments] = useState({});
  const [op541FileName, setOp541FileName] = useState("");
  const [op541VehicleInfo, setOp541VehicleInfo] = useState({}); // { sheetLabel: { pstName, vehicleNum } }

  // OP 541T state
  const [op541tSections, setOp541tSections] = useState([]);
  const [op541tStates, setOp541tStates] = useState({});
  const [op541tComments, setOp541tComments] = useState({});
  const [op541tFileName, setOp541tFileName] = useState("");

  // Tab-level comments for PST Home Visit, PAP Setup, Ventilator Home Visit
  const [tabComments, setTabComments] = useState({ pst_setup: "", pst_maintenance: "", clinician: "", vent: "" });
  const setTabComment = (id, val) => setTabComments(prev => ({ ...prev, [id]: val }));

  const setState = useCallback((key, val) => {
    setForm(prev => ({ ...prev, states: { ...prev.states, [key]: prev.states[key] === val ? null : val } }));
  }, []);

  const setComment = useCallback((key, val) => {
    setForm(prev => ({ ...prev, comments: { ...prev.comments, [key]: val } }));
  }, []);

  // Auto-save draft on any change
  useEffect(() => {
    saveDraft(meta, states, comments);
    setSavedAt(new Date().toISOString());
  }, [meta, states, comments, tabComments, op541VehicleInfo]);

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
      data.push({
        label: `OP 541 — ${sec.sheetLabel}${sec.label ? " / " + sec.label : ""}`,
        ref: "OP 541 Location Readiness Tool",
        pstName: vInfo.pstName || "",
        vehicleNum: vInfo.vehicleNum || "",
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

  function startFresh() {
    if (!window.confirm("Clear all data and start a new visit? This cannot be undone.")) return;
    clearDraft();
    const b = initStates();
    setMeta({ location: "", city: "", specialist: meta.specialist, date: new Date().toLocaleDateString("en-US"), followUpDate: "", followUpTime: "" });
    setForm(b);
    setOp541Sections([]); setOp541States({}); setOp541Comments({}); setOp541FileName(""); setOp541VehicleInfo({});
    setOp541tSections([]); setOp541tStates({}); setOp541tComments({}); setOp541tFileName("");
    setTabComments({ pst_setup: "", pst_maintenance: "", clinician: "", vent: "" });
    setActiveTab(0); setView("form"); setEmailText(""); setReportLines([]); setHasDraft(false); setSavedAt(null);
  }

  function saveProgress() {
    const id = `visit_${meta.location?.replace(/\s+/g,"_") || "unknown"}_${Date.now()}`;
    const visit = {
      id,
      label: `${meta.location || "Unknown Location"} — ${meta.date}`,
      savedAt: new Date().toISOString(),
      meta, states, comments,
      op541Sections, op541States, op541Comments, op541FileName, op541VehicleInfo,
      op541tSections, op541tStates, op541tComments, op541tFileName,
      tabComments,
    };
    saveVisitToStorage(visit);
    writeTrendData(id, meta, SECTIONS, states, comments, op541Sections, op541States, op541Comments, op541tSections, op541tStates, op541tComments, tabComments);
    setSavedVisits(loadVisits());
    alert(`Visit saved: ${visit.label}`);
  }

  function loadVisit(visit) {
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
    setTabComments(visit.tabComments ?? { pst_setup: "", pst_maintenance: "", clinician: "", vent: "" });
    setActiveTab(0); setView("form"); setEmailText(""); setReportLines([]);
    setShowVisits(false);
  }

  function deleteVisit(id) {
    deleteVisitFromStorage(id);
    deleteTrendVisit(id);
    setSavedVisits(loadVisits());
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
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      setEmailText(text);
    } catch {
      setEmailText(`Subject: Accreditation Survey Prep Follow-Up — ${loc}, ${city} — ${date}\n\nHello,\n\nThank you for your time during the accreditation survey prep visit on ${date} for ${loc}, ${city}.\n\n${issues.length === 0 ? "All reviewed areas were found to be in compliance. No corrective action is required at this time." : `The following items require corrective action:\n\n${issueBlock}\n\nPlease address each item and report back with your findings. A follow-up Teams call with the LCM and Area/Region Manager will be scheduled.`}\n\nBest regards,\n${spec}\nAccreditation Specialist`);
    } finally {
      setReportLines(summaryData);
      setLoading(false);
      setView("email");
    }
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

      const strCell = (addr, val) =>
        `<c r="${addr}" t="inlineStr"><is><t>${esc(val)}</t></is></c>`;

      // Build one worksheet XML for a given tab's issues
      // Columns: A=Item Description  B=Corrective Action Status (dropdown)  C=Notes
      const buildSheetXml = (tabLabel, tabRef, issues) => {
        const maxRow = issues.length + 3; // header=1, meta=2, col-headers=3, data starts at 4

        const headerRow = `<row r="1" spans="1:3">` +
          strCell("A1", `${tabLabel}  |  ${tabRef}`) +
          strCell("B1", `Location: ${meta.location || "—"}`) +
          strCell("C1", `Visit Date: ${meta.date || "—"}`) +
          `</row>`;

        const metaRow = `<row r="2" spans="1:3">` +
          strCell("A2", `Specialist: ${meta.specialist || "—"}`) +
          strCell("B2", `City / State: ${meta.city || "—"}`) +
          strCell("C2", `Export Date: ${new Date().toLocaleDateString("en-US")}`) +
          `</row>`;

        const colHeaderRow = `<row r="3" spans="1:3">` +
          strCell("A3", "Item / Finding") +
          strCell("B3", "Corrected? (Yes / No / Pending)") +
          strCell("C3", "Notes / Comments") +
          `</row>`;

        const dataRows = issues.map((iss, idx) => {
          const r = idx + 4;
          const noteText = [iss.comment, iss.mismatch ? "⚠ Mismatch — location self-audit marked compliant" : ""]
            .filter(Boolean).join(" | ");
          return `<row r="${r}" spans="1:3">` +
            strCell(`A${r}`, iss.text) +
            `<c r="B${r}" t="inlineStr"><is><t></t></is></c>` +
            strCell(`C${r}`, noteText) +
            `</row>`;
        }).join("");

        // CF: green for Yes, red for No, yellow for Pending — applied to col B data rows
        const cfSqref = `B4:B${Math.max(maxRow, 203)}`;
        const cf = `<conditionalFormatting sqref="${cfSqref}">` +
          `<cfRule type="containsText" priority="1" operator="containsText" dxfId="0" text="Yes"><formula>NOT(ISERROR(SEARCH("Yes",B4)))</formula></cfRule>` +
          `<cfRule type="containsText" priority="2" operator="containsText" dxfId="1" text="No"><formula>NOT(ISERROR(SEARCH("No",B4)))</formula></cfRule>` +
          `<cfRule type="containsText" priority="3" operator="containsText" dxfId="2" text="Pending"><formula>NOT(ISERROR(SEARCH("Pending",B4)))</formula></cfRule>` +
          `</conditionalFormatting>`;

        // Data validation: Yes/No/Pending dropdown on col B data rows
        const dvSqref = `B4:B${Math.max(maxRow, 203)}`;
        const dv = `<dataValidations count="1">` +
          `<dataValidation sqref="${dvSqref}" showDropDown="0" showInputMessage="1" showErrorMessage="1" allowBlank="1" ` +
          `errorTitle="Invalid Entry" error="Please select &quot;Yes&quot;, &quot;No&quot;, or &quot;Pending&quot;." ` +
          `promptTitle="Item Corrected?" prompt="Select &quot;Yes&quot; if resolved, &quot;No&quot; if still open, &quot;Pending&quot; if in progress." ` +
          `type="list"><formula1>"Yes,No,Pending"</formula1></dataValidation>` +
          `</dataValidations>`;

        // Col widths: A=60, B=28, C=40
        const cols = `<cols><col min="1" max="1" width="60" bestFit="1" customWidth="1"/>` +
          `<col min="2" max="2" width="28" customWidth="1"/>` +
          `<col min="3" max="3" width="40" bestFit="1" customWidth="1"/></cols>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheetViews><sheetView tabSelected="0" workbookViewId="0"><selection activeCell="A4" sqref="A4"/></sheetView></sheetViews>` +
          cols +
          `<sheetData>` +
          headerRow + metaRow + colHeaderRow + dataRows +
          `</sheetData>` +
          cf + dv +
          `</worksheet>`;
      };

      // ── Build styles.xml with the 3 dxf entries CF needs ──
      const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
        `<dxfs count="3">` +
          `<dxf><font><b val="1"/><color rgb="001B5E20"/></font><fill><patternFill patternType="solid"><fgColor rgb="00C8E6C9"/><bgColor rgb="00C8E6C9"/></patternFill></fill></dxf>` +
          `<dxf><font><b val="1"/><color rgb="00B71C1C"/></font><fill><patternFill patternType="solid"><fgColor rgb="00FFCDD2"/><bgColor rgb="00FFCDD2"/></patternFill></fill></dxf>` +
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
        zip.file(`xl/worksheets/sheet${i + 1}.xml`, buildSheetXml(s.label, s.ref, s.issues));
      });

      // ── Download ──
      const outBuf = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
      const blob   = new Blob([outBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement("a");
      const loc    = (meta.location || "Location").replace(/\s+/g, "_");
      const date   = (meta.date     || "").replace(/\//g, "-");
      a.href     = url;
      a.download = `FollowUp_${loc}_${date}.xlsx`;
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
      meta, states, comments, tabComments, op541VehicleInfo,
    };
    savePdfSnapshot(snapshot);
    setPdfHistory(loadPdfHistory());
    const backupOk = downloadBackupFile(snapshot, "Rotech_Backup");
    if (!backupOk) alert("Warning: automatic backup download failed. Please make sure to save the PDF from the print dialog.");
    window.print();
  }

  function copyText(txt) {
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const isOp541Tab  = activeTab === SECTIONS.length;
  const isOp541tTab = activeTab === SECTIONS.length + 1;
  const isPolicyTab = activeTab === SECTIONS.length + 2;
  const isTrendsTab = activeTab === SECTIONS.length + 3;
  const sec = (isOp541Tab || isOp541tTab || isPolicyTab || isTrendsTab) ? null : SECTIONS[activeTab];
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img src="/rotech-survey-prep/rotech-logo.jpg" alt="Rotech Healthcare" style={{ height: 52, width: "auto", background: "#fff", borderRadius: 6, padding: "4px 10px" }} />
            <div style={{ fontSize: 20, fontWeight: 600 }}>Accreditation Survey Prep Report</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {savedAt && view === "form" && (
              <span style={{ fontSize: 11, opacity: 0.5 }}>
                Auto-saved {new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            {view !== "form" && (
              <button onClick={() => setView("form")} style={{ padding: "7px 14px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, cursor: "pointer" }}>
                ← Back to form
              </button>
            )}
            {view === "form" && (
              <>
                <button onClick={saveProgress} style={{ padding: "7px 14px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, cursor: "pointer" }}>
                  💾 Save Progress
                </button>
                <button onClick={() => setShowVisits(v => !v)} style={{ padding: "7px 14px", fontSize: 13, background: showVisits ? "#fff" : "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: showVisits ? BRAND : "#fff", borderRadius: 6, cursor: "pointer", fontWeight: showVisits ? 600 : 400 }}>
                  📋 Saved Visits {savedVisits.length > 0 && `(${savedVisits.length})`}
                </button>
                <button onClick={startFresh} style={{ padding: "7px 14px", fontSize: 13, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,100,100,0.5)", color: "#ffcdd2", borderRadius: 6, cursor: "pointer" }}>
                  ✕ Clear & Start Over
                </button>
                <button onClick={generateOutputs} disabled={loading} style={{ padding: "7px 14px", fontSize: 13, background: "#fff", color: BRAND, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                  {loading ? "Generating…" : "Generate Email & Report"}
                </button>
              </>
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

      {showPdfReminder && (
        <div style={{ background: "#fff3e0", borderBottom: "2px solid #ffb74d", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: "#7a4a00" }}>
            ⚠️ <strong>Double-check your PDF saved.</strong> A backup snapshot was downloaded to your device and stored in PDF History as a fail-safe — if the print dialog didn't actually save a PDF, reopen it with "Print / PDF" again, or recover the data anytime from PDF History below.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowVisits(true)} style={{ padding: "5px 12px", fontSize: 12, background: "#fff", color: "#7a4a00", border: "1px solid #ffb74d", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>View PDF History</button>
            <button onClick={() => setShowPdfReminder(false)} style={{ padding: "5px 12px", fontSize: 12, background: "transparent", color: "#7a4a00", border: "1px solid #ffb74d", borderRadius: 5, cursor: "pointer" }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Saved Visits Panel */}
      {showVisits && (
        <div style={{ background: "#f8f9fa", borderBottom: "2px solid #e0e0e0", padding: "16px 24px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND, marginBottom: 12 }}>Saved Visits</div>
          {savedVisits.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9e9e9e" }}>No saved visits yet. Use "Save Progress" to save the current visit.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {savedVisits.map(v => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#212121" }}>{v.label}</div>
                    <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 2 }}>Saved {new Date(v.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => loadVisit(v)} style={{ padding: "6px 14px", fontSize: 12, background: BRAND, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>Load</button>
                    <button onClick={() => { if (window.confirm("Delete this saved visit?")) deleteVisit(v.id); }} style={{ padding: "6px 10px", fontSize: 12, background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 5, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PDF History */}
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND, marginTop: 20, marginBottom: 10 }}>📄 PDF History <span style={{ fontSize: 11, fontWeight: 400, color: "#9e9e9e" }}>(last 15 generated)</span></div>
          {pdfHistory.length === 0 ? (
            <div style={{ fontSize: 13, color: "#9e9e9e" }}>No PDFs generated yet. Click "⬇ Download PDF" in the Report view to generate and auto-save a snapshot.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pdfHistory.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #dde5ef", borderRadius: 6, padding: "10px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#212121" }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#9e9e9e", marginTop: 2 }}>
                      Generated {new Date(s.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      {s.specialist ? ` · ${s.specialist}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => {
                      // Load snapshot state
                      const snapStates   = s.states   || {};
                      const snapComments = s.comments  || {};
                      setMeta(s.meta || {});
                      setStates(snapStates);
                      setComments(snapComments);
                      if (s.tabComments)     setTabComments(s.tabComments);
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
                        return { label: sec.label, ref: sec.ref, yes, no, na, pending, total: items.length, issues, observations };
                      });
                      setReportLines(lines);
                      setView("report");
                      setShowVisits(false);
                    }} style={{ padding: "6px 14px", fontSize: 12, background: "#1a3a5c", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}>
                      Regenerate
                    </button>
                    <button onClick={() => { if (window.confirm("Remove this PDF record?")) { deletePdfSnapshot(s.id); setPdfHistory(loadPdfHistory()); }}} style={{ padding: "6px 10px", fontSize: 12, background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 5, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

            {/* Policy Dates tab */}
            <button onClick={() => setActiveTab(SECTIONS.length + 2)} style={{
              padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap", background: "none",
              border: "none", borderBottom: isPolicyTab ? `2px solid ${BRAND}` : "2px solid transparent",
              color: isPolicyTab ? BRAND : "#616161", cursor: "pointer", fontWeight: isPolicyTab ? 600 : 400,
            }}>
              📋 Policy Dates
            </button>

            {/* Trends tab */}
            <button onClick={() => setActiveTab(SECTIONS.length + 3)} style={{
              padding: "10px 16px", fontSize: 12, whiteSpace: "nowrap", background: "none",
              border: "none", borderBottom: isTrendsTab ? `2px solid ${BRAND}` : "2px solid transparent",
              color: isTrendsTab ? BRAND : "#616161", cursor: "pointer", fontWeight: isTrendsTab ? 600 : 400,
            }}>
              📊 Issue Trends
            </button>
          </div>

          {/* Regular section content */}
          {!isOp541Tab && !isOp541tTab && !isPolicyTab && !isTrendsTab && (
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
                          {(() => {
                            const matches = getPolicyMatches(item.text);
                            if (!matches.length) return null;
                            return (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                                {matches.map(key => (
                                  <span key={key} title={`${POLICY_DATES[key].name} — Rev: ${POLICY_DATES[key].rev}`} style={{
                                    fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                    background: "#e8eef4", color: BRAND, border: "1px solid #c5d5e8",
                                    cursor: "default", fontWeight: 600, letterSpacing: "0.02em"
                                  }}>
                                    📋 {key} · Rev {POLICY_DATES[key].rev}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
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

              {/* Tab-level comments for PST, PAP Setup, Vent */}
              {["pst_setup", "pst_maintenance", "clinician", "vent"].includes(sec.id) && (
                <div style={{ marginTop: 12, padding: "14px 16px", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    📝 Visit Notes / Unable to Complete Reason
                  </div>
                  <textarea
                    value={tabComments[sec.id]}
                    onChange={e => setTabComment(sec.id, e.target.value)}
                    placeholder="Note any reason this visit could not be completed (e.g. patient not available, location closed, PST unavailable) or general visit observations…"
                    rows={3}
                    style={{ width: "100%", fontSize: 13, padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 6, resize: "vertical", color: "#212121", background: "#fafafa", boxSizing: "border-box" }}
                  />
                </div>
              )}
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
                      const isVehicleSheet = section.sheetLabel.startsWith("Vehicle") || section.sheetLabel.startsWith("Unit");
                      const vInfo = op541VehicleInfo[section.sheetLabel] || { pstName: "", vehicleNum: "" };
                      const setVInfo = (field, val) => setOp541VehicleInfo(prev => ({
                        ...prev,
                        [section.sheetLabel]: { ...prev[section.sheetLabel], pstName: prev[section.sheetLabel]?.pstName || "", vehicleNum: prev[section.sheetLabel]?.vehicleNum || "", [field]: val }
                      }));
                      return (
                        <div key={si} style={{ marginBottom: 20 }}>
                          {showSheetHeader && (
                            <div style={{ background: BRAND, color: "#fff", padding: "10px 16px", marginBottom: 8, borderRadius: 6, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em", marginTop: si > 0 ? 24 : 0, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                              <span>{section.sheetLabel}</span>
                              {isVehicleSheet && (
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <label style={{ fontSize: 11, opacity: 0.8, whiteSpace: "nowrap" }}>PST Name:</label>
                                    <input
                                      value={vInfo.pstName}
                                      onChange={e => setVInfo("pstName", e.target.value)}
                                      placeholder="Enter name"
                                      style={{ fontSize: 12, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", width: 130 }}
                                    />
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <label style={{ fontSize: 11, opacity: 0.8, whiteSpace: "nowrap" }}>Vehicle #:</label>
                                    <input
                                      value={vInfo.vehicleNum}
                                      onChange={e => setVInfo("vehicleNum", e.target.value)}
                                      placeholder="Enter #"
                                      style={{ fontSize: 12, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", width: 80 }}
                                    />
                                  </div>
                                </div>
                              )}
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
          {/* Policy Dates tab content */}
          {isPolicyTab && (
            <div style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: BRAND, marginBottom: 4 }}>Policy Revision Reference</div>
                <div style={{ fontSize: 12, color: "#757575" }}>
                  Dates are set in <code style={{ background: "#f5f5f5", padding: "1px 5px", borderRadius: 3 }}>POLICY_DATES</code> at the top of <code style={{ background: "#f5f5f5", padding: "1px 5px", borderRadius: 3 }}>App.jsx</code> — update the <code style={{ background: "#f5f5f5", padding: "1px 5px", borderRadius: 3 }}>rev:</code> value for any policy and it will reflect here and on the checklist badges automatically.
                </div>
              </div>

              {/* Search */}
              <PolicyDateSearch />
            </div>
          )}
          {/* Issue Trends tab content */}
          {isTrendsTab && <TrendTracker />}
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

          {/* Screen-only toolbar */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#212121" }}>Survey Prep Report</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={exportFollowUpXLSX} style={{ padding: "7px 14px", fontSize: 13, background: "#1a6e35", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                ⬇ Export Follow-Up XLSX
              </button>
              <button onClick={exportPDF} style={{ padding: "7px 14px", fontSize: 13, background: BRAND, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
                ⬇ Download PDF
              </button>
            </div>
          </div>

          {/* ── HEADER BAND ── */}
          <div style={{ background: BRAND, borderRadius: "6px 6px 0 0", padding: "12px 20px", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: "0.01em" }}>Accreditation Survey Prep Report</div>
          </div>

          {/* ── META TABLE ── */}
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #c5cfe0", borderTop: "none", marginBottom: 0 }}>
            <tbody>
              <tr>
                <td style={{ padding: "7px 14px", fontSize: 13, color: "#424242", borderRight: "1px solid #dde5ef", borderBottom: "1px solid #dde5ef", background: "#f5f8fb", width: "50%" }}>
                  <span style={{ color: "#7a8fa8", fontSize: 11, display: "block", marginBottom: 1 }}>Location / Lawson #</span>
                  <strong style={{ color: "#1a3a5c" }}>{meta.location || "—"}</strong>
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, color: "#424242", borderBottom: "1px solid #dde5ef", background: "#f5f8fb" }}>
                  <span style={{ color: "#7a8fa8", fontSize: 11, display: "block", marginBottom: 1 }}>City / State</span>
                  <strong style={{ color: "#1a3a5c" }}>{meta.city || "—"}</strong>
                </td>
              </tr>
              <tr>
                <td style={{ padding: "7px 14px", fontSize: 13, color: "#424242", borderRight: "1px solid #dde5ef", background: "#f5f8fb" }}>
                  <span style={{ color: "#7a8fa8", fontSize: 11, display: "block", marginBottom: 1 }}>Accreditation Specialist</span>
                  <strong style={{ color: "#1a3a5c" }}>{meta.specialist || "—"}</strong>
                </td>
                <td style={{ padding: "7px 14px", fontSize: 13, color: "#424242", background: "#f5f8fb" }}>
                  <span style={{ color: "#7a8fa8", fontSize: 11, display: "block", marginBottom: 1 }}>Visit Date</span>
                  <strong style={{ color: "#1a3a5c" }}>{meta.date || "—"}</strong>
                </td>
              </tr>
              {(meta.followUpDate || meta.followUpTime) && (
                <tr>
                  <td colSpan={2} style={{ padding: "7px 14px", fontSize: 13, background: "#fffbea", borderTop: "1px solid #dde5ef" }}>
                    <span style={{ color: "#7a5c00", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 1 }}>Follow-Up Teams Call Scheduled</span>
                    <strong style={{ color: "#3d2e00", fontSize: 14 }}>
                      {meta.followUpDate ? new Date(meta.followUpDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "—"}
                      {meta.followUpTime ? ` · ${meta.followUpTime}` : ""}
                    </strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── SUMMARY SCORES ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 0, marginBottom: 20, marginTop: 16 }}>
            {[
              ["Total Compliant", reportLines.reduce((a, s) => a + s.yes, 0), "#2e7d32", "#e8f5e9", "2px solid #2e7d32"],
              ["Total Issues",    reportLines.reduce((a, s) => a + s.no, 0),  "#c62828", "#ffebee", "2px solid #c62828"],
            ].map(([l, n, tc, bg, border]) => (
              <div key={l} style={{ background: bg, borderBottom: border, padding: "10px 12px", textAlign: "center", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: tc }}>{n}</div>
                <div style={{ fontSize: 11, color: tc, marginTop: 1 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* ── SECTION DIVIDER ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `2px solid ${BRAND}`, paddingBottom: 4, marginBottom: 10, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
            Section Detail
          </div>

          {/* ── SECTION CARDS ── */}
          {reportLines.map((s, i) => {
            const hasIssues = s.no > 0 || s.issues.length > 0;
            const hasPending = s.pending > 0;
            const accentColor = hasIssues ? "#c62828" : hasPending ? "#e65100" : "#2e7d32";
            const isCompliant = !hasIssues && !hasPending;
            return (
              <div key={i} style={{ marginBottom: 10, borderRadius: "0 6px 6px 0", border: `1px solid #e0e0e0`, borderLeft: `4px solid ${accentColor}`, pageBreakInside: "avoid", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
                {/* Section header */}
                <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: isCompliant ? "#f6fbf6" : hasIssues ? "#fdf4f4" : "#fffbf2", borderBottom: isCompliant ? "none" : "1px solid #ede0e0" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#212121" }}>{s.label}</div>
                    {(s.pstName || s.vehicleNum) && (
                      <div style={{ display: "flex", gap: 14, marginTop: 2, fontSize: 11, color: "#555" }}>
                        {s.pstName   && <span>PST: <strong>{s.pstName}</strong></span>}
                        {s.vehicleNum && <span>Vehicle #: <strong>{s.vehicleNum}</strong></span>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, whiteSpace: "nowrap" }}>
                    <span style={{ color: "#2e7d32" }}>✓ {s.yes}</span>
                    <span style={{ color: "#c62828" }}>✗ {s.no}</span>
                    {s.na > 0      && <span style={{ color: "#616161" }}>N/A {s.na}</span>}
                    {s.pending > 0 && <span style={{ color: "#e65100" }}>? {s.pending}</span>}
                  </div>
                </div>

                {/* Compliant — collapsed */}
                {isCompliant && (
                  <div style={{ padding: "6px 14px", fontSize: 12, color: "#2e7d32" }}>All items compliant — no corrective action required.</div>
                )}

                {/* Issues */}
                {s.issues.length > 0 && (
                  <div style={{ padding: "10px 14px 6px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#c62828", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Items requiring corrective action</div>
                    {s.issues.map((iss, j) => (
                      <div key={j} style={{ padding: "8px 10px", marginBottom: 5, background: iss.mismatch ? "#fffde7" : "#fff8f8", borderLeft: `3px solid ${iss.mismatch ? "#f0a500" : "#e57373"}`, borderRadius: "0 4px 4px 0", fontSize: 13, pageBreakInside: "avoid" }}>
                        <div style={{ color: "#212121", lineHeight: 1.5 }}>• {iss.text}</div>
                        {iss.mismatch && (
                          <div style={{ fontSize: 11, color: "#e65100", marginTop: 3, fontWeight: 600 }}>⚠ Mismatch — location self-audit marked compliant</div>
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

                {/* Observations */}
                {s.observations && s.observations.length > 0 && (
                  <div style={{ padding: "8px 14px 8px", borderTop: s.issues.length > 0 ? "1px solid #ede8e8" : "none" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Observations</div>
                    {s.observations.map((obs, j) => (
                      <div key={j} style={{ padding: "7px 10px", marginBottom: 4, background: "#f9fff9", borderLeft: "3px solid #81c784", borderRadius: "0 4px 4px 0", fontSize: 13, pageBreakInside: "avoid" }}>
                        <div style={{ color: "#212121", lineHeight: 1.5 }}>• {obs.text}</div>
                        {obs.comment && (
                          <div style={{ fontSize: 12, color: "#2e7d32", marginTop: 4, paddingTop: 4, borderTop: "1px solid #c8e6c9", lineHeight: 1.4 }}>
                            <strong>Note:</strong> {obs.comment}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── ADDITIONAL COMMENTS ── */}
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 6, padding: "12px 14px", marginTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Additional Comments</div>
            <textarea placeholder="Add any additional notes or observations here…" rows={3}
              style={{ width: "100%", fontSize: 13, padding: "8px", border: "1px solid #e0e0e0", borderRadius: 4, resize: "vertical", color: "#212121", boxSizing: "border-box" }} />
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
