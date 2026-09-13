import { useState, useRef, useMemo, useEffect } from "react";
import { T, cardStyle, Icon, metaLabel, metaField, btnPrimary, btnOutline } from "./theme";

// ─── FOLLOW-UP CALL EMAIL ────────────────────────────────────────────────────
// Turns a filled-in Virtual Follow-Up Tracker into the summary email the
// location manager receives after the follow-up call.
//
// The tracker is exported from a visit (Export Follow-Up XLSX), worked through
// on the Teams call, and dropped back in here. This module reads it, counts the
// corrective actions, and composes the email.
//
// It deliberately owns no data. Nothing here is written to Firestore and no
// collection is added: the file the specialist uploads is the whole input, and
// the email on the clipboard is the whole output. That keeps the feature free
// of new security rules, and — as with Site Circuit — the message is composed
// in the specialist's own Outlook rather than sent by the application, so no
// mail processor enters the architecture.
//
// The tracker's "Corrected?" column is a Yes / No / Pending dropdown, which
// maps onto the three states the email reports:
//
//   Yes      → verified     confirmed on the walkthrough
//   Pending  → reported     manager says done, not yet confirmed
//   No       → outstanding  listed in full, with its note
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

const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();

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
  const JSZip = (await import("jszip")).default;
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

      if (!status || status === "outstanding")
        cat.outstanding.push({ item: note ? `${item} — ${note}` : item });
      else cat[status]++;
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

// ─── the email ───────────────────────────────────────────────────────────────
// Built as a standalone HTML document and rendered in an iframe, so the app's
// own stylesheet cannot leak into a message that will live in Outlook. Styles
// are written inline for the same reason.

