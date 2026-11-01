import { useState } from "react";
import { T } from "./theme";
import { loadSignature, saveSignature } from "./emailKit";
import AfterVisitEmail from "./AfterVisitEmail";
import FollowUpEmail from "./FollowUpEmail";

// ─── EMAILS TAB ──────────────────────────────────────────────────────────────
// One home for the two emails a location manager gets from a survey prep:
//
//   After Visit    — right after the on-site visit, built from the open visit
//   Follow-Up Call — after the Teams follow-up, built from the uploaded tracker
//
// Both are composed in the app and pasted into Outlook. The signature's cell
// and email are owned here so both modes share one remembered copy.
// ─────────────────────────────────────────────────────────────────────────────

const MODE_KEY = "rsp.emails.mode";
const MODES = [
  ["afterVisit", "After Visit"],
  ["followUp",   "Follow-Up Call"],
];

function loadMode() {
  try { return localStorage.getItem(MODE_KEY) === "followUp" ? "followUp" : "afterVisit"; }
  catch { return "afterVisit"; }
}

export default function Emails({ afterVisit }) {
  const [mode, setModeState] = useState(loadMode);
  const [signature, setSignatureState] = useState(loadSignature);

  const setMode = m => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* remembered for this session only */ }
  };
  const setSignature = sig => { setSignatureState(sig); saveSignature(sig); };

  return (
    <div>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 12px" }}>
        <div role="tablist" aria-label="Which email"
          style={{ display: "inline-flex", background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: 3, boxShadow: T.shadowSoft }}>
          {MODES.map(([key, label]) => {
            const on = mode === key;
            return (
              <button key={key} role="tab" aria-selected={on} onClick={() => setMode(key)}
                style={{
                  padding: "7px 16px", fontSize: 13.5, fontWeight: 700, border: "none", borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                  background: on ? T.blue600 : "transparent", color: on ? T.white : T.gray700,
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "afterVisit"
        ? <AfterVisitEmail {...afterVisit} signature={signature} setSignature={setSignature} />
        : <FollowUpEmail signature={signature} setSignature={setSignature} />}
    </div>
  );
}
