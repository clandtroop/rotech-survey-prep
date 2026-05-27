import { useState, useEffect, useCallback } from "react";

const BRAND = "#1a3a5c";

const SECTIONS = [
  {
    id: "morning", label: "Morning Meeting Binder", short: "Morning", ref: "Binder 1 · OP 541 & OP 840",
    items: [
      { text: "Policy 1.1.25 Morning Meetings present" },
      { text: "OP 843 Morning Meeting Checklist current and complete" },
      { text: "OP 543 Morning Meeting Attendance Sheet on file" },
      { text: "OP 519 Targeted Surveillance Log (current log) present" },
      { text: "Separate OP 519 Employee Targeted Surveillance Log saved on LCM computer (confidential)", note: "Must be kept confidential on LCM computer, not in binder" },
    ]
  },
  {
    id: "inservice", label: "In-Service Binder", short: "In-Service", ref: "Binder 2 · OP 541 & OP 840",
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
    id: "site", label: "Site Inspection Binder", short: "Site", ref: "Binder 3 · OP 840",
    items: [
      { text: "Policy 1.1.14 Inspections, Audits & Investigations present" },
      { text: "All applicable licenses on file (pharmacy, health dept, sales tax, business, clinician, etc.)", note: "Board of Pharmacy or Dept of Health, Sales Tax, Business/Professional, County Occupational, Clinicians'" },
      { text: "Certificate of Insurance - Property and Liability" },
      { text: "Policy 2.1.29 Patient Complaints and OP 564 Patient Complaint Report" },
      { text: "Policy 1.1.12 Medicare Supplier Standards" },
      { text: "Policy 6.5.10 Notice of Privacy Practices" },
      { text: "Patient Information Booklet (RHI 1000) with all required sections flagged", note: "Flag: Patient Rights, Delivery/Repair, Complaint Resolution, Financial/Billing, Terms of Agreement" },
      { text: "Phone listing - business section of white pages or print Google page" },
      { text: "OSHA 300 Logs present" },
      { text: "OP 201 Field Management Organizational Chart" },
    ]
  },
  {
    id: "jc", label: "JC / Operations Binder", short: "JC / Ops", ref: "Binder 4 · OP 541 & OP 840",
    items: [
      { text: "Tab 1 - Policy 1.1.22 Performance Improvement Program" },
      { text: "Tab 1 - Location metrics and corrective action plan (as applicable)" },
      { text: "Tab 1 - EMR reviews (20 semi-annually) and corrective actions" },
      { text: "Tab 1 - OP 541 Location Readiness Tool completed January and July" },
      { text: "Tab 1 - JC 427 Personnel Records Review completed January and July" },
      { text: "Tab 1 - Quarterly Patient Perception of Care reports" },
      { text: "Tab 1 - Annual Referral Source Perception of Care report" },
      { text: "Tab 1 - Infection Control Targeted Surveillance Logs (OP 519)" },
      { text: "Tab 1 - Semi-annual Infectious Disease Trending Reports (OP 542)" },
      { text: "Tab 1 - Influenza Vaccination Data Collection (OP 752)" },
      { text: "Tab 1 - Quarterly Don't Bug Me newsletter and OP 520 attendance record" },
      { text: "Tab 1 - OP 201 Organizational Chart and Policy 1.1.2 Scope of Service" },
      { text: "Tab 1 - Key contact person name documented for surveyor tracer selection" },
      { text: "Tab 2 - Emergency Preparedness: Policy 2.2.2, OP 525, OP 857" },
      { text: "Tab 2 - Fire Prevention: Policy 2.4.13, RM 1240" },
      { text: "Tab 2 - FDA 001 Equipment Maintenance Log - smoke alarm checks (weekly)" },
      { text: "Tab 2 - FDA 001 - monthly emergency lighting / exit sign checks (as applicable)" },
      { text: "Tab 3 - Incidents: Policy 2.4.1, OP 518, RM 1202, copies of all incidents" },
      { text: "Tab 4 - Complaints: Policy 2.1.29, OP 522, OP 564, OP 566, copies of all complaints" },
      { text: "Tab 5 - Facility Safety Inspection OP 512 (Jan & July) with fire drill record" },
      { text: "Tab 5 - Policy 2.2.4 and maintenance/calibration docs for all instrumentation", note: "Self-calibrating analyzer FDA 025, O2 analyzer FDA 003, annual calibration records" },
    ]
  },
  {
    id: "sds", label: "SDS / Hazmat Binder", short: "SDS", ref: "Binder 5 · JC 427, OP 541 & OP 840",
    items: [
      { text: "RM 1232 Hazardous Chemical Inventory List" },
      { text: "RM 1233 Site Specific Information Sheet" },
      { text: "RM 1234 Hazard Communication Program Training Record (copy also in employee file)" },
      { text: "RM 1238 PPE Hazard Assessment Form (copy also in employee file)" },
      { text: "SDS on file for every hazardous chemical stored or used at location" },
    ]
  },
  {
    id: "pst", label: "PST Home Visit", short: "PST Visit", ref: "Form JC 426",
    items: [
      { text: "All equipment, supplies, and tanks secured in vehicle" },
      { text: "Testing equipment, gloves, Madawipes, hand gel, non-clear bags and red tags on vehicle" },
      { text: "Complete dosing instructions printed on delivery ticket (liter flow, route, duration)", note: "e.g. 2lpm NC Continuous" },
      { text: "Patient information not visible in vehicle" },
      { text: "Vehicle locked and secured when unattended (windows up, all doors locked)" },
      { text: "Hand gel applied prior to entering patient's home" },
      { text: "Back-up tank assembled to take into home" },
      { text: "No Smoking sign(s) posted at entrance to home", note: "Required if oxygen is in the home" },
      { text: "Correct patient confirmed using two patient identifiers" },
      { text: "Patient instructed on portable/back-up system per order; conserving device cycling verified" },
      { text: "Hand gel used between clean and dirty tasks; gloves changed appropriately" },
      { text: "Concentrator plugged in and minimum run times observed per OP 609" },
      { text: "Portable liquid oxygen or gaseous systems checked" },
      { text: "Back-up tanks verified and patient ability to operate confirmed (AMA on file if refused)", note: "Back-up tanks must have RHI 600 tag" },
      { text: "Cylinder storage safe - not in closets, not freestanding, 15 ft from heat/flame" },
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
    id: "clinician", label: "Clinician Visit", short: "Clinician", ref: "Form JC 423 / JC 424",
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
      { text: "Magnetic PAP mask risk discussed - pacemaker, defibrillator, cochlear implant (6 inch rule)", note: "Applies on setup or mask exchange" },
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
      { text: "Initial Plan of Care (CL 307) fully completed - home safety and fall risk included" },
      { text: "Patient internet access confirmed; Rotech website reviewed; RHI 1080 card provided" },
      { text: "Credentials used when signing (clinician only)" },
      { text: "Hand gel applied at end of visit; table wiped down" },
    ]
  }
];

