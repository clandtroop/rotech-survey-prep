import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { T, BRAND, Icon, cardStyle } from "./theme";
import { loadTrendData, TRENDS_COLLECTION, toIsoDate, monthLabel } from "./trendData";

// ─── ISSUE TREND DASHBOARD ───────────────────────────────────────────────────
// Company-wide view of every issue recorded on a finalized visit.
//
// The previous version rendered every module — recurring issues, the monthly
// chart, four rankings and the complete issue log — stacked on one page, which
// meant several screens of scrolling before you could tell whether anything
// was getting worse. This version leads with a KPI row and puts each module
// behind its own view, so the landing screen answers "how are we doing" and
// the detail is one click away. Everything below the filter row is scoped by
// the same filter slice, and every view is extractable as XLSX or PDF.
// ─────────────────────────────────────────────────────────────────────────────

const VIEWS = [
  { id: "overview",  label: "Overview",   icon: "layout-grid" },
  { id: "recurring", label: "Recurring",  icon: "repeat" },
  { id: "locations", label: "Locations",  icon: "map-pin" },
  { id: "items",     label: "Items",      icon: "list-checks" },
  { id: "sections",  label: "Sections",   icon: "clipboard-list" },
  { id: "managers",  label: "Managers",   icon: "users" },
  { id: "log",       label: "Issue Log",  icon: "table" },
];

const LOG_PAGE_SIZE = 25;
const OVERVIEW_PREVIEW = 5; // rows each overview module shows before "View all"

const fmt = n => Number(n || 0).toLocaleString("en-US");

// ── Chart primitives ─────────────────────────────────────────────────────────

