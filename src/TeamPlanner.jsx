import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, query as fsQuery, where, getDocs, writeBatch } from "firebase/firestore";
import { db, auth } from "./firebase";
import { T, Icon, cardStyle, btnPrimary, btnOutline, metaLabel, metaField } from "./theme";
import {
  PLANNER_ADMIN_EMAILS, PEOPLE_COLLECTION, TASKS_COLLECTION, ENTRIES_COLLECTION, MILESTONES_COLLECTION,
  STATUSES, STATUS_BY_ID, OUT_STATUSES, CADENCES, MONTH_NAMES,
  toIso, fromIso, todayIso, addDays, weekStart, monthKey, quarterOf, monthsOfQuarter,
  formatDate, formatRange, monthWeekdayGrid, weekdaysOfMonth,
  entryCovers, entryDayCount, isMultiDay, hasTravelDetail,
  taskDueBucket, cadenceRank, cadenceLabel, findPersonForEmail,
} from "./teamPlannerData";

// ─── TEAM PLANNER ────────────────────────────────────────────────────────────
// Team oversight and visit/PTO planning — the replacement for
// Team_Planner_5.21.2026.xlsx. Four views over three collections:
//
//   Today        who is out right now and what recurring work is in play
//   Tasks        the recurring compliance list, filterable by specialist/cadence
//   Whereabouts  one team calendar, replacing the ten per-person tabs
//   Print        month-at-a-glance and quarter rollup, the workflow the team
//                actually relied on the Excel grids for
//
// This module is entirely separate from the survey-prep checklist: no shared
// collections, and survey due dates stay where they already live.
// ─────────────────────────────────────────────────────────────────────────────

const VIEWS = [
  { id: "today",       label: "Today",        icon: "clock" },
  { id: "tasks",       label: "Task Calendar", icon: "repeat" },
  { id: "whereabouts", label: "Whereabouts",  icon: "calendar" },
  { id: "print",       label: "Print Summary", icon: "printer" },
];

// Status colours. Site visits and travel are the two the eye needs to find
// first on a month grid, so they get the saturated brand colours; the everyday
// home-office state stays deliberately quiet.
const STATUS_STYLE = {
  home_office:          { bg: T.gray100,   fg: T.gray700,   border: T.gray300 },
  site_visit:           { bg: T.blue50,    fg: T.blue600,   border: "#b8d3ee" },
  travel:               { bg: "#e6f6fa",   fg: T.tealDeep,  border: "#a5dfeb" },
  pto:                  { bg: T.successBg, fg: T.success,   border: T.successBorder },
  flex_holiday:         { bg: T.successBg, fg: T.success,   border: T.successBorder },
  limited_availability: { bg: T.warningBg, fg: T.warning,   border: "#e3c894" },
  meeting:              { bg: "#f0ecfa",   fg: "#5b4b9e",   border: "#cfc4ea" },
  holiday:              { bg: T.errorBg,   fg: T.error,     border: T.errorBorder },
  other:                { bg: T.white,     fg: T.gray600,   border: T.gray300 },
};
const styleFor = id => STATUS_STYLE[id] || STATUS_STYLE.other;

const EMPTY_TRAVEL = {
  hotel:  { name: "", confirmation: "", checkIn: "", checkOut: "", phone: "", notes: "" },
  flight: {
    airline: "", confirmation: "", departAirport: "", departTime: "", arriveAirport: "", arriveTime: "", notes: "",
    returnFlight: { airline: "", confirmation: "", departAirport: "", departTime: "", arriveAirport: "", arriveTime: "" },
  },
};

// Appends an immutable audit record, mirroring the helper the survey-prep side
// uses for the locations roster. `before` holds the full documents rather than
// a count, so a deletion done in error can be reconstructed — this app has
// twice had a collection found empty with no record of who or when, and bulk
// deletion is the one action here that can repeat that.
async function logPlannerAudit(collectionName, docId, action, before, after) {
  try {
    await setDoc(doc(collection(db, "auditLog")), {
      collection: collectionName,
      docId,
      action,
      before: before ?? null,
      after: after ?? null,
      user: auth.currentUser?.displayName || "",
      userEmail: auth.currentUser?.email || "",
      at: Date.now(),
    });
  } catch (err) {
    console.error("Audit log write failed (change was still applied):", err);
  }
}

// Snapshots can be hundreds of entries; Firestore caps a document at 1 MiB, so
// the record is split rather than risking a write that fails and leaves the
// deletion unlogged.
const AUDIT_CHUNK = 150;
async function logDeletedEntries(docId, action, entries) {
  for (let i = 0; i < entries.length; i += AUDIT_CHUNK) {
    await logPlannerAudit(ENTRIES_COLLECTION, docId, action, {
      entries: entries.slice(i, i + AUDIT_CHUNK),
      part: Math.floor(i / AUDIT_CHUNK) + 1,
      ofParts: Math.ceil(entries.length / AUDIT_CHUNK),
      totalDeleted: entries.length,
    }, null);
  }
}

// Firestore's writeBatch caps at 500 operations.
async function deleteAll(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach(r => batch.delete(r));
    await batch.commit();
  }
}

const blankEntry = (personKey, personName, ownerEmail, iso) => ({
  personKey, personName, ownerEmail, ownerUid: auth.currentUser?.uid || null,
  startDate: iso, endDate: iso, status: "home_office", rawText: "", notes: "",
  visit: { location: "", purpose: "", multiDay: false },
  travel: structuredClone(EMPTY_TRAVEL),
});

// ─── DATA ────────────────────────────────────────────────────────────────────

// Roster, tasks and milestones are small and always wanted; entries are scoped
// to one calendar year at a time (~1,000 docs) so paging between months never
// re-queries. A multi-day entry that starts in December and runs into January
// is why the window opens a month early.
function usePlannerData(year) {
  const [people, setPeople] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const onErr = e => setError(e?.message || "Could not load Team Planner data.");
    const subs = [
      onSnapshot(collection(db, PEOPLE_COLLECTION),
        s => setPeople(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr),
      onSnapshot(collection(db, TASKS_COLLECTION),
        s => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr),
      onSnapshot(collection(db, MILESTONES_COLLECTION),
        s => setMilestones(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr),
    ];
    return () => subs.forEach(u => u());
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = fsQuery(
      collection(db, ENTRIES_COLLECTION),
      where("startDate", ">=", `${year - 1}-12-01`),
      where("startDate", "<=", `${year}-12-31`),
    );
    return onSnapshot(q, s => {
      setEntries(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, e => { setError(e?.message || "Could not load calendar entries."); setLoading(false); });
  }, [year]);

  return { people, tasks, milestones, entries, loading, error };
}

// ─── SHARED BITS ─────────────────────────────────────────────────────────────

function StatusChip({ status, children, style }) {
  const s = styleFor(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.fg,
      border: `1px solid ${s.border}`, borderRadius: T.radiusPill, padding: "1px 8px",
      fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", ...style,
    }}>{children ?? STATUS_BY_ID[status]?.label ?? status}</span>
  );
}