const STORAGE_KEY = "rotech_survey_draft";

function saveDraft(meta, states, comments) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ meta, states, comments, savedAt: new Date().toISOString() })); } catch {}
}
function loadDraft() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function buildPDFBlob(meta, summaryData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, M = 40, CW = W - M * 2;
  let y = M;
  const rule = () => { doc.setDrawColor(220,220,220); doc.line(M,y,W-M,y); y+=8; };
  const checkPage = (n=60) => { if(y+n>760){doc.addPage();y=M;} };

  doc.setFillColor(26,58,92); doc.rect(0,0,W,80,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(255,255,255);
  doc.text("ROTECH HEALTHCARE",M,22);
  doc.setFontSize(16); doc.text("Accreditation Survey Prep Report",M,46);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.text("Rev 03.24.2026",M,64);
  y=100;

  [["Location",meta.location||"-"],["City / State",meta.city||"-"],["Accreditation Specialist",meta.specialist||"-"],["Visit Date",meta.date]].forEach(([label,val])=>{
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(100,100,100); doc.text(label.toUpperCase(),M,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(30,30,30); doc.text(val,M+160,y); y+=16;
  });
  y+=8; rule();

  const tY=summaryData.reduce((a,s)=>a+s.yes,0), tN=summaryData.reduce((a,s)=>a+s.no,0),
        tNA=summaryData.reduce((a,s)=>a+s.na,0), tP=summaryData.reduce((a,s)=>a+s.pending,0);
  [[tY,"Compliant",[46,125,50],[232,245,233]],[tN,"Issues",[198,40,40],[255,235,238]],[tNA,"N/A",[97,97,97],[245,245,245]],[tP,"Not Reviewed",[230,81,0],[255,243,224]]].forEach(([n,label,tc,bg],i)=>{
    const bw=CW/4-6, x=M+i*(bw+8);
    doc.setFillColor(...bg); doc.roundedRect(x,y,bw,44,4,4,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(...tc); doc.text(String(n),x+bw/2,y+22,{align:"center"});
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.text(label,x+bw/2,y+36,{align:"center"});
  });
  y+=58; rule();

  summaryData.forEach(sec=>{
    checkPage(50);
    const bg=sec.no>0?[255,235,238]:sec.pending>0?[255,248,225]:[232,245,233];
    doc.setFillColor(...bg); doc.rect(M,y-2,CW,18,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(30,30,30); doc.text(sec.label,M+4,y+10);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(80,80,80);
    doc.text("Y:"+sec.yes+"  N:"+sec.no+"  NA:"+sec.na+"  ?:"+sec.pending,W-M-4,y+10,{align:"right"});
    y+=22;
    if(sec.issues.length>0){
      sec.issues.forEach(iss=>{
        checkPage(40);
        doc.setFillColor(255,248,248); doc.rect(M+8,y-2,CW-8,iss.comment?32:18,"F");
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(30,30,30);
        const lines=doc.splitTextToSize("- "+iss.text,CW-20); doc.text(lines,M+12,y+8); y+=lines.length*11;
        if(iss.comment){ doc.setTextColor(180,40,40); const cl=doc.splitTextToSize("  Note: "+iss.comment,CW-20); doc.text(cl,M+12,y+2); y+=cl.length*10+4; }
        y+=4;
      });
    } else {
      doc.setFont("helvetica","italic"); doc.setFontSize(8); doc.setTextColor(46,125,50);
      doc.text("All items compliant.",M+4,y+8); y+=16;
    }
    y+=6;
  });

  checkPage(70); rule();
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(26,58,92); doc.text("Additional Comments",M,y); y+=14;
  doc.setDrawColor(200,200,200); doc.rect(M,y,CW,54); y+=70;

  checkPage(70); rule();
  const sigW=CW/2-16;
  ["Accreditation Specialist","Location Manager"].forEach((role,i)=>{
    const x=M+i*(sigW+32);
    doc.setDrawColor(30,30,30); doc.line(x,y+30,x+sigW,y+30);
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(100,100,100);
    doc.text(role,x,y+42); doc.text("Date: _______________",x,y+56);
  });

  return doc.output("blob");
}

function initStates() {
  const s={},c={};
  SECTIONS.forEach((sec,si)=>sec.items.forEach((_,ii)=>{s[`${si}-${ii}`]=null;c[`${si}-${ii}`]="";}));
  return {states:s,comments:c};
}

export default function App() {
  const draft = loadDraft();
  const blank = initStates();

  const [meta,       setMeta]      = useState(draft?.meta     ?? {location:"",city:"",managerEmail:"",specialist:"",date:new Date().toLocaleDateString("en-US")});
  const [states,     setStates]    = useState(draft?.states   ?? blank.states);
  const [comments,   setComments]  = useState(draft?.comments ?? blank.comments);
  const [activeTab,  setActiveTab] = useState(0);
  const [view,       setView]      = useState("form");
  const [emailText,  setEmailText] = useState("");
  const [summary,    setSummary]   = useState([]);
  const [generating, setGenerating]= useState(false);
  const [copied,     setCopied]    = useState(false);
  const [hasDraft,   setHasDraft]  = useState(!!draft);
  const [savedAt,    setSavedAt]   = useState(draft?.savedAt ?? null);

  useEffect(()=>{
    saveDraft(meta,states,comments);
    setSavedAt(new Date().toISOString());
  },[meta,states,comments]);

  const setState = useCallback((key,val)=>{
    setStates(p=>({...p,[key]:p[key]===val?null:val}));
  },[]);
  const setComment = useCallback((key,val)=>{
    setComments(p=>({...p,[key]:val}));
  },[]);

  function getStats(si){
    let yes=0,no=0,na=0,pending=0;
    SECTIONS[si].items.forEach((_,ii)=>{
      const s=states[`${si}-${ii}`];
      if(s==="yes")yes++;else if(s==="no")no++;else if(s==="na")na++;else pending++;
    });
    return{yes,no,na,pending,total:SECTIONS[si].items.length};
  }

  function buildSummary(){
    return SECTIONS.map((sec,si)=>{
      const stats=getStats(si);
      const issues=sec.items.flatMap((item,ii)=>{
        const key=`${si}-${ii}`;
        return states[key]==="no"?[{text:item.text,comment:comments[key]}]:[];
      });
      return{label:sec.label,ref:sec.ref,...stats,issues};
    });
  }

  async function handleReview(){
    setGenerating(true);
    const sd=buildSummary();
    setSummary(sd);
    const issues=sd.flatMap(s=>s.issues.map(i=>`- [${s.label}] ${i.text}${i.comment?` - ${i.comment}`:""}`));
    const issueBlock=issues.length===0?"No issues - all areas compliant.":issues.join("\n");
    const prompt=`You are an accreditation compliance specialist at a home medical equipment company. Generate a professional follow-up email to the location manager.

Location: ${meta.location||"[Location]"}, ${meta.city||"[City, ST]"}
Date: ${meta.date}
Specialist: ${meta.specialist||"[Specialist]"}
Compliant: ${sd.reduce((a,s)=>a+s.yes,0)} | Issues: ${sd.reduce((a,s)=>a+s.no,0)} | N/A: ${sd.reduce((a,s)=>a+s.na,0)} | Pending: ${sd.reduce((a,s)=>a+s.pending,0)}

Issues:
${issueBlock}

Write a professional direct email. List issues with a 5-business-day corrective action deadline. Mention a follow-up Teams call with LCM and Area/Region Manager will be scheduled. Use plain dashes not bullets. If no issues, write a brief congratulatory message. Sign as ${meta.specialist||"[Specialist]"}, Accreditation Specialist.`;

    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      setEmailText(data.content?.find(b=>b.type==="text")?.text||fallback(meta,issueBlock));
    }catch{setEmailText(fallback(meta,issueBlock));}
    setGenerating(false);
    setView("review");
  }

  function fallback(m,issueBlock){
    const noIssues=issueBlock==="No issues - all areas compliant.";
    return `Subject: Accreditation Survey Prep Follow-Up - ${m.location||"[Location]"}, ${m.city||""} - ${m.date}\n\nHello,\n\nThank you for your time during the accreditation survey prep visit on ${m.date} for ${m.location||"[Location]"}, ${m.city||""}.\n\n${noIssues?"All reviewed areas were found to be in compliance. No corrective action is required at this time. Great work keeping your location survey-ready!":`The following items require corrective action within 5 business days:\n\n${issueBlock}\n\nPlease address each item and report back. A follow-up Teams call with the LCM and Area/Region Manager will be scheduled.`}\n\nBest regards,\n${m.specialist||"[Specialist]"}\nAccreditation Specialist`;
  }

  function downloadPDF(){
    const blob=buildPDFBlob(meta,summary);
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`SurveyPrep_${(meta.location||"Location").replace(/\s+/g,"_")}_${meta.date.replace(/\//g,"-")}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  function copyEmail(){
    navigator.clipboard.writeText(emailText).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});
  }

  function startFresh(){
    clearDraft();
    const b=initStates();
    setMeta({location:"",city:"",managerEmail:"",specialist:meta.specialist,date:new Date().toLocaleDateString("en-US")});
    setStates(b.states); setComments(b.comments);
    setActiveTab(0); setView("form"); setSummary([]); setEmailText(""); setHasDraft(false);
  }

  const allStats=SECTIONS.reduce((a,_,si)=>{const s=getStats(si);return{yes:a.yes+s.yes,no:a.no+s.no,pending:a.pending+s.pending};},{yes:0,no:0,pending:0});
  const totalItems=SECTIONS.reduce((a,s)=>a+s.items.length,0);
  const pct=Math.round(((totalItems-allStats.pending)/totalItems)*100);
  const sec=SECTIONS[activeTab];
  const fmtSaved=savedAt?new Date(savedAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):null;

  return (
    <div style={{maxWidth:960,margin:"0 auto",minHeight:"100vh",background:"#f8f9fa"}}>

      {/* Header */}
      <div style={{background:BRAND,color:"#fff"}} className="px-3 py-3">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <div style={{fontSize:11,opacity:0.6,textTransform:"uppercase",letterSpacing:"0.1em"}}>Rotech Healthcare · Accreditation</div>
            <div style={{fontSize:18,fontWeight:600,marginTop:2}}>Survey Prep Checklist</div>
          </div>
          <div className="d-flex gap-2 align-items-center">
            {fmtSaved && view==="form" && <span style={{fontSize:11,opacity:0.5}}>Draft saved {fmtSaved}</span>}
            {view==="review" && <button onClick={()=>setView("form")} className="btn btn-sm btn-outline-light">Back to form</button>}
            {view==="form" && <button onClick={handleReview} disabled={generating} className="btn btn-sm btn-light fw-semibold" style={{color:BRAND,opacity:generating?0.7:1}}>{generating?"Generating...":"Review & Generate"}</button>}
          </div>
        </div>
        {(view==="form"||view==="review")&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginTop:12}}>
            {[["location","Location"],["city","City / State"],["managerEmail","Manager Email"],["specialist","Specialist"],["date","Visit Date"]].map(([k,label])=>(
              <div key={k}>
                <div style={{fontSize:9,opacity:0.55,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{label}</div>
                <input value={meta[k]} onChange={e=>setMeta(p=>({...p,[k]:e.target.value}))} placeholder={label}
                  className="form-control form-control-sm"
                  style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff"}} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Draft banner */}
      {hasDraft && view==="form" && (
        <div className="alert alert-warning mb-0 py-2 px-3 d-flex justify-content-between align-items-center" style={{borderRadius:0}}>
          <span style={{fontSize:13}}>Draft restored from your last session.</span>
          <button onClick={startFresh} className="btn btn-sm btn-outline-warning" style={{fontSize:12}}>Clear and start fresh</button>
        </div>
      )}

      {/* FORM VIEW */}
      {view==="form"&&(
        <>
          <div className="progress" style={{height:4,borderRadius:0}}>
            <div className={`progress-bar ${allStats.no>0?"bg-danger":"bg-success"}`} style={{width:`${pct}%`,transition:"width 0.3s"}} />
          </div>

          <div className="d-flex flex-wrap gap-4 align-items-center px-3 py-2 bg-white border-bottom">
            {[["Y",allStats.yes,"#2e7d32","Compliant"],["N",allStats.no,"#c62828","Issues"],["?",allStats.pending,"#9e9e9e","Pending"]].map(([sym,n,c,label])=>(
              <div key={label} className="d-flex align-items-center gap-1" style={{fontSize:13}}>
                <span style={{color:c,fontWeight:700}}>{sym} {n}</span>
                <span className="text-muted">{label}</span>
              </div>
            ))}
            <div className="ms-auto text-muted" style={{fontSize:12}}>{pct}% reviewed ({totalItems-allStats.pending}/{totalItems})</div>
          </div>

          <div className="bg-white border-bottom d-flex" style={{overflowX:"auto"}}>
            {SECTIONS.map((s,i)=>{
              const st=getStats(i);
              return(
                <button key={i} onClick={()=>setActiveTab(i)}
                  className="d-flex align-items-center gap-1 border-0 bg-transparent"
                  style={{fontSize:12,whiteSpace:"nowrap",padding:"10px 14px",color:i===activeTab?BRAND:"#616161",fontWeight:i===activeTab?600:400,borderBottom:i===activeTab?`2px solid ${BRAND}`:"2px solid transparent",cursor:"pointer"}}>
                  {s.short}
                  {st.no>0&&<span className="badge bg-danger rounded-pill" style={{fontSize:9}}>{st.no}</span>}
                  {st.no===0&&st.pending===0&&<span className="badge bg-success rounded-pill" style={{fontSize:9}}>✓</span>}
                </button>
              );
            })}
          </div>

          <div className="p-3">
            <div className="text-muted mb-2" style={{fontSize:11}}>{sec.ref}</div>
            <div className="d-flex gap-2 mb-3 flex-wrap">
              {[["yes","Mark all compliant","#198754"],["no","Mark all issues","#dc3545"],["na","Mark all N/A","#6c757d"]].map(([v,l,c])=>(
                <button key={v} onClick={()=>sec.items.forEach((_,ii)=>setState(`${activeTab}-${ii}`,v))}
                  className="btn btn-sm" style={{fontSize:11,borderColor:c,color:c,border:`1px solid ${c}`,background:"#fff"}}>{l}</button>
              ))}
            </div>

            <div className="d-flex flex-column gap-2">
              {sec.items.map((item,ii)=>{
                const key=`${activeTab}-${ii}`, state=states[key];
                return(
                  <div key={ii} className="card shadow-sm"
                    style={{border:`1px solid ${state==="no"?"#f5c6cb":state==="yes"?"#c3e6cb":"#e0e0e0"}`,background:state==="no"?"#fff8f8":state==="yes"?"#f9fff9":"#fff"}}>
                    <div className="card-body py-2 px-3 d-flex gap-3 align-items-start">
                      <div className="flex-grow-1">
                        <div style={{fontSize:13,lineHeight:1.5,color:"#212121"}}>{item.text}</div>
                        {item.note&&<div className="text-muted mt-1" style={{fontSize:11}}>{item.note}</div>}
                        {state==="no"&&<textarea placeholder="Describe the issue..." value={comments[key]} onChange={e=>setComment(key,e.target.value)} rows={2}
                          className="form-control form-control-sm mt-2" style={{fontSize:12}} />}
                      </div>
                      <div className="d-flex gap-1 flex-shrink-0 mt-1">
                        {["yes","no","na"].map(v=>{
                          const sel=state===v;
                          const clr=v==="yes"?{bg:"#198754",border:"#198754"}:v==="no"?{bg:"#dc3545",border:"#dc3545"}:{bg:"#6c757d",border:"#6c757d"};
                          const lbl=v==="yes"?"Y":v==="no"?"N":"N/A";
                          return(
                            <button key={v} onClick={()=>setState(key,v)}
                              style={{width:v==="na"?40:32,height:30,fontSize:10,fontWeight:600,padding:0,cursor:"pointer",borderRadius:4,background:sel?clr.bg:"#fff",color:sel?"#fff":clr.bg,border:`1px solid ${clr.border}`}}>
                              {lbl}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* REVIEW VIEW */}
      {view==="review"&&(
        <div style={{padding:16}}>

          {/* Action buttons */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:17,fontWeight:700,color:BRAND}}>Accreditation Survey Prep Report</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={downloadPDF} style={{padding:"7px 16px",fontSize:13,background:BRAND,color:"#fff",border:"none",borderRadius:5,cursor:"pointer",fontWeight:600}}>Download PDF Report</button>
              <button onClick={startFresh} style={{padding:"7px 16px",fontSize:13,background:"#fff",color:"#198754",border:"1px solid #198754",borderRadius:5,cursor:"pointer",fontWeight:600}}>Mark Complete and Clear</button>
            </div>
          </div>

          {/* Visit info bar */}
          <div style={{background:"#f0f4f8",border:"1px solid #d0dae6",borderRadius:6,padding:"10px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8}}>
            {[["Location",meta.location||"—"],["City / State",meta.city||"—"],["Specialist",meta.specialist||"—"],["Visit Date",meta.date]].map(([label,val])=>(
              <div key={label}>
                <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"0.08em",color:"#6c757d",marginBottom:2}}>{label}</div>
                <div style={{fontSize:13,fontWeight:600,color:"#212121"}}>{val}</div>
              </div>
            ))}
          </div>

          {/* Summary stat boxes */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
            {[
              ["Compliant",summary.reduce((a,s)=>a+s.yes,0),"text-bg-success"],
              ["Issues",   summary.reduce((a,s)=>a+s.no,0), "text-bg-danger"],
              ["N/A",      summary.reduce((a,s)=>a+s.na,0), "text-bg-secondary"],
              ["Pending",  summary.reduce((a,s)=>a+s.pending,0),"text-bg-primary"]
            ].map(([l,n,variant])=>(
              <div key={l} style={{textAlign:"center",padding:"8px 4px"}}>
                <div><span className={`badge ${variant}`} style={{fontSize:22,padding:"8px 14px"}}>{n}</span></div>
                <div style={{fontSize:12,marginTop:6,color:"#616161",fontWeight:600}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Section summaries */}
          {summary.map((s,i)=>{
            const hdrBg=s.no>0?"#ffebee":s.pending>0?"#fff8e1":"#e8f5e9";
            const borderClr=s.no>0?"#ef9a9a":s.pending>0?"#ffe082":"#a5d6a7";
            return(
              <div key={i} style={{border:`1px solid ${borderClr}`,borderRadius:6,marginBottom:8,overflow:"hidden"}}>
                <div style={{background:hdrBg,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#212121"}}>{s.label}</span>
                  <span style={{fontSize:11,color:"#616161"}}>
                    <span style={{color:"#2e7d32",fontWeight:600}}>Y:{s.yes}</span>{"  "}
                    <span style={{color:"#c62828",fontWeight:600}}>N:{s.no}</span>{"  "}
                    <span style={{color:"#616161"}}>NA:{s.na}</span>{"  "}
                    <span style={{color:"#e65100"}}>?:{s.pending}</span>
                  </span>
                </div>
                {s.issues.length>0?(
                  <div style={{padding:"8px 14px"}}>
                    {s.issues.map((iss,j)=>(
                      <div key={j} style={{fontSize:12,padding:"6px 10px",marginBottom:4,background:"#fff8f8",border:"1px solid #ef9a9a",borderRadius:4}}>
                        <div style={{color:"#212121"}}>— {iss.text}</div>
                        {iss.comment&&<div style={{color:"#c62828",marginTop:3,fontWeight:600}}>Note: {iss.comment}</div>}
                      </div>
                    ))}
                  </div>
                ):(
                  <div style={{padding:"6px 14px",fontSize:12,color:"#2e7d32",fontStyle:"italic"}}>All items compliant — no corrective action required.</div>
                )}
              </div>
            );
          })}

          {/* Email card */}
          <div style={{border:"1px solid #dee2e6",borderRadius:6,overflow:"hidden",marginTop:16}}>
            <div style={{background:"#f8f9fa",borderBottom:"1px solid #dee2e6",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:14,fontWeight:600,color:"#212121"}}>
                Follow-up email draft
                {meta.managerEmail&&<span style={{fontSize:11,fontWeight:400,color:"#9e9e9e",marginLeft:8}}>To: {meta.managerEmail}</span>}
              </div>
              <button onClick={copyEmail} style={{padding:"4px 14px",fontSize:12,background:copied?"#198754":"#fff",color:copied?"#fff":"#424242",border:"1px solid #dee2e6",borderRadius:4,cursor:"pointer",fontWeight:copied?600:400}}>
                {copied?"Copied!":"Copy to clipboard"}
              </button>
            </div>
            <textarea value={emailText} onChange={e=>setEmailText(e.target.value)} rows={14}
              style={{width:"100%",fontSize:12,lineHeight:1.7,padding:"12px 16px",border:"none",resize:"vertical",color:"#212121",background:"#fff",boxSizing:"border-box",outline:"none"}} />
            <div style={{background:"#f8f9fa",borderTop:"1px solid #dee2e6",padding:"8px 16px",fontSize:11,color:"#9e9e9e"}}>
              Edit above if needed, then copy and paste into Outlook. The PDF report downloads separately via the button above.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
