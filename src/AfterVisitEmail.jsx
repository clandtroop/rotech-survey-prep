import { useState } from "react";
import { T, cardStyle, Icon, metaLabel, metaField, btnPrimary, btnOutline } from "./theme";
import {
  clean, esc, paragraphsHtml, infoGridHtml, signatureHtml, EmailOutputCard,
  findingText, TextBlock, FindingRow, CustomRow, AddCustomButton, PickerCategory, AddCategoryRow,
  linkBtn, smallBtn, checkbox,
} from "./emailKit";

// ─── AFTER VISIT EMAIL ───────────────────────────────────────────────────────
// The email the location manager receives right after the on-site visit: a
// short greeting, what is attached, the handful of findings the specialist
// wants treated as top priorities, and the Follow-Up Teams call date.
//
// Its input is the visit that is open in the app. Every "Issue" finding is
// offered in a picker, grouped by area, and NOTHING starts ticked: the full
// list already travels in the attached reports, so the email carries only what
// the specialist deliberately chooses to call out. Each ticked finding starts
// from its checklist wording plus the visit comment and can be rewritten —
// checklist text reads as a requirement ("…current and complete"), and the
// email wants a finding.
//
// Unlike the Follow-Up Call email, this one saves its draft: the picks, rewritten
// wording, custom items and paragraph edits live on the visit document
// (visit.afterVisitEmail) so they survive leaving the screen, reopening the
// visit, or picking it up on another device. Like the other emails it is never
// sent by the application — it goes to Outlook by copy and paste.
//
// Above the priorities the email repeats the Survey Prep Report's Total
// Compliant / Total Issues tiles and its Follow-Up Checklist reminder; below
// them it carries the checklist link, and the screen nags until that link has
// been generated for the visit (it lives in followUpChecklists/<visitId>).
//
// Grouping: checklist binders collapse into one "Binders" category shown last,
// as a single paragraph pointing at the binder guide/report by default (the
// template's convention) or as individual items. OP 541 / 541T findings group
// under their section header (OVERALL FACILITY, WAREHOUSE SPACE, …), vehicle
// sheets by unit, patient-visit forms by form, and personnel by file type.
// The finding list itself is built in App.jsx (buildAfterVisitFindings), next
// to the checklist data it reads.
// ─────────────────────────────────────────────────────────────────────────────

export const BINDERS = "Binders";

// The Survey Prep Report carries the findings; the two guides are references
// for organising the binders and the warehouse.
const ATTACHMENTS = [
  { key: "reports",        label: "Survey Prep Report" },
  { key: "binderGuide",    label: "OP 840 Location Binder Guide" },
  { key: "warehouseGuide", label: "Warehouse Organization Guide" },
];
const DEFAULT_ATTACH = { reports: true, binderGuide: true, warehouseGuide: true };

// The stored draft is whatever the visit document carried — possibly nothing,
// possibly written by an older build — so every read goes through here.
function normalizeDraft(raw) {
  const x = raw && typeof raw === "object" ? raw : {};
  const obj = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  return {
    picked: obj(x.picked),
    edits: obj(x.edits),
    custom: Array.isArray(x.custom) ? x.custom : [],
    customCategories: Array.isArray(x.customCategories) ? x.customCategories : [],
    binderMode: x.binderMode === "list" ? "list" : "paragraph",
    binderParagraph: !!x.binderParagraph,
    // Only the current attachment keys: a draft from the first release also
    // carries "binderReport", which no longer exists.
    attach: Object.fromEntries(Object.keys(DEFAULT_ATTACH).map(k =>
      [k, typeof obj(x.attach)[k] === "boolean" ? x.attach[k] : DEFAULT_ATTACH[k]])),
    text: obj(x.text),
  };
}

const itemText = (f, d) => (Object.prototype.hasOwnProperty.call(d.edits, f.id) ? d.edits[f.id] : findingText(f));

// "the Glen Burnie team" rather than "the Rotech team": most locations share a
// trading name, so the city is what tells them apart (the same reason Issue
// Trends identifies sites by City, ST).
function teamName(meta) {
  return clean(meta.city).split(",")[0].trim() || clean(meta.location);
}

