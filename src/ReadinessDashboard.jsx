// Location Readiness tab — live semiannual assessment data (OP 541, OP 512,
// JC 427) pulled straight from the Location Readiness Platform's Firestore
// (a separate Firebase project; see src/readiness.js for the how and the
// schema notes). Specialists connect once with their Location Readiness
// Platform account; after that the session persists like the main app's.
import { useEffect, useMemo, useState } from "react";
import { T, cardStyle, Icon, btnPrimary, btnOutline, BRAND } from "./theme";
import {
  onReadinessAuthChanged,
  signInToReadiness,
  signOutOfReadiness,
  fetchReadinessLocations,
  fetchLocationAssessments,
  READINESS_QUARTERS,
  READINESS_FORM_TYPES,
  summarizeAssessment,
  quarterRollup,
} from "./readiness";
import { downloadSubmissionPdf } from "./submissionPdf";

const FORM_META = {
  OP541: { label: "OP 541", subtitle: "Facility Readiness", accent: T.blue600 },
  OP512: { label: "OP 512", subtitle: "Safety Inspection", accent: T.warning },
  JC427: { label: "JC 427", subtitle: "Personnel Records", accent: T.success },
};

const ROLLUP_PILLS = {
  complete: { label: "Complete", bg: T.successBg, fg: T.success, border: T.successBorder },
  partial:  { label: "Partial",  bg: T.warningBg, fg: T.warning, border: T.warning },
  pending:  { label: "Pending",  bg: T.gray100,   fg: T.gray600, border: T.gray300 },
};

function fmtDate(value) {
  if (!value) return "—";
  const d = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function Pill({ label, bg, fg, border }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color: fg, border: `1px solid ${border || bg}` }}>
      {label}
    </span>
  );
}

