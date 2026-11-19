import { useState, useRef, useEffect } from "react";
import { T, cardStyle, Icon, metaLabel, metaField, btnPrimary, btnOutline } from "./theme";
import { importChunk } from "./chunkRecovery";
import {
  clean, esc, paragraphsHtml, infoGridHtml, signatureHtml, EmailOutputCard,
  findingText, TextBlock, FindingRow, CustomRow, AddCustomButton, PickerCategory, AddCategoryRow,
  smallBtn,
} from "./emailKit";

// ─── FOLLOW-UP CALL EMAIL ────────────────────────────────────────────────────
// Turns a filled-in Virtual Follow-Up Tracker into the summary email the
// location manager receives after the follow-up call.
//
// The tracker is exported from a visit (Export Follow-Up XLSX), worked through
// on the Teams call, and dropped back in here. This module reads it, counts the
// corrective actions, and composes the email.
//
// The screen works like the After Visit email's: every outstanding finding is
// offered in a picker, grouped by section, and can be reworded; custom items
// and categories can be added; and every paragraph can be rewritten and reset.
// One difference is deliberate — here outstanding findings start TICKED. The
// After Visit email rides with the full report attached, so it lists only what
// the specialist chooses; this one has no attachment, so its list IS the
// manager's action list, and the specialist unticks what they'd rather raise
// another way. Unticked findings still count in the totals: the numbers are
// the tracker's, the list is the specialist's.
//
// Picks and wording live in this screen only. Nothing here is written to
// Firestore and no collection is added: the file the specialist uploads is the
// input, and the email on the clipboard is the output. Picks are keyed by the
// tracker's own row keys (hidden column D), so dropping in a corrected copy of
// the same tracker keeps them. The one read is the visit's Follow-Up Checklist
// — found by the visit id the tracker carries in D2 — so its link goes in the
// email without pasting. As with Site Circuit, the message is composed in the
// specialist's own Outlook rather than sent by the application, so no mail
// processor enters the architecture.
//
// The tracker's "Corrected?" column is a Yes / No / Pending dropdown, which
// maps onto the three states the email reports:
//
//   Yes      → verified     confirmed on the walkthrough
//   Pending  → reported     manager says done, not yet confirmed
//   No       → outstanding  offered in the picker, with its note
//   blank    → outstanding, AND the specialist is told which rows they are
//
// That last case matters: a blank means nobody answered for that finding, not
// that it passed. Counting blanks as corrected would put a number in front of
// a location manager that nobody stands behind.
//
// Corrected findings are counted, never listed. The manager needs a short
// action list, not a recap of work already done — the tracker and the report
// remain the detailed record.
//
// Trackers exported before hidden column D existed are still accepted; their
// section names come from the sheet tabs, which Excel truncates to 31
// characters, so the specialist is warned that some may read oddly.
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_TAG = "RSP-FOLLOWUP-V2";
const DATA_START_ROW = 5;
const STATUS = { yes: "verified", pending: "reported", no: "outstanding" };

// Legacy fallback only. Excel caps sheet names at 31 chars and the old export
// also stripped "/" while building them, so "OP 541 — Facility / OVERALL
// FACILITY" arrived as the tab "OP 541 — Facility  OVERALL FACI". These
// expansions are best-effort guesses at the cut-off words; newer trackers
// carry the exact label in D3 and never reach this table.
const SUFFIX_FIXES = {
  "OVERALL FACI": "Overall Facility", "WAREHOUSE SP": "Warehouse Space",
  "DOCUMENTATIO": "Documentation",    DOCUMEN: "Documentation",
  EMERGEN: "Emergency",               STORAGE: "Storage",
};

// ─── .xlsx reading ───────────────────────────────────────────────────────────
// JSZip is already a dependency (the tracker export uses it) and is imported
// dynamically for the same reason it is there: this screen is rarely opened,
// so the parser stays out of the initial bundle.

function cellText(c, shared) {
  if (c.getAttribute("t") === "inlineStr")
    return Array.from(c.getElementsByTagName("t")).map(t => t.textContent).join("");
  const v = c.getElementsByTagName("v")[0];
  if (!v) return "";
  if (c.getAttribute("t") === "s") return shared[parseInt(v.textContent, 10)] || "";
  return v.textContent;
}