function defaultTexts(meta, attach, followUpDisplay) {
  const team = teamName(meta);
  // Each attachment sentence reads naturally whichever others are ticked —
  // no "also" on the first one, and no two "I have also attached" in a row.
  const warehouseLead = attach.binderGuide
    ? "The Warehouse Organization Guide is attached as well."
    : `I have ${attach.reports ? "also " : ""}attached the Warehouse Organization Guide.`;
  const binderRefs = attach.reports && attach.binderGuide
    ? "Please refer to the attached Survey Prep Report for specific findings and corrections needed, and use the OP 840 Location Binder Guide as a reference when organizing your binders."
    : attach.reports
      ? "Please refer to the attached Survey Prep Report for specific findings and corrections needed."
      : attach.binderGuide
        ? "Please use the attached OP 840 Location Binder Guide as a reference when organizing your binders."
        : "Please review each binder against OP 840 and correct the missing items prior to our Follow-Up Call.";
  return {
    salutation: "Hello,",
    greeting: `It was great meeting you and the ${team ? `${team} ` : ""}team — I appreciate everyone's receptiveness during our visit.`,
    reports: "Attached you will find the Survey Prep Report completed during our visit. Please ensure that it is thoroughly reviewed and that corrective action is taken on every area of non-compliance prior to our Follow-Up Call.",
    binderGuide: `I have ${attach.reports ? "also " : ""}attached the OP 840 Location Binder Guide for reference as you organize your binders.`,
    warehouseGuide: `${warehouseLead} Please review this with your team and ensure you are utilizing your space efficiently while remaining compliant with the standards outlined.`,
    priorityIntro: "The following items require your immediate attention and should be treated as top priorities:",
    binders: `Each binder reviewed has missing items. ${binderRefs}`,
    checklistNote: "Use this checklist to mark items off as you correct them before our Follow-Up Call.",
    encouragement: "I know this is a lot to work through, and I have full confidence in your team's ability to get these items corrected. Addressing these findings proactively is what separates a well-prepared location from one that is caught off guard — and you have the opportunity to be in a great position before your survey.",
    followup: followUpDisplay || "",
    followupNote: "A calendar invite has already been sent. Please have Teams available on your phone, as I will want to do a walkthrough of the location, warehouse, and vehicle, as well as review any updated documentation at that time.",
    closing: "Please don't hesitate to reach out with any questions as you work through these items. I'm happy to support you along the way.",
  };
}

// Findings in their arrival order, then the specialist's own categories, with
// Binders always last — that is where the template puts it.
function groupCategories(findings, d) {
  const order = [];
  const byName = {};
  const ensure = name => {
    if (!byName[name]) { byName[name] = { name, findings: [], custom: [] }; order.push(name); }
    return byName[name];
  };
  findings.forEach(f => ensure(f.category).findings.push(f));
  d.customCategories.forEach(ensure);
  d.custom.forEach(c => ensure(c.category).custom.push(c));
  const names = order.filter(n => n !== BINDERS);
  if (byName[BINDERS]) names.push(BINDERS);
  return names.map(n => byName[n]);
}

function buildBlocks(categories, d, txt) {
  const blocks = [];
  for (const cat of categories) {
    if (cat.name === BINDERS && d.binderMode === "paragraph") {
      if (d.binderParagraph && clean(txt("binders"))) blocks.push({ name: BINDERS, type: "prose", text: txt("binders") });
      continue;
    }
    const items = [
      ...cat.findings.filter(f => d.picked[f.id]).map(f => itemText(f, d)),
      ...cat.custom.map(c => c.text),
    ].filter(t => clean(t));
    if (items.length) blocks.push({ name: cat.name, type: "list", items });
  }
  return blocks;
}

// ─── the email ───────────────────────────────────────────────────────────────
// The After Visit Email template, with every style inlined so it survives the
// paste into Outlook. Section order and colours follow the template exactly.

