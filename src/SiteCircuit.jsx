import { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, setDoc, query as fsQuery, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { T, cardStyle, Icon, metaLabel, metaField, btnPrimary, btnOutline } from "./theme";
import {
  PLANNER_ADMIN_EMAILS, ENTRIES_COLLECTION, MONTH_NAMES,
  VISIT_MODES, VISIT_CONFIRMATIONS, visitModeOf, visitConfirmationOf,
  formatDate, formatRange, todayIso, monthKey, isMultiDay,
} from "./teamPlannerData";

// ─── SITE CIRCUIT ────────────────────────────────────────────────────────────
// Turns the month's scheduled site visits into one consolidated email to the
// Division VP, replacing the practice of CC'ing leadership on every individual
// location notification.
//
// It deliberately owns no visit data. Site visits are already recorded in the
// Team Planner (teamPlannerEntries with status "site_visit"), and a second
// list would mean logging every trip twice and having the two disagree — which
// is exactly the failure the standalone Site Circuit page had, where each
// person's browser held a different schedule and Export/Import JSON was the
// only way to reconcile them. This module reads those entries, adds the two
// fields the email needs (mode and confirmation, both edited in the planner or
// inline here), and writes nothing else.
//
// Because the underlying documents are teamPlannerEntries, permissions come
// free from the rules already in place: everyone signed in reads the whole
// team's schedule, you may only change your own entries, and admins may fix
// anyone's. No new collection, no new rules.
//
// Recipients (VP name/email, CC list) stay in localStorage: they are a
// per-specialist preference rather than team data, so keeping them local
// avoids a collection and a rules block for three strings.
// ─────────────────────────────────────────────────────────────────────────────

const RECIPIENTS_KEY = "siteCircuit.recipients";

const CONFIRMATION_STYLE = {
  scheduled:          { fg: T.warning, bg: T.warningBg },
  confirmed:          { fg: T.success, bg: T.successBg },
  "needs-reschedule": { fg: T.error,   bg: T.errorBg },
};

// Mail clients silently truncate very long mailto: URLs (Outlook has
// historically cut off around 2,000 characters), which would drop visits off
// the bottom of the message without saying so. Past this the button still
// works, but we steer toward "Copy email text", which has no such limit.
const MAILTO_SAFE_LENGTH = 1900;

// "2026-09" → "September 2026". Built from the parts rather than
// new Date("2026-09"), which parses as UTC midnight and renders as August
// anywhere west of Greenwich — i.e. for this entire team.
function monthLabel(key) {
  const [y, m] = String(key).split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function loadRecipients() {
  try {
    const raw = localStorage.getItem(RECIPIENTS_KEY);
    return raw ? JSON.parse(raw) : { vpName: "", vpEmail: "", cc: "" };
  } catch {
    return { vpName: "", vpEmail: "", cc: "" };
  }
}

// ─── EMAIL ───────────────────────────────────────────────────────────────────

function whenOf(entry) {
  const range = isMultiDay(entry)
    ? formatRange(entry.startDate, entry.endDate)
    : formatDate(entry.startDate, { weekday: "short", month: "short", day: "numeric" });
  return entry.visit?.time ? `${range} ${entry.visit.time}` : range;
}

function visitLine(entry) {
  const confirmation = VISIT_CONFIRMATIONS.find(c => c.id === visitConfirmationOf(entry))?.label || "Scheduled";
  return `  - ${entry.visit?.location || "Untitled location"} | ${whenOf(entry)}` +
    ` | Lead: ${entry.personName || "TBD"} | ${confirmation}` +
    `${entry.notes ? ` | ${entry.notes}` : ""}`;
}

function buildEmail({ key, onsite, virtual, recipients, senderName }) {
  const label = monthLabel(key);
  const block = (title, items) =>
    items.length === 0
      ? `${title.toUpperCase()}\n  None scheduled.\n`
      : `${title.toUpperCase()}\n${items.map(visitLine).join("\n")}\n`;

  const vpFirst = (recipients.vpName || "").trim().split(/\s+/)[0];
  const subject = `Site Visit Schedule – ${label}`;
  const body =
    `Hi ${vpFirst || "[VP Name]"},\n\n` +
    `Below is the summary of scheduled site audits/inspections for ${label}, covering both virtual and onsite visits. ` +
    `This is a consolidated view for your awareness — individual location notifications go out separately to each site.\n\n` +
    block("Virtual visits", virtual) + "\n" +
    block("Onsite visits", onsite) + "\n" +
    `Total: ${virtual.length} virtual, ${onsite.length} onsite scheduled this month.\n\n` +
    `Let me know if you'd like more detail on any location, or if any dates need to shift.\n\n` +
    `Best,\n${senderName || "[Your Name]"}`;

  return { subject, body };
}

// ─── VISIT ROW ───────────────────────────────────────────────────────────────

function VisitRow({ entry, canEdit, onPatch }) {
  const confirmation = visitConfirmationOf(entry);
  const style = CONFIRMATION_STYLE[confirmation] || CONFIRMATION_STYLE.scheduled;

  return (
    <li style={{ listStyle: "none", border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: "12px 13px", background: T.white }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.3 }}>
        {entry.visit?.location || "Untitled location"}
      </div>
      <div style={{ fontSize: 12.5, color: T.gray600, marginTop: 3 }}>
        {whenOf(entry)} · {entry.personName || "Unassigned"}
      </div>
      {entry.visit?.purpose && (
        <div style={{ fontSize: 12.5, color: T.gray600, marginTop: 3 }}>{entry.visit.purpose}</div>
      )}
      {entry.notes && (
        <div style={{ fontSize: 12.5, color: T.gray600, fontStyle: "italic", marginTop: 5 }}>{entry.notes}</div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 9 }}>
        {canEdit ? (
          <>
            {/* Mode and confirmation are editable in place: the whole point of
                this screen is a last pass over the month before the email goes
                out, and bouncing to the planner to change one dropdown would
                make that pass slower than editing the email by hand. */}
            <select aria-label="Visit mode" value={visitModeOf(entry)}
              onChange={e => onPatch(entry, { mode: e.target.value })}
              style={{ ...metaField, width: "auto", padding: "5px 8px", fontSize: 12.5 }}>
              {VISIT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select aria-label="Confirmation status" value={confirmation}
              onChange={e => onPatch(entry, { confirmation: e.target.value })}
              style={{ ...metaField, width: "auto", padding: "5px 8px", fontSize: 12.5, color: style.fg, fontWeight: 700 }}>
              {VISIT_CONFIRMATIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: T.radiusPill,
            textTransform: "uppercase", letterSpacing: "0.03em", color: style.fg, background: style.bg }}>
            {VISIT_CONFIRMATIONS.find(c => c.id === confirmation)?.label}
          </span>
        )}
      </div>
    </li>
  );
}

// ─── MODULE ──────────────────────────────────────────────────────────────────

export default function SiteCircuit({ onOpenPlanner }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recipients, setRecipients] = useState(loadRecipients);
  const [flag, setFlag] = useState("");
  const [key, setKey] = useState(() => monthKey(todayIso()));

  const email = auth.currentUser?.email || "";
  const senderName = auth.currentUser?.displayName || "";
  const isAdmin = PLANNER_ADMIN_EMAILS.includes(email);

  // Scoped to the month in view. Date strings are YYYY-MM-DD, so a lexical
  // range over the month prefix selects it exactly, and paging months is one
  // small query rather than a read of the whole planner.
  useEffect(() => {
    setLoading(true);
    setError("");
    const q = fsQuery(
      collection(db, ENTRIES_COLLECTION),
      where("startDate", ">=", `${key}-01`),
      where("startDate", "<=", `${key}-31`),
    );
    return onSnapshot(q, s => {
      setEntries(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, e => {
      setError(e?.message || "Could not load the visit schedule.");
      setLoading(false);
    });
  }, [key]);

  const byMode = useMemo(() => {
    const visits = entries
      .filter(e => e.status === "site_visit")
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    return {
      onsite:  visits.filter(e => visitModeOf(e) === "onsite"),
      virtual: visits.filter(e => visitModeOf(e) === "virtual"),
    };
  }, [entries]);

  const { subject, body } = useMemo(
    () => buildEmail({ key, onsite: byMode.onsite, virtual: byMode.virtual, recipients, senderName }),
    [key, byMode, recipients, senderName],
  );

  const canEdit = entry => isAdmin || (!!entry.ownerEmail && entry.ownerEmail === email);

  // Merge-writes only the visit map. ownerEmail is untouched and survives the
  // merge, which is what keeps this inside the existing teamPlannerEntries
  // update rule (owner on both sides, or admin).
  async function patchVisit(entry, patch) {
    try {
      await setDoc(doc(db, ENTRIES_COLLECTION, entry.id), {
        visit: { ...entry.visit, ...patch },
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      setError(e?.message || "Could not update that visit.");
    }
  }

  function persistRecipients() {
    try { localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(recipients)); } catch { /* storage blocked */ }
    flash("Saved");
  }

  function flash(text, ms = 1600) {
    setFlag(text);
    setTimeout(() => setFlag(""), ms);
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text)
      .then(() => flash(label))
      .catch(() => flash("Couldn't copy — select the text and copy manually", 3000));
  }

  const mailtoUrl = useMemo(() => {
    const params = [];
    if (recipients.cc) params.push(`cc=${encodeURIComponent(recipients.cc)}`);
    params.push(`subject=${encodeURIComponent(subject)}`);
    params.push(`body=${encodeURIComponent(body)}`);
    return `mailto:${encodeURIComponent(recipients.vpEmail || "")}?${params.join("&")}`;
  }, [recipients, subject, body]);

  function openEmail() {
    if (!recipients.vpEmail) { flash("Add the VP's email under Recipients first", 2600); return; }
    window.location.href = mailtoUrl;
  }

  const panel = (mode) => {
    const meta = VISIT_MODES.find(m => m.id === mode);
    const items = byMode[mode];
    const accent = mode === "onsite" ? T.warning : T.blue600;
    return (
      <section style={{ ...cardStyle(accent), flex: "1 1 320px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "16px 18px", borderBottom: `1px solid ${T.gray200}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            {meta.label} visits
            <span style={{ fontSize: 12, color: T.gray600, background: T.gray100, borderRadius: T.radiusPill,
              padding: "2px 9px", fontWeight: 700 }}>{items.length}</span>
          </div>
        </div>
        <ul style={{ margin: 0, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.length === 0 ? (
            <li style={{ listStyle: "none", padding: "26px 18px", textAlign: "center", color: T.gray500, fontSize: 13 }}>
              No {meta.label.toLowerCase()} visits scheduled this month.
            </li>
          ) : items.map(e => (
            <VisitRow key={e.id} entry={e} canEdit={canEdit(e)} onPatch={patchVisit} />
          ))}
        </ul>
      </section>
    );
  };

  const total = byMode.onsite.length + byMode.virtual.length;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em" }}>Site Circuit</div>
          <div style={{ fontSize: 14, color: T.gray600, marginTop: 2, maxWidth: "62ch" }}>
            One consolidated schedule email to leadership, built from the site visits already
            on the Team Planner — instead of CC'ing them on every location notification.
          </div>
        </div>
        <div>
          <label style={metaLabel} htmlFor="sc-month">Month</label>
          <input id="sc-month" type="month" value={key} onChange={e => e.target.value && setKey(e.target.value)}
            style={{ ...metaField, width: "auto", minWidth: 170 }} />
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error,
          borderRadius: T.radius, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: T.gray500, fontSize: 14, padding: "40px 0", textAlign: "center" }}>Loading the visit schedule…</div>
      ) : (
        <>
          {total === 0 && (
            <div style={{ ...cardStyle(T.gray300), padding: "18px 20px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13.5, color: T.gray600, flex: "1 1 320px" }}>
                No site visits are on the Team Planner for {monthLabel(key)}. Visits are scheduled there —
                add them with the <strong>Site Visit</strong> status and they appear here automatically.
              </div>
              {onOpenPlanner && <button onClick={onOpenPlanner} style={btnOutline}>Open Team Planner</button>}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            {panel("virtual")}
            {panel("onsite")}
          </div>

          {/* Recipients */}
          <div style={{ ...cardStyle(T.gray600), marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: "16px 18px", borderBottom: `1px solid ${T.gray200}`, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Recipients</div>
              <span style={{ fontSize: 12, color: T.gray500 }}>Yours alone, saved on this device — set once</span>
            </div>
            <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              <div>
                <label style={metaLabel} htmlFor="sc-vp-name">Division VP name</label>
                <input id="sc-vp-name" value={recipients.vpName} placeholder="e.g. Jordan Reyes" style={metaField}
                  onChange={e => setRecipients({ ...recipients, vpName: e.target.value })} />
              </div>
              <div>
                <label style={metaLabel} htmlFor="sc-vp-email">Division VP email (To:)</label>
                <input id="sc-vp-email" type="email" value={recipients.vpEmail} placeholder="vp@rotech.com" style={metaField}
                  onChange={e => setRecipients({ ...recipients, vpEmail: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={metaLabel} htmlFor="sc-cc">CC — Region Manager, Area Manager, etc. (comma-separated)</label>
                <input id="sc-cc" value={recipients.cc} placeholder="regionmgr@rotech.com, areamgr@rotech.com" style={metaField}
                  onChange={e => setRecipients({ ...recipients, cc: e.target.value })} />
              </div>
            </div>
            <div style={{ padding: "0 18px 16px" }}>
              <button onClick={persistRecipients} style={btnPrimary}>Save recipients</button>
            </div>
          </div>

          {/* Generated email */}
          <div style={{ ...cardStyle(T.blue700), marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: "16px 18px", borderBottom: `1px solid ${T.gray200}`, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="mail" size={16} style={{ color: T.blue700 }} />
                Leadership notification — ready to send
              </div>
              <span style={{ fontSize: 12, color: T.gray500 }}>Subject: {subject}</span>
            </div>
            <pre style={{ margin: 0, padding: "16px 18px", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6,
              color: T.ink, maxHeight: 420, overflow: "auto", fontFamily: "inherit" }}>{body}</pre>
            <div style={{ display: "flex", gap: 8, padding: "0 18px 16px", flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={openEmail} style={btnPrimary}>Open email (To/CC prefilled)</button>
              <button onClick={() => copy(`Subject: ${subject}\n\n${body}`, "Copied")} style={btnOutline}>Copy email text</button>
              <button onClick={() => copy(subject, "Subject copied")} style={btnOutline}>Copy subject line</button>
              {flag && <span style={{ fontSize: 12.5, color: T.success, fontWeight: 600 }}>{flag}</span>}
            </div>
            {mailtoUrl.length > MAILTO_SAFE_LENGTH && (
              <div style={{ margin: "0 18px 16px", background: T.warningBg, color: T.warning, borderRadius: T.radius,
                padding: "9px 12px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name="alert-circle" size={14} />
                This month's schedule is long enough that some mail clients may truncate it — use “Copy email text” and paste into a new message instead.
              </div>
            )}
          </div>

          <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${T.gray200}`,
            fontSize: 12.5, color: T.gray600, lineHeight: 1.6 }}>
            <strong style={{ color: T.ink }}>Where this data comes from:</strong> every visit above is a Team
            Planner entry with the <strong>Site Visit</strong> status, so there is one schedule and nothing to
            keep in sync. Mode and confirmation can be changed here or in the planner; you can edit the visits
            you own, and admins can fix anyone's.
          </div>
        </>
      )}
    </div>
  );
}