async function readWorkbook(file) {
  const JSZip = (await importChunk(() => import("jszip"))).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parse = async path => {
    const f = zip.file(path);
    if (!f) return null;
    return new DOMParser().parseFromString(await f.async("string"), "application/xml");
  };

  const wb = await parse("xl/workbook.xml");
  if (!wb || !wb.getElementsByTagName("sheet").length)
    throw new Error("No worksheets found — is this the Follow-Up Tracker export?");

  const relsDoc = await parse("xl/_rels/workbook.xml.rels");
  const rels = {};
  if (relsDoc)
    for (const r of relsDoc.getElementsByTagName("Relationship"))
      rels[r.getAttribute("Id")] = r.getAttribute("Target").replace(/^\/?xl\//, "");

  const ssDoc = await parse("xl/sharedStrings.xml");
  const shared = ssDoc
    ? Array.from(ssDoc.getElementsByTagName("si")).map(si =>
        Array.from(si.getElementsByTagName("t")).map(t => t.textContent).join(""))
    : [];

  const sheets = [];
  for (const s of wb.getElementsByTagName("sheet")) {
    const rid = s.getAttribute("r:id")
      || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const doc = await parse("xl/" + (rels[rid] || ""));
    if (!doc) continue;
    const rows = {};
    for (const row of doc.getElementsByTagName("row")) {
      const cells = {};
      for (const c of row.getElementsByTagName("c"))
        cells[(c.getAttribute("r") || "").replace(/[0-9]/g, "")] = clean(cellText(c, shared));
      rows[parseInt(row.getAttribute("r"), 10)] = cells;
    }
    sheets.push({ name: s.getAttribute("name") || "", rows });
  }
  return sheets;
}

// Anything after "| Mismatch …" is the export's self-audit conflict flag. It is
// pulled off the note text and counted separately: it is real and worth knowing,
// but "you marked this compliant and it wasn't", repeated down a list, reads as
// an indictment of the person being asked to fix things. The specialist sees the
// count here and can raise it deliberately.
function splitNote(note) {
  const parts = clean(note).split("|").map(p => p.trim()).filter(Boolean);
  const kept = parts.filter(p => !/mismatch/i.test(p));
  return [kept.join(" | "), kept.length !== parts.length];
}

function categoryFromTab(tab) {
  const parts = tab.trim().split(/\s{2,}/).filter(Boolean);
  if (parts.length < 2) return tab.trim();
  let tail = parts.slice(1).join(" ");
  if (SUFFIX_FIXES[tail]) tail = SUFFIX_FIXES[tail];
  else if (tail === tail.toUpperCase())
    tail = tail.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
  return `${parts[0]} / ${tail}`;
}

function parseTracker(sheets) {
  const meta = {};
  const categories = [];
  const blanks = [];
  const seen = new Set();
  let mismatches = 0, total = 0, modern = 0;

  for (const sheet of sheets) {
    const rows = sheet.rows;
    // Rows 2-3 carry "Label: value" pairs, identical on every sheet.
    for (const r of [2, 3])
      for (const key of Object.keys(rows[r] || {})) {
        const v = rows[r][key];
        const i = v.indexOf(":");
        if (i > 0) {
          const label = clean(v.slice(0, i));
          if (!(label in meta)) meta[label] = clean(v.slice(i + 1));
        }
      }

    const d = k => clean((rows[k] || {}).D);
    if (d(1) === FORMAT_TAG) modern++;
    if (d(2) && !meta.visitId) meta.visitId = d(2);

    const cat = { name: d(3) || categoryFromTab(sheet.name), verified: 0, reported: 0, outstanding: [] };

    for (const n of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
      if (n < DATA_START_ROW) continue;
      const cells = rows[n];
      const item = clean(cells.A);
      if (!item) continue;
      total++;

      const [note, flagged] = splitNote(cells.C);
      if (flagged) mismatches++;

      const status = STATUS[clean(cells.B).toLowerCase()];
      if (!status) blanks.push(`${sheet.name} row ${n}`);

      if (!status || status === "outstanding") {
        // The hidden row key names the finding itself, so a pick or rewording
        // survives a corrected copy of the tracker being dropped in again.
        // Older trackers have none, so their sheet and row stand in.
        let id = clean(cells.D) || `${sheet.name}#${n}`;
        if (seen.has(id)) id = `${id}#${n}`;
        seen.add(id);
        cat.outstanding.push({
          id, text: item, comment: note,
          source: status ? "" : `No Yes / No / Pending answer (${sheet.name} row ${n}) — counted as outstanding`,
        });
      } else cat[status]++;
    }

    if (cat.verified || cat.reported || cat.outstanding.length) categories.push(cat);
  }

  if (!total) throw new Error("No findings found — is this the Follow-Up Tracker export?");

  const verified    = categories.reduce((a, c) => a + c.verified, 0);
  const reported    = categories.reduce((a, c) => a + c.reported, 0);
  const outstanding = categories.reduce((a, c) => a + c.outstanding.length, 0);
  return {
    meta, categories, blanks, mismatches, total, verified, reported, outstanding,
    legacy: modern === 0,
  };
}

// ─── the draft ───────────────────────────────────────────────────────────────
// What the specialist has changed: findings left OUT of the list (everything
// starts in), reworded findings, their own items and categories, and rewritten
// paragraphs. Everything else is derived from the tracker.

const EMPTY_DRAFT = { unpicked: {}, edits: {}, custom: [], customCategories: [], text: {} };

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const without = (obj, k) => { const o = { ...obj }; delete o[k]; return o; };
const itemText = (f, d) => (has(d.edits, f.id) ? d.edits[f.id] : findingText(f));

// The same tracker dropped in again (blanks filled in, a note fixed) keeps the
// draft; a different visit's tracker starts a fresh one.
const trackerKey = p => p.meta.visitId || p.meta.Location || "";

// "Pending" is the manager's word, not a verification, so when anything is
// only reported complete the all-clear says so rather than calling every item
// verified and nothing further required.
function defaultTexts(p, allClear) {
  const loc = p.meta.Location || "your location";
  const n = p.reported;
  const one = n === 1;
  return {
    salutation: "Hello,",
    greeting: `Thank you for taking the time to walk through ${loc} with me today — I appreciate you and your team making the call a priority.`,
    summaryIntro: "Below is a summary of where things stand following our call, based on the follow-up tracker we worked through together.",
    outstandingIntro: "Still outstanding — please close these out:",
    allClear: n
      ? `Every item from the visit has been addressed. ${n} ${one ? "item was" : "items were"} reported complete and still ${one ? "needs" : "need"} to be verified — please keep the supporting documentation on hand so I can confirm ${one ? "it" : "them"}.`
      : "Every item from the visit has been corrected and verified. Nothing further is required from your team at this time.",
    checklistNote: "Keep marking items off as you complete them.",
    encouragement: allClear
      ? n
        ? "This is great progress. Your team has worked through every finding, and once the remaining items are verified this location will be in a strong position going into the survey window."
        : "This is excellent work. Your team turned these around quickly and thoroughly, which puts this location in a strong position going into the survey window."
      : "None of the remaining items are difficult — they just need to be closed out before your survey window opens.",
    closing: allClear
      ? "As always, reach out any time if questions come up between now and your survey. I'm happy to help."
      : "As always, reach out with any questions as you work through the remaining items. I'm happy to help.",
  };
}

// Tracker sections with something outstanding, in tracker order, then the
// specialist's own categories in the order they were added.
function groupCategories(p, d) {
  const order = [];
  const byName = {};
  const ensure = name => {
    if (!byName[name]) { byName[name] = { name, findings: [], custom: [] }; order.push(name); }
    return byName[name];
  };
  p.categories.forEach(c => { if (c.outstanding.length) ensure(c.name).findings.push(...c.outstanding); });
  d.customCategories.forEach(ensure);
  d.custom.forEach(c => ensure(c.category).custom.push(c));
  return order.map(n => byName[n]);
}

function buildBlocks(categories, d) {
  return categories.map(cat => ({
    name: cat.name,
    items: [
      ...cat.findings.filter(f => !d.unpicked[f.id]).map(f => itemText(f, d)),
      ...cat.custom.map(c => c.text),
    ].filter(t => clean(t)),
  })).filter(b => b.items.length);
}

// ─── the email ───────────────────────────────────────────────────────────────
// Built as a standalone HTML document and rendered in an iframe, so the app's
// own stylesheet cannot leak into a message that will live in Outlook. Styles
// are written inline for the same reason.

function buildEmailHtml({ p, blocks, allClear, txt, form, signature, checklistUrl }) {
  const P = html => `<p style="font-size:14.5px;margin:0 0 16px;">${html}</p>`;
  const paras = text => paragraphsHtml(text).map(P).join("");
  // A white text card, left out altogether when its text has been cleared.
  const card = (html, extra) => html ? `
  <div style="background:#fff;border:1px solid #dde3ea;${extra}padding:24px 28px 8px;">
    ${html}
  </div>` : "";

  const done = p.verified + p.reported;
  const pct  = p.total ? Math.round((done / p.total) * 100) : 0;

  const infoGrid = infoGridHtml([
    ["Location", p.meta.Location], ["City / State", p.meta["City / State"]],
    ["Accreditation Specialist", p.meta.Specialist], ["Original Visit Date", p.meta["Visit Date"]],
    ["Follow-Up Call Date", form.callDate || p.meta["Export Date"]],
  ]);

  // Status colour never travels alone — each tile carries a mark and a written
  // label, because corrected/pending/outstanding is a green/amber/red set and
  // that is the pairing colour-blind readers cannot separate.
  const tile = (n, mark, label, fg, bg, br) => n === 0 ? "" : `
    <td width="33%" valign="top" style="padding:10px 14px;background:${bg};border:1px solid ${br};border-radius:6px;">
      <div style="font-size:24px;font-weight:700;line-height:1.1;color:${fg};">${n}</div>
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${fg};margin-top:2px;">${mark} ${esc(label)}</div>
    </td>`;
  const tiles = [
    tile(p.verified,    "&#10004;", "Verified on call",  "#1e7a4d", "#e8f5ee", "#bfe3d0"),
    tile(p.reported,    "&#9203;",  "Reported complete", "#9a6b12", "#fdf3dc", "#f0d68a"),
    tile(p.outstanding, "&#9888;",  "Still outstanding", "#b3261e", "#fbeaea", "#f0c4c2"),
  ].filter(Boolean);

  const seg = (n, colour) => n === 0 ? "" :
    `<td width="${(n / p.total) * 100}%" style="background:${colour};height:12px;font-size:0;line-height:12px;">&nbsp;</td>`;
  const meter = `<table role="presentation" width="100%" cellpadding="0" cellspacing="2" style="margin-bottom:14px;"><tr>` +
    seg(p.verified, "#34a06a") + seg(p.reported, "#dba62d") + seg(p.outstanding, "#d9534f") + `</tr></table>`;

  const blockHtml = (b, last) => `
      <div style="margin-bottom:${last ? 0 : 18}px;">
        <div style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#143a63;margin-bottom:8px;">${esc(b.name)}</div>
        ${b.items.map((t, i) => `
        <div style="border-left:3px solid #d9534f;background:#fbeaea;border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:${i === b.items.length - 1 ? 0 : 6}px;font-size:13.5px;color:#24303d;">${esc(t.trim()).replace(/\n/g, "<br>")}</div>`).join("")}
      </div>`;

  const body = blocks.length ? `
    <div style="background:#fff;border:1px solid #dde3ea;border-radius:8px;margin:20px 0;overflow:hidden;">
      <div style="background:#fdf3dc;border-bottom:1px solid #f0d68a;padding:14px 20px;font-size:14.5px;font-weight:700;color:#6b4a10;"><span style="margin-right:6px;">&#9888;&#65039;</span>${esc(txt("outstandingIntro"))}</div>
      <div style="padding:18px 20px 20px;">${blocks.map((b, i) => blockHtml(b, i === blocks.length - 1)).join("")}</div>
    </div>` : allClear ? `
    <div style="background:#e8f5ee;border:1px solid #bfe3d0;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:15px;font-weight:700;color:#1e7a4d;margin-bottom:2px;">&#10004; ${p.reported ? "Nothing left outstanding" : "All findings closed out"}</div>
      ${paragraphsHtml(txt("allClear")).map((t, i) => `<div style="font-size:13.5px;color:#24303d;${i ? "margin-top:8px;" : ""}">${t}</div>`).join("")}
    </div>` : "";

  const checklist = clean(checklistUrl) ? `
    <div style="background:#f7f9fc;border:1px solid #dde3ea;border-radius:8px;padding:14px 20px;margin:20px 0;font-size:13.5px;">
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#143a63;margin-bottom:4px;">Your Follow-Up Checklist</div>
      <a href="${esc(checklistUrl)}" style="color:#143a63;font-weight:700;word-break:break-all;">${esc(checklistUrl)}</a>
      ${clean(txt("checklistNote")) ? `<div style="color:#6b7686;margin-top:4px;">${esc(txt("checklistNote"))}</div>` : ""}
    </div>` : "";

  const nextStep = clean(form.nextStep) ? `
    <div style="background:#fdf3dc;border:1px solid #f0d68a;border-radius:8px;padding:14px 20px;margin:20px 0;">
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#b3781a;margin-bottom:2px;">Next Checkpoint</div>
      <div style="font-size:15px;font-weight:700;color:#6b4a10;">${esc(form.nextStep)}</div>
    </div>` : "";

  const sub = p.reported > 0
    ? `${p.verified} verified on the call, ${p.reported} reported complete and pending verification.`
    : "All corrections confirmed during the walkthrough.";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(p.meta.Location || "Location")} — Follow-Up Call Summary</title></head>
<body style="margin:0;padding:32px 16px;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.55;color:#24303d;">
<div id="report" style="max-width:760px;margin:0 auto;">
  <div style="background:#143a63;color:#fff;border-radius:10px 10px 0 0;padding:22px 28px;">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b9cbe0;margin-bottom:4px;">Accreditation Survey Prep</div>
    <div style="font-size:26px;font-weight:700;">Follow-Up Call Summary</div>
  </div>

  ${infoGrid}

  ${card([txt("salutation"), txt("greeting"), txt("summaryIntro")].map(paras).join(""), "border-top:none;")}

  <div style="background:#fff;border:1px solid #dde3ea;border-radius:8px;margin:20px 0;padding:20px 22px;">
    <p style="font-size:17px;font-weight:700;color:#0d2947;margin:0 0 2px;">${done} of ${p.total} findings corrected &middot; ${pct}%</p>
    <p style="font-size:13px;color:#6b7686;margin:0 0 14px;">${esc(sub)}</p>
    ${meter}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;"><tr>${tiles.join("")}</tr></table>
  </div>

  ${body}
  ${checklist}

  ${card(paras(txt("encouragement")), "border-radius:8px;")}

  ${nextStep}

  ${card(paras(txt("closing")), "border-top:none;")}

  ${signatureHtml({ name: p.meta.Specialist, phone: signature.phone, email: signature.email })}

  <div style="text-align:center;color:#6b7686;font-size:11.5px;margin-top:22px;">Rotech Healthcare &middot; Accreditation Survey Prep</div>
</div>
</body></html>`;
}

// ─── screen ──────────────────────────────────────────────────────────────────

// signature / setSignature are the cell and email shared with the After Visit
// email and remembered on this device (see Emails.jsx). findChecklist looks up
// a visit's Follow-Up Checklist link; when the tracker's visit is the one open
// in the app (openVisitId), onGenerate can create that checklist from here.
export default function FollowUpEmail({ signature, setSignature, findChecklist, openVisitId, generating, onGenerate }) {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [form, setForm] = useState({ callDate: "", nextStep: "", checklist: "" });
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [collapsed, setCollapsed] = useState({});
  const [focusId, setFocusId] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [lookup, setLookup] = useState({ id: null, status: "idle", url: "" });
  const [lookupRev, setLookupRev] = useState(0);
  const fileRef = useRef(null);
  // The last tracker read successfully. Kept apart from `parsed`, which a
  // wrong file clears, so the right one dropped in next still keeps the draft.
  const lastKey = useRef(null);

  // The visit's Follow-Up Checklist, looked up by the visit id the tracker
  // carries. The checklist doc is world-readable (managers open it without
  // signing in), so this needs no special rule.
  const visitId = parsed?.meta.visitId || "";
  useEffect(() => {
    if (!visitId || !findChecklist) return;
    let cancelled = false;
    setLookup({ id: visitId, status: "checking", url: "" });
    findChecklist(visitId)
      .then(url => { if (!cancelled) setLookup({ id: visitId, status: url ? "found" : "missing", url }); })
      .catch(() => { if (!cancelled) setLookup({ id: visitId, status: "error", url: "" }); });
    return () => { cancelled = true; };
  }, [visitId, lookupRev, findChecklist]);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const next = parseTracker(await readWorkbook(file));
      const key = trackerKey(next);
      const same = !!key && key === lastKey.current;
      lastKey.current = key;
      if (!same) { setDraft(EMPTY_DRAFT); setCollapsed({}); }
      setParsed(next);
      setForm(f => same
        ? { ...f, callDate: f.callDate || next.meta["Export Date"] || "" }
        : { ...f, callDate: next.meta["Export Date"] || "", checklist: "" });
    } catch (e) {
      setParsed(null);
      setError(e?.message || "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  // ── derived from the tracker and the draft ──
  const d = draft;
  const categories = parsed ? groupCategories(parsed, d) : [];
  const blocks = buildBlocks(categories, d);
  const allClear = !!parsed && parsed.outstanding === 0 && blocks.length === 0;
  const defaults = parsed ? defaultTexts(parsed, allClear) : {};
  const txt = k => (has(d.text, k) ? d.text[k] : defaults[k]);
  const listedCount = blocks.reduce((n, b) => n + b.items.length, 0);
  const tickedOutstanding = categories.reduce((n, c) => n + c.findings.filter(f => !d.unpicked[f.id]).length, 0);
  const leftOut = parsed ? parsed.outstanding - tickedOutstanding : 0;

  const lookupStatus = !visitId || !findChecklist ? "unknown" : lookup.id === visitId ? lookup.status : "checking";
  const checklistUrl = lookupStatus === "found" ? lookup.url : clean(form.checklist);
  const canGenerate = lookupStatus === "missing" && !!onGenerate && visitId === openVisitId;

  const html = parsed ? buildEmailHtml({ p: parsed, blocks, allClear, txt, form, signature, checklistUrl }) : "";

  // ── draft edits ──
  const update = fn => setDraft(prev => fn(prev));
  const togglePick = id => update(x => ({ ...x, unpicked: x.unpicked[id] ? without(x.unpicked, id) : { ...x.unpicked, [id]: true } }));
  const setPicks = (ids, on) => update(x => {
    const unpicked = { ...x.unpicked };
    ids.forEach(id => { if (on) delete unpicked[id]; else unpicked[id] = true; });
    return { ...x, unpicked };
  });
  const setEdit = (f, value) => update(x => ({
    ...x, edits: value === findingText(f) ? without(x.edits, f.id) : { ...x.edits, [f.id]: value },
  }));
  const resetEdit = id => update(x => ({ ...x, edits: without(x.edits, id) }));
  // An edit that lands back on the default drops the override, so the text
  // keeps following the tracker from then on.
  const setText = (k, value) => update(x => ({
    ...x, text: value === defaults[k] ? without(x.text, k) : { ...x.text, [k]: value },
  }));
  const resetText = k => update(x => ({ ...x, text: without(x.text, k) }));

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
  const canAddCategory = !!trimmedNew && !existingNames.includes(trimmedNew.toLowerCase());
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

  async function generateChecklist() {
    await onGenerate();
    setLookupRev(r => r + 1);
  }

  // ── pieces ──
  const field = (key, label, placeholder) => (
    <div>
      <label style={metaLabel} htmlFor={`fu-${key}`}>{label}</label>
      <input id={`fu-${key}`} style={metaField} placeholder={placeholder} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );
  const sigField = (key, label, placeholder) => (
    <div>
      <label style={metaLabel} htmlFor={`fu-sig-${key}`}>{label}</label>
      <input id={`fu-sig-${key}`} style={metaField} placeholder={placeholder} value={signature[key]}
        onChange={e => setSignature({ ...signature, [key]: e.target.value })} />
    </div>
  );
  const textBlock = (k, label, rows = 3) => (
    <TextBlock key={k} id={`fu-text-${k}`} label={label} value={txt(k)} rows={rows}
      overridden={has(d.text, k)} onChange={v => setText(k, v)} onReset={() => resetText(k)} />
  );

  const note = (tone, children, action) => {
    const map = { ok: [T.successBg, T.success], warn: [T.warningBg, T.warning], err: [T.errorBg, T.error], info: [T.blue50, T.blue800] };
    const [bg, fg] = map[tone];
    return (
      <div role={tone === "err" ? "alert" : undefined}
        style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          background: bg, color: fg, borderRadius: T.radius, padding: "11px 14px", fontSize: 13, marginTop: 12 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>{children}</div>
        {action}
      </div>
    );
  };

  const count = (n, label, fg, bg, br) => (
    <div style={{ flex: 1, minWidth: 120, background: bg, border: `1px solid ${br}`, borderRadius: T.radius, padding: "10px 13px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: fg }}>{n}</div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: fg, marginTop: 1 }}>{label}</div>
    </div>
  );

  // Found automatically when it can be; pasted by hand when it can't.
  const manualLink = <div style={{ marginTop: 10 }}>{field("checklist", "Paste the checklist link (optional)", "https://…")}</div>;
  const checklistSection = (() => {
    switch (lookupStatus) {
      case "found":
        return note("ok",
          <><b>Follow-Up Checklist link included</b> in the email — found from the visit this tracker was exported from.
            <span style={{ display: "block", wordBreak: "break-all", color: T.gray600, marginTop: 2 }}>{lookup.url}</span></>);
      case "checking":
        return note("info", "Looking for this visit's Follow-Up Checklist…");
      case "missing":
        return <>
          {note("warn",
            <><b>No Follow-Up Checklist has been generated for this visit.</b>{" "}
              {canGenerate
                ? "Generate it now to put its link in the email, or paste a link below."
                : "Open that visit and generate its Follow-Up Checklist link, then drop the tracker in here again — or paste a link below."}</>,
            canGenerate && (
              <button onClick={generateChecklist} disabled={generating}
                style={{ ...btnPrimary, opacity: generating ? 0.6 : 1, cursor: generating ? "default" : "pointer" }}>
                {generating ? "Generating…" : "Generate checklist link"}
              </button>
            ))}
          {manualLink}
        </>;
      case "error":
        return <>
          {note("warn",
            <><b>Couldn't look up this visit's Follow-Up Checklist</b> — no connection? Try again, or paste the link below.</>,
            <button onClick={() => setLookupRev(r => r + 1)} style={btnOutline}>Try again</button>)}
          {manualLink}
        </>;
      default:
        return <>
          {note("info",
            <>This tracker doesn't say which visit it came from (it was exported before the visit was saved, or by an older
              version), so the checklist link can't be found automatically. Paste it below, or leave it blank to leave it out.</>)}
          {manualLink}
        </>;
    }
  })();

  const renderCategory = cat => {
    const ids = cat.findings.map(f => f.id);
    const inEmail = ids.filter(id => !d.unpicked[id]).length + cat.custom.filter(c => clean(c.text)).length;
    const isCustomCategory = d.customCategories.includes(cat.name) && cat.findings.length === 0;
    const open = !collapsed[cat.name];
    const actions = (ids.length > 1 || isCustomCategory) && (
      <>
        {ids.length > 1 && (
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
      <PickerCategory key={cat.name} name={cat.name} open={open} actions={actions}
        countLabel={`${inEmail} of ${cat.findings.length + cat.custom.length} in email`}
        onToggle={() => setCollapsed(c => ({ ...c, [cat.name]: open }))}>
        {cat.findings.map(f => (
          <FindingRow key={f.id} f={f} checked={!d.unpicked[f.id]} value={itemText(f, d)} edited={has(d.edits, f.id)}
            onToggle={() => togglePick(f.id)} onEdit={v => setEdit(f, v)} onReset={() => resetEdit(f.id)} />
        ))}
        {cat.custom.map(c => (
          <CustomRow key={c.id} item={c} autoFocus={c.id === focusId}
            onChange={v => setCustom(c.id, v)} onRemove={() => removeCustom(c.id)} />
        ))}
        <AddCustomButton onClick={() => addCustom(cat.name)} />
      </PickerCategory>
    );
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 64px" }}>
      <div style={{ ...cardStyle(T.blue600), padding: "20px 22px", marginBottom: 16 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px", fontSize: 19, color: T.ink }}>
          <Icon name="mail" size={18} style={{ color: T.blue600 }} />
          Follow-Up Call Email
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: T.gray600 }}>
          Drop in the Follow-Up Tracker you filled out during the call, then choose and reword the outstanding items. The
          summary email is composed here for you to paste into Outlook — nothing is sent or saved.
        </p>
      </div>

      {/* 1 — the tracker */}
      <div style={{ ...cardStyle(), padding: "20px 22px", marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15.5, color: T.ink }}>1 &nbsp;Add the filled-in tracker</h3>
        <div
          role="button" tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
          style={{
            border: `2px dashed ${drag ? T.blue600 : T.gray300}`, borderRadius: T.radius,
            background: drag ? T.blue50 : T.gray50, padding: "32px 20px", textAlign: "center", cursor: "pointer",
          }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 3 }}>
            {busy ? "Reading…" : "Drop the tracker here"}
          </div>
          <div style={{ fontSize: 13.5, color: T.gray600 }}>or click to choose the .xlsx you filled in during the call</div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }}
          onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />

        {error && note("err", <><b>Couldn't read that file.</b> {error}</>)}

        {parsed && (
          <>
            {note("ok", <><b>{parsed.meta.Location || "Tracker"}</b> — {parsed.total} findings across {parsed.categories.length} sections.</>)}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {count(parsed.verified,    "Corrected",   T.success, T.successBg, T.successBorder)}
              {count(parsed.reported,    "Pending",     T.warning, T.warningBg, "#f0d68a")}
              {count(parsed.outstanding, "Outstanding", T.error,   T.errorBg,   T.errorBorder)}
            </div>

            {parsed.blanks.length > 0 && note("warn",
              <>
                <b>{parsed.blanks.length} finding{parsed.blanks.length === 1 ? " has" : "s have"} no Yes / No / Pending answer.</b>{" "}
                They are counted as <b>outstanding</b>, not as corrected. Fill in the Corrected? column for these rows and drop the
                file in again — your picks and wording are kept.
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {parsed.blanks.slice(0, 6).map(b => <li key={b}>{b}</li>)}
                  {parsed.blanks.length > 6 && <li>…and {parsed.blanks.length - 6} more</li>}
                </ul>
              </>)}

            {parsed.legacy && note("warn",
              <><b>Older tracker format.</b> Section names are coming from the sheet tabs, which Excel truncates, so some may read oddly. Re-export the tracker to get the full names.</>)}

            {parsed.mismatches > 0 && note("warn",
              <><b>{parsed.mismatches} finding{parsed.mismatches === 1 ? " was" : "s were"} marked compliant on the location's own self-audit but failed on your visit.</b>{" "}
                This is not mentioned in the email — raise it directly if it matters.</>)}
          </>
        )}
      </div>

      {parsed && (
        <>
          {/* 2 — what goes in the outstanding list */}
          <div style={{ ...cardStyle(), padding: "20px 22px", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15.5, color: T.ink }}>2 &nbsp;Choose the outstanding items</h3>
            <p style={{ margin: 0, fontSize: 13, color: T.gray600 }}>
              Every outstanding finding starts in the email — untick any you'd rather raise another way, and reword any that
              need it. Corrected and pending findings are counted, not listed.
              {" "}<b style={{ color: listedCount ? T.blue600 : T.gray600 }}>{listedCount} in the email.</b>
            </p>
            {parsed.outstanding === 0 && note("info",
              <>Nothing is outstanding on this tracker, so the email shows the all-clear message. Add a category below if
                there's still something to call out.</>)}
            {leftOut > 0 && note("info",
              <><b>{leftOut} outstanding finding{leftOut === 1 ? " is" : "s are"} left out of the list.</b>{" "}
                {leftOut === 1 ? "It's" : "They're"} still counted in the email's totals.</>)}

            <div style={{ marginTop: 14 }}>
              {categories.map(renderCategory)}
              <AddCategoryRow value={newCategory} onChange={setNewCategory} onAdd={addCategory} canAdd={canAddCategory} />
            </div>
          </div>

          {/* 3 — greeting, call details, wording */}
          <div style={{ ...cardStyle(), padding: "20px 22px", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15.5, color: T.ink }}>3 &nbsp;Greeting, call details and wording</h3>

            {/* The opening is written here, not in Outlook: editing pasted HTML
                there is what knocks the formatting out of shape. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              <TextBlock id="fu-text-salutation" label="Salutation" multiline={false} value={txt("salutation")}
                placeholder="e.g. Good afternoon Sarah," overridden={has(d.text, "salutation")}
                onChange={v => setText("salutation", v)} onReset={() => resetText("salutation")}
                hint={`Add the manager's name, e.g. "Good afternoon Sarah,". Clear it to start straight with the greeting.`} />
              {textBlock("greeting", "Greeting")}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              {field("callDate", "Follow-up call date", "e.g. September 8, 2026")}
              {field("nextStep", "Next checkpoint (blank to hide)", "e.g. Friday, September 26 · 2:00 PM PT")}
              {sigField("phone", "Your cell", "(000) 000-0000")}
              {sigField("email", "Your email", "you@rotech.com")}
            </div>
            {parsed.meta["Export Date"] && (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: T.gray600 }}>
                The call date is prefilled from the tracker's export date ({parsed.meta["Export Date"]}) — correct it if the call was another day.
              </p>
            )}
            <div style={{ fontSize: 12, color: T.gray500, marginTop: 4 }}>Cell and email are remembered on this device for both emails.</div>

            <div style={{ marginTop: 18 }}>
              <div style={{ ...metaLabel, marginBottom: 0 }}>Follow-Up Checklist link</div>
              {checklistSection}
            </div>

            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: T.blue600 }}>Edit the rest of the email's wording</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
                {[
                  ["summaryIntro", "Summary lead-in", true],
                  ["outstandingIntro", "Outstanding list lead-in", blocks.length > 0],
                  ["allClear", "All-clear message", allClear],
                  ["checklistNote", "Follow-Up Checklist note", !!checklistUrl],
                  ["encouragement", "Encouragement", true],
                  ["closing", "Closing", true],
                ].filter(([, , shown]) => shown)
                  .map(([k, label]) => textBlock(k, label, k === "outstandingIntro" || k === "checklistNote" ? 2 : 3))}
                <div style={{ fontSize: 12, color: T.gray500 }}>Leave a blank line to start a new paragraph.</div>
              </div>
            </details>
          </div>

          {/* 4 — hand off to Outlook */}
          <EmailOutputCard step="4" html={html} title="Follow-up email preview">
            {parsed.outstanding > 0 && blocks.length === 0 && (
              <div style={{ background: T.warningBg, color: T.warning, borderRadius: T.radius, padding: "9px 13px", fontSize: 13, marginBottom: 12 }}>
                No outstanding items are ticked, so the outstanding list is left out of the email — its totals still show {parsed.outstanding} outstanding.
              </div>
            )}
          </EmailOutputCard>
        </>
      )}
    </div>
  );
}