function buildEmailHtml({ meta, blocks, txt, attach, signature, totals, checklistUrl }) {
  const P = html => `<p style="font-size:14.5px;color:#24303d;margin:0 0 16px;">${html}</p>`;
  const paras = text => paragraphsHtml(text).map(P).join("");
  const lawson = clean(meta.lawson);

  const infoGrid = infoGridHtml([
    [`Location${lawson && lawson !== "other" ? ` (Lawson # ${lawson})` : ""}`, meta.location],
    ["City / State", meta.city],
    ["Accreditation Specialist", meta.specialist],
    ["Visit Date", meta.date],
  ]);

  const intro = [
    txt("salutation"), txt("greeting"),
    attach.reports && txt("reports"), attach.binderGuide && txt("binderGuide"), attach.warehouseGuide && txt("warehouseGuide"),
  ].filter(Boolean).map(paras).join("");

  // The Survey Prep Report's own summary tiles and reminder, repeated so the
  // email opens on the same numbers the attached report does. Left out when
  // nothing on the visit has been answered yet.
  const totalsHtml = totals && (totals.compliant || totals.issues) ? `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;">
    <tr>
      <td width="50%" align="center" valign="top" style="background:#e7f4ec;border-bottom:2px solid #1d7a4d;padding:10px 12px;">
        <div style="font-size:26px;font-weight:700;line-height:1.2;color:#1d7a4d;">${totals.compliant}</div>
        <div style="font-size:11px;color:#1d7a4d;margin-top:1px;">Total Compliant</div>
      </td>
      <td width="50%" align="center" valign="top" style="background:#fbeae7;border-bottom:2px solid #c0392b;padding:10px 12px;">
        <div style="font-size:26px;font-weight:700;line-height:1.2;color:#c0392b;">${totals.issues}</div>
        <div style="font-size:11px;color:#c0392b;margin-top:1px;">Total Issues</div>
      </td>
    </tr>
  </table>
  <div style="font-size:12px;color:#5d6773;font-style:italic;margin-top:8px;">Friendly reminder: please refer back to the Follow-Up Checklist regularly and mark items off as they're completed.</div>` : "";

  const checklistHtml = clean(checklistUrl) ? `
  <div style="background:#f7f9fc;border:1px solid #dde3ea;border-radius:8px;padding:14px 20px;margin:20px 0;font-size:13.5px;">
    <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#143a63;margin-bottom:4px;">Your Follow-Up Checklist</div>
    <a href="${esc(checklistUrl)}" style="color:#143a63;font-weight:700;word-break:break-all;">${esc(checklistUrl)}</a>
    ${clean(txt("checklistNote")) ? `<div style="color:#6b7686;margin-top:4px;">${esc(txt("checklistNote"))}</div>` : ""}
  </div>` : "";

  const blockHtml = (b, last) => {
    const label = `<div style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#143a63;margin-bottom:8px;">${esc(b.name)}</div>`;
    const body = b.type === "prose"
      ? paragraphsHtml(b.text).map(p => `<p style="font-size:13.5px;color:#24303d;background:#f7f8fa;border:1px solid #dde3ea;border-radius:6px;padding:10px 14px;margin:0;">${p}</p>`).join("")
      : b.items.map((t, i) => `<div style="border-left:3px solid #d9534f;background:#fbeaea;border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:${i === b.items.length - 1 ? 0 : 6}px;font-size:13.5px;color:#24303d;">${esc(clean(t) ? t.trim() : "").replace(/\n/g, "<br>")}</div>`).join("");
    return `<div style="margin-bottom:${last ? 0 : 18}px;">${label}${body}</div>`;
  };

  const priority = blocks.length ? `
  <div style="background:#ffffff;border:1px solid #dde3ea;border-radius:8px;margin:20px 0;overflow:hidden;">
    <div style="background:#fdf3dc;border-bottom:1px solid #f0d68a;padding:14px 20px;font-size:14.5px;font-weight:700;color:#6b4a10;"><span style="margin-right:6px;">&#9888;&#65039;</span>${esc(txt("priorityIntro"))}</div>
    <div style="padding:18px 20px 20px;">${blocks.map((b, i) => blockHtml(b, i === blocks.length - 1)).join("")}</div>
  </div>` : "";

  const followup = clean(txt("followup"));
  // Without a follow-up banner between them, the encouragement and closing
  // share one card so the stack has no orphaned borders.
  const encouragement = `
  <div style="background:#ffffff;border:1px solid #dde3ea;border-radius:${followup ? "8px" : "8px 8px 0 0"};padding:24px 28px 8px;${blocks.length || checklistHtml ? "" : "margin-top:20px;"}">
    ${paras(txt("encouragement"))}
    ${followup ? "" : paras(txt("closing"))}
  </div>`;

  const followupHtml = followup ? `
  <div style="background:#fdf3dc;border:1px solid #f0d68a;border-radius:8px;padding:14px 20px;margin:20px 0;">
    <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#b3781a;margin-bottom:2px;">Follow-Up Teams Call Scheduled</div>
    <div style="font-size:15px;font-weight:700;color:#6b4a10;">${esc(followup)}</div>
  </div>
  <div style="background:#ffffff;border:1px solid #dde3ea;border-top:none;padding:24px 28px 8px;">
    ${paras(txt("followupNote"))}
    ${paras(txt("closing"))}
  </div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(meta.location || "Location")} — After Visit Follow-Up</title></head>
<body style="margin:0;padding:32px 16px;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.55;color:#24303d;">
<div id="report" style="max-width:760px;margin:0 auto;">
  <div style="background:#143a63;color:#ffffff;border-radius:10px 10px 0 0;padding:22px 28px;">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b9cbe0;margin-bottom:4px;">Accreditation Survey Prep</div>
    <div style="font-size:26px;font-weight:700;">After Visit Follow-Up</div>
  </div>

  ${infoGrid}

  <div style="background:#ffffff;border:1px solid #dde3ea;border-top:none;padding:24px 28px 8px;">
    ${intro}
  </div>
  ${totalsHtml}
  ${priority}
  ${checklistHtml}
  ${encouragement}
  ${followupHtml}
  ${signatureHtml({ name: meta.specialist, phone: signature.phone, email: signature.email })}

  <div style="text-align:center;color:#6b7686;font-size:11.5px;margin-top:22px;">Rotech Healthcare &middot; Accreditation Survey Prep</div>
</div>
</body></html>`;
}

// ─── screen ──────────────────────────────────────────────────────────────────
// The picker's rows, text blocks and category headers come from emailKit,
// shared with the Follow-Up Call email.

function Segmented({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label}
      style={{ display: "inline-flex", border: `1.5px solid ${T.gray300}`, borderRadius: T.radius, overflow: "hidden" }}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          style={{
            padding: "5px 12px", fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit",
            background: value === v ? T.blue600 : T.white, color: value === v ? T.white : T.gray700,
          }}>
          {text}
        </button>
      ))}
    </div>
  );
}