function SectionCard({ accent, title, icon, right, children, pad = true }) {
  return (
    <div style={{ ...cardStyle(accent), marginBottom: 18 }}>
      <div style={{ padding: "15px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
          {icon && <Icon name={icon} size={15} style={{ color: T.gray600 }} />}{title}
        </div>
        {right}
      </div>
      <div style={{ padding: pad ? "12px 20px 18px" : "12px 0 0" }}>{children}</div>
    </div>
  );
}

function EmptyNote({ children }) {
  return <div style={{ fontSize: 13.5, color: T.gray500, padding: "10px 0" }}>{children}</div>;
}

const selectStyle = { ...metaField, padding: "7px 10px", fontSize: 13.5, width: "auto", minWidth: 150 };

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function TeamPlanner() {
  const [view, setView] = useState("today");
  const [anchor, setAnchor] = useState(() => todayIso());   // drives month/quarter paging
  const [showRoster, setShowRoster] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [editing, setEditing] = useState(null);             // entry draft in the modal
  const [detail, setDetail] = useState(null);               // entry shown in the drawer

  const year = Number(anchor.slice(0, 4));
  const { people, tasks, milestones, entries, loading, error } = usePlannerData(year);

  const email = auth.currentUser?.email || "";
  const isAdmin = PLANNER_ADMIN_EMAILS.includes(email);
  const me = useMemo(() => findPersonForEmail(people, email), [people, email]);

  const roster = useMemo(
    () => [...people].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || String(a.displayName).localeCompare(String(b.displayName))),
    [people],
  );
  const activeRoster = useMemo(() => roster.filter(p => p.active !== false), [roster]);
  const nameOf = useCallback(
    key => roster.find(p => p.personKey === key)?.displayName || key || "—",
    [roster],
  );

  const canEdit = useCallback(
    entry => isAdmin || (!!entry?.ownerEmail && entry.ownerEmail === email),
    [isAdmin, email],
  );

  function startNewEntry(iso) {
    if (!me && !isAdmin) return;
    const person = me || activeRoster[0];
    if (!person) return;
    setEditing(blankEntry(person.personKey, person.displayName, person.email || email, iso || todayIso()));
  }

  async function saveEntry(draft) {
    const id = draft.id || doc(collection(db, ENTRIES_COLLECTION)).id;
    const { id: _drop, ...body } = draft;
    await setDoc(doc(db, ENTRIES_COLLECTION, id), {
      ...body,
      endDate: body.endDate || body.startDate,
      visit: { ...body.visit, multiDay: isMultiDay(body) },
      ownerUid: auth.currentUser?.uid || body.ownerUid || null,
      updatedAt: new Date().toISOString(),
      ...(draft.id ? {} : { createdAt: new Date().toISOString() }),
    }, { merge: true });
    setEditing(null);
    setDetail(null);
  }

  async function removeEntry(entry) {
    if (!window.confirm(`Delete ${nameOf(entry.personKey)}'s entry for ${formatRange(entry.startDate, entry.endDate)}?`)) return;
    await deleteDoc(doc(db, ENTRIES_COLLECTION, entry.id));
    setEditing(null);
    setDetail(null);
  }

  const viewProps = {
    anchor, setAnchor, entries, tasks, milestones, roster, activeRoster, nameOf,
    me, isAdmin, canEdit, onOpen: setDetail, onEdit: setEditing, onNew: startNewEntry, loading,
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 28px 80px" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em" }}>Team Planner</div>
          <div style={{ fontSize: 14, color: T.gray600, marginTop: 2 }}>
            Recurring duties, whereabouts and visit planning for the accreditation team
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(me || isAdmin) && (
            <button onClick={() => setShowManage(true)} style={btnOutline}>
              <Icon name="list-checks" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />My Entries
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowRoster(true)} style={btnOutline}>
              <Icon name="users" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />Roster
            </button>
          )}
          <button onClick={() => startNewEntry(todayIso())} disabled={!me && !isAdmin}
            title={!me && !isAdmin ? "Your account is not mapped to a roster person yet — an admin can do this from Roster." : ""}
            style={{ ...btnPrimary, opacity: !me && !isAdmin ? 0.5 : 1, cursor: !me && !isAdmin ? "default" : "pointer" }}>
            <Icon name="plus" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />Add Entry
          </button>
        </div>
      </div>

      {!me && !isAdmin && !loading && (
        <div className="no-print" style={{ background: T.warningBg, border: "1px solid #e3c894", color: T.warning, borderRadius: T.radius, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
          You can see the whole team's calendar, but your sign-in isn't linked to a roster person yet, so you have nothing of your own to edit. An admin can link it from the Roster panel.
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, borderRadius: T.radius, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* View rail */}
      <div className="no-print" style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap", borderBottom: `1px solid ${T.gray200}`, paddingBottom: 10 }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13.5, fontWeight: 600,
              background: view === v.id ? T.blue600 : T.white, color: view === v.id ? T.white : T.gray700,
              border: `1px solid ${view === v.id ? T.blue600 : T.gray300}`, borderRadius: T.radiusPill,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            <Icon name={v.icon} size={14} />{v.label}
          </button>
        ))}
      </div>

      {view === "today"       && <TodayView {...viewProps} />}
      {view === "tasks"       && <TaskCalendarView {...viewProps} />}
      {view === "whereabouts" && <WhereaboutsView {...viewProps} />}
      {view === "print"       && <PrintSummaryView {...viewProps} />}

      {detail && (
        <EntryDetail entry={detail} nameOf={nameOf} canEdit={canEdit(detail)}
          onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} />
      )}
      {editing && (
        <EntryModal draft={editing} roster={activeRoster} isAdmin={isAdmin} me={me}
          onChange={setEditing} onSave={saveEntry} onDelete={removeEntry} onClose={() => setEditing(null)} />
      )}
      {showRoster && (
        <RosterPanel roster={roster} onClose={() => setShowRoster(false)} />
      )}
      {showManage && (
        <ManageEntriesPanel me={me} isAdmin={isAdmin} roster={roster} onClose={() => setShowManage(false)} />
      )}
    </div>
  );
}

// ─── TODAY ───────────────────────────────────────────────────────────────────