const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildEmailHtml(p, form) {
  const loc  = p.meta.Location || "your location";
  const done = p.verified + p.reported;
  const pct  = p.total ? Math.round((done / p.total) * 100) : 0;
  const allClear = p.outstanding === 0;

  const infoCells = [
    ["Location", p.meta.Location], ["City / State", p.meta["City / State"]],
    ["Accreditation Specialist", p.meta.Specialist], ["Original Visit Date", p.meta["Visit Date"]],
    ["Follow-Up Call Date", form.callDate || p.meta["Export Date"]],
  ].filter(([, v]) => clean(v));

  // Two fields to a row. An odd count would otherwise leave a dead half-row,
  // so a lone last field spans the width instead.
  const infoCell = ([label, value], { wide, rule }) => `
    <td ${wide ? 'colspan="2" width="100%"' : 'width="50%"'} valign="top" style="padding:14px 28px;background:#dde8f3;border-bottom:1px solid #cfdcea;${
      rule ? "border-right:1px solid #cfdcea;" : ""}">
      <div style="font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#6f8199;margin-bottom:2px;">${esc(label)}</div>
      <div style="font-size:15px;font-weight:700;color:#0d2947;">${esc(value)}</div>
    </td>`;
  const infoRows = [];
  for (let i = 0; i < infoCells.length; i += 2) {
    const lone = i + 1 >= infoCells.length;
    infoRows.push(`<tr>${infoCell(infoCells[i], { wide: lone, rule: !lone })}${
      lone ? "" : infoCell(infoCells[i + 1], { wide: false, rule: false })}</tr>`);
  }

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

  const outstandingBlocks = p.categories.filter(c => c.outstanding.length).map(c => `
    <div style="margin-bottom:18px;">
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#143a63;margin-bottom:8px;">${esc(c.name)}</div>
      ${c.outstanding.map(o => `
        <div style="border-left:3px solid #d9534f;background:#fbeaea;border-radius:0 4px 4px 0;padding:8px 12px;margin-bottom:6px;font-size:13.5px;color:#24303d;">${esc(o.item)}</div>`).join("")}
    </div>`).join("");

  const body = allClear ? `
    <div style="background:#e8f5ee;border:1px solid #bfe3d0;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:15px;font-weight:700;color:#1e7a4d;margin-bottom:2px;">&#10004; All findings closed out</div>
      <div style="font-size:13.5px;color:#24303d;">Every item from the visit has been corrected and verified. Nothing further is required from your team at this time.</div>
    </div>` : `
    <div style="background:#fff;border:1px solid #dde3ea;border-radius:8px;margin:20px 0;overflow:hidden;">
      <div style="background:#fdf3dc;border-bottom:1px solid #f0d68a;padding:14px 20px;font-size:14.5px;font-weight:700;color:#6b4a10;">&#9888;&#65039; Still outstanding — please close these out:</div>
      <div style="padding:18px 20px 20px;">${outstandingBlocks}</div>
    </div>`;

  const checklist = clean(form.checklist) ? `
    <div style="background:#f7f9fc;border:1px solid #dde3ea;border-radius:8px;padding:14px 20px;margin:20px 0;font-size:13.5px;">
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#143a63;margin-bottom:4px;">Your Follow-Up Checklist</div>
      <a href="${esc(form.checklist)}" style="color:#143a63;font-weight:700;word-break:break-all;">${esc(form.checklist)}</a>
      <div style="color:#6b7686;margin-top:4px;">Keep marking items off as you complete them.</div>
    </div>` : "";

  const nextStep = clean(form.nextStep) ? `
    <div style="background:#fdf3dc;border:1px solid #f0d68a;border-radius:8px;padding:14px 20px;margin:20px 0;">
      <div style="font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#b3781a;margin-bottom:2px;">Next Checkpoint</div>
      <div style="font-size:15px;font-weight:700;color:#6b4a10;">${esc(form.nextStep)}</div>
    </div>` : "";

  const encouragement = allClear
    ? "This is excellent work. Your team turned these around quickly and thoroughly, which puts this location in a strong position going into the survey window."
    : "None of the remaining items are difficult — they just need to be closed out before your survey window opens.";
  const closing = allClear
    ? "As always, reach out any time if questions come up between now and your survey. I'm happy to help."
    : "As always, reach out with any questions as you work through the remaining items. I'm happy to help.";

  const sub = p.reported > 0
    ? `${p.verified} verified on the call, ${p.reported} reported complete and pending verification.`
    : "All corrections confirmed during the walkthrough.";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:32px 16px;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.55;color:#24303d;">
<div id="report" style="max-width:760px;margin:0 auto;">
  <div style="background:#143a63;color:#fff;border-radius:10px 10px 0 0;padding:22px 28px;">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b9cbe0;margin-bottom:4px;">Accreditation Survey Prep</div>
    <div style="font-size:26px;font-weight:700;">Follow-Up Call Summary</div>
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${infoRows.join("")}</table>

  <div style="background:#fff;border:1px solid #dde3ea;border-top:none;padding:24px 28px 8px;">
    <p style="font-size:14.5px;margin:0 0 16px;">Thank you for taking the time to walk through ${esc(loc)} with me today — I appreciate you and your team making the call a priority.</p>
    <p style="font-size:14.5px;margin:0 0 16px;">Below is a summary of where things stand following our call, based on the follow-up tracker we worked through together.</p>
  </div>

  <div style="background:#fff;border:1px solid #dde3ea;border-radius:8px;margin:20px 0;padding:20px 22px;">
    <p style="font-size:17px;font-weight:700;color:#0d2947;margin:0 0 2px;">${done} of ${p.total} findings corrected &middot; ${pct}%</p>
    <p style="font-size:13px;color:#6b7686;margin:0 0 14px;">${esc(sub)}</p>
    ${meter}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;"><tr>${tiles.join("")}</tr></table>
  </div>

  ${body}
  ${checklist}

  <div style="background:#fff;border:1px solid #dde3ea;border-radius:8px;padding:24px 28px 8px;">
    <p style="font-size:14.5px;margin:0 0 16px;">${esc(encouragement)}</p>
  </div>

  ${nextStep}

  <div style="background:#fff;border:1px solid #dde3ea;border-top:none;padding:24px 28px 8px;">
    <p style="font-size:14.5px;margin:0 0 16px;">${esc(closing)}</p>
  </div>

  <div style="background:#292929;border-radius:0 0 8px 8px;padding:18px 28px 20px;">
    <div style="font-size:14.5px;font-weight:700;"><span style="color:#d3e0ff;">${esc(p.meta.Specialist || "")}</span><span style="color:#7d8699;font-weight:400;padding:0 6px;">|</span><span style="color:#7dadff;">Accreditation Specialist</span></div>
    <div style="font-size:13.5px;font-weight:700;color:#9ec2ff;margin-top:2px;">Rotech Healthcare</div>
    ${clean(form.phone) ? `<div style="font-size:13.5px;font-weight:700;color:#9ec2ff;margin-top:2px;">Cell: ${esc(form.phone)}</div>` : ""}
    ${clean(form.email) ? `<div style="font-size:13.5px;font-weight:700;color:#9ec2ff;margin-top:2px;">Email: ${esc(form.email)}</div>` : ""}
    <div style="font-size:13.5px;font-weight:700;font-style:italic;margin-top:14px;"><span style="color:#e7a7ff;">Accreditation = </span><span style="color:#ffcc00;">$$$</span><span style="color:#5ec18b;"> For Services Rendered</span></div>
  </div>

  <div style="text-align:center;color:#6b7686;font-size:11.5px;margin-top:22px;">Rotech Healthcare &middot; Accreditation Survey Prep</div>
</div>
</body></html>`;
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function FollowUpEmail() {
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState({ callDate: "", nextStep: "", phone: "", email: "", checklist: "" });
  const fileRef = useRef(null);
  const frameRef = useRef(null);

  const html = useMemo(() => (parsed ? buildEmailHtml(parsed, form) : ""), [parsed, form]);
  useEffect(() => { if (copied) { const t = setTimeout(() => setCopied(""), 4000); return () => clearTimeout(t); } }, [copied]);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true); setError(""); setCopied("");
    try {
      const next = parseTracker(await readWorkbook(file));
      setParsed(next);
      setForm(f => ({ ...f, callDate: f.callDate || next.meta["Export Date"] || "" }));
    } catch (e) {
      setParsed(null);
      setError(e?.message || "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  // Selection + execCommand rather than writing HTML to the clipboard directly:
  // copying a rendered selection is what produces the inline-styled markup
  // Outlook pastes faithfully. ClipboardItem is the fallback for browsers that
  // have dropped execCommand.
  async function copyEmail() {
    const doc = frameRef.current?.contentDocument;
    const node = doc?.getElementById("report");
    if (!node) return;
    try {
      const range = doc.createRange();
      range.selectNodeContents(node);
      const sel = frameRef.current.contentWindow.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      const ok = doc.execCommand("copy");
      sel.removeAllRanges();
      if (ok) { setCopied("Copied — now paste into Outlook"); return; }
    } catch { /* fall through */ }
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html":  new Blob([node.outerHTML], { type: "text/html" }),
        "text/plain": new Blob([node.innerText || ""], { type: "text/plain" }),
      })]);
      setCopied("Copied — now paste into Outlook");
    } catch {
      setCopied("Couldn't copy — use Open in new tab, then Ctrl+A and Ctrl+C");
    }
  }

  function openInTab() {
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  const field = (key, label, placeholder) => (
    <div>
      <label style={metaLabel} htmlFor={`fu-${key}`}>{label}</label>
      <input id={`fu-${key}`} style={metaField} placeholder={placeholder} value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  const note = (tone, children) => {
    const map = { ok: [T.successBg, T.success], warn: [T.warningBg, T.warning], err: [T.errorBg, T.error] };
    const [bg, fg] = map[tone];
    return (
      <div role={tone === "err" ? "alert" : undefined}
        style={{ background: bg, color: fg, borderRadius: T.radius, padding: "11px 14px", fontSize: 13, marginTop: 12 }}>
        {children}
      </div>
    );
  };

  const count = (n, label, fg, bg, br) => (
    <div style={{ flex: 1, minWidth: 120, background: bg, border: `1px solid ${br}`, borderRadius: T.radius, padding: "10px 13px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: fg }}>{n}</div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: fg, marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 64px" }}>
      <div style={{ ...cardStyle(T.blue600), padding: "20px 22px", marginBottom: 16 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px", fontSize: 19, color: T.ink }}>
          <Icon name="mail" size={18} style={{ color: T.blue600 }} />
          Follow-Up Call Email
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: T.gray600 }}>
          Drop in the Follow-Up Tracker you filled out during the call. The summary email is composed here for you to paste into Outlook — nothing is sent or saved.
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
          onChange={e => handleFile(e.target.files?.[0])} />

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
                They are counted as <b>outstanding</b>, not as corrected. Fill in the Corrected? column for these rows and drop the file in again.
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
          {/* 2 — what the tracker doesn't know */}
          <div style={{ ...cardStyle(), padding: "20px 22px", marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15.5, color: T.ink }}>2 &nbsp;Fill in what the tracker doesn't know</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              {field("callDate", "Follow-up call date", "e.g. September 8, 2026")}
              {field("nextStep", "Next checkpoint (blank to hide)", "e.g. Friday, September 26 · 2:00 PM PT")}
              {field("phone", "Your cell", "(000) 000-0000")}
              {field("email", "Your email", "you@rotech.com")}
            </div>
            <div style={{ marginTop: 12 }}>{field("checklist", "Follow-up checklist link (optional)", "https://…")}</div>
            {parsed.meta["Export Date"] && (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: T.gray600 }}>
                The call date is prefilled from the tracker's export date ({parsed.meta["Export Date"]}) — correct it if the call was another day.
              </p>
            )}
          </div>

          {/* 3 — hand off to Outlook */}
          <div style={{ ...cardStyle(), padding: "20px 22px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15.5, color: T.ink }}>3 &nbsp;Copy it into Outlook</h3>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={copyEmail} style={btnPrimary}>Copy email</button>
              <button onClick={openInTab} style={btnOutline}>Open in new tab</button>
              {copied && <span style={{ fontSize: 13, fontWeight: 600, color: T.success }}>{copied}</span>}
            </div>
            <p style={{ margin: "9px 0 14px", fontSize: 12.5, color: T.gray600 }}>
              Click <b>Copy email</b>, then open a new message in Outlook and press Ctrl+V. If the formatting doesn't come through,
              use <b>Open in new tab</b>, press Ctrl+A then Ctrl+C, and paste that instead.
            </p>
            <iframe ref={frameRef} title="Follow-up email preview" srcDoc={html}
              style={{ width: "100%", height: 620, border: `1px solid ${T.gray200}`, borderRadius: T.radius, background: T.white }} />
          </div>
        </>
      )}
    </div>
  );
}