// Whether this visit's Follow-Up Checklist exists, and the one-click way to
// make it when it doesn't. The email's checklist box is only as good as the
// checklist behind it, so the reminder shows at the top of the screen and
// again beside the Copy button.
function ChecklistNotice({ checklist, onOpenChecklist, compact }) {
  if (!checklist) return null;
  const { status, url, busy, onGenerate } = checklist;
  const box = (tone, children, action) => {
    const [bg, fg, br] = {
      ok:   [T.successBg, T.success, T.successBorder],
      warn: [T.warningBg, T.warning, "#f0d68a"],
      info: [T.blue50, T.blue800, "#c5d9ef"],
    }[tone];
    return (
      <div role={tone === "warn" ? "alert" : "status"}
        style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          background: bg, color: fg, border: `1px solid ${br}`, borderRadius: T.radius, padding: "10px 14px",
          fontSize: 13, marginBottom: compact ? 12 : 16 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>{children}</div>
        {action}
      </div>
    );
  };
  const generate = label => (
    <button onClick={onGenerate} disabled={busy}
      style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}>
      {busy ? "Generating…" : label}
    </button>
  );

  switch (status) {
    case "exists":
      return compact ? null : box("ok",
        <><b>Follow-Up Checklist link included</b> in the email, after the priority items.
          <span style={{ display: "block", wordBreak: "break-all", color: T.gray600, marginTop: 2 }}>{url}</span></>);
    case "stale":
      return box("warn",
        <><b>The Follow-Up Checklist is out of date.</b> It was generated before this visit's findings last changed, so it
          doesn't list everything. Update it before sending — the link stays the same.</>,
        generate("Update checklist"));
    case "missing":
      return box("warn",
        <><b>The Follow-Up Checklist link hasn't been generated for this visit yet.</b> Generate it before sending so the
          location gets the link in this email.</>,
        generate("Generate checklist link"));
    case "error":
      return box("warn",
        <><b>Couldn't check for this visit's Follow-Up Checklist</b> — no connection? Generate the link to be sure it
          exists and is included in this email.</>,
        generate("Generate checklist link"));
    case "unsaved":
      return box("warn",
        <><b>Save this visit before generating its Follow-Up Checklist link.</b> Use Save Progress on the checklist, then
          come back here to generate the link.</>,
        <button onClick={onOpenChecklist} style={btnOutline}>Go to Checklist</button>);
    case "checking":
      return compact ? null : box("info", "Checking for this visit's Follow-Up Checklist…");
    default:
      return null;
  }
}

