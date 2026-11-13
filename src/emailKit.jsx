import { useEffect, useRef, useState } from "react";
import { T, cardStyle, Icon, metaLabel, metaField, btnPrimary, btnOutline } from "./theme";

// ─── SHARED EMAIL PLUMBING ───────────────────────────────────────────────────
// The After Visit email and the Follow-Up Call email are both composed here in
// the app and handed to the specialist's own Outlook by copy and paste — never
// sent by the application. This module holds what the two have in common: the
// HTML escaping, the signature card, the remembered cell/email, the finding
// picker's pieces, and the preview-and-copy card.
// ─────────────────────────────────────────────────────────────────────────────

export const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();

export const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Escaped text with the specialist's own line breaks kept: a blank line starts
// a new paragraph, a single newline becomes <br>. Returns an array of
// paragraph HTML strings so the caller chooses the wrapping element.
export function paragraphsHtml(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => esc(p).replace(/\n/g, "<br>"));
}

// The blue label/value grid under the email banner. Two fields to a row; an
// odd count would otherwise leave a dead half-row, so a lone last field spans
// the width instead. Empty values are dropped.
export function infoGridHtml(cells) {
  const shown = cells.filter(([, v]) => clean(v));
  const cell = ([label, value], { wide, rule }) => `
    <td ${wide ? 'colspan="2" width="100%"' : 'width="50%"'} valign="top" style="padding:14px 28px;background:#dde8f3;border-bottom:1px solid #cfdcea;${
      rule ? "border-right:1px solid #cfdcea;" : ""}">
      <div style="font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#6f8199;margin-bottom:2px;">${esc(label)}</div>
      <div style="font-size:15px;font-weight:700;color:#0d2947;">${esc(value)}</div>
    </td>`;
  const rows = [];
  for (let i = 0; i < shown.length; i += 2) {
    const lone = i + 1 >= shown.length;
    rows.push(`<tr>${cell(shown[i], { wide: lone, rule: !lone })}${
      lone ? "" : cell(shown[i + 1], { wide: false, rule: false })}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join("")}</table>`;
}

// ─── signature ───────────────────────────────────────────────────────────────
// Cell and email are the only signature fields the app does not already know
// (the name comes from the signed-in account or the tracker). They are kept in
// this browser's localStorage, not on the server: they belong to the person,
// not to any visit, and re-typing them for every email was the friction.

const SIGNATURE_KEY = "rsp.emailSignature.v1";

export function loadSignature() {
  try {
    const s = JSON.parse(localStorage.getItem(SIGNATURE_KEY) || "{}");
    return { phone: typeof s.phone === "string" ? s.phone : "", email: typeof s.email === "string" ? s.email : "" };
  } catch {
    return { phone: "", email: "" };
  }
}

export function saveSignature(sig) {
  try { localStorage.setItem(SIGNATURE_KEY, JSON.stringify({ phone: sig.phone || "", email: sig.email || "" })); }
  catch { /* private mode / storage full — the fields still work for this session */ }
}

// Inline styles throughout: the markup has to survive Outlook, which ignores
// <style> blocks in pasted content.
export function signatureHtml({ name, phone, email }) {
  return `
  <div style="background:#292929;border-radius:0 0 8px 8px;padding:18px 28px 20px;">
    <div style="font-size:14.5px;font-weight:700;"><span style="color:#d3e0ff;">${esc(name || "")}</span><span style="color:#7d8699;font-weight:400;padding:0 6px;">|</span><span style="color:#7dadff;">Accreditation Specialist</span></div>
    <div style="font-size:13.5px;font-weight:700;color:#9ec2ff;margin-top:2px;">Rotech Healthcare</div>
    ${clean(phone) ? `<div style="font-size:13.5px;font-weight:700;color:#9ec2ff;margin-top:2px;">Cell: ${esc(phone)}</div>` : ""}
    ${clean(email) ? `<div style="font-size:13.5px;font-weight:700;color:#9ec2ff;margin-top:2px;">Email: ${esc(email)}</div>` : ""}
    <div style="font-size:13.5px;font-weight:700;font-style:italic;margin-top:14px;"><span style="color:#e7a7ff;">Accreditation = </span><span style="color:#ffcc00;">$$$</span><span style="color:#5ec18b;"> For Services Rendered</span></div>
  </div>`;
}

// ─── finding picker ──────────────────────────────────────────────────────────
// Both emails let the specialist choose which findings are listed, reword each
// one, add their own items and categories, and rewrite any paragraph. These
// are the controls they share; each email keeps its own draft shape.

export const linkBtn = {
  background: "none", border: "none", padding: 0, color: T.blue600, fontSize: 12.5,
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
export const smallBtn = { ...btnOutline, padding: "4px 10px", fontSize: 12 };
export const checkbox = { marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: T.blue600, cursor: "pointer" };
const textareaStyle = { ...metaField, fontSize: 13.5, lineHeight: 1.45, resize: "vertical", minHeight: 44 };

// A finding's wording in the email until the specialist rewrites it.
export const findingText = f => [f.prefix, f.text, f.comment].map(clean).filter(Boolean).join(" — ");

// One editable paragraph (or, with multiline off, one line) of an email, with
// a reset that only shows once it differs from the default.
export function TextBlock({ id, label, value, overridden, onChange, onReset, rows = 3, hint, multiline = true, placeholder }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <label htmlFor={id} style={metaLabel}>{label}</label>
        {overridden && <button onClick={onReset} style={linkBtn}>Reset to default</button>}
      </div>
      {multiline
        ? <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={textareaStyle} />
        : <input id={id} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={metaField} />}
      {hint && <div style={{ fontSize: 12, color: T.gray500, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function FindingRow({ f, checked, value, edited, onToggle, onEdit, onReset }) {
  return (
    <div style={{
      padding: "8px 10px", borderRadius: T.radius,
      background: checked ? T.blue50 : "transparent", border: `1px solid ${checked ? "#c5d9ef" : "transparent"}`,
    }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={checkbox} />
        <span style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.45 }}>
          {f.prefix && <b>{f.prefix} — </b>}
          {f.text}
          {f.comment && <span style={{ color: T.gray600 }}> — {f.comment}</span>}
          {f.source && <span style={{ display: "block", fontSize: 11.5, color: T.gray500, marginTop: 1 }}>{f.source}</span>}
        </span>
      </label>
      {checked && (
        <div style={{ marginLeft: 26, marginTop: 6 }}>
          <textarea aria-label="Wording in the email" rows={2} value={value}
            onChange={e => onEdit(e.target.value)} style={textareaStyle} />
          {edited && <button onClick={onReset} style={{ ...linkBtn, marginTop: 3 }}>Reset wording</button>}
        </div>
      )}
    </div>
  );
}

export function CustomRow({ item, autoFocus, onChange, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: T.radius, background: T.blue50, border: "1px solid #c5d9ef" }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: T.blue600, marginTop: 9, minWidth: 44 }}>Custom</span>
      <textarea aria-label="Custom item wording" rows={2} value={item.text} autoFocus={autoFocus}
        placeholder="Describe the finding as it should read in the email"
        onChange={e => onChange(e.target.value)} style={{ ...textareaStyle, flex: 1 }} />
      <button onClick={onRemove} aria-label="Remove custom item" title="Remove"
        style={{ ...linkBtn, color: T.gray500, marginTop: 8 }}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export function AddCustomButton({ onClick }) {
  return (
    <div style={{ padding: "4px 10px" }}>
      <button onClick={onClick} style={{ ...linkBtn, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="plus" size={14} /> Add custom item
      </button>
    </div>
  );
}

// A collapsible category in the picker: its name and count, any actions on
// the right (All / None, Remove category, …), and its rows when open.
export function PickerCategory({ name, countLabel, open, onToggle, actions, children }) {
  return (
    <div style={{ borderTop: `1px solid ${T.gray200}`, padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onToggle} aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} style={{ color: T.gray500 }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.blue800 }}>{name}</span>
          <span style={{ fontSize: 12, color: T.gray500, fontWeight: 600 }}>· {countLabel}</span>
        </button>
        {actions && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function AddCategoryRow({ value, onChange, onAdd, canAdd }) {
  return (
    <div style={{ borderTop: `1px solid ${T.gray200}`, paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input aria-label="New category name" placeholder="New category, e.g. Signage" value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
        style={{ ...metaField, width: 260, fontSize: 13.5, padding: "7px 10px" }} />
      <button onClick={onAdd} disabled={!canAdd}
        style={{ ...smallBtn, padding: "7px 12px", opacity: canAdd ? 1 : 0.5, cursor: canAdd ? "pointer" : "default" }}>
        Add category
      </button>
    </div>
  );
}

// ─── copy / open ─────────────────────────────────────────────────────────────

// Selection + execCommand rather than writing HTML to the clipboard directly:
// copying a rendered selection is what produces the inline-styled markup
// Outlook pastes faithfully. ClipboardItem is the fallback for browsers that
// have dropped execCommand. Resolves to the message to show the specialist.
export async function copyRenderedEmail(frame) {
  const doc = frame?.contentDocument;
  const node = doc?.getElementById("report");
  if (!node) return "Couldn't copy — use Open in new tab, then Ctrl+A and Ctrl+C";
  try {
    const range = doc.createRange();
    range.selectNodeContents(node);
    const sel = frame.contentWindow.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    const ok = doc.execCommand("copy");
    sel.removeAllRanges();
    if (ok) return "Copied — now paste into Outlook";
  } catch { /* fall through */ }
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html":  new Blob([node.outerHTML], { type: "text/html" }),
      "text/plain": new Blob([node.innerText || ""], { type: "text/plain" }),
    })]);
    return "Copied — now paste into Outlook";
  } catch {
    return "Couldn't copy — use Open in new tab, then Ctrl+A and Ctrl+C";
  }
}

export function openHtmlInTab(html) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── the hand-off card ───────────────────────────────────────────────────────
// Rendered in an iframe so the app's own stylesheet cannot leak into a message
// that will live in Outlook.

export function EmailOutputCard({ step, html, title, children }) {
  const frameRef = useRef(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(""), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div style={{ ...cardStyle(), padding: "20px 22px" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15.5, color: T.ink }}>{step} &nbsp;Copy it into Outlook</h3>
      {children}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={async () => setCopied(await copyRenderedEmail(frameRef.current))} style={btnPrimary}>Copy email</button>
        <button onClick={() => openHtmlInTab(html)} style={btnOutline}>Open in new tab</button>
        {copied && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: copied.startsWith("Copied") ? T.success : T.error }}>{copied}</span>}
      </div>
      <p style={{ margin: "9px 0 14px", fontSize: 12.5, color: T.gray600 }}>
        Click <b>Copy email</b>, then open a new message in Outlook and press Ctrl+V. If the formatting doesn't come through,
        use <b>Open in new tab</b>, press Ctrl+A then Ctrl+C, and paste that instead.
      </p>
      <iframe ref={frameRef} title={title} srcDoc={html}
        style={{ width: "100%", height: 620, border: `1px solid ${T.gray200}`, borderRadius: T.radius, background: T.white }} />
    </div>
  );
}
