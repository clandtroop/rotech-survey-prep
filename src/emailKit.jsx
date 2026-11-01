import { useEffect, useRef, useState } from "react";
import { T, cardStyle, btnPrimary, btnOutline } from "./theme";

// ─── SHARED EMAIL PLUMBING ───────────────────────────────────────────────────
// The After Visit email and the Follow-Up Call email are both composed here in
// the app and handed to the specialist's own Outlook by copy and paste — never
// sent by the application. This module holds what the two have in common: the
// HTML escaping, the signature card, the remembered cell/email, and the
// preview-and-copy card.
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