export default function AfterVisitEmail({ visit, draft, setDraft, signature, setSignature, checklist, totals, onOpenChecklist, onOpenDashboard }) {
  const { meta = {}, findings = [], followUpDisplay = "", hasVisit } = visit;
  const d = normalizeDraft(draft);
  const defaults = defaultTexts(meta, d.attach, followUpDisplay);
  const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  const txt = k => (has(d.text, k) ? d.text[k] : defaults[k]);

  const categories = groupCategories(findings, d);
  const blocks = buildBlocks(categories, d, txt);
  const checklistUrl = checklist && (checklist.status === "exists" || checklist.status === "stale") ? checklist.url : "";
  const html = buildEmailHtml({ meta, blocks, txt, attach: d.attach, signature, totals, checklistUrl });
  const listedCount = blocks.reduce((n, b) => n + (b.type === "list" ? b.items.length : 1), 0);

  const [collapsed, setCollapsed] = useState({});
  const [focusId, setFocusId] = useState(null);
  const [newCategory, setNewCategory] = useState("");

  // Every write goes through the normalised shape, so a draft saved by an older
  // build (or none at all) is upgraded on its first edit.
  const update = fn => setDraft(prev => fn(normalizeDraft(prev)));
  const without = (obj, k) => { const o = { ...obj }; delete o[k]; return o; };

  const togglePick = id => update(x => ({ ...x, picked: x.picked[id] ? without(x.picked, id) : { ...x.picked, [id]: true } }));
  const setPicks = (ids, on) => update(x => {
    const picked = { ...x.picked };
    ids.forEach(id => { if (on) picked[id] = true; else delete picked[id]; });
    return { ...x, picked };
  });
  const setEdit = (f, value) => update(x => ({
    ...x, edits: value === findingText(f) ? without(x.edits, f.id) : { ...x.edits, [f.id]: value },
  }));
  const resetEdit = id => update(x => ({ ...x, edits: without(x.edits, id) }));
  // An edit that lands back on the default drops the override, so the text
  // keeps following the attachments and visit details from then on.
  const setText = (k, value) => update(x => ({
    ...x, text: value === defaults[k] ? without(x.text, k) : { ...x.text, [k]: value },
  }));
  const resetText = k => update(x => ({ ...x, text: without(x.text, k) }));
  const setAttach = (k, on) => update(x => ({ ...x, attach: { ...x.attach, [k]: on } }));

  const addCustom = category => {
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setFocusId(id);
    setCollapsed(c => ({ ...c, [category]: false }));
    update(x => ({ ...x, custom: [...x.custom, { id, category, text: "" }] }));
  };
  const setCustom = (id, text) => update(x => ({ ...x, custom: x.custom.map(c => (c.id === id ? { ...c, text } : c)) }));
  const removeCustom = id => update(x => ({ ...x, custom: x.custom.filter(c => c.id !== id) }));

  const existingNames = categories.map(c => c.name.toLowerCase());
  const trimmedNew = clean(newCategory);
  const canAddCategory = trimmedNew && !existingNames.includes(trimmedNew.toLowerCase());
  const addCategory = () => {
    if (!canAddCategory) return;
    update(x => ({ ...x, customCategories: [...x.customCategories, trimmedNew] }));
    addCustom(trimmedNew);
    setNewCategory("");
  };
  const removeCategory = name => update(x => ({
    ...x,
    customCategories: x.customCategories.filter(n => n !== name),
    custom: x.custom.filter(c => c.category !== name),
  }));

  const note = (tone, children) => {
    const [bg, fg] = { warn: [T.warningBg, T.warning], info: [T.blue50, T.blue800] }[tone];
    return <div style={{ background: bg, color: fg, borderRadius: T.radius, padding: "10px 14px", fontSize: 13, marginTop: 12 }}>{children}</div>;
  };

  const header = (
    <div style={{ ...cardStyle(T.blue600), padding: "20px 22px", marginBottom: 16 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px", fontSize: 19, color: T.ink }}>
        <Icon name="send" size={18} style={{ color: T.blue600 }} />
        After Visit Email
      </h2>
      <p style={{ margin: 0, fontSize: 14, color: T.gray600 }}>
        Choose which findings from the open visit to call out as top priorities. The email is composed here for you to paste into
        Outlook — nothing is sent. Your picks and edits are saved with the visit.
      </p>
    </div>
  );

  if (!hasVisit) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 64px" }}>
        {header}
        <div style={{ ...cardStyle(), padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 6 }}>No visit is open</div>
          <div style={{ fontSize: 13.5, color: T.gray600, maxWidth: 420, margin: "0 auto 18px" }}>
            The after-visit email is built from the visit you have open. Load a saved visit from the Dashboard, or fill in the checklist first.
          </div>
          <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={onOpenDashboard} style={btnOutline}>Go to Dashboard</button>
            <button onClick={onOpenChecklist} style={btnOutline}>Go to Checklist</button>
          </div>
        </div>
      </div>
    );
  }

  const renderCategory = cat => {
    const isBinders = cat.name === BINDERS;
    const paragraphMode = isBinders && d.binderMode === "paragraph";
    const ids = cat.findings.map(f => f.id);
    const pickedHere = ids.filter(id => d.picked[id]).length;
    const isCustomCategory = d.customCategories.includes(cat.name) && cat.findings.length === 0;
    const open = !collapsed[cat.name];
    const countLabel = paragraphMode
      ? (d.binderParagraph ? "paragraph included" : "paragraph not included")
      : `${pickedHere + cat.custom.filter(c => clean(c.text)).length} of ${cat.findings.length + cat.custom.length} in email`;

    const actions = (
      <>
        {isBinders && (
          <Segmented label="How binder findings appear" value={d.binderMode}
            options={[["paragraph", "Paragraph"], ["list", "List items"]]}
            onChange={v => update(x => ({ ...x, binderMode: v }))} />
        )}
        {!paragraphMode && ids.length > 1 && (
          <>
            <button onClick={() => setPicks(ids, true)} style={smallBtn}>All</button>
            <button onClick={() => setPicks(ids, false)} style={smallBtn}>None</button>
          </>
        )}
        {isCustomCategory && (
          <button onClick={() => removeCategory(cat.name)} style={{ ...smallBtn, color: T.error, borderColor: T.errorBorder }}>Remove category</button>
        )}
      </>
    );

    return (
      <PickerCategory key={cat.name} name={cat.name} countLabel={countLabel} open={open}
        onToggle={() => setCollapsed(c => ({ ...c, [cat.name]: open }))} actions={actions}>
            {paragraphMode ? (
              <>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, color: T.ink, cursor: "pointer", padding: "4px 10px" }}>
                  <input type="checkbox" checked={d.binderParagraph} style={{ ...checkbox, marginTop: 0 }}
                    onChange={e => update(x => ({ ...x, binderParagraph: e.target.checked }))} />
                  Include the Binders paragraph
                </label>
                {d.binderParagraph && (
                  <div style={{ padding: "0 10px 0 36px" }}>
                    <TextBlock id="av-binders" label="Binders paragraph" value={txt("binders")} rows={3}
                      overridden={has(d.text, "binders")} onChange={v => setText("binders", v)} onReset={() => resetText("binders")} />
                  </div>
                )}
                {cat.findings.length > 0 && (
                  <details style={{ padding: "4px 10px 0 36px", fontSize: 13 }}>
                    <summary style={{ cursor: "pointer", color: T.gray600 }}>Show the {cat.findings.length} binder finding{cat.findings.length === 1 ? "" : "s"} (for reference — switch to List items to pick them)</summary>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: T.gray700 }}>
                      {cat.findings.map(f => (
                        <li key={f.id} style={{ marginBottom: 3 }}>
                          {f.text}{f.comment && <span style={{ color: T.gray500 }}> — {f.comment}</span>}
                          {f.source && <span style={{ color: T.gray500 }}> · {f.source}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <>
                {cat.findings.map(f => (
                  <FindingRow key={f.id} f={f} checked={!!d.picked[f.id]} value={itemText(f, d)} edited={has(d.edits, f.id)}
                    onToggle={() => togglePick(f.id)} onEdit={v => setEdit(f, v)} onReset={() => resetEdit(f.id)} />
                ))}
                {cat.custom.map(c => (
                  <CustomRow key={c.id} item={c} autoFocus={c.id === focusId}
                    onChange={v => setCustom(c.id, v)} onRemove={() => removeCustom(c.id)} />
                ))}
                <AddCustomButton onClick={() => addCustom(cat.name)} />
              </>
            )}
      </PickerCategory>
    );
  };

  const followupOverridden = has(d.text, "followup");

  const textBlock = (k, label, rows = 3, hint) => (
    <TextBlock key={k} id={`av-text-${k}`} label={label} value={txt(k)} rows={rows}
      overridden={has(d.text, k)} onChange={v => setText(k, v)} onReset={() => resetText(k)} hint={hint} />
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 64px" }}>
      {header}
      <ChecklistNotice checklist={checklist} onOpenChecklist={onOpenChecklist} />

      {/* 1 — what goes in the priorities block */}
      <div style={{ ...cardStyle(), padding: "20px 22px", marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15.5, color: T.ink }}>1 &nbsp;Pick the priority items</h3>
        <p style={{ margin: 0, fontSize: 13, color: T.gray600 }}>
          <b>{meta.location || "This visit"}</b>{meta.city ? ` · ${meta.city}` : ""} — {findings.length} finding{findings.length === 1 ? "" : "s"} marked Issue.
          {" "}Nothing is listed in the email until you tick it; each ticked item can be reworded.
          {" "}<b style={{ color: listedCount ? T.blue600 : T.gray600 }}>{listedCount} in the email.</b>
        </p>
        {!meta.location && note("warn", <><b>This visit has no location yet.</b> Fill in the Lawson # on the checklist so the email header is complete.</>)}
        {findings.length === 0 && note("info", <>No findings on this visit are marked <b>Issue</b>. You can still add a category and custom items below.</>)}

        <div style={{ marginTop: 14 }}>
          {categories.map(renderCategory)}
          <AddCategoryRow value={newCategory} onChange={setNewCategory} onAdd={addCategory} canAdd={!!canAddCategory} />
        </div>
      </div>

      {/* 2 — attachments, wording, signature */}
      <div style={{ ...cardStyle(), padding: "20px 22px", marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15.5, color: T.ink }}>2 &nbsp;Greeting, attachments and call details</h3>

        {/* The opening is written here, not in Outlook: editing pasted HTML
            there is what knocks the formatting out of shape. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <TextBlock id="av-text-salutation" label="Salutation" multiline={false} value={txt("salutation")}
            placeholder="e.g. Good afternoon Sarah," overridden={has(d.text, "salutation")}
            onChange={v => setText("salutation", v)} onReset={() => resetText("salutation")}
            hint={`Add the manager's name, e.g. "Good afternoon Sarah,". Clear it to start straight with the greeting.`} />
          {textBlock("greeting", "Greeting", 3,
            has(d.text, "greeting") ? undefined : "Uses the visit's city so it reads naturally when the location is just \"Rotech\".")}
        </div>

        <div style={metaLabel}>Attached to this email</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "6px 16px", marginBottom: 6 }}>
          {ATTACHMENTS.map(a => (
            <label key={a.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, color: T.ink, cursor: "pointer" }}>
              <input type="checkbox" checked={!!d.attach[a.key]} onChange={e => setAttach(a.key, e.target.checked)} style={{ ...checkbox, marginTop: 0 }} />
              {a.label}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: T.gray500, marginBottom: 16 }}>
          The opening paragraphs and the Binders paragraph mention only what's ticked. Attach the files to the Outlook message yourself.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <div style={{ gridColumn: "span 2", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <label htmlFor="av-followup" style={metaLabel}>Follow-Up Teams call</label>
              {followupOverridden && <button onClick={() => resetText("followup")} style={linkBtn}>Use the visit's date</button>}
            </div>
            <input id="av-followup" style={metaField} value={txt("followup")} placeholder="e.g. Friday, November 13, 2026 · 2:00 PM EST"
              onChange={e => setText("followup", e.target.value)} />
            <div style={{ fontSize: 12, color: T.gray500, marginTop: 4 }}>
              {followUpDisplay
                ? "Prefilled from the visit's Follow-Up Teams Call. Clear it to leave the call banner out."
                : "No follow-up call is set on this visit. Type one here, or leave it blank to leave the call banner out."}
            </div>
          </div>
          <div>
            <label htmlFor="av-sig-phone" style={metaLabel}>Your cell</label>
            <input id="av-sig-phone" style={metaField} placeholder="(000) 000-0000" value={signature.phone}
              onChange={e => setSignature({ ...signature, phone: e.target.value })} />
          </div>
          <div>
            <label htmlFor="av-sig-email" style={metaLabel}>Your email</label>
            <input id="av-sig-email" style={metaField} placeholder="you@rotech.com" value={signature.email}
              onChange={e => setSignature({ ...signature, email: e.target.value })} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.gray500, marginTop: 4 }}>Cell and email are remembered on this device for both emails.</div>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: T.blue600 }}>Edit the rest of the email's wording</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
            {[
              ["reports", "Survey Prep Report paragraph", d.attach.reports],
              ["binderGuide", "OP 840 Location Binder Guide paragraph", d.attach.binderGuide],
              ["warehouseGuide", "Warehouse Organization Guide paragraph", d.attach.warehouseGuide],
              ["priorityIntro", "Priorities lead-in", blocks.length > 0],
              ["checklistNote", "Follow-Up Checklist note", !!checklistUrl],
              ["encouragement", "Encouragement", true],
              ["followupNote", "Follow-up call note", !!clean(txt("followup"))],
              ["closing", "Closing", true],
            ].filter(([, , shown]) => shown).map(([k, label]) => textBlock(k, label, k === "priorityIntro" || k === "checklistNote" ? 2 : 3))}
            <div style={{ fontSize: 12, color: T.gray500 }}>Leave a blank line to start a new paragraph.</div>
          </div>
        </details>
      </div>

      {/* 3 — hand off to Outlook */}
      <EmailOutputCard step="3" html={html} title="After visit email preview">
        <ChecklistNotice checklist={checklist} onOpenChecklist={onOpenChecklist} compact />
        {listedCount === 0 && (
          <div style={{ background: T.warningBg, color: T.warning, borderRadius: T.radius, padding: "9px 13px", fontSize: 13, marginBottom: 12 }}>
            No items are ticked, so the priorities block is left out of the email.
          </div>
        )}
      </EmailOutputCard>
    </div>
  );
}