function TodayView({ entries, tasks, milestones, nameOf, onOpen, activeRoster }) {
  const today = todayIso();
  const ws = weekStart(today);
  const weekDays = [0, 1, 2, 3, 4].map(i => addDays(ws, i));

  const todayEntries = entries.filter(e => entryCovers(e, today));
  const out = todayEntries.filter(e => OUT_STATUSES.includes(e.status));
  const inOffice = activeRoster.filter(p => {
    const e = todayEntries.find(x => x.personKey === p.personKey);
    return e && !OUT_STATUSES.includes(e.status);
  });
  const unaccounted = activeRoster.filter(p => !todayEntries.some(x => x.personKey === p.personKey));

  const buckets = { today: [], week: [], month: [] };
  tasks.filter(t => t.active !== false).forEach(t => {
    const b = taskDueBucket(t, today);
    if (b) buckets[b].push(t);
  });
  Object.values(buckets).forEach(list => list.sort((a, b) => cadenceRank(a) - cadenceRank(b) || String(a.name).localeCompare(String(b.name))));

  const todayMonth = Number(today.slice(5, 7));
  const todayDay = Number(today.slice(8, 10));
  const upcomingMilestones = milestones
    .map(m => ({ ...m, days: daysUntilAnnual(m.month, m.day, todayMonth, todayDay) }))
    .filter(m => m.days !== null && m.days <= 30)
    .sort((a, b) => a.days - b.days);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18, alignItems: "start" }}>
      <div>
        <SectionCard accent={T.blue600} icon="users" title={`Out today — ${formatDate(today, { weekday: "long", month: "long", day: "numeric" })}`}>
          {out.length === 0 ? <EmptyNote>Nobody is marked out today.</EmptyNote> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {out.map(e => (
                <button key={e.id} onClick={() => onOpen(e)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left",
                    background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>{nameOf(e.personKey)}</span>
                    <span style={{ fontSize: 12.5, color: T.gray600, display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.visit?.location || e.rawText || STATUS_BY_ID[e.status]?.label}
                      {isMultiDay(e) && ` · ${formatRange(e.startDate, e.endDate)}`}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {hasTravelDetail(e) && <Icon name="plane" size={13} style={{ color: T.gray500 }} />}
                    <StatusChip status={e.status} />
                  </span>
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 12.5, color: T.gray500 }}>
            {inOffice.length} in office · {unaccounted.length} with nothing recorded
            {unaccounted.length > 0 && <span style={{ color: T.gray400 }}> ({unaccounted.map(p => p.displayName.split(" ")[0]).join(", ")})</span>}
          </div>
        </SectionCard>

        <SectionCard accent={T.teal} icon="calendar" title="This week">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {weekDays.map(iso => {
              const dayOut = entries.filter(e => entryCovers(e, iso) && OUT_STATUSES.includes(e.status));
              return (
                <div key={iso} style={{ border: `1px solid ${iso === today ? T.blue600 : T.gray200}`, borderRadius: T.radius, padding: 8, background: iso === today ? T.blue50 : T.white, minHeight: 78 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {formatDate(iso, { weekday: "short" })} {fromIso(iso).getDate()}
                  </div>
                  <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
                    {dayOut.length === 0 ? <span style={{ fontSize: 11.5, color: T.gray400 }}>All in</span> :
                      dayOut.map(e => (
                        <button key={e.id} onClick={() => onOpen(e)} title={`${nameOf(e.personKey)} — ${e.visit?.location || STATUS_BY_ID[e.status]?.label}`}
                          style={{ ...chipButton(styleFor(e.status)) }}>
                          {nameOf(e.personKey).split(" ")[0]} · {STATUS_BY_ID[e.status]?.short}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div>
        <SectionCard accent={T.warning} icon="repeat" title="Recurring tasks in play">
          {["today", "week", "month"].map(bucket => (
            <div key={bucket} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.gray500, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                {bucket === "today" ? "Due today" : bucket === "week" ? "This week" : "This month"}
              </div>
              {buckets[bucket].length === 0 ? <EmptyNote>Nothing scheduled.</EmptyNote> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {buckets[bucket].map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
            </div>
          ))}
        </SectionCard>

        {upcomingMilestones.length > 0 && (
          <SectionCard accent={T.success} icon="check-circle" title="Birthdays & anniversaries — next 30 days">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {upcomingMilestones.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5 }}>
                  <span>{m.label || `${nameOf(m.personKey)} — ${m.type === "birthday" ? "Birthday" : "Work anniversary"}`}</span>
                  <span style={{ color: T.gray500, whiteSpace: "nowrap" }}>
                    {MONTH_NAMES[m.month - 1]?.slice(0, 3)} {m.day}{m.days === 0 ? " · today" : ""}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

const chipButton = s => ({
  background: s.bg, color: s.fg, border: `1px solid ${s.border}`, borderRadius: 5,
  padding: "2px 5px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%",
});

// Days until the next occurrence of an annual month/day, wrapping the year end.
function daysUntilAnnual(month, day, curMonth, curDay) {
  if (!month || !day) return null;
  const y = new Date().getFullYear();
  const target = new Date(y, month - 1, day);
  const now = new Date(y, curMonth - 1, curDay);
  if (target < now) target.setFullYear(y + 1);
  return Math.round((target - now) / 86400000);
}

function TaskRow({ task }) {
  const who = task.assignee?.type === "team" ? "Team"
    : task.assignee?.displayName || (task.assignee?.type === "unassigned" ? "Unassigned" : "—");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "7px 10px", background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: T.radius }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{task.name}</div>
        {task.comments && <div style={{ fontSize: 12, color: T.gray600, marginTop: 2 }}>{task.comments}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.gray700 }}>{who}</div>
        <div style={{ fontSize: 11.5, color: T.gray500 }}>{cadenceLabel(task)}</div>
      </div>
    </div>
  );
}

// ─── TASK CALENDAR ───────────────────────────────────────────────────────────

function TaskCalendarView({ tasks, roster }) {
  const [person, setPerson] = useState("");
  const [cadence, setCadence] = useState("");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState("list");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter(t => t.active !== false)
      .filter(t => !person || t.assignee?.personKey === person || (person === "__team" && t.assignee?.type === "team"))
      .filter(t => !cadence || t.cadence?.type === cadence)
      .filter(t => !q || `${t.name} ${t.comments} ${t.scope}`.toLowerCase().includes(q))
      .sort((a, b) => cadenceRank(a) - cadenceRank(b)
        || (a.cadence?.date || "").localeCompare(b.cadence?.date || "")
        || String(a.name).localeCompare(String(b.name)));
  }, [tasks, person, cadence, search]);

  // The old "Tasks by Month" tab was a quarter grid of month blocks; it held no
  // data of its own, so it is rendered here from the same task list rather than
  // migrated as a second copy that can drift out of sync.
  const byMonth = useMemo(() => {
    const m = Array.from({ length: 12 }, () => []);
    filtered.forEach(t => {
      const c = t.cadence || {};
      if (c.type === "oneOff" && c.date) m[Number(c.date.slice(5, 7)) - 1].push(t);
      else if (c.months?.length) c.months.forEach(mo => m[mo - 1].push(t));
    });
    return m;
  }, [filtered]);

  const recurringCount = filtered.filter(t => t.cadence?.type !== "standing").length;

  return (
    <>
      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={person} onChange={e => setPerson(e.target.value)} aria-label="Filter by specialist" style={selectStyle}>
          <option value="">All specialists</option>
          <option value="__team">Team-wide only</option>
          {roster.map(p => <option key={p.personKey} value={p.personKey}>{p.displayName}</option>)}
        </select>
        <select value={cadence} onChange={e => setCadence(e.target.value)} aria-label="Filter by cadence" style={selectStyle}>
          <option value="">All cadences</option>
          {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" aria-label="Search tasks"
          style={{ ...metaField, padding: "7px 10px", fontSize: 13.5, width: 220 }} />
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {[["list", "table", "List"], ["months", "layout-grid", "By month"]].map(([id, icon, label]) => (
            <button key={id} onClick={() => setLayout(id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                background: layout === id ? T.blue50 : T.white, color: layout === id ? T.blue600 : T.gray700,
                border: `1px solid ${layout === id ? T.blue600 : T.gray300}`, borderRadius: T.radius }}>
              <Icon name={icon} size={13} />{label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: T.gray500, marginBottom: 10 }}>
        {filtered.length} tasks · {recurringCount} scheduled, {filtered.length - recurringCount} standing duties
      </div>

      {layout === "list" ? (
        <div style={{ ...cardStyle(T.warning), overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: T.gray50 }}>
                {["Task", "Cadence", "Specialist", "Applies to", "Comments"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.gray200}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, color: T.gray500 }}>No tasks match these filters.</td></tr>
              )}
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${T.gray100}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: T.gray700 }}>{cadenceLabel(t)}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    {t.assignee?.type === "team"
                      ? <span style={{ fontWeight: 600, color: T.blue600 }}>Team</span>
                      : t.assignee?.displayName || <span style={{ color: T.gray400 }}>Unassigned</span>}
                  </td>
                  <td style={{ padding: "10px 14px", color: T.gray600 }}>{t.scope || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.gray600 }}>{t.comments || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          {byMonth.map((list, i) => (
            <div key={i} style={cardStyle(quarterAccent(quarterOf(i + 1)))}>
              <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{MONTH_NAMES[i]}</span>
                <span style={{ fontSize: 11.5, color: T.gray500 }}>Q{quarterOf(i + 1)} · {list.length}</span>
              </div>
              <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
                {list.length === 0 ? <span style={{ fontSize: 12.5, color: T.gray400 }}>Nothing scheduled</span> :
                  list.map(t => (
                    <div key={`${t.id}-${i}`} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                      <span style={{ color: T.gray500, whiteSpace: "nowrap" }}>
                        {t.assignee?.type === "team" ? "Team" : (t.assignee?.displayName || "").split(" ")[0]}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const quarterAccent = q => [T.blue600, T.teal, T.warning, T.success][q - 1];

// ─── WHEREABOUTS ─────────────────────────────────────────────────────────────

function WhereaboutsView({ anchor, setAnchor, entries, roster, nameOf, onOpen, onNew, me, isAdmin, loading }) {
  const [person, setPerson] = useState("");
  const [status, setStatus] = useState("");
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const grid = useMemo(() => monthWeekdayGrid(year, month), [year, month]);
  const today = todayIso();

  const shown = useMemo(
    () => entries.filter(e => (!person || e.personKey === person) && (!status || e.status === status)),
    [entries, person, status],
  );

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthEntries = shown.filter(e => monthKey(e.startDate) === monthPrefix || monthKey(e.endDate || e.startDate) === monthPrefix);

  return (
    <>
      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <MonthPager anchor={anchor} setAnchor={setAnchor} />
        <select value={person} onChange={e => setPerson(e.target.value)} aria-label="Filter by person" style={selectStyle}>
          <option value="">Whole team</option>
          {roster.map(p => <option key={p.personKey} value={p.personKey}>{p.displayName}{p.active === false ? " (inactive)" : ""}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status" style={selectStyle}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: T.gray500, marginLeft: "auto" }}>
          {loading ? "Loading…" : `${monthEntries.length} entries this month`}
        </span>
      </div>

      <div style={cardStyle(T.blue600)}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: `1px solid ${T.gray200}` }}>
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d => (
            <div key={d} style={{ padding: "10px 12px", fontSize: 11.5, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>{d}</div>
          ))}
        </div>
        {grid.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
            {week.map((iso, di) => {
              const dayEntries = iso ? shown.filter(e => entryCovers(e, iso)) : [];
              return (
                <div key={di} style={{
                  minHeight: 108, padding: 8, borderRight: di < 4 ? `1px solid ${T.gray100}` : "none",
                  borderTop: wi > 0 ? `1px solid ${T.gray100}` : "none",
                  background: iso === today ? T.blue50 : iso ? T.white : T.gray50,
                }}>
                  {iso && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 12.5, fontWeight: iso === today ? 800 : 600, color: iso === today ? T.blue600 : T.gray600 }}>
                          {fromIso(iso).getDate()}
                        </span>
                        {(me || isAdmin) && (
                          <button className="no-print" onClick={() => onNew(iso)} aria-label={`Add entry for ${formatDate(iso)}`}
                            style={{ background: "none", border: "none", color: T.gray400, cursor: "pointer", padding: 0, lineHeight: 1 }}>
                            <Icon name="plus" size={13} />
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {dayEntries.map(e => (
                          <button key={e.id} onClick={() => onOpen(e)}
                            title={`${nameOf(e.personKey)} — ${e.visit?.location || e.rawText || STATUS_BY_ID[e.status]?.label}${e.notes ? ` · ${e.notes}` : ""}`}
                            style={chipButton(styleFor(e.status))}>
                            <span style={{ fontWeight: 700 }}>{nameOf(e.personKey).split(" ")[0]}</span>{" "}
                            {e.visit?.location || STATUS_BY_ID[e.status]?.short}
                            {hasTravelDetail(e) && " ✈"}
                            {e.notes && " •"}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, fontSize: 12, color: T.gray600 }}>
        {STATUSES.map(s => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: styleFor(s.id).bg, border: `1px solid ${styleFor(s.id).border}` }} />
            {s.label}
          </span>
        ))}
        <span style={{ color: T.gray500 }}>✈ has hotel/flight detail · • has a note</span>
      </div>
    </>
  );
}

function MonthPager({ anchor, setAnchor, step = "month" }) {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const shift = n => {
    const d = new Date(year, month - 1 + (step === "quarter" ? n * 3 : n), 1);
    setAnchor(toIso(d));
  };
  const label = step === "quarter"
    ? `Q${quarterOf(month)} ${year}`
    : `${MONTH_NAMES[month - 1]} ${year}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button onClick={() => shift(-1)} aria-label="Previous" style={pagerBtn}><Icon name="chevron-left" size={15} /></button>
      <span style={{ fontSize: 15, fontWeight: 700, minWidth: 150, textAlign: "center" }}>{label}</span>
      <button onClick={() => shift(1)} aria-label="Next" style={pagerBtn}><Icon name="chevron-right" size={15} /></button>
      <button onClick={() => setAnchor(todayIso())} style={{ ...btnOutline, padding: "6px 12px", fontSize: 12.5, marginLeft: 6 }}>Today</button>
    </div>
  );
}
const pagerBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
  background: T.white, border: `1px solid ${T.gray300}`, borderRadius: T.radius, cursor: "pointer", color: T.gray700,
};

// ─── ENTRY DETAIL ────────────────────────────────────────────────────────────

// Hotel and flight details deliberately live only here, never inline on the
// calendar: a month grid that showed confirmation numbers would be unreadable,
// and this is reference material you want at the moment you're travelling.
function EntryDetail({ entry, nameOf, canEdit, onClose, onEdit }) {
  const s = styleFor(entry.status);
  const hotel = entry.travel?.hotel || {};
  const flight = entry.travel?.flight || {};
  const ret = flight.returnFlight || {};
  const hasHotel = Object.values(hotel).some(v => String(v || "").trim());
  const hasFlight = [flight.airline, flight.confirmation, flight.departTime, flight.arriveTime, flight.departAirport, flight.arriveAirport].some(v => String(v || "").trim());
  const hasReturn = Object.values(ret).some(v => String(v || "").trim());

  return (
    <Overlay onClose={onClose} labelledBy="tp-detail-title">
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div id="tp-detail-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>{nameOf(entry.personKey)}</div>
          <div style={{ fontSize: 13.5, color: T.gray600, marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatusChip status={entry.status} />
            {formatRange(entry.startDate, entry.endDate)}
            {isMultiDay(entry) && <span style={{ color: T.gray500 }}>· {entryDayCount(entry)} days</span>}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ ...pagerBtn, border: "none", background: "none" }}><Icon name="x" size={18} /></button>
      </div>

      <div style={{ padding: "18px 24px", maxHeight: "60vh", overflowY: "auto" }}>
        {entry.status === "site_visit" && (
          <DetailBlock icon="map-pin" title="Visit">
            <DetailRow label="Location" value={entry.visit?.location} />
            <DetailRow label="Purpose" value={entry.visit?.purpose} />
            <DetailRow label="Duration" value={isMultiDay(entry) ? `${entryDayCount(entry)} days (${formatRange(entry.startDate, entry.endDate)})` : "Single day"} />
          </DetailBlock>
        )}

        {entry.notes && (
          <DetailBlock icon="file-text" title="Notes">
            <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: T.gray700 }}>{entry.notes}</div>
          </DetailBlock>
        )}

        {hasHotel && (
          <DetailBlock icon="bed" title="Hotel">
            <DetailRow label="Hotel" value={hotel.name} />
            <DetailRow label="Confirmation #" value={hotel.confirmation} mono />
            <DetailRow label="Check-in" value={hotel.checkIn && formatDate(hotel.checkIn, { weekday: "short", month: "short", day: "numeric" })} />
            <DetailRow label="Check-out" value={hotel.checkOut && formatDate(hotel.checkOut, { weekday: "short", month: "short", day: "numeric" })} />
            <DetailRow label="Phone" value={hotel.phone} />
            <DetailRow label="Notes" value={hotel.notes} />
          </DetailBlock>
        )}

        {hasFlight && (
          <DetailBlock icon="plane" title="Flight">
            <DetailRow label="Airline" value={flight.airline} />
            <DetailRow label="Confirmation #" value={flight.confirmation} mono />
            <DetailRow label="Outbound" value={[flight.departAirport, flight.departTime].filter(Boolean).join(" ") + (flight.arriveAirport || flight.arriveTime ? ` → ${[flight.arriveAirport, flight.arriveTime].filter(Boolean).join(" ")}` : "")} />
            {hasReturn && (
              <DetailRow label="Return" value={[ret.departAirport, ret.departTime].filter(Boolean).join(" ") + (ret.arriveAirport || ret.arriveTime ? ` → ${[ret.arriveAirport, ret.arriveTime].filter(Boolean).join(" ")}` : "") + (ret.airline ? ` · ${ret.airline}` : "") + (ret.confirmation ? ` · ${ret.confirmation}` : "")} />
            )}
            <DetailRow label="Notes" value={flight.notes} />
          </DetailBlock>
        )}

        {entry.status === "site_visit" && !hasHotel && !hasFlight && (
          <EmptyNote>No hotel or flight details recorded for this visit yet.</EmptyNote>
        )}

        {entry.rawText && entry.rawText !== entry.visit?.location && (
          <div style={{ marginTop: 14, fontSize: 12, color: T.gray500 }}>
            From the spreadsheet: <span style={{ fontStyle: "italic" }}>“{entry.rawText}”</span>
          </div>
        )}
      </div>

      <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={btnOutline}>Close</button>
        {canEdit && <button onClick={onEdit} style={btnPrimary}><Icon name="square-pen" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />Edit</button>}
      </div>
    </Overlay>
  );
}

function DetailBlock({ icon, title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.gray500, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={13} />{title}
      </div>
      <div style={{ background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: "10px 14px" }}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  if (!String(value || "").trim()) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "4px 0", fontSize: 13.5 }}>
      <span style={{ color: T.gray600, minWidth: 118, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

function Overlay({ children, onClose, labelledBy, width = 620 }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="no-print" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(19,25,34,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1200 }}>
      <div style={{ background: T.white, borderRadius: T.radiusCard, width: "100%", maxWidth: width, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(19,25,34,.3)" }}>
        {children}
      </div>
    </div>
  );
}

// ─── ENTRY EDITOR ────────────────────────────────────────────────────────────

function EntryModal({ draft, roster, isAdmin, me, onChange, onSave, onDelete, onClose }) {
  const [saving, setSaving] = useState(false);
  const [showTravel, setShowTravel] = useState(() => hasTravelDetail(draft));
  const set = (patch) => onChange({ ...draft, ...patch });
  const setVisit = patch => onChange({ ...draft, visit: { ...draft.visit, ...patch } });
  const setHotel = patch => onChange({ ...draft, travel: { ...draft.travel, hotel: { ...draft.travel?.hotel, ...patch } } });
  const setFlight = patch => onChange({ ...draft, travel: { ...draft.travel, flight: { ...draft.travel?.flight, ...patch } } });
  const setReturn = patch => setFlight({ returnFlight: { ...draft.travel?.flight?.returnFlight, ...patch } });

  const isVisit = draft.status === "site_visit";

  async function submit(e) {
    e.preventDefault();
    if (draft.endDate && draft.endDate < draft.startDate) return;
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  }

  const badRange = !!draft.endDate && draft.endDate < draft.startDate;

  return (
    <Overlay onClose={onClose} labelledBy="tp-edit-title">
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.gray200}` }}>
          <div id="tp-edit-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {draft.id ? "Edit entry" : "New entry"}
          </div>
        </div>

        <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1 }}>
          <Field label="Person">
            {isAdmin ? (
              <select value={draft.personKey} required style={metaField}
                onChange={e => {
                  const p = roster.find(x => x.personKey === e.target.value);
                  set({ personKey: p?.personKey || "", personName: p?.displayName || "", ownerEmail: p?.email || "" });
                }}>
                <option value="">Select…</option>
                {roster.map(p => <option key={p.personKey} value={p.personKey}>{p.displayName}</option>)}
              </select>
            ) : (
              <input value={me?.displayName || draft.personName || ""} readOnly style={{ ...metaField, background: T.gray50, color: T.gray600 }} />
            )}
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Start date">
              <input type="date" required value={draft.startDate} style={metaField}
                onChange={e => set({ startDate: e.target.value, endDate: draft.endDate && draft.endDate >= e.target.value ? draft.endDate : e.target.value })} />
            </Field>
            <Field label="End date" hint="Same as start for a single day">
              <input type="date" value={draft.endDate || draft.startDate} min={draft.startDate} style={metaField}
                onChange={e => set({ endDate: e.target.value })} />
            </Field>
          </div>
          {badRange && <div role="alert" style={{ fontSize: 12.5, color: T.error, marginTop: -6, marginBottom: 12 }}>End date can't be before the start date.</div>}

          <Field label="Status">
            <select value={draft.status} style={metaField} onChange={e => set({ status: e.target.value })}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>

          {isVisit && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Location"><input value={draft.visit?.location || ""} placeholder="Little Rock, AR" style={metaField} onChange={e => setVisit({ location: e.target.value })} /></Field>
              <Field label="Purpose"><input value={draft.visit?.purpose || ""} placeholder="Site visit / transfill" style={metaField} onChange={e => setVisit({ purpose: e.target.value })} /></Field>
            </div>
          )}

          <Field label="Notes" hint="Shows on the calendar as a dot; full text in this detail view">
            <textarea rows={3} value={draft.notes || ""} style={{ ...metaField, resize: "vertical" }}
              placeholder="Travelling with Aundrea…" onChange={e => set({ notes: e.target.value })} />
          </Field>

          {isVisit && (
            <>
              <button type="button" onClick={() => setShowTravel(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: T.blue600, marginBottom: 12 }}>
                <Icon name={showTravel ? "chevron-down" : "chevron-right"} size={14} />
                Hotel & flight details
                <span style={{ fontWeight: 400, color: T.gray500 }}>— never shown on the calendar</span>
              </button>

              {showTravel && (
                <div style={{ background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: "14px 16px", marginBottom: 14 }}>
                  <SubHead icon="bed">Hotel</SubHead>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Hotel name"><input value={draft.travel?.hotel?.name || ""} style={metaField} onChange={e => setHotel({ name: e.target.value })} /></Field>
                    <Field label="Confirmation #"><input value={draft.travel?.hotel?.confirmation || ""} style={metaField} onChange={e => setHotel({ confirmation: e.target.value })} /></Field>
                    <Field label="Check-in"><input type="date" value={draft.travel?.hotel?.checkIn || ""} style={metaField} onChange={e => setHotel({ checkIn: e.target.value })} /></Field>
                    <Field label="Check-out"><input type="date" value={draft.travel?.hotel?.checkOut || ""} style={metaField} onChange={e => setHotel({ checkOut: e.target.value })} /></Field>
                    <Field label="Phone"><input value={draft.travel?.hotel?.phone || ""} style={metaField} onChange={e => setHotel({ phone: e.target.value })} /></Field>
                    <Field label="Hotel notes"><input value={draft.travel?.hotel?.notes || ""} style={metaField} onChange={e => setHotel({ notes: e.target.value })} /></Field>
                  </div>

                  <SubHead icon="plane">Flight — outbound</SubHead>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Airline"><input value={draft.travel?.flight?.airline || ""} style={metaField} onChange={e => setFlight({ airline: e.target.value })} /></Field>
                    <Field label="Confirmation #"><input value={draft.travel?.flight?.confirmation || ""} style={metaField} onChange={e => setFlight({ confirmation: e.target.value })} /></Field>
                    <Field label="Departs from"><input value={draft.travel?.flight?.departAirport || ""} placeholder="DFW" style={metaField} onChange={e => setFlight({ departAirport: e.target.value })} /></Field>
                    <Field label="Departure time"><input value={draft.travel?.flight?.departTime || ""} placeholder="Mon 6:15a" style={metaField} onChange={e => setFlight({ departTime: e.target.value })} /></Field>
                    <Field label="Arrives at"><input value={draft.travel?.flight?.arriveAirport || ""} placeholder="LIT" style={metaField} onChange={e => setFlight({ arriveAirport: e.target.value })} /></Field>
                    <Field label="Arrival time"><input value={draft.travel?.flight?.arriveTime || ""} placeholder="Mon 8:40a" style={metaField} onChange={e => setFlight({ arriveTime: e.target.value })} /></Field>
                  </div>

                  <SubHead icon="plane">Flight — return</SubHead>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Airline"><input value={draft.travel?.flight?.returnFlight?.airline || ""} style={metaField} onChange={e => setReturn({ airline: e.target.value })} /></Field>
                    <Field label="Confirmation #"><input value={draft.travel?.flight?.returnFlight?.confirmation || ""} style={metaField} onChange={e => setReturn({ confirmation: e.target.value })} /></Field>
                    <Field label="Departs from"><input value={draft.travel?.flight?.returnFlight?.departAirport || ""} style={metaField} onChange={e => setReturn({ departAirport: e.target.value })} /></Field>
                    <Field label="Departure time"><input value={draft.travel?.flight?.returnFlight?.departTime || ""} style={metaField} onChange={e => setReturn({ departTime: e.target.value })} /></Field>
                    <Field label="Arrives at"><input value={draft.travel?.flight?.returnFlight?.arriveAirport || ""} style={metaField} onChange={e => setReturn({ arriveAirport: e.target.value })} /></Field>
                    <Field label="Arrival time"><input value={draft.travel?.flight?.returnFlight?.arriveTime || ""} style={metaField} onChange={e => setReturn({ arriveTime: e.target.value })} /></Field>
                  </div>

                  <Field label="Flight notes"><input value={draft.travel?.flight?.notes || ""} style={metaField} onChange={e => setFlight({ notes: e.target.value })} /></Field>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            {draft.id && (
              <button type="button" onClick={() => onDelete(draft)}
                style={{ ...btnOutline, color: T.error, borderColor: T.errorBorder }}>
                <Icon name="trash" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancel</button>
            <button type="submit" disabled={saving || badRange} style={{ ...btnPrimary, opacity: saving || badRange ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save entry"}
            </button>
          </div>
        </div>
      </form>
    </Overlay>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={metaLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function SubHead({ icon, children }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.07em", margin: "6px 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
      <Icon name={icon} size={13} />{children}
    </div>
  );
}

// ─── PRINT SUMMARY ───────────────────────────────────────────────────────────

// The team printed the old Excel month grids and worked off paper, so this has
// to survive the trip through a printer: landscape, one row per person, one
// narrow column per weekday, and no interactive chrome.
function PrintSummaryView({ anchor, setAnchor, entries, activeRoster, roster }) {
  const [mode, setMode] = useState("month");
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const quarter = quarterOf(month);
  const people = activeRoster.length ? activeRoster : roster;

  return (
    <>
      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <MonthPager anchor={anchor} setAnchor={setAnchor} step={mode === "quarter" ? "quarter" : "month"} />
        <div style={{ display: "flex", gap: 4 }}>
          {[["month", "Month"], ["quarter", "Quarter"]].map(([id, label]) => (
            <button key={id} onClick={() => setMode(id)}
              style={{ padding: "7px 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                background: mode === id ? T.blue50 : T.white, color: mode === id ? T.blue600 : T.gray700,
                border: `1px solid ${mode === id ? T.blue600 : T.gray300}`, borderRadius: T.radius }}>{label}</button>
          ))}
        </div>
        <button onClick={() => window.print()} style={{ ...btnPrimary, marginLeft: "auto" }}>
          <Icon name="printer" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />Print
        </button>
      </div>

      <div style={{ background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radiusCard, padding: "22px 24px" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            Rotech Accreditation Team — {mode === "month" ? `${MONTH_NAMES[month - 1]} ${year}` : `Q${quarter} ${year}`}
          </div>
          <div style={{ fontSize: 12.5, color: T.gray600, marginTop: 2 }}>
            Team whereabouts summary · printed {formatDate(todayIso(), { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>

        {mode === "month"
          ? <MonthGrid year={year} month={month} people={people} entries={entries} />
          : monthsOfQuarter(quarter).map(m => (
              <div key={m} style={{ marginBottom: 26, breakInside: "avoid" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}>{MONTH_NAMES[m - 1]} {year}</div>
                <MonthGrid year={year} month={m} people={people} entries={entries} compact />
              </div>
            ))}

        <QuarterRollup year={year} months={mode === "month" ? [month] : monthsOfQuarter(quarter)} people={people} entries={entries} />
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 0.4in; }
          body { background: #fff !important; }
        }
      `}</style>
    </>
  );
}

function MonthGrid({ year, month, people, entries, compact }) {
  const days = weekdaysOfMonth(year, month);
  const cellFont = compact ? 8.5 : 9.5;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ ...printTh, width: 92, textAlign: "left" }}>Specialist</th>
            {days.map(iso => (
              <th key={iso} style={{ ...printTh, fontSize: 8.5 }}>
                <div style={{ color: T.gray500 }}>{formatDate(iso, { weekday: "narrow" })}</div>
                {fromIso(iso).getDate()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map(p => (
            <tr key={p.personKey}>
              <td style={{ ...printTd, textAlign: "left", fontWeight: 700, fontSize: 10 }}>{p.displayName}</td>
              {days.map(iso => {
                const e = entries.find(x => x.personKey === p.personKey && entryCovers(x, iso));
                const s = e ? styleFor(e.status) : null;
                return (
                  <td key={iso} title={e ? `${e.visit?.location || e.rawText || ""} ${e.notes || ""}`.trim() : ""}
                    style={{ ...printTd, fontSize: cellFont, background: s ? s.bg : T.white, color: s ? s.fg : T.gray400, fontWeight: 600 }}>
                    {e ? (e.status === "site_visit" && e.visit?.location
                      ? abbrevLocation(e.visit.location)
                      : STATUS_BY_ID[e.status]?.short) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Little Rock, AR" -> "AR" in a 20px-wide print cell; the full string is in
// the trip list underneath and on the cell's tooltip on screen.
function abbrevLocation(loc) {
  const st = /,\s*([A-Z]{2})\s*$/.exec(String(loc));
  return st ? st[1] : String(loc).slice(0, 4);
}

const printTh = {
  border: `1px solid ${T.gray300}`, padding: "3px 2px", fontSize: 9, fontWeight: 700,
  background: T.gray50, textAlign: "center", color: T.gray700,
};
const printTd = {
  border: `1px solid ${T.gray200}`, padding: "3px 2px", textAlign: "center",
  overflow: "hidden", whiteSpace: "nowrap",
};

function QuarterRollup({ year, months, people, entries }) {
  const inScope = e => months.includes(Number(e.startDate.slice(5, 7))) && Number(e.startDate.slice(0, 4)) === year;

  const rows = people.map(p => {
    const mine = entries.filter(e => e.personKey === p.personKey && inScope(e));
    const dayCount = id => mine.filter(e => e.status === id).reduce((a, e) => a + entryDayCount(e), 0);
    return {
      person: p,
      pto: dayCount("pto") + dayCount("flex_holiday"),
      visitDays: dayCount("site_visit"),
      travelDays: dayCount("travel"),
      trips: mine.filter(e => e.status === "site_visit"),
    };
  });

  return (
    <div style={{ marginTop: 22, breakInside: "avoid" }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 8 }}>
        {months.length > 1 ? "Quarter rollup" : "Month rollup"}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["Specialist", "PTO / FH days", "Site visit days", "Travel days", "Site visits"].map(h => (
              <th key={h} style={{ ...printTh, textAlign: h === "Specialist" || h === "Site visits" ? "left" : "center", fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.person.personKey}>
              <td style={{ ...printTd, textAlign: "left", fontWeight: 700, fontSize: 11, width: 130 }}>{r.person.displayName}</td>
              <td style={{ ...printTd, fontSize: 11, width: 90 }}>{r.pto || "—"}</td>
              <td style={{ ...printTd, fontSize: 11, width: 90 }}>{r.visitDays || "—"}</td>
              <td style={{ ...printTd, fontSize: 11, width: 80 }}>{r.travelDays || "—"}</td>
              <td style={{ ...printTd, textAlign: "left", fontSize: 10.5, whiteSpace: "normal", lineHeight: 1.5 }}>
                {r.trips.length === 0 ? <span style={{ color: T.gray400 }}>—</span> :
                  r.trips.map(t => `${t.visit?.location || t.rawText || "Site visit"} (${formatRange(t.startDate, t.endDate)})`).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MANAGE MY ENTRIES ───────────────────────────────────────────────────────

// Bulk cleanup of your own calendar history. The per-entry Delete button in the
// editor handles one day; this exists for the case the whole module was built
// around — years of imported rows, where deleting a stale season one day at a
// time is not a real option.
//
// Queries by personKey across every year rather than the calendar's loaded
// window: "previous entries" is the main thing anyone wants to clear, and those
// are exactly the ones the calendar isn't showing.
function ManageEntriesPanel({ me, isAdmin, roster, onClose }) {
  const email = auth.currentUser?.email || "";
  const [personKey, setPersonKey] = useState(me?.personKey || (isAdmin ? roster[0]?.personKey : "") || "");
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!personKey) { setRows([]); return; }
    setRows(null);
    setSelected(new Set());
    getDocs(fsQuery(collection(db, ENTRIES_COLLECTION), where("personKey", "==", personKey)))
      .then(s => setRows(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.startDate.localeCompare(a.startDate))))
      .catch(e => { setRows([]); setResult(`Could not load entries: ${e.message}`); });
  }, [personKey]);

  const canDelete = entry => isAdmin || (!!entry.ownerEmail && entry.ownerEmail === email);

  const shown = useMemo(() => (rows || []).filter(e =>
    (!from || (e.endDate || e.startDate) >= from) &&
    (!to || e.startDate <= to) &&
    (!status || e.status === status)), [rows, from, to, status]);

  const deletable = shown.filter(canDelete);
  const blocked = shown.length - deletable.length;
  const selectedRows = shown.filter(e => selected.has(e.id));
  const allShownSelected = deletable.length > 0 && deletable.every(e => selected.has(e.id));

  function toggle(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAllShown() {
    setSelected(s => {
      const n = new Set(s);
      if (allShownSelected) deletable.forEach(e => n.delete(e.id));
      else deletable.forEach(e => n.add(e.id));
      return n;
    });
  }

  // The common ask is "clear out everything before this year".
  const thisYear = new Date().getFullYear();
  const presets = [
    { label: `Before ${thisYear}`, apply: () => { setFrom(""); setTo(`${thisYear - 1}-12-31`); } },
    { label: `${thisYear - 1} only`, apply: () => { setFrom(`${thisYear - 1}-01-01`); setTo(`${thisYear - 1}-12-31`); } },
    { label: "All dates", apply: () => { setFrom(""); setTo(""); } },
  ];

  const needsTyping = selectedRows.length > 20;
  const confirmOk = !needsTyping || typed.trim().toUpperCase() === "DELETE";

  async function runDelete() {
    setBusy(true);
    setResult("");
    try {
      const targets = selectedRows.filter(canDelete);
      const refs = targets.map(e => doc(db, ENTRIES_COLLECTION, e.id));
      await logDeletedEntries(personKey, "bulk-delete-entries", targets);
      await deleteAll(refs);
      setRows(prev => prev.filter(r => !selected.has(r.id)));
      setSelected(new Set());
      setConfirming(false);
      setTyped("");
      setResult(`Deleted ${targets.length} ${targets.length === 1 ? "entry" : "entries"}. A full snapshot is in the audit log.`);
    } catch (err) {
      setResult(`Delete failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    const dates = selectedRows.map(e => e.startDate).sort();
    return (
      <Overlay onClose={() => setConfirming(false)} labelledBy="tp-bulk-title">
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.gray200}` }}>
          <div id="tp-bulk-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: T.error }}>
            Delete {selectedRows.length} {selectedRows.length === 1 ? "entry" : "entries"}?
          </div>
        </div>
        <div style={{ padding: "18px 24px" }}>
          <div style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: T.radius, padding: "12px 14px", marginBottom: 16, fontSize: 13.5, color: T.gray700, lineHeight: 1.7 }}>
            Covering <strong>{formatDate(dates[0], { month: "short", day: "numeric", year: "numeric" })}</strong> to{" "}
            <strong>{formatDate(dates[dates.length - 1], { month: "short", day: "numeric", year: "numeric" })}</strong>.
            This removes them from the team calendar and from every print summary covering those months.
            Hotel and flight details on any site visits go with them.
          </div>
          <div style={{ fontSize: 13, color: T.gray600, marginBottom: 16 }}>
            A full snapshot is written to the audit log first, so this is recoverable — but only by reading it
            back out of Firestore by hand.
          </div>
          {needsTyping && (
            <Field label='Type "DELETE" to confirm'>
              <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus placeholder="DELETE" style={metaField} />
            </Field>
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setConfirming(false)} disabled={busy} style={btnOutline}>Cancel</button>
          <button onClick={runDelete} disabled={!confirmOk || busy}
            style={{ ...btnPrimary, background: T.error, opacity: !confirmOk || busy ? 0.5 : 1 }}>
            {busy ? "Deleting…" : `Delete ${selectedRows.length}`}
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose} labelledBy="tp-manage-title" width={780}>
      <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.gray200}` }}>
        <div id="tp-manage-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>
          {isAdmin && personKey !== me?.personKey ? "Manage entries" : "My entries"}
        </div>
        <div style={{ fontSize: 13, color: T.gray600, marginTop: 3 }}>
          Every recorded day, all years. Select what you want gone.
        </div>
      </div>

      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${T.gray200}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {isAdmin && (
          <select value={personKey} onChange={e => setPersonKey(e.target.value)} aria-label="Person" style={{ ...selectStyle, minWidth: 130 }}>
            {roster.map(p => <option key={p.personKey} value={p.personKey}>{p.displayName}</option>)}
          </select>
        )}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" style={{ ...selectStyle, minWidth: 0 }} />
        <span style={{ fontSize: 13, color: T.gray500 }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="To date" style={{ ...selectStyle, minWidth: 0 }} />
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status" style={selectStyle}>
          <option value="">Any status</option>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {presets.map(p => (
          <button key={p.label} onClick={p.apply} style={{ ...linkAction, color: T.blue600 }}>{p.label}</button>
        ))}
      </div>

      <div style={{ padding: "10px 24px", overflowY: "auto", flex: 1, maxHeight: "48vh" }}>
        {rows === null && <EmptyNote>Loading…</EmptyNote>}
        {rows !== null && shown.length === 0 && <EmptyNote>No entries match these filters.</EmptyNote>}
        {shown.length > 0 && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${T.gray200}` }}>
              <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} disabled={deletable.length === 0} />
              Select all {deletable.length} shown
              {blocked > 0 && <span style={{ fontWeight: 400, color: T.gray500 }}>· {blocked} not yours to delete</span>}
            </label>
            {shown.map(e => {
              const mine = canDelete(e);
              return (
                <label key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.gray100}`, opacity: mine ? 1 : 0.5 }}>
                  <input type="checkbox" disabled={!mine} checked={selected.has(e.id)} onChange={() => toggle(e.id)} style={{ marginTop: 3 }} />
                  <span style={{ width: 120, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: T.gray700 }}>
                    {formatRange(e.startDate, e.endDate)}
                    <span style={{ display: "block", fontWeight: 400, color: T.gray500 }}>{e.startDate.slice(0, 4)}</span>
                  </span>
                  <StatusChip status={e.status} />
                  <span style={{ fontSize: 13, minWidth: 0, flex: 1 }}>
                    {e.visit?.location || e.rawText || ""}
                    {e.notes && <span style={{ display: "block", fontSize: 12, color: T.gray500 }}>{e.notes}</span>}
                    {!mine && <span style={{ display: "block", fontSize: 11.5, color: T.gray500 }}>Owned by {e.ownerEmail || "nobody yet — an admin must link this person"}</span>}
                  </span>
                </label>
              );
            })}
          </>
        )}
      </div>

      {result && <div style={{ margin: "0 24px 10px", fontSize: 12.5, color: T.gray700, background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: "8px 12px" }}>{result}</div>}

      <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: T.gray600 }}>
          {selectedRows.length > 0 ? `${selectedRows.length} selected` : `${shown.length} shown`}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={btnOutline}>Close</button>
          <button onClick={() => setConfirming(true)} disabled={selectedRows.length === 0}
            style={{ ...btnPrimary, background: T.error, opacity: selectedRows.length === 0 ? 0.5 : 1, cursor: selectedRows.length === 0 ? "default" : "pointer" }}>
            <Icon name="trash" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Delete selected
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── ROSTER (ADMIN) ──────────────────────────────────────────────────────────

// The migration imports entries with the roster's email as ownerEmail. Where
// that email wasn't known at import time the entries land un-owned, so setting
// it here has to backfill them — otherwise a specialist still can't edit their
// own migrated history, which is the whole point of the mapping.
function RosterPanel({ roster, onClose }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(roster.map(p => [p.personKey, p.email || ""])));
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");
  const [counts, setCounts] = useState(null);      // personKey -> entry count, all years
  const [removing, setRemoving] = useState(null);  // person queued for removal

  // Counts cover every year, not just the one the calendar has loaded, because
  // that is what the removal warning has to be honest about.
  const loadCounts = useCallback(async () => {
    const snap = await getDocs(collection(db, ENTRIES_COLLECTION));
    const tally = {};
    snap.docs.forEach(d => { const k = d.data().personKey; tally[k] = (tally[k] || 0) + 1; });
    setCounts(tally);
  }, []);
  useEffect(() => { loadCounts().catch(() => setCounts({})); }, [loadCounts]);

  async function toggleActive(person) {
    setBusy(person.personKey);
    setDone("");
    try {
      const next = person.active === false;
      await setDoc(doc(db, PEOPLE_COLLECTION, person.personKey), { active: next }, { merge: true });
      await logPlannerAudit(PEOPLE_COLLECTION, person.personKey, next ? "reactivate" : "deactivate",
        { active: person.active !== false }, { active: next });
      setDone(`${person.displayName} is now ${next ? "active" : "inactive"}.`);
    } catch (err) {
      setDone(`Could not update ${person.displayName}: ${err.message}`);
    } finally {
      setBusy("");
    }
  }

  async function linkAccount(person) {
    const email = (drafts[person.personKey] || "").trim().toLowerCase();
    if (!email) return;
    setBusy(person.personKey);
    setDone("");
    try {
      await setDoc(doc(db, PEOPLE_COLLECTION, person.personKey), { email }, { merge: true });

      // Backfill ownership on this person's existing entries. Chunked because
      // a writeBatch caps at 500 operations and a full year is ~250 per person.
      const snap = await getDocs(fsQuery(collection(db, ENTRIES_COLLECTION), where("personKey", "==", person.personKey)));
      const stale = snap.docs.filter(d => (d.data().ownerEmail || "") !== email);
      for (let i = 0; i < stale.length; i += 400) {
        const batch = writeBatch(db);
        stale.slice(i, i + 400).forEach(d => batch.update(d.ref, { ownerEmail: email }));
        await batch.commit();
      }
      setDone(`${person.displayName} linked to ${email}${stale.length ? ` · ${stale.length} entries reassigned` : ""}`);
    } catch (err) {
      setDone(`Could not link ${person.displayName}: ${err.message}`);
    } finally {
      setBusy("");
    }
  }

  if (removing) {
    return <RemovePersonPanel person={removing} entryCount={counts?.[removing.personKey] ?? 0}
      onDone={msg => { setRemoving(null); setDone(msg); loadCounts().catch(() => {}); }}
      onCancel={() => setRemoving(null)} />;
  }

  return (
    <Overlay onClose={onClose} labelledBy="tp-roster-title" width={720}>
      <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.gray200}` }}>
        <div id="tp-roster-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>Team Planner roster</div>
        <div style={{ fontSize: 13, color: T.gray600, marginTop: 3 }}>
          Link each specialist to the email they sign in with. That address is what lets them edit their own entries — including the ones migrated from the spreadsheet.
        </div>
      </div>
      <div style={{ padding: "14px 24px", overflowY: "auto", maxHeight: "60vh" }}>
        {roster.length === 0 && <EmptyNote>No roster people yet — run the migration script to create them.</EmptyNote>}
        {roster.map(p => (
          <div key={p.personKey} style={{ padding: "10px 0", borderBottom: `1px solid ${T.gray100}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 150, flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: p.active === false ? T.gray500 : T.ink }}>{p.displayName}</div>
                <div style={{ fontSize: 11.5, color: p.active === false ? T.gray400 : T.gray500 }}>
                  {p.personKey}
                  {p.active === false ? " · inactive" : ""}
                  {counts && ` · ${counts[p.personKey] || 0} entries`}
                </div>
              </div>
              <input type="email" value={drafts[p.personKey] ?? ""} placeholder="name@rotech.com"
                onChange={e => setDrafts(d => ({ ...d, [p.personKey]: e.target.value }))}
                style={{ ...metaField, flex: 1, padding: "7px 10px", fontSize: 13.5 }} />
              <button onClick={() => linkAccount(p)} disabled={busy === p.personKey || !(drafts[p.personKey] || "").trim()}
                style={{ ...btnOutline, padding: "7px 12px", fontSize: 12.5, opacity: busy === p.personKey ? 0.6 : 1 }}>
                {busy === p.personKey ? "Linking…" : "Link"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 7, marginLeft: 160 }}>
              <button onClick={() => toggleActive(p)} disabled={busy === p.personKey}
                style={{ ...linkAction, color: T.gray700 }}>
                {p.active === false ? "Reactivate" : "Deactivate"}
              </button>
              <button onClick={() => setRemoving(p)} style={{ ...linkAction, color: T.error }}>
                Remove permanently…
              </button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14, fontSize: 12, color: T.gray500, lineHeight: 1.6 }}>
          <strong style={{ color: T.gray700 }}>Deactivate</strong> is the one to reach for when someone leaves the
          team: they drop out of the Today counts, the print grids and the entry picker, but their history stays on
          the calendar and it can be undone. Deactivating does not revoke their sign-in — delete the account in
          Firebase Authentication for that.
        </div>
        {done && <div style={{ marginTop: 12, fontSize: 12.5, color: T.gray700, background: T.gray50, border: `1px solid ${T.gray200}`, borderRadius: T.radius, padding: "8px 12px" }}>{done}</div>}
      </div>
      <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnPrimary}>Done</button>
      </div>
    </Overlay>
  );
}

const linkAction = {
  background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
  fontSize: 12.5, fontWeight: 600, textDecoration: "underline",
};

// Removing a person deletes their entries and milestones in the same action.
// Deleting the roster row on its own would orphan every entry that references
// the personKey — the calendar would keep showing the days with the raw key
// where the name should be, which is worse than either keeping or removing them.
function RemovePersonPanel({ person, entryCount, onDone, onCancel }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmed = typed.trim().toLowerCase() === person.displayName.trim().toLowerCase();

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const entrySnap = await getDocs(fsQuery(collection(db, ENTRIES_COLLECTION), where("personKey", "==", person.personKey)));
      const milestoneSnap = await getDocs(fsQuery(collection(db, MILESTONES_COLLECTION), where("personKey", "==", person.personKey)));

      // Snapshot everything before touching it, so the audit trail is complete
      // even if a later batch fails halfway.
      await logDeletedEntries(person.personKey, "delete-person-entries",
        entrySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      await logPlannerAudit(PEOPLE_COLLECTION, person.personKey, "delete-person", {
        person: { ...person },
        milestones: milestoneSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        entriesDeleted: entrySnap.size,
      }, null);

      await deleteAll(entrySnap.docs.map(d => d.ref));
      await deleteAll(milestoneSnap.docs.map(d => d.ref));
      await deleteDoc(doc(db, PEOPLE_COLLECTION, person.personKey));

      onDone(`Removed ${person.displayName}: ${entrySnap.size} entries and ${milestoneSnap.size} milestones deleted. Recoverable from the audit log.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onCancel} labelledBy="tp-remove-title">
      <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.gray200}` }}>
        <div id="tp-remove-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: T.error }}>
          Remove {person.displayName}
        </div>
      </div>
      <div style={{ padding: "18px 24px", overflowY: "auto" }}>
        <div style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: T.radius, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.error, marginBottom: 6 }}>This permanently deletes:</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: T.gray700, lineHeight: 1.7 }}>
            <li><strong>{entryCount}</strong> calendar {entryCount === 1 ? "entry" : "entries"} — every recorded day, across all years</li>
            <li>their birthday and work anniversary, if recorded</li>
            <li>their roster record</li>
          </ul>
        </div>
        <div style={{ fontSize: 13.5, color: T.gray700, lineHeight: 1.65, marginBottom: 16 }}>
          Their history disappears from the team calendar and from every past month's print summary.
          Anything migrated from the spreadsheet is only in Firestore now — the original workbook is not
          being kept in sync. <strong>Deactivating instead</strong> hides them from the active views and keeps all of it.
          <br /><br />
          A full snapshot is written to the audit log first, so this is recoverable, but only by someone
          willing to read it back out of Firestore by hand.
        </div>
        <Field label={`Type "${person.displayName}" to confirm`}>
          <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus
            placeholder={person.displayName} style={metaField} />
        </Field>
        {error && <div role="alert" style={{ fontSize: 12.5, color: T.error, background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: T.radius, padding: "8px 10px" }}>{error}</div>}
      </div>
      <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} disabled={busy} style={btnOutline}>Cancel</button>
        <button onClick={remove} disabled={!confirmed || busy}
          style={{ ...btnPrimary, background: T.error, opacity: !confirmed || busy ? 0.5 : 1, cursor: !confirmed || busy ? "default" : "pointer" }}>
          {busy ? "Removing…" : `Delete ${person.displayName} and ${entryCount} entries`}
        </button>
      </div>
    </Overlay>
  );
}