// One-time connect screen for the readiness project.
function ConnectCard({ onError, error, busy, onSubmit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.gray300}`, borderRadius: T.radius, color: T.ink };

  return (
    <div style={{ maxWidth: 440, margin: "40px auto" }}>
      <div style={{ ...cardStyle(BRAND), padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: BRAND, marginBottom: 4 }}>Connect Location Readiness</div>
        <p style={{ fontSize: 13, color: T.gray600, marginTop: 0 }}>
          This tab shows live semiannual assessment data (OP 541, OP 512, JC 427) from the
          <strong> Location Readiness Platform</strong>, which uses separate accounts. Sign in once
          with your Location Readiness credentials — the connection then stays active on this device.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.gray700, display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={input} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.gray700, display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={input} required />
          </div>
          {error && (
            <div style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, borderRadius: T.radius, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          <button type="submit" disabled={busy} style={{ ...btnPrimary, width: "100%", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
        <p style={{ fontSize: 11, color: T.gray500, marginBottom: 0, marginTop: 12 }}>
          No account? Location Readiness accounts are invite-only — ask an Accreditation Specialist
          admin of that platform for an invite.
        </p>
      </div>
    </div>
  );
}

function FormTile({ type, assessment, locationName, quarter }) {
  const meta = FORM_META[type];
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const summary = assessment ? summarizeAssessment(assessment) : null;
  const rejected = summary?.status === "rejected";

  const statusPill = !summary
    ? { label: "Pending", bg: T.gray100, fg: T.gray600, border: T.gray300 }
    : rejected
      ? { label: "✕ Rejected", bg: T.errorBg, fg: T.error, border: T.errorBorder }
      : { label: "✓ Submitted", bg: T.successBg, fg: T.success, border: T.successBorder };

  const handlePdf = async () => {
    setDownloading(true);
    setPdfError("");
    try {
      await downloadSubmissionPdf(assessment, locationName);
    } catch (err) {
      setPdfError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ ...cardStyle(meta.accent), padding: 16, flex: "1 1 240px", minWidth: 240 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: T.gray500 }}>{meta.subtitle}</div>
        </div>
        <Pill {...statusPill} />
      </div>

      {summary ? (
        <div style={{ marginTop: 12, fontSize: 12, color: T.gray700, display: "grid", gap: 4 }}>
          <div>Submitted: <strong>{fmtDate(summary.submittedAt)}</strong></div>
          <div>{summary.answered} items answered · <span style={{ color: summary.negative > 0 ? T.error : T.success, fontWeight: 700 }}>{summary.negative} negative</span>{summary.positiveRate != null && <> · {summary.positiveRate}% clear</>}</div>
          {summary.employees != null && <div>{summary.employees} employee{summary.employees === 1 ? "" : "s"} reviewed</div>}
          {summary.flaggedSections.length > 0 && (
            <div style={{ color: T.warning, fontWeight: 600 }} title={summary.flaggedSections.map(s => `${s.label} (${s.negative} negative)`).join("\n")}>
              ⚠ {summary.flaggedSections.length} section{summary.flaggedSections.length === 1 ? " needs" : "s need"} corrective action
            </div>
          )}
          {rejected && assessment.rejectionReason && (
            <div style={{ color: T.error }}>Reason: {assessment.rejectionReason}</div>
          )}
          <button onClick={handlePdf} disabled={downloading} style={{ ...btnOutline, marginTop: 8, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, opacity: downloading ? 0.7 : 1 }}>
            <Icon name="file-text" size={14} /> {downloading ? "Generating…" : "Download PDF"}
          </button>
          {pdfError && <div style={{ color: T.error, fontSize: 11 }}>{pdfError}</div>}
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 12, color: T.gray500 }}>
          Not submitted for {quarter}.
        </div>
      )}
    </div>
  );
}

export default function ReadinessDashboard() {
  const [user, setUser] = useState(undefined); // undefined = auth state loading
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [locations, setLocations] = useState(null); // null = loading
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // readiness location doc
  const [quarter, setQuarter] = useState(READINESS_QUARTERS[0]);
  const [assessments, setAssessments] = useState(null); // grouped[quarter][type]
  const [assessLoading, setAssessLoading] = useState(false);

  useEffect(() => onReadinessAuthChanged(u => setUser(u || null)), []);

  useEffect(() => {
    if (!user) { setLocations(null); return; }
    let cancelled = false;
    setLoadError("");
    fetchReadinessLocations()
      .then(locs => { if (!cancelled) setLocations(locs.sort((a, b) => (a.name || "").localeCompare(b.name || ""))); })
      .catch(err => { if (!cancelled) { setLocations([]); setLoadError(err.message); } });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!selected) { setAssessments(null); return; }
    let cancelled = false;
    setAssessLoading(true);
    fetchLocationAssessments(selected.id)
      .then(grouped => { if (!cancelled) setAssessments(grouped); })
      .catch(err => { if (!cancelled) { setAssessments({}); setLoadError(err.message); } })
      .finally(() => { if (!cancelled) setAssessLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const filtered = useMemo(() => {
    if (!locations) return [];
    const q = search.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(l =>
      [l.id, l.lawsonNumber, l.name, l.city, l.state, l.regionId, l.areaId]
        .some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [locations, search]);

  const handleConnect = async (email, password) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInToReadiness(email, password);
    } catch (err) {
      const friendly = {
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/user-not-found": "No Location Readiness account exists for that email.",
        "auth/wrong-password": "Email or password is incorrect.",
        "auth/too-many-requests": "Too many attempts — wait a few minutes and try again.",
      }[err.code];
      setAuthError(friendly || err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  if (user === undefined) {
    return <div style={{ padding: 40, textAlign: "center", color: T.gray500, fontSize: 13 }}>Loading…</div>;
  }
  if (!user) {
    return <ConnectCard onSubmit={handleConnect} busy={authBusy} error={authError} />;
  }

  const byType = assessments?.[quarter] || {};
  const rollup = quarterRollup(byType);
  const rollupPill = ROLLUP_PILLS[rollup.status];

  return (
    <div style={{ padding: "16px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND }}>Location Readiness</div>
          <div style={{ fontSize: 12, color: T.gray500, marginTop: 2 }}>
            Live semiannual assessment status from the Location Readiness Platform · connected as {user.email}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {READINESS_QUARTERS.map(q => (
            <button key={q} onClick={() => setQuarter(q)} style={{ padding: "7px 14px", fontSize: 12, background: quarter === q ? BRAND : "#fff", color: quarter === q ? "#fff" : T.gray600, border: `1px solid ${quarter === q ? BRAND : T.gray200}`, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              {q}
            </button>
          ))}
          <button onClick={signOutOfReadiness} title="Disconnect from the Location Readiness Platform" style={{ padding: "7px 14px", fontSize: 12, background: "#fff", color: T.gray600, border: `1px solid ${T.gray200}`, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
            Disconnect
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, borderRadius: T.radius, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
          {loadError}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Location list */}
        <div style={{ ...cardStyle(), flex: "0 1 300px", minWidth: 260 }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.gray200}` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, Lawson #, city…"
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 12, border: `1px solid ${T.gray300}`, borderRadius: 6 }}
            />
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {locations === null && <div style={{ padding: 14, fontSize: 12, color: T.gray500 }}>Loading locations…</div>}
            {locations !== null && filtered.length === 0 && <div style={{ padding: 14, fontSize: 12, color: T.gray500 }}>No locations match.</div>}
            {filtered.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelected(loc)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: selected?.id === loc.id ? T.blue50 : "transparent", border: "none", borderBottom: `1px solid ${T.gray100}`, cursor: "pointer" }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{loc.name}</div>
                <div style={{ fontSize: 11, color: T.gray500 }}>#{loc.id} · {loc.city}, {loc.state} · {loc.regionId}/{loc.areaId}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div style={{ flex: "1 1 420px", minWidth: 320 }}>
          {!selected ? (
            <div style={{ ...cardStyle(), padding: 32, textAlign: "center", color: T.gray500, fontSize: 13 }}>
              <Icon name="map-pin" size={22} style={{ color: T.gray400 }} />
              <div style={{ marginTop: 8 }}>Select a location to see its readiness status.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ ...cardStyle(BRAND), padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{selected.name}</div>
                    <div style={{ fontSize: 12, color: T.gray500 }}>
                      Lawson #{selected.id} · {selected.city}, {selected.state} · Region {selected.regionId} / Area {selected.areaId}
                    </div>
                    <div style={{ fontSize: 12, color: T.gray700, marginTop: 4 }}>
                      JC Survey Due: <strong>{selected.jcSurveyDue ? fmtDate(selected.jcSurveyDue) : "—"}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Pill {...rollupPill} />
                    <div style={{ fontSize: 12, color: T.gray600, marginTop: 4 }}>{rollup.submitted} of {rollup.total} forms submitted · {quarter}</div>
                  </div>
                </div>

                {/* Quarter-over-quarter strip */}
                <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  {READINESS_QUARTERS.map(q => {
                    const r = quarterRollup(assessments?.[q] || {});
                    const p = ROLLUP_PILLS[r.status];
                    return (
                      <div key={q} style={{ fontSize: 11, color: T.gray600, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{q}:</span>
                        <Pill {...p} /> <span>{r.submitted}/{r.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {assessLoading ? (
                <div style={{ ...cardStyle(), padding: 24, textAlign: "center", color: T.gray500, fontSize: 13 }}>Loading assessments…</div>
              ) : (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {READINESS_FORM_TYPES.map(type => (
                    <FormTile
                      key={type}
                      type={type}
                      quarter={quarter}
                      assessment={byType[type] || null}
                      locationName={selected.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