// Round the y-axis top up to a clean number so ticks read 0 / 5 / 10 / 15
// instead of 0 / 4.33 / 8.67 / 13.
function niceScale(max) {
  const raw = Math.max(1, max);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(c => c * pow).find(c => raw / c <= 4) || raw;
  const top = Math.ceil(raw / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return { top, ticks };
}

// Column chart for issues per month. One series, so no legend — the card
// title says what is plotted. Values are direct-labelled only on the peak and
// the latest month; every other month is reachable on hover/focus, and all of
// them are in the Monthly sheet of the XLSX export.
function MonthlyChart({ months, height = 170 }) {
  const [hover, setHover] = useState(-1);
  if (months.length === 0) return null;

  const { top, ticks } = niceScale(Math.max(...months.map(m => m.count)));
  const peak = months.reduce((best, m, i) => (m.count > months[best].count ? i : best), 0);
  const last = months.length - 1;
  // Past ~14 columns every x label no longer fits, so thin them out rather
  // than letting them overlap into mush.
  const labelEvery = Math.ceil(months.length / 14);

  return (
    <div style={{ display: "flex", gap: 10, padding: "18px 18px 12px" }}>
      <div style={{ width: 26, height, position: "relative", flexShrink: 0 }}>
        {ticks.map(t => (
          <div key={t} style={{
            position: "absolute", right: 0, bottom: `calc(${(t / top) * 100}% - 6px)`,
            fontSize: 10.5, color: T.gray500, fontVariantNumeric: "tabular-nums",
          }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: "relative", height }}>
          {ticks.map(t => (
            <div key={t} style={{
              position: "absolute", left: 0, right: 0, bottom: `${(t / top) * 100}%`,
              borderTop: `1px solid ${t === 0 ? T.gray300 : T.gray200}`,
            }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 3 }}>
            {months.map((m, i) => {
              const barH = m.count === 0 ? 0 : Math.max(3, (m.count / top) * height);
              const labelled = i === peak || i === last;
              const active = hover === i;
              return (
                <div key={m.key} tabIndex={0} role="img"
                  aria-label={`${m.label}: ${m.count} issue${m.count === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(-1)}
                  style={{
                    flex: 1, minWidth: 0, height: "100%", position: "relative",
                    display: "flex", flexDirection: "column", justifyContent: "flex-end",
                    alignItems: "center", cursor: "default", outline: "none",
                  }}>
                  {labelled && m.count > 0 && !active && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.gray700, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>{m.count}</div>
                  )}
                  {active && (
                    <div style={{
                      position: "absolute", bottom: barH + 8, left: "50%", transform: "translateX(-50%)",
                      background: T.ink, color: T.white, borderRadius: 6, padding: "5px 9px",
                      fontSize: 11.5, whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none",
                      boxShadow: "0 4px 12px rgba(19,25,34,.28)",
                    }}>
                      <strong style={{ fontSize: 13 }}>{fmt(m.count)}</strong>
                      <span style={{ color: "#c9d4e2", marginLeft: 6 }}>{m.label}</span>
                    </div>
                  )}
                  <div style={{
                    width: "100%", maxWidth: 24, height: barH,
                    background: active ? T.blue400 : BRAND, borderRadius: "4px 4px 0 0",
                    transition: "background .12s",
                  }} />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
          {months.map((m, i) => (
            <div key={m.key} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10, color: T.gray500, whiteSpace: "nowrap", overflow: "hidden" }}>
              {i % labelEvery === 0 || i === last ? m.label : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 12-point sparkline for a stat tile — context for the headline number, not a
// chart to read values off. The current period gets the accent dot.
function Sparkline({ values, width = 76, height = 24 }) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const y = v => height - 3 - (v / max) * (height - 6);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={T.gray300} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(values.length - 1) * step} cy={y(values[values.length - 1])} r="3.5" fill={BRAND} stroke={T.white} strokeWidth="2" />
    </svg>
  );
}

// ── Layout primitives ────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone = BRAND, delta, spark, onClick }) {
  const clickable = typeof onClick === "function";
  return (
    <div onClick={onClick} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        ...cardStyle(tone), padding: "14px 16px", cursor: clickable ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 2, minHeight: 92,
      }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: T.ink, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{value}</div>
        {spark}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
        {delta}
        {sub && <div style={{ fontSize: 11.5, color: T.gray500 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Panel({ title, count, subtitle, right, children, accent = BRAND, pad = true }) {
  return (
    <div style={{ ...cardStyle(accent), marginBottom: 16 }}>
      <div style={{ padding: "13px 18px", borderBottom: `1px solid ${T.gray100}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
            {title}{count != null && <span style={{ color: T.gray500, fontWeight: 600 }}> · {fmt(count)}</span>}
          </div>
          {subtitle && <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      <div style={pad ? { padding: "6px 18px 14px" } : null}>{children}</div>
    </div>
  );
}

// Ranked horizontal bar. One hue for every row — bar length already encodes
// magnitude, so shading each row darker would burn the colour channel on
// information the chart is showing twice.
function BarRow({ label, sub, value, max, tone = BRAND, track = T.blue50, onClick, last }) {
  const clickable = typeof onClick === "function";
  return (
    <div onClick={onClick} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? e => { if (e.key === "Enter") onClick(); } : undefined}
      title={clickable ? "Show these issues in the issue log" : undefined}
      style={{
        padding: "9px 0", borderBottom: last ? "none" : `1px solid ${T.gray100}`,
        cursor: clickable ? "pointer" : "default",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.4 }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: T.gray500, marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmt(value)}</div>
      </div>
      <div style={{ height: 8, background: track, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${max ? (value / max) * 100 : 0}%`, height: "100%", background: tone, borderRadius: "0 4px 4px 0" }} />
      </div>
    </div>
  );
}

function EmptyRow({ children }) {
  return <div style={{ fontSize: 12.5, color: T.gray500, padding: "18px 0", textAlign: "center" }}>{children}</div>;
}

function Chip({ children, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
      background: T.blue50, color: T.blue700, border: `1px solid ${T.blueBorder}`,
      borderRadius: T.radiusPill, padding: "3px 5px 3px 10px",
    }}>
      {children}
      <button onClick={onRemove} aria-label="Remove filter" style={{
        display: "inline-flex", background: "none", border: "none", cursor: "pointer",
        color: T.blue600, padding: 2, lineHeight: 0, borderRadius: T.radiusPill,
      }}>
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function TrendDashboard() {
  const [localData] = useState(loadTrendData);
  const [firestoreRecords, setFirestoreRecords] = useState([]);
  const [firestoreLoading, setFirestoreLoading] = useState(true);

  const [view, setView] = useState("overview");
  const [q, setQ] = useState("");
  const [filterLoc, setFilterLoc] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterSpec, setFilterSpec] = useState("");
  const [filterAM, setFilterAM] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preset, setPreset] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [sortKey, setSortKey] = useState("iso");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

  const [showExport, setShowExport] = useState(false);
  const [printMode, setPrintMode] = useState(""); // "" | "summary" | "full"
  const exportRef = useRef(null);

  // Real-time Firestore listener — picks up all specialists' finalized visits
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, TRENDS_COLLECTION),
      snap => {
        const records = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (Array.isArray(d.records)) records.push(...d.records);
        });
        setFirestoreRecords(records);
        setFirestoreLoading(false);
      },
      () => setFirestoreLoading(false) // on error, fall back to local data
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!showExport) return;
    const close = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showExport]);

  // Merge: Firestore is authoritative; localStorage fills in anything not yet
  // synced. Dates are normalized to ISO here, once, so every downstream
  // comparison and bucket works off a sortable value.
  const allRecords = useMemo(() => {
    const synced = new Set(firestoreRecords.map(r => r.visitId));
    return [...firestoreRecords, ...localData.filter(r => !synced.has(r.visitId))]
      .map(r => ({ ...r, iso: toIsoDate(r.date), areaManager: r.areaManager || "Unassigned" }));
  }, [firestoreRecords, localData]);

  const issuesAll = useMemo(
    () => allRecords.filter(r => r.itemText !== "_clean" && r.section !== "_summary" && r.visitType !== "note"),
    [allRecords]
  );

  // One row per finalized visit, so "visits" and "clean visits" can be counted
  // even for visits that recorded no issues at all.
  const allVisits = useMemo(() => {
    const m = new Map();
    allRecords.forEach(r => {
      if (m.has(r.visitId)) return;
      m.set(r.visitId, {
        visitId: r.visitId, location: r.location, city: r.city, lawson: r.lawson,
        iso: r.iso, date: r.date, specialist: r.specialist, region: r.region, areaManager: r.areaManager,
      });
    });
    return [...m.values()];
  }, [allRecords]);

  const options = useMemo(() => ({
    locations:   [...new Set(allRecords.map(r => r.location).filter(Boolean))].sort(),
    sections:    [...new Set(issuesAll.map(r => r.section).filter(Boolean))].sort(),
    specialists: [...new Set(allRecords.map(r => r.specialist).filter(Boolean))].sort(),
    managers:    [...new Set(allRecords.map(r => r.areaManager))].sort(),
    regions:     [...new Set(allRecords.map(r => r.region).filter(Boolean))].sort(),
  }), [allRecords, issuesAll]);

  // Visit-level filters apply to both visits and issues; section + search only
  // narrow issues (a visit isn't "in" or "out" of a section).
  const matchesVisit = r => {
    if (filterLoc    && !String(r.location || "").toLowerCase().includes(filterLoc.toLowerCase())) return false;
    if (filterSpec   && r.specialist !== filterSpec) return false;
    if (filterAM     && r.areaManager !== filterAM) return false;
    if (filterRegion && r.region !== filterRegion) return false;
    if (dateFrom && (!r.iso || r.iso < dateFrom)) return false;
    if (dateTo   && (!r.iso || r.iso > dateTo))   return false;
    return true;
  };

  const visits = useMemo(() => allVisits.filter(matchesVisit),
    [allVisits, filterLoc, filterSpec, filterAM, filterRegion, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return issuesAll.filter(r => {
      if (!matchesVisit(r)) return false;
      if (filterSection && r.section !== filterSection) return false;
      if (needle) {
        const hay = `${r.itemText} ${r.comment} ${r.location} ${r.section}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [issuesAll, q, filterLoc, filterSection, filterSpec, filterAM, filterRegion, dateFrom, dateTo]);

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const tally = (keyFn) => {
      const m = new Map();
      filtered.forEach(r => { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    };

    const items    = tally(r => r.itemText);
    const sections = tally(r => r.section);
    const managers = tally(r => r.areaManager);

    // Per-location rollup: issue count plus the visit count it should be read
    // against, so a site with 3 visits isn't compared naively to one with 1.
    const locMap = new Map();
    const touch = loc => {
      if (!locMap.has(loc)) locMap.set(loc, { location: loc, issues: 0, visits: 0, region: "", areaManager: "", lastVisit: "", topItem: "", items: new Map() });
      return locMap.get(loc);
    };
    visits.forEach(v => {
      const e = touch(v.location);
      e.visits += 1;
      e.region = e.region || v.region || "";
      e.areaManager = e.areaManager || v.areaManager;
      if (v.iso > e.lastVisit) e.lastVisit = v.iso;
    });
    filtered.forEach(r => {
      const e = touch(r.location);
      e.issues += 1;
      e.items.set(r.itemText, (e.items.get(r.itemText) || 0) + 1);
    });
    const locations = [...locMap.values()].map(e => {
      const top = [...e.items.entries()].sort((a, b) => b[1] - a[1])[0];
      return { ...e, topItem: top ? top[0] : "", avg: e.visits ? e.issues / e.visits : 0 };
    }).sort((a, b) => b.issues - a.issues || a.location.localeCompare(b.location));

    // Recurring = the same item failing at the same site on two or more
    // *separate* visits. Counting raw records instead would flag a single
    // visit where two employees missed the same competency, which is one
    // finding, not a recurrence.
    const recMap = new Map();
    filtered.forEach(r => {
      const k = `${r.location}||${r.itemText}`;
      if (!recMap.has(k)) recMap.set(k, { location: r.location, item: r.itemText, section: r.section, areaManager: r.areaManager, region: r.region, visitIds: new Set(), records: 0, lastSeen: "" });
      const e = recMap.get(k);
      e.visitIds.add(r.visitId);
      e.records += 1;
      if (r.iso > e.lastSeen) e.lastSeen = r.iso;
    });
    const recurring = [...recMap.values()]
      .filter(e => e.visitIds.size >= 2)
      .map(e => ({ ...e, count: e.visitIds.size }))
      .sort((a, b) => b.count - a.count || b.records - a.records || a.location.localeCompare(b.location));

    // Manager rollup with their sites, worst-first.
    const amSites = new Map();
    filtered.forEach(r => {
      if (!amSites.has(r.areaManager)) amSites.set(r.areaManager, new Map());
      const m = amSites.get(r.areaManager);
      m.set(r.location, (m.get(r.location) || 0) + 1);
    });
    const managerRows = managers.map(([am, count]) => ({
      areaManager: am,
      issues: count,
      visits: visits.filter(v => v.areaManager === am).length,
      sites: [...(amSites.get(am) || new Map()).entries()].sort((a, b) => b[1] - a[1]),
    }));

    // Months, gap-filled so a quiet month reads as a gap in the chart rather
    // than silently collapsing the time axis.
    const monthMap = new Map();
    filtered.forEach(r => { if (r.iso) { const k = r.iso.slice(0, 7); monthMap.set(k, (monthMap.get(k) || 0) + 1); } });
    let months = [];
    if (monthMap.size > 0) {
      const keys = [...monthMap.keys()].sort();
      const [sy, sm] = keys[0].split("-").map(Number);
      const [ey, em] = keys[keys.length - 1].split("-").map(Number);
      for (let y = sy, m = sm; y < ey || (y === ey && m <= em);) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        months.push({ key, label: monthLabel(key), count: monthMap.get(key) || 0 });
        m += 1; if (m > 12) { m = 1; y += 1; }
      }
    }

    const cleanVisits = visits.filter(v => !filtered.some(r => r.visitId === v.visitId)).length;
    const sitesAffected = locations.filter(l => l.issues > 0).length;

    // Change is measured on whole months only — the current month is usually
    // partial, so including it would read as a drop every time. Older data
    // that stops short of this month keeps all its buckets.
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const closed = months.length && months[months.length - 1].key === thisMonth ? months.slice(0, -1) : months;
    let change = null;
    if (closed.length >= 6) {
      const recent = closed.slice(-3).reduce((s, m) => s + m.count, 0);
      const prior  = closed.slice(-6, -3).reduce((s, m) => s + m.count, 0);
      if (prior > 0) change = Math.round(((recent - prior) / prior) * 100);
      else if (recent > 0) change = 100;
      else change = 0;
    }

    return { items, sections, managers: managerRows, locations, recurring, months, cleanVisits, sitesAffected, change };
  }, [filtered, visits]);

  const sortedLog = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? ""), bv = String(b[sortKey] ?? "");
      return av.localeCompare(bv, "en", { numeric: true }) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const activeFilters = [
    filterLoc     && { key: "loc",     label: `Location: ${filterLoc}`,   clear: () => setFilterLoc("") },
    filterSection && { key: "section", label: `Section: ${filterSection}`, clear: () => setFilterSection("") },
    filterSpec    && { key: "spec",    label: `Specialist: ${filterSpec}`, clear: () => setFilterSpec("") },
    filterRegion  && { key: "region",  label: `Region: ${filterRegion}`,  clear: () => setFilterRegion("") },
    filterAM      && { key: "am",      label: `Manager: ${filterAM}`,     clear: () => setFilterAM("") },
    q.trim()      && { key: "q",       label: `Search: ${q.trim()}`,      clear: () => setQ("") },
    (dateFrom || dateTo) && { key: "date", label: `Dates: ${dateFrom || "start"} → ${dateTo || "today"}`, clear: () => { setDateFrom(""); setDateTo(""); setPreset("all"); } },
  ].filter(Boolean);

  // Any change to the slice or the ordering invalidates the current page —
  // without this, narrowing the filters from page 5 leaves the table empty
  // while the pager still claims to be showing rows 101-125.
  useEffect(() => { setPage(0); }, [
    filtered.length, sortKey, sortDir, view,
    q, filterLoc, filterSection, filterSpec, filterAM, filterRegion, dateFrom, dateTo,
  ]);

  function clearAll() {
    setQ(""); setFilterLoc(""); setFilterSection(""); setFilterSpec("");
    setFilterAM(""); setFilterRegion(""); setDateFrom(""); setDateTo(""); setPreset("all");
  }

  function applyPreset(id) {
    setPreset(id);
    if (id === "all") { setDateFrom(""); setDateTo(""); return; }
    const back = { "90d": 3, "6mo": 6, "12mo": 12 }[id];
    const d = new Date();
    d.setMonth(d.getMonth() - back);
    setDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setDateTo("");
  }

  // Drill-down: every ranked row jumps into the issue log already scoped to
  // what was clicked, so the ranking and the detail can't disagree.
  function drill(patch) {
    if ("location" in patch) setFilterLoc(patch.location);
    if ("section"  in patch) setFilterSection(patch.section);
    if ("manager"  in patch) setFilterAM(patch.manager);
    if ("item"     in patch) setQ(patch.item);
    setView("log");
  }

  // ── Exports ────────────────────────────────────────────────────────────────
  const scopeLines = () => {
    const lines = [
      ["Report", "Rotech — Issue Trend Analysis"],
      ["Generated", new Date().toLocaleString("en-US")],
      ["Date range", dateFrom || dateTo ? `${dateFrom || "earliest"} to ${dateTo || "today"}` : "All dates"],
      ["Location", filterLoc || "All"],
      ["Section", filterSection || "All"],
      ["Specialist", filterSpec || "All"],
      ["Region", filterRegion || "All"],
      ["Area manager", filterAM || "All"],
      ["Search", q.trim() || "—"],
    ];
    return lines;
  };

  const kpiRows = () => [
    ["Visits in scope", visits.length],
    ["Issues found", filtered.length],
    ["Avg issues per visit", visits.length ? Number((filtered.length / visits.length).toFixed(2)) : 0],
    ["Recurring issues", stats.recurring.length],
    ["Sites with issues", stats.sitesAffected],
    ["Clean visits", stats.cleanVisits],
    ["3-month change", stats.change == null ? "n/a" : `${stats.change > 0 ? "+" : ""}${stats.change}%`],
  ];

  const logRows = () => {
    const rows = [["Date", "Visit ID", "Lawson #", "Location", "City", "Region", "Area Manager", "Specialist", "Section", "Form Ref", "Item", "Comment"]];
    sortedLog.forEach(r => rows.push([
      r.date || "", r.visitId, r.lawson || "", r.location, r.city || "", r.region || "",
      r.areaManager, r.specialist || "", r.section, r.formRef || "", r.itemText, r.comment || "",
    ]));
    return rows;
  };

  function download(wb, suffix) {
    const stamp = new Date().toLocaleDateString("en-US").replace(/\//g, "-");
    XLSX.writeFile(wb, `Rotech_IssueTrends_${suffix}_${stamp}.xlsx`);
  }

  function sheet(wb, name, rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws["!cols"] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  function exportLogXLSX() {
    setShowExport(false);
    const wb = XLSX.utils.book_new();
    sheet(wb, "Issue Log", logRows(), [12, 18, 10, 26, 18, 12, 20, 20, 26, 14, 60, 50]);
    download(wb, "IssueLog");
  }

  // One workbook, one sheet per dashboard view — so whatever is on screen has
  // a tab in the file, filtered exactly the same way.
  function exportFullXLSX() {
    setShowExport(false);
    const wb = XLSX.utils.book_new();

    sheet(wb, "Summary", [
      ...scopeLines(), [], ["Metric", "Value"], ...kpiRows(),
    ], [24, 46]);

    sheet(wb, "Monthly Trend",
      [["Month", "Issues"], ...stats.months.map(m => [m.label, m.count])], [14, 10]);

    sheet(wb, "Recurring Issues",
      [["Location", "Item", "Section", "Area Manager", "Visits Failed", "Total Findings", "Last Seen"],
        ...stats.recurring.map(r => [r.location, r.item, r.section, r.areaManager, r.count, r.records, r.lastSeen || ""])],
      [26, 60, 26, 20, 13, 14, 12]);

    sheet(wb, "By Location",
      [["Location", "Region", "Area Manager", "Visits", "Issues", "Avg per Visit", "Last Visit", "Most Common Issue"],
        ...stats.locations.map(l => [l.location, l.region, l.areaManager, l.visits, l.issues, Number(l.avg.toFixed(2)), l.lastVisit || "", l.topItem])],
      [26, 12, 20, 8, 8, 13, 12, 60]);

    sheet(wb, "By Item",
      [["Item", "Findings", "Sites Affected"],
        ...stats.items.map(([item, count]) => [item, count, new Set(filtered.filter(r => r.itemText === item).map(r => r.location)).size])],
      [70, 10, 14]);

    sheet(wb, "By Section",
      [["Section", "Issues", "% of Total"],
        ...stats.sections.map(([s, c]) => [s, c, filtered.length ? Number(((c / filtered.length) * 100).toFixed(1)) : 0])],
      [34, 10, 12]);

    sheet(wb, "By Area Manager",
      [["Area Manager", "Visits", "Issues", "Sites with Issues", "Sites (issue count)"],
        ...stats.managers.map(m => [m.areaManager, m.visits, m.issues, m.sites.length, m.sites.map(([loc, c]) => `${loc} (${c})`).join(", ")])],
      [22, 8, 8, 18, 70]);

    sheet(wb, "Issue Log", logRows(), [12, 18, 10, 26, 18, 12, 20, 20, 26, 14, 60, 50]);

    download(wb, "Full");
  }

  // PDF goes through the browser's print dialog against a purpose-built
  // report block (see the portal at the bottom), not a screenshot of the
  // dashboard — so page breaks land between sections and tables repeat their
  // headers instead of the on-screen cards being sliced in half.
  function exportPDF(mode) {
    setShowExport(false);
    setPrintMode(mode);
  }

  useEffect(() => {
    if (!printMode) return;
    const prevTitle = document.title;
    const stamp = new Date().toLocaleDateString("en-US").replace(/\//g, "-");
    document.title = `Rotech Issue Trends - ${stamp}`;
    const restore = () => { document.title = prevTitle; setPrintMode(""); };
    window.addEventListener("afterprint", restore);
    // One frame for the report block to lay out before the dialog snapshots it.
    const go = setTimeout(() => window.print(), 80);
    const bail = setTimeout(restore, 60000); // afterprint doesn't fire everywhere
    return () => { clearTimeout(go); clearTimeout(bail); window.removeEventListener("afterprint", restore); };
  }, [printMode]);

  // ── Loading / empty ────────────────────────────────────────────────────────
  if (firestoreLoading) return (
    <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray500 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <div style={{ fontSize: 14, color: T.gray600 }}>Loading company-wide trend data…</div>
    </div>
  );

  if (allVisits.length === 0) return (
    <div style={{ padding: "64px 24px", textAlign: "center", color: T.gray500 }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.gray700, marginBottom: 8 }}>No trend data yet</div>
      <div style={{ fontSize: 13 }}>Complete a visit and click “☑ Finalize Visit” to start tracking issue trends.</div>
    </div>
  );

  // ── Filter chrome ──────────────────────────────────────────────────────────
  const inputStyle = {
    fontSize: 12.5, padding: "7px 10px", border: `1px solid ${T.gray300}`, borderRadius: T.radius,
    color: T.ink, background: T.white, width: "100%", fontFamily: "inherit", boxSizing: "border-box", outline: "none",
  };
  const selectField = (label, value, setValue, opts, allLabel) => (
    <div>
      <label style={{ display: "block", fontSize: 11, color: T.gray600, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <select value={value} onChange={e => setValue(e.target.value)} style={inputStyle}>
        <option value="">{allLabel}</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const avgPerVisit = visits.length ? (filtered.length / visits.length).toFixed(1) : "0.0";
  const changeTone = stats.change == null ? T.gray600 : stats.change > 0 ? T.error : stats.change < 0 ? T.success : T.gray600;
  const changeIcon = stats.change == null ? null : stats.change > 0 ? "trending-up" : stats.change < 0 ? "trending-down" : "minus";

  const viewCounts = {
    overview:  null,
    recurring: stats.recurring.length,
    locations: stats.locations.filter(l => l.issues > 0).length,
    items:     stats.items.length,
    sections:  stats.sections.length,
    managers:  stats.managers.length,
    log:       filtered.length,
  };

  const menuItem = {
    display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
    padding: "9px 14px", fontSize: 12.5, background: "none", border: "none",
    color: T.ink, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  return (
    <>
      {/* Screen-only, and deliberately free of any @media print rule — the
          print stylesheet lives with the report block so an ordinary Ctrl+P
          on this tab still prints the page. */}
      <style>{`
        .trend-grid-2 { display: grid; gap: 16px; grid-template-columns: 1fr; align-items: start; }
        .trend-grid-2 > div { margin-bottom: 0 !important; }
        @media (min-width: 1000px) { .trend-grid-2 { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="trend-screen" style={{ padding: "16px 24px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>Issue Trend Analysis</div>
            <div style={{ fontSize: 12.5, color: T.gray500, marginTop: 2 }}>
              {fmt(allVisits.length)} finalized visit{allVisits.length === 1 ? "" : "s"} · {fmt(issuesAll.length)} issues recorded company-wide
            </div>
          </div>
          <div ref={exportRef} style={{ position: "relative" }}>
            <button onClick={() => setShowExport(v => !v)} aria-haspopup="menu" aria-expanded={showExport}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", fontSize: 13, fontWeight: 600,
                background: BRAND, color: T.white, border: "none", borderRadius: T.radius, cursor: "pointer", fontFamily: "inherit",
              }}>
              <Icon name="download" size={15} /> Export
              <Icon name="chevron-down" size={14} />
            </button>
            {showExport && (
              <div role="menu" style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 1000, minWidth: 250,
                background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10,
                boxShadow: "0 8px 24px rgba(19,25,34,.16)", overflow: "hidden", paddingBottom: 4,
              }}>
                <div style={{ padding: "9px 14px 6px", fontSize: 10.5, fontWeight: 700, color: T.gray500, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Excel
                </div>
                <button role="menuitem" onClick={exportFullXLSX} style={menuItem}>
                  <Icon name="file-spreadsheet" size={15} style={{ color: T.success }} />
                  <span>Full workbook <span style={{ color: T.gray500 }}>· 8 sheets</span></span>
                </button>
                <button role="menuitem" onClick={exportLogXLSX} style={menuItem}>
                  <Icon name="file-spreadsheet" size={15} style={{ color: T.success }} />
                  <span>Issue log only <span style={{ color: T.gray500 }}>· {fmt(filtered.length)} rows</span></span>
                </button>
                <div style={{ borderTop: `1px solid ${T.gray100}`, margin: "5px 0 0" }} />
                <div style={{ padding: "9px 14px 6px", fontSize: 10.5, fontWeight: 700, color: T.gray500, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  PDF
                </div>
                <button role="menuitem" onClick={() => exportPDF("summary")} style={menuItem}>
                  <Icon name="printer" size={15} style={{ color: BRAND }} />
                  <span>Summary report</span>
                </button>
                <button role="menuitem" onClick={() => exportPDF("full")} style={menuItem}>
                  <Icon name="printer" size={15} style={{ color: BRAND }} />
                  <span>Full report <span style={{ color: T.gray500 }}>· incl. issue log</span></span>
                </button>
                <div style={{ padding: "8px 14px 4px", fontSize: 11, color: T.gray500, lineHeight: 1.45, borderTop: `1px solid ${T.gray100}`, marginTop: 5 }}>
                  Every export uses the filters below. Choose “Save as PDF” as the printer destination.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filter row — one row, above everything it scopes */}
        <div style={{ ...cardStyle(), padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.gray400, pointerEvents: "none" }} />
              <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search issues"
                placeholder="Search items, comments, locations…"
                style={{ ...inputStyle, paddingLeft: 30 }} />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["90d", "90 days"], ["6mo", "6 mo"], ["12mo", "12 mo"], ["all", "All time"]].map(([id, label]) => (
                <button key={id} onClick={() => applyPreset(id)}
                  style={{
                    padding: "7px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    borderRadius: T.radius, border: `1px solid ${preset === id ? BRAND : T.gray300}`,
                    background: preset === id ? T.blue50 : T.white, color: preset === id ? T.blue700 : T.gray600,
                  }}>{label}</button>
              ))}
            </div>
            <button onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12, fontWeight: 600,
                borderRadius: T.radius, border: `1px solid ${T.gray300}`, background: T.white, color: T.gray700,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              <Icon name="filter" size={13} />
              Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
              <Icon name={showFilters ? "chevron-down" : "chevron-right"} size={13} />
            </button>
            {activeFilters.length > 0 && (
              <button onClick={clearAll} style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, background: "none", border: "none", color: T.blue600, cursor: "pointer", fontFamily: "inherit" }}>
                Clear all
              </button>
            )}
          </div>

          {showFilters && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.gray100}` }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: T.gray600, fontWeight: 600, marginBottom: 4 }}>Location</label>
                <input list="trend-locs" value={filterLoc} onChange={e => setFilterLoc(e.target.value)} placeholder="All locations" style={inputStyle} />
                <datalist id="trend-locs">{options.locations.map(l => <option key={l} value={l} />)}</datalist>
              </div>
              {selectField("Section", filterSection, setFilterSection, options.sections, "All sections")}
              {selectField("Specialist", filterSpec, setFilterSpec, options.specialists, "All specialists")}
              {selectField("Region", filterRegion, setFilterRegion, options.regions, "All regions")}
              {selectField("Area manager", filterAM, setFilterAM, options.managers, "All area managers")}
              <div>
                <label style={{ display: "block", fontSize: 11, color: T.gray600, fontWeight: 600, marginBottom: 4 }}>Date from</label>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset("custom"); }} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: T.gray600, fontWeight: 600, marginBottom: 4 }}>Date to</label>
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset("custom"); }} style={inputStyle} />
              </div>
            </div>
          )}

          {activeFilters.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {activeFilters.map(f => <Chip key={f.key} onRemove={f.clear}>{f.label}</Chip>)}
            </div>
          )}
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 12, marginBottom: 16 }}>
          <StatTile label="Visits in scope" value={fmt(visits.length)}
            sub={visits.length === allVisits.length ? "all finalized visits" : `of ${fmt(allVisits.length)} total`} />
          <StatTile label="Issues found" value={fmt(filtered.length)}
            spark={<Sparkline values={stats.months.slice(-12).map(m => m.count)} />}
            delta={stats.change != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: changeTone }}>
                <Icon name={changeIcon} size={12} />
                {stats.change > 0 ? "+" : ""}{stats.change}%
              </span>
            )}
            sub={stats.change != null ? "last 3 closed months" : "not enough history yet"} />
          <StatTile label="Avg per visit" value={avgPerVisit} sub="issues per finalized visit" />
          <StatTile label="Recurring" value={fmt(stats.recurring.length)} tone={T.error}
            sub="repeat findings" onClick={() => setView("recurring")} />
          <StatTile label="Sites with issues" value={fmt(stats.sitesAffected)}
            sub={`of ${fmt(stats.locations.length)} visited`} onClick={() => setView("locations")} />
          <StatTile label="Clean visits" value={fmt(stats.cleanVisits)} tone={T.success}
            sub="no findings in this slice" />
        </div>

        {/* View switcher */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16, borderBottom: `1px solid ${T.gray200}`, paddingBottom: 2 }}>
          {VIEWS.map(v => {
            const on = view === v.id;
            return (
              <button key={v.id} onClick={() => setView(v.id)} aria-current={on ? "page" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", fontSize: 12.5,
                  fontWeight: on ? 700 : 600, background: "none", border: "none", cursor: "pointer",
                  fontFamily: "inherit", color: on ? BRAND : T.gray600,
                  borderBottom: `2px solid ${on ? BRAND : "transparent"}`, marginBottom: -3,
                }}>
                <Icon name={v.icon} size={14} />
                {v.label}
                {viewCounts[v.id] != null && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, background: on ? T.blue50 : T.gray100,
                    color: on ? T.blue700 : T.gray600, borderRadius: T.radiusPill, padding: "1px 7px",
                  }}>{fmt(viewCounts[v.id])}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── OVERVIEW ── */}
        {view === "overview" && (
          <>
            <Panel title="Issues per month"
              subtitle={stats.months.length ? `${stats.months[0].label} – ${stats.months[stats.months.length - 1].label} · hover a column for its count` : null}
              pad={false}>
              {stats.months.length === 0
                ? <EmptyRow>No dated issues in this slice.</EmptyRow>
                : <MonthlyChart months={stats.months} />}
            </Panel>

            <div className="trend-grid-2">
              <Panel accent={T.error} title="Top recurring issues" count={stats.recurring.length}
                subtitle="Same item, same site, 2+ separate visits"
                right={stats.recurring.length > OVERVIEW_PREVIEW && (
                  <button onClick={() => setView("recurring")} style={linkBtn}>View all →</button>
                )}>
                {stats.recurring.length === 0
                  ? <EmptyRow>Nothing is repeating in this slice. 🎉</EmptyRow>
                  : stats.recurring.slice(0, OVERVIEW_PREVIEW).map((r, i, arr) => (
                    <BarRow key={`${r.location}|${r.item}`} label={r.item} sub={r.location}
                      value={r.count} max={stats.recurring[0].count} tone={T.error} track={T.errorBg}
                      last={i === arr.length - 1} onClick={() => drill({ location: r.location, item: r.item })} />
                  ))}
              </Panel>

              <Panel title="Sites by issue count" count={stats.sitesAffected}
                subtitle="Issues recorded across all visits in scope"
                right={stats.locations.length > OVERVIEW_PREVIEW && (
                  <button onClick={() => setView("locations")} style={linkBtn}>View all →</button>
                )}>
                {stats.sitesAffected === 0
                  ? <EmptyRow>No issues in this slice.</EmptyRow>
                  : stats.locations.filter(l => l.issues > 0).slice(0, OVERVIEW_PREVIEW).map((l, i, arr) => (
                    <BarRow key={l.location} label={l.location} sub={`${l.visits} visit${l.visits === 1 ? "" : "s"} · ${l.avg.toFixed(1)} per visit`}
                      value={l.issues} max={stats.locations[0].issues}
                      last={i === arr.length - 1} onClick={() => drill({ location: l.location })} />
                  ))}
              </Panel>

              <Panel title="Most-failed items" count={stats.items.length}
                subtitle="Across every checklist and form"
                right={stats.items.length > OVERVIEW_PREVIEW && (
                  <button onClick={() => setView("items")} style={linkBtn}>View all →</button>
                )}>
                {stats.items.length === 0
                  ? <EmptyRow>No issues in this slice.</EmptyRow>
                  : stats.items.slice(0, OVERVIEW_PREVIEW).map(([item, count], i, arr) => (
                    <BarRow key={item} label={item} value={count} max={stats.items[0][1]}
                      last={i === arr.length - 1} onClick={() => drill({ item })} />
                  ))}
              </Panel>

              <Panel title="Issues by section" count={stats.sections.length}
                subtitle="Which binder or form the finding came from"
                right={stats.sections.length > OVERVIEW_PREVIEW && (
                  <button onClick={() => setView("sections")} style={linkBtn}>View all →</button>
                )}>
                {stats.sections.length === 0
                  ? <EmptyRow>No issues in this slice.</EmptyRow>
                  : stats.sections.slice(0, OVERVIEW_PREVIEW).map(([s, c], i, arr) => (
                    <BarRow key={s} label={s} sub={`${((c / filtered.length) * 100).toFixed(0)}% of all findings`}
                      value={c} max={stats.sections[0][1]}
                      last={i === arr.length - 1} onClick={() => drill({ section: s })} />
                  ))}
              </Panel>
            </div>
          </>
        )}

        {/* ── RECURRING ── */}
        {view === "recurring" && (
          <Panel accent={T.error} title="Recurring issues" count={stats.recurring.length}
            subtitle="The same item failing at the same site on two or more separate visits — the findings a corrective action didn't stick on.">
            {stats.recurring.length === 0
              ? <EmptyRow>No item has failed twice at the same site in this slice.</EmptyRow>
              : stats.recurring.map((r, i, arr) => (
                <div key={`${r.location}|${r.item}`} style={{ padding: "11px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${T.gray100}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.error, marginBottom: 2 }}>{r.location}</div>
                      <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>{r.item}</div>
                      <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 3 }}>
                        {r.section} · {r.areaManager}{r.lastSeen ? ` · last seen ${r.lastSeen}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ background: T.errorBg, color: T.error, border: `1px solid ${T.errorBorder}`, borderRadius: T.radiusPill, padding: "2px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {r.count} visits
                      </span>
                      <button onClick={() => drill({ location: r.location, item: r.item })} style={linkBtn}>Detail →</button>
                    </div>
                  </div>
                </div>
              ))}
          </Panel>
        )}

        {/* ── LOCATIONS ── */}
        {view === "locations" && (
          <Panel title="Sites" count={stats.locations.length}
            subtitle="Every site visited in this slice. “Avg” is issues divided by visits, so a frequently visited site isn't penalised for volume."
            pad={false}>
            {stats.locations.length === 0 ? <div style={{ padding: 18 }}><EmptyRow>No visits in this slice.</EmptyRow></div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {["Site", "Region", "Area manager", "Visits", "Issues", "Avg", "Most common issue"].map((h, i) => (
                        <th key={h} style={{ ...thStyle, textAlign: i >= 3 && i <= 5 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.locations.map((l, i) => (
                      <tr key={l.location} style={{ borderTop: `1px solid ${T.gray100}`, background: i % 2 ? T.gray50 : T.white, cursor: "pointer" }}
                        onClick={() => drill({ location: l.location })}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: BRAND }}>{l.location}</td>
                        <td style={tdStyle}>{l.region || "—"}</td>
                        <td style={tdStyle}>{l.areaManager}</td>
                        <td style={numTd}>{l.visits}</td>
                        <td style={{ ...numTd, fontWeight: 700, color: l.issues ? T.error : T.success }}>{l.issues}</td>
                        <td style={numTd}>{l.avg.toFixed(1)}</td>
                        <td style={{ ...tdStyle, color: T.gray600 }}>{l.topItem || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {/* ── ITEMS ── */}
        {view === "items" && (
          <Panel title="Failed items" count={stats.items.length}
            subtitle="Every distinct checklist item with at least one finding, worst first.">
            {stats.items.length === 0 ? <EmptyRow>No issues in this slice.</EmptyRow> : stats.items.map(([item, count], i, arr) => {
              const sites = new Set(filtered.filter(r => r.itemText === item).map(r => r.location)).size;
              return (
                <BarRow key={item} label={item} sub={`${sites} site${sites === 1 ? "" : "s"} affected`}
                  value={count} max={stats.items[0][1]} last={i === arr.length - 1}
                  onClick={() => drill({ item })} />
              );
            })}
          </Panel>
        )}

        {/* ── SECTIONS ── */}
        {view === "sections" && (
          <Panel title="Issues by checklist section" count={stats.sections.length}
            subtitle="Where the findings are concentrated across binders, OP 541/541T, and JC 427.">
            {stats.sections.length === 0 ? <EmptyRow>No issues in this slice.</EmptyRow> : stats.sections.map(([s, c], i, arr) => (
              <BarRow key={s} label={s} sub={`${((c / filtered.length) * 100).toFixed(1)}% of all findings`}
                value={c} max={stats.sections[0][1]} last={i === arr.length - 1}
                onClick={() => drill({ section: s })} />
            ))}
          </Panel>
        )}

        {/* ── MANAGERS ── */}
        {view === "managers" && (
          <Panel title="Issues by area manager" count={stats.managers.length}
            subtitle="Rolled up from each manager's sites in this slice.">
            {stats.managers.length === 0 ? <EmptyRow>No issues in this slice.</EmptyRow> : stats.managers.map((m, i, arr) => (
              <div key={m.areaManager} style={{ padding: "12px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${T.gray100}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 7 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: m.areaManager === "Unassigned" ? T.gray500 : BRAND }}>{m.areaManager}</div>
                    <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 1 }}>
                      {m.visits} visit{m.visits === 1 ? "" : "s"} · {m.sites.length} site{m.sites.length === 1 ? "" : "s"} with findings
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: BRAND, fontVariantNumeric: "tabular-nums" }}>{fmt(m.issues)}</span>
                    <button onClick={() => drill({ manager: m.areaManager })} style={linkBtn}>Detail →</button>
                  </div>
                </div>
                <div style={{ height: 8, background: T.blue50, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${(m.issues / stats.managers[0].issues) * 100}%`, height: "100%", background: BRAND, borderRadius: "0 4px 4px 0" }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.sites.map(([loc, c]) => (
                    <span key={loc} style={{ fontSize: 11, background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: T.radiusPill, padding: "2px 10px", color: T.gray600 }}>
                      {loc} <strong style={{ color: BRAND }}>{c}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Panel>
        )}

        {/* ── ISSUE LOG ── */}
        {view === "log" && (
          <Panel title="Issue log" count={filtered.length}
            subtitle="Every finding in this slice. Click a column heading to sort; use Export for the full table as XLSX or PDF."
            pad={false}>
            {filtered.length === 0 ? <div style={{ padding: 18 }}><EmptyRow>No issues match the current filters.</EmptyRow></div> : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        {[
                          ["iso", "Date"], ["location", "Location"], ["region", "Region"],
                          ["areaManager", "Area manager"], ["section", "Section"], ["itemText", "Item"],
                          ["comment", "Comment"], ["specialist", "Specialist"],
                        ].map(([key, label]) => (
                          <th key={key} style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                            onClick={() => {
                              if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
                              else { setSortKey(key); setSortDir("asc"); }
                            }}>
                            {label}
                            <span style={{ color: sortKey === key ? BRAND : T.gray300, marginLeft: 4 }}>
                              {sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLog.slice(page * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE + LOG_PAGE_SIZE).map((r, i) => (
                        <tr key={`${r.visitId}-${page}-${i}`} style={{ borderTop: `1px solid ${T.gray100}`, background: i % 2 ? T.gray50 : T.white }}>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap", color: T.gray600 }}>{r.date || "—"}</td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: BRAND }}>{r.location}</td>
                          <td style={{ ...tdStyle, color: T.gray600, whiteSpace: "nowrap" }}>{r.region || "—"}</td>
                          <td style={{ ...tdStyle, color: T.gray600, whiteSpace: "nowrap" }}>{r.areaManager}</td>
                          <td style={{ ...tdStyle, color: T.gray600 }}>{r.section}</td>
                          <td style={{ ...tdStyle, color: T.ink, lineHeight: 1.45, minWidth: 220 }}>{r.itemText}</td>
                          <td style={{ ...tdStyle, color: r.comment ? T.gray600 : T.gray400, fontStyle: r.comment ? "normal" : "italic" }}>{r.comment || "—"}</td>
                          <td style={{ ...tdStyle, color: T.gray600, whiteSpace: "nowrap" }}>{r.specialist || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 18px", borderTop: `1px solid ${T.gray100}`, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: T.gray600 }}>
                    Showing {fmt(page * LOG_PAGE_SIZE + 1)}–{fmt(Math.min(filtered.length, (page + 1) * LOG_PAGE_SIZE))} of {fmt(filtered.length)}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={pagerBtn(page === 0)}>← Prev</button>
                    <span style={{ fontSize: 12, color: T.gray600, padding: "0 4px" }}>
                      Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE))}
                    </span>
                    <button onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * LOG_PAGE_SIZE >= filtered.length}
                      style={pagerBtn((page + 1) * LOG_PAGE_SIZE >= filtered.length)}>Next →</button>
                  </div>
                </div>
              </>
            )}
          </Panel>
        )}
      </div>

      {/* Print-only report, rendered as a direct child of <body> so the print
          stylesheet can hide the entire app with one rule and leave nothing
          taking up space (which is what produces stray blank pages). Mounted
          only while a PDF export is in flight. */}
      {printMode && createPortal(
        <PrintReport
          mode={printMode}
          scope={scopeLines()}
          kpis={kpiRows()}
          stats={stats}
          rows={sortedLog}
          filteredCount={filtered.length}
        />,
        document.body
      )}
    </>
  );
}

// ── Shared style objects ─────────────────────────────────────────────────────

const linkBtn = {
  fontSize: 12, fontWeight: 600, color: BRAND, background: "none",
  border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, whiteSpace: "nowrap",
};
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 };
const thStyle = {
  padding: "9px 14px", textAlign: "left", fontWeight: 700, fontSize: 11.5, color: T.gray700,
  background: T.gray50, borderBottom: `1px solid ${T.gray200}`, whiteSpace: "nowrap",
};
const tdStyle = { padding: "8px 14px", verticalAlign: "top" };
const numTd = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const pagerBtn = disabled => ({
  padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: T.radius,
  border: `1px solid ${T.gray300}`, background: T.white, fontFamily: "inherit",
  color: disabled ? T.gray400 : T.gray700, cursor: disabled ? "default" : "pointer",
});

// ── Print report ─────────────────────────────────────────────────────────────
// Deliberately plain: black-on-white, real tables with repeating headers, and
// page breaks between sections. This is what "Export → PDF" produces, and it
// is meant to be readable on paper and forwardable to a manager, not a
// screenshot of the dashboard.

const P = {
  h1: { fontSize: 18, fontWeight: 700, margin: "0 0 2px" },
  h2: { fontSize: 13, fontWeight: 700, margin: "0 0 6px", paddingBottom: 3, borderBottom: "2px solid #0053a1", color: "#0053a1" },
  section: { marginTop: 16, pageBreakInside: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 9.5 },
  th: { textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #333", fontWeight: 700, background: "#eef4fb" },
  td: { textAlign: "left", padding: "3px 6px", borderBottom: "1px solid #ddd", verticalAlign: "top" },
};

function PrintTable({ head, rows, align = [] }) {
  return (
    <table style={P.table}>
      <thead style={{ display: "table-header-group" }}>
        <tr>{head.map((h, i) => <th key={h} style={{ ...P.th, textAlign: align[i] || "left" }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ pageBreakInside: "avoid" }}>
            {r.map((c, j) => <td key={j} style={{ ...P.td, textAlign: align[j] || "left" }}>{c === "" || c == null ? "—" : String(c)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintReport({ mode, scope, kpis, stats, rows, filteredCount }) {
  const pct = c => (filteredCount ? `${((c / filteredCount) * 100).toFixed(1)}%` : "0%");
  return (
    <div id="trend-print-report" style={{ fontFamily: "'Source Sans 3', system-ui, sans-serif", color: "#131922", padding: 0 }}>
      {/* Scoped to this block's lifetime: it only exists while an export is
          running, so an ordinary Ctrl+P on the dashboard still prints the
          page instead of hiding everything and emitting a blank sheet. */}
      <style>{`
        #trend-print-report { display: none; }
        @media print {
          body > *:not(#trend-print-report) { display: none !important; }
          #trend-print-report { display: block !important; }
          @page { margin: 0.5in; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #0053a1", paddingBottom: 8, marginBottom: 4 }}>
        <div>
          <h1 style={P.h1}>Issue Trend Analysis</h1>
          <div style={{ fontSize: 11, color: "#5d6773" }}>
            Rotech Healthcare — Accreditation Survey Prep · {mode === "full" ? "Full report" : "Summary report"}
          </div>
        </div>
        {/* Decorative: if the logo can't be fetched (offline, path change) a
            broken-image glyph would be printed onto the report, so drop it. */}
        <img src="/rotech-survey-prep/rotech-logo.jpg" alt="" aria-hidden="true"
          onError={e => { e.currentTarget.style.display = "none"; }}
          style={{ height: 30, width: "auto" }} />
      </div>

      <div style={P.section}>
        <h2 style={P.h2}>Report scope</h2>
        <table style={{ ...P.table, fontSize: 10 }}>
          <tbody>
            {scope.map(([k, v]) => (
              <tr key={k}>
                <td style={{ ...P.td, width: 130, fontWeight: 700, borderBottom: "none" }}>{k}</td>
                <td style={{ ...P.td, borderBottom: "none" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={P.section}>
        <h2 style={P.h2}>Key figures</h2>
        <PrintTable head={["Metric", "Value"]} rows={kpis.map(([k, v]) => [k, v])} align={["left", "right"]} />
      </div>

      {stats.months.length > 0 && (
        <div style={P.section}>
          <h2 style={P.h2}>Issues per month</h2>
          <PrintTable head={["Month", "Issues"]} rows={stats.months.map(m => [m.label, m.count])} align={["left", "right"]} />
        </div>
      )}

      <div style={{ ...P.section, pageBreakBefore: "always" }}>
        <h2 style={P.h2}>Recurring issues ({stats.recurring.length})</h2>
        <div style={{ fontSize: 9.5, color: "#5d6773", marginBottom: 5 }}>
          Same item failing at the same site on two or more separate visits.
        </div>
        {stats.recurring.length === 0
          ? <div style={{ fontSize: 10 }}>None in this slice.</div>
          : <PrintTable head={["Site", "Item", "Section", "Area manager", "Visits", "Last seen"]}
              align={["left", "left", "left", "left", "right", "left"]}
              rows={stats.recurring.map(r => [r.location, r.item, r.section, r.areaManager, r.count, r.lastSeen])} />}
      </div>

      <div style={P.section}>
        <h2 style={P.h2}>Sites ({stats.locations.length})</h2>
        <PrintTable head={["Site", "Region", "Area manager", "Visits", "Issues", "Avg", "Most common issue"]}
          align={["left", "left", "left", "right", "right", "right", "left"]}
          rows={stats.locations.map(l => [l.location, l.region, l.areaManager, l.visits, l.issues, l.avg.toFixed(1), l.topItem])} />
      </div>

      <div style={P.section}>
        <h2 style={P.h2}>Most-failed items ({stats.items.length})</h2>
        <PrintTable head={["Item", "Findings", "% of total"]} align={["left", "right", "right"]}
          rows={stats.items.map(([item, c]) => [item, c, pct(c)])} />
      </div>

      <div style={P.section}>
        <h2 style={P.h2}>Issues by section ({stats.sections.length})</h2>
        <PrintTable head={["Section", "Issues", "% of total"]} align={["left", "right", "right"]}
          rows={stats.sections.map(([s, c]) => [s, c, pct(c)])} />
      </div>

      <div style={P.section}>
        <h2 style={P.h2}>Issues by area manager ({stats.managers.length})</h2>
        <PrintTable head={["Area manager", "Visits", "Issues", "Sites with findings"]} align={["left", "right", "right", "right"]}
          rows={stats.managers.map(m => [m.areaManager, m.visits, m.issues, m.sites.length])} />
      </div>

      {mode === "full" && (
        <div style={{ ...P.section, pageBreakBefore: "always" }}>
          <h2 style={P.h2}>Full issue log ({rows.length})</h2>
          <PrintTable head={["Date", "Site", "Area manager", "Section", "Item", "Comment", "Specialist"]}
            rows={rows.map(r => [r.date, r.location, r.areaManager, r.section, r.itemText, r.comment, r.specialist])} />
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 6, borderTop: "1px solid #c5ccd5", fontSize: 9, color: "#7c8794" }}>
        Generated from Rotech Survey Prep · figures reflect the filters listed under “Report scope”.
      </div>
    </div>
  );
}
