import { useState, useCallback } from "react";

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
    id: "clinician", label: "Clinician Visit", ref: "Form JC 423 / JC 424",
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
  const [view, setView] = useState("form"); // form | email | report
  const [emailText, setEmailText] = useState("");
  const [reportLines, setReportLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

  function getAllIssues() {
    return SECTIONS.flatMap((sec, si) =>
      sec.items.flatMap((item, ii) => {
        const key = `${si}-${ii}`;
        if (states[key] === "no") return [{ section: sec.label, text: item.text, comment: comments[key] }];
        return [];
      })
    );
  }

  function buildSummaryData() {
    return SECTIONS.map((sec, si) => {
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
  }

  async function generateOutputs() {
    setLoading(true);
    const issues = getAllIssues();
    const summaryData = buildSummaryData();
    const loc = meta.location || "[Location]";
    const city = meta.city || "[City, ST]";
    const spec = meta.specialist || "[Specialist]";
    const date = meta.date || new Date().toLocaleDateString("en-US");

    const totalYes = summaryData.reduce((a, s) => a + s.yes, 0);
    const totalNo = summaryData.reduce((a, s) => a + s.no, 0);
    const totalNa = summaryData.reduce((a, s) => a + s.na, 0);
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

Write a professional but direct email. If there are issues, list them clearly with requested corrective actions and a deadline of 5 business days to report back. Mention a follow-up teams call with LCM and Area/Region Manager will be scheduled. If no issues, write a brief congratulatory message. Do not use bullet symbols - use plain dashes. Sign off as ${spec}, Accreditation Specialist.`;

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
      setEmailText(`Subject: Accreditation Survey Prep Follow-Up — ${loc}, ${city} — ${date}\n\nHello,\n\nThank you for your time during the accreditation survey prep visit on ${date} for ${loc}, ${city}.\n\n${issues.length === 0 ? "All reviewed areas were found to be in compliance. No corrective action is required at this time." : `The following items require corrective action within 5 business days:\n\n${issueBlock}\n\nPlease address each item and report back with your findings. A follow-up Teams call with the LCM and Area/Region Manager will be scheduled.`}\n\nBest regards,\n${spec}\nAccreditation Specialist`);
    }

    setReportLines(summaryData);
    setLoading(false);
    setView("email");
  }

  function copyText(txt) {
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const sec = SECTIONS[activeTab];
  const stats = getSectionStats(activeTab);
  const allStats = SECTIONS.reduce((a, _, si) => {
    const s = getSectionStats(si);
    return { yes: a.yes + s.yes, no: a.no + s.no, pending: a.pending + s.pending };
  }, { yes: 0, no: 0, pending: 0 });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", background: "#fff", minHeight: "100vh" }}>
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
              <button onClick={() => { generateOutputs(); }} disabled={loading} style={{ padding: "7px 14px", fontSize: 13, background: "#fff", color: BRAND, border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
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
              <input
                value={meta[k]}
                onChange={e => setMeta(p => ({ ...p, [k]: e.target.value }))}
                placeholder={label}
                style={{ width: "100%", padding: "7px 11px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 5, color: "#fff", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          ))}
          {/* Follow-up call: date + time side by side */}
          <div style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: 10, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Follow-Up Teams Call Scheduled</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="date"
                value={meta.followUpDate}
                onChange={e => setMeta(p => ({ ...p, followUpDate: e.target.value }))}
                style={{ flex: 1, padding: "7px 11px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 5, color: "#fff", outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
              />
              <input
                type="time"
                value={meta.followUpTime}
                onChange={e => setMeta(p => ({ ...p, followUpTime: e.target.value }))}
                style={{ flex: 1, padding: "7px 11px", fontSize: 13, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 5, color: "#fff", outline: "none", boxSizing: "border-box", colorScheme: "dark" }}
              />
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
          </div>

          {/* Section content */}
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
                  display: "flex", gap: 12, padding: "10px 12px", marginBottom: 6,
                  borderRadius: 6, border: `1px solid ${state === "no" ? "#ef9a9a" : state === "yes" ? "#a5d6a7" : "#e0e0e0"}`,
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
                        value={comments[key]}
                        onChange={e => setComment(key, e.target.value)}
                        rows={3}
                        style={{
                          marginTop: 8, width: "50%", fontSize: 12, padding: "7px 9px",
                          border: `1px solid ${state === "no" ? "#ef9a9a" : "#a5d6a7"}`,
                          borderRadius: 5, resize: "vertical", color: "#212121", background: "#fff",
                          boxSizing: "border-box", display: "block"
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* EMAIL VIEW */}
      {view === "email" && (
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#212121" }}>Manager Follow-Up Email</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => copyText(emailText)} style={{ padding: "7px 14px", fontSize: 13, background: copied ? "#e8f5e9" : "#fff", border: "1px solid #e0e0e0", borderRadius: 6, cursor: "pointer", color: copied ? "#2e7d32" : "#424242" }}>
                {copied ? "✓ Copied" : "Copy email"}
              </button>
            </div>
          </div>
          <textarea
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            style={{ width: "100%", minHeight: 420, fontSize: 13, lineHeight: 1.7, padding: "14px", border: "1px solid #e0e0e0", borderRadius: 8, resize: "vertical", color: "#212121", boxSizing: "border-box" }}
          />
          <div style={{ marginTop: 12, fontSize: 12, color: "#9e9e9e" }}>You can edit this email before copying. Click "View Report →" for the full PDF-style report.</div>
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

          {/* Report header box */}
          <div style={{ border: `2px solid ${BRAND}`, borderRadius: 8, padding: "16px 20px", marginBottom: 20, background: "#f0f4f8" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: BRAND, marginBottom: 10 }}>Accreditation Survey Prep Report</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 13, color: "#424242" }}>
              <div><strong>Location / Lawson #:</strong> {meta.location || "—"}</div>
              <div><strong>City / State:</strong> {meta.city || "—"}</div>
              <div><strong>Accreditation Specialist:</strong> {meta.specialist || "—"}</div>
              <div><strong>Visit Date:</strong> {meta.date}</div>
            </div>
          </div>

          {/* Follow-up call banner */}
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

          {/* Overall summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
            {[
              ["Total Compliant", reportLines.reduce((a, s) => a + s.yes, 0), "#2e7d32", "#e8f5e9"],
              ["Total Issues", reportLines.reduce((a, s) => a + s.no, 0), "#c62828", "#ffebee"],
              ["Total N/A", reportLines.reduce((a, s) => a + s.na, 0), "#616161", "#f5f5f5"],
              ["Not Reviewed", reportLines.reduce((a, s) => a + s.pending, 0), "#e65100", "#fff3e0"],
            ].map(([l, n, tc, bg]) => (
              <div key={l} style={{ background: bg, border: `1px solid ${tc}30`, borderRadius: 8, padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: tc }}>{n}</div>
                <div style={{ fontSize: 12, color: tc, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Section-by-section */}
          {reportLines.map((sec, i) => (
            <div key={i} style={{ marginBottom: 16, border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: sec.no > 0 ? "#ffebee" : sec.pending > 0 ? "#fff8e1" : "#e8f5e9", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#212121" }}>{sec.label}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                  <span style={{ color: "#2e7d32" }}>✓ {sec.yes}</span>
                  <span style={{ color: "#c62828" }}>✗ {sec.no}</span>
                  {sec.na > 0 && <span style={{ color: "#616161" }}>N/A {sec.na}</span>}
                  {sec.pending > 0 && <span style={{ color: "#e65100" }}>? {sec.pending}</span>}
                </div>
              </div>
              {sec.issues.length > 0 && (
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#c62828", marginBottom: 8 }}>ITEMS REQUIRING CORRECTIVE ACTION:</div>
                  {sec.issues.map((iss, j) => (
                    <div key={j} style={{ padding: "10px 12px", marginBottom: 6, background: "#fff8f8", border: "1px solid #ef9a9a", borderRadius: 5, fontSize: 13 }}>
                      <div style={{ color: "#212121", lineHeight: 1.5 }}>• {iss.text}</div>
                      {iss.comment && (
                        <div style={{ fontSize: 12, color: "#c62828", marginTop: 6, paddingTop: 6, borderTop: "1px solid #f5c6c6", lineHeight: 1.4 }}>
                          <strong>Note:</strong> {iss.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {sec.observations && sec.observations.length > 0 && (
                <div style={{ padding: "10px 16px", borderTop: sec.issues.length > 0 ? "1px solid #e0e0e0" : "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2e7d32", marginBottom: 6 }}>OBSERVATIONS:</div>
                  {sec.observations.map((obs, j) => (
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
              {sec.issues.length === 0 && sec.no === 0 && (
                <div style={{ padding: "8px 16px", fontSize: 13, color: "#2e7d32" }}>All items compliant — no corrective action required.</div>
              )}
            </div>
          ))}

          {/* Additional comments area */}
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
