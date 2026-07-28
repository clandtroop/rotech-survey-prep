import { useState, useMemo, useRef, useEffect } from "react";
import { collection, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { T, Icon, cardStyle, btnPrimary, btnOutline, metaLabel, metaField } from "./theme";
import {
  TASKS_COLLECTION, TASK_DONE_COLLECTION, CADENCES, MONTH_NAMES,
  todayIso, formatDate, monthKey,
  buildTaskSeries, seriesBucket, seriesKeyOf, periodKeyFor, isCompletable,
  canEditTask, canTagTask, normalizeTag, allTagsOf, cadenceLabel,
} from "./teamPlannerData";

// ─── MY TASKS + TASK EDITING ─────────────────────────────────────────────────
// The per-specialist task list, and the one form used to add or edit a task.
// Split out of TeamPlanner.jsx because the grouping and completion logic is
// substantial enough to read on its own.
// ─────────────────────────────────────────────────────────────────────────────

const BUCKETS = [
  { id: "today",    label: "Due today" },
  { id: "week",     label: "Due this week" },
  { id: "month",    label: "Due this month" },
  { id: "overdue",  label: "Past due" },
  { id: "later",    label: "Later this year" },
];

const tagStyle = {
  display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 600, padding: "1.5px 7px",
  borderRadius: 4, background: T.white, border: `1px solid ${T.gray300}`, color: T.gray600, whiteSpace: "nowrap",
};

function Tag({ children }) {
  return <span style={tagStyle}><span style={{ opacity: 0.45, marginRight: 2 }}>#</span>{children}</span>;
}

// ─── TAG EDITOR ──────────────────────────────────────────────────────────────

function TagEditor({ tags, suggestions, onChange, compact }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  function commit() {
    const tag = normalizeTag(draft);
    if (tag && !tags.includes(tag)) onChange([...tags, tag].sort());
    setDraft("");
    setAdding(false);
  }

  const listId = "tp-tag-suggestions";
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {tags.map(t => (
        <span key={t} style={tagStyle}>
          <span style={{ opacity: 0.45, marginRight: 2 }}>#</span>{t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))}
            aria-label={`Remove tag ${t}`}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.gray400, padding: "0 0 0 4px", fontSize: 12, lineHeight: 1 }}>×</button>
        </span>
      ))}
      {adding ? (
        <>
          <input ref={inputRef} value={draft} list={listId}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }}
            placeholder="tag"
            style={{ ...metaField, width: 110, padding: "2px 7px", fontSize: 11.5, borderWidth: 1 }} />
          <datalist id={listId}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
        </>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          style={{ ...tagStyle, borderStyle: "dashed", color: T.gray500, cursor: "pointer", fontFamily: "inherit" }}>
          + tag
        </button>
      )}
      {compact && null}
    </span>
  );
}

// ─── MY TASKS ────────────────────────────────────────────────────────────────

export function MyTasksView({ tasks, done, roster, me, isAdmin, onEditTask, onNewTask }) {
  const email = auth.currentUser?.email || "";
  const iso = todayIso();
  const [personKey, setPersonKey] = useState(me?.personKey || "");
  const [tagFilter, setTagFilter] = useState("");
  const [busy, setBusy] = useState("");

  const viewingKey = personKey || me?.personKey || "";
  const viewingName = roster.find(p => p.personKey === viewingKey)?.displayName || "";

  const series = useMemo(
    () => buildTaskSeries(tasks, viewingKey, iso),
    [tasks, viewingKey, iso],
  );

  const suggestions = useMemo(() => allTagsOf(tasks), [tasks]);
  const shown = tagFilter ? series.filter(s => s.tags.includes(tagFilter)) : series;

  const mine = shown.filter(s => !s.isTeam);
  const team = shown.filter(s => s.isTeam);
  const standing = mine.filter(s => seriesBucket(s, iso) === "standing");
  const scheduled = mine.filter(s => seriesBucket(s, iso) !== "standing");

  // Completion keys present in the done collection, so a tick survives a reload.
  const doneKey = (task, period) => `${task.id}_${period}`;
  const isDone = (task, period) => !!period && done.some(d => d.id === doneKey(task, period));
  const doneRecord = (task, period) => done.find(d => d.id === doneKey(task, period));

  async function toggleDone(series_) {
    const target = series_.target;
    if (!target || !isCompletable(target)) return;
    const period = periodKeyFor(target, iso);
    if (!period) return;
    const id = doneKey(target, period);
    setBusy(id);
    try {
      if (isDone(target, period)) {
        await deleteDoc(doc(db, TASK_DONE_COLLECTION, id));
      } else {
        await setDoc(doc(db, TASK_DONE_COLLECTION, id), {
          taskId: target.id,
          seriesKey: seriesKeyOf(target),
          taskName: target.name,
          periodKey: period,
          personKey: viewingKey,
          doneBy: auth.currentUser?.displayName || "",
          doneByEmail: email,
          doneAt: new Date().toISOString(),
        });
      }
    } finally {
      setBusy("");
    }
  }

  async function setTags(series_, tags) {
    // Tags live on the task the row is built from, so a tag added to a grouped
    // rotation lands on the rule and shows for every occurrence of it.
    const target = series_.rule || series_.head;
    await setDoc(doc(db, TASKS_COLLECTION, target.id), { tags }, { merge: true });
  }

  function Row({ s }) {
    const head = s.head;
    const target = s.target;
    const period = target ? periodKeyFor(target, iso) : null;
    const completable = target && isCompletable(target) && !!period;
    const checked = completable && isDone(target, period);
    const rec = completable ? doneRecord(target, period) : null;
    const editable = canEditTask(head, email, isAdmin);
    const taggable = canTagTask(head, email, isAdmin, viewingKey);
    const rowId = completable ? doneKey(target, period) : head.id;

    // Dates that still lie ahead, so a rotation reads "your turn on…" rather
    // than replaying the whole year.
    const upcoming = s.dates.filter(d => d >= iso).slice(0, 3);

    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 11, padding: "9px 11px",
        border: `1px solid ${T.gray200}`, borderRadius: T.radius, marginBottom: 6,
        background: checked ? T.gray50 : T.white,
      }}>
        {completable ? (
          <input type="checkbox" checked={checked} disabled={busy === rowId}
            onChange={() => toggleDone(s)}
            aria-label={`Mark ${head.name} complete`}
            style={{ marginTop: 3, width: 15, height: 15, flexShrink: 0, accentColor: T.blue600 }} />
        ) : <span style={{ width: 15, flexShrink: 0 }} />}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, textDecoration: checked ? "line-through" : "none", color: checked ? T.gray500 : T.ink }}>
            {head.name}
          </div>
          {(upcoming.length > 0 || head.comments || head.scope) && (
            <div style={{ fontSize: 12, color: T.gray600, marginTop: 2 }}>
              {upcoming.length > 0 && (
                <>Your turn: <strong>{formatDate(upcoming[0], { weekday: "short", month: "short", day: "numeric" })}</strong>
                  {upcoming.length > 1 && ` · then ${upcoming.slice(1).map(d => formatDate(d)).join(", ")}`}
                  {(head.comments || head.scope) && " · "}</>
              )}
              {head.comments}
              {head.comments && head.scope && " · "}
              {head.scope}
            </div>
          )}
          {rec && (
            <div style={{ fontSize: 11.5, color: T.success, marginTop: 2 }}>
              Done{rec.doneBy ? ` · ${rec.doneBy}` : ""}{rec.doneAt ? `, ${formatDate(rec.doneAt.slice(0, 10))}` : ""}
            </div>
          )}
          <div style={{ marginTop: 5 }}>
            {taggable
              ? <TagEditor tags={s.tags} suggestions={suggestions} onChange={t => setTags(s, t)} />
              : s.tags.map(t => <Tag key={t}>{t}</Tag>)}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          {s.isTeam && <span style={{ ...pill(T.successBg, T.success, T.successBorder) }}>Team</span>}
          <span style={pill(T.gray100, T.gray700, T.gray300)}>
            {s.occurrences.length > 1 && s.rule ? `${cadenceLabel(s.rule)} · ${s.occurrences.length}×` : cadenceLabel(head)}
          </span>
          {editable
            ? <button onClick={() => onEditTask(head)} style={linkBtn}>Edit</button>
            : <span title="Assigned by an admin — you can tick it off and tag it" style={{ fontSize: 11, color: T.gray400 }}>🔒</span>}
        </div>
      </div>
    );
  }

  function Section({ label, hint, list }) {
    if (!list.length) return null;
    return (
      <>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.gray600, margin: "20px 0 8px", display: "flex", alignItems: "baseline", gap: 8 }}>
          {label}
          {hint && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: T.gray500, fontSize: 12 }}>{hint}</span>}
        </div>
        {list.map(s => <Row key={s.key} s={s} />)}
      </>
    );
  }

  if (!viewingKey) {
    return (
      <div style={{ ...cardStyle(T.warning), padding: "18px 22px", fontSize: 14, color: T.gray700 }}>
        Your sign-in isn't linked to a roster person yet, so there's no task list to show.
        An admin can link it from the Roster panel.
      </div>
    );
  }

  return (
    <>
      <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: T.blue50, border: `1px solid #dbe8f6`, borderRadius: T.radius, padding: "9px 12px", marginBottom: 16 }}>
        {isAdmin && (
          <select value={viewingKey} onChange={e => setPersonKey(e.target.value)} aria-label="Whose tasks"
            style={{ ...metaField, width: "auto", padding: "5px 9px", fontSize: 13 }}>
            {roster.map(p => <option key={p.personKey} value={p.personKey}>{p.displayName}</option>)}
          </select>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.gray700 }}>Filter</span>
        <button onClick={() => setTagFilter("")} style={filterPill(!tagFilter)}>All</button>
        {suggestions.map(t => (
          <button key={t} onClick={() => setTagFilter(t === tagFilter ? "" : t)} style={filterPill(tagFilter === t)}>{t}</button>
        ))}
        {suggestions.length === 0 && (
          <span style={{ fontSize: 12, color: T.gray600 }}>No tags yet — add one on any task below.</span>
        )}
        <button onClick={onNewTask} style={{ ...btnPrimary, marginLeft: "auto", padding: "7px 14px", fontSize: 12.5 }}>
          <Icon name="plus" size={13} style={{ marginRight: 5, verticalAlign: "-2px" }} />Add a task
        </button>
      </div>

      {shown.length === 0 && (
        <div style={{ fontSize: 13.5, color: T.gray500, padding: "10px 0" }}>
          {tagFilter ? `Nothing tagged #${tagFilter}.` : `No tasks assigned to ${viewingName || "you"} yet.`}
        </div>
      )}

      {BUCKETS.map(b => (
        <Section key={b.id} label={b.label} list={scheduled.filter(s => seriesBucket(s, iso) === b.id)} />
      ))}
      <Section label="Team tasks" hint="— assigned to everyone, not to you specifically" list={team} />
      <Section label="Standing duties" hint="— ongoing ownership, nothing to check off" list={standing} />

      <p className="no-print" style={{ fontSize: 12, color: T.gray500, marginTop: 14 }}>
        🔒 marks work an admin assigned — you can tick it off and tag it, but not rename, reschedule or delete it.
      </p>
    </>
  );
}

const pill = (bg, fg, border) => ({
  display: "inline-flex", alignItems: "center", gap: 4, background: bg, color: fg,
  border: `1px solid ${border}`, borderRadius: T.radiusPill, padding: "1px 8px",
  fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
});

const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
  fontSize: 12, fontWeight: 600, color: T.blue600, textDecoration: "underline",
};

const filterPill = active => ({
  fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: T.radiusPill,
  cursor: "pointer", background: active ? T.blue600 : T.white, color: active ? T.white : T.gray700,
  border: `1px solid ${active ? T.blue600 : T.gray300}`,
});

// ─── TASK EDITOR ─────────────────────────────────────────────────────────────

export function blankTask(personKey, displayName, email) {
  return {
    name: "",
    cadence: { type: "oneOff", date: todayIso(), months: [], rawLabel: "" },
    assignee: { type: "specialist", personKey, displayName },
    scope: "",
    comments: "",
    tags: [],
    origin: "personal",
    ownerEmail: email,
    active: true,
  };
}

// One form for every task. What a specialist may change is narrower than what
// an admin may, so the fields they cannot touch are shown disabled rather than
// hidden — seeing that a task is scheduled for September is useful even when
// you are not the one who gets to change it.
export function TaskEditorModal({ draft, roster, isAdmin, allTasks, onChange, onClose, onSaved }) {
  const email = auth.currentUser?.email || "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNew = !draft.id;
  const fullEdit = isNew || canEditTask(draft, email, isAdmin);
  const suggestions = useMemo(() => allTagsOf(allTasks), [allTasks]);

  const set = patch => onChange({ ...draft, ...patch });
  const setCadence = patch => onChange({ ...draft, cadence: { ...draft.cadence, ...patch } });

  const type = draft.cadence?.type || "oneOff";
  const months = draft.cadence?.months || [];

  function toggleMonth(m) {
    setCadence({ months: months.includes(m) ? months.filter(x => x !== m) : [...months, m].sort((a, b) => a - b) });
  }

  async function submit(e) {
    e.preventDefault();
    if (!draft.name.trim()) { setError("Give the task a name."); return; }
    setSaving(true);
    setError("");
    try {
      const id = draft.id || doc(collection(db, TASKS_COLLECTION)).id;
      const { id: _drop, ...body } = draft;
      await setDoc(doc(db, TASKS_COLLECTION, id), {
        ...body,
        name: body.name.trim(),
        seriesKey: seriesKeyOf(body),
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || "",
        ...(isNew ? { createdAt: new Date().toISOString() } : {}),
      }, { merge: true });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${draft.name}"? This removes it from everyone's task list.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, TASKS_COLLECTION, draft.id));
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const ro = { background: T.gray50, color: T.gray500 };
  const fieldWrap = { marginBottom: 14 };

  return (
    <div className="no-print" role="dialog" aria-modal="true" aria-labelledby="tp-task-title"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(19,25,34,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1200 }}>
      <form onSubmit={submit} style={{ background: T.white, borderRadius: T.radiusCard, width: "100%", maxWidth: 640, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(19,25,34,.3)" }}>
        <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${T.gray200}` }}>
          <div id="tp-task-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {isNew ? "Add a task" : fullEdit ? "Edit task" : draft.name}
          </div>
          {!fullEdit && (
            <div style={{ fontSize: 12.5, color: T.gray600, marginTop: 3 }}>
              Assigned by an admin. You can change its tags — everything else is theirs to edit.
            </div>
          )}
        </div>

        <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1 }}>
          <div style={fieldWrap}>
            <label style={metaLabel}>Task name</label>
            <input value={draft.name} onChange={e => set({ name: e.target.value })} disabled={!fullEdit}
              required autoFocus={isNew} placeholder="Pull vent binder samples before Kokomo"
              style={{ ...metaField, ...(fullEdit ? {} : ro) }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={fieldWrap}>
              <label style={metaLabel}>Cadence</label>
              <select value={type} onChange={e => setCadence({ type: e.target.value })} disabled={!fullEdit}
                style={{ ...metaField, ...(fullEdit ? {} : ro) }}>
                {CADENCES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={metaLabel}>Assigned to</label>
              <select value={draft.assignee?.type === "team" ? "__team" : draft.assignee?.personKey || ""}
                disabled={!isAdmin}
                onChange={e => {
                  if (e.target.value === "__team") return set({ assignee: { type: "team", personKey: "", displayName: "Team" } });
                  const p = roster.find(x => x.personKey === e.target.value);
                  set({ assignee: { type: "specialist", personKey: p?.personKey || "", displayName: p?.displayName || "" } });
                }}
                style={{ ...metaField, ...(isAdmin ? {} : ro) }}>
                <option value="__team">Team (everyone)</option>
                {roster.map(p => <option key={p.personKey} value={p.personKey}>{p.displayName}</option>)}
              </select>
              {!isAdmin && <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 4 }}>Admin only — you can't hand work to someone else</div>}
            </div>
          </div>

          {type === "oneOff" && (
            <div style={fieldWrap}>
              <label style={metaLabel}>Date</label>
              <input type="date" value={draft.cadence?.date || ""} disabled={!fullEdit}
                onChange={e => setCadence({ date: e.target.value })}
                style={{ ...metaField, ...(fullEdit ? {} : ro) }} />
            </div>
          )}

          {(type === "month" || type === "monthRange") && (
            <div style={{ ...fieldWrap, background: T.gray50, border: `1px dashed ${T.gray300}`, borderRadius: T.radius, padding: "12px 14px" }}>
              <label style={metaLabel}>Which months</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MONTH_NAMES.map((m, i) => {
                  const on = months.includes(i + 1);
                  return (
                    <button key={m} type="button" disabled={!fullEdit} onClick={() => toggleMonth(i + 1)}
                      style={{ ...filterPill(on), opacity: fullEdit ? 1 : 0.6, cursor: fullEdit ? "pointer" : "default" }}>
                      {m.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={fieldWrap}>
              <label style={metaLabel}>Applies to</label>
              <input value={draft.scope || ""} onChange={e => set({ scope: e.target.value })} disabled={!fullEdit}
                placeholder="All Regions" style={{ ...metaField, ...(fullEdit ? {} : ro) }} />
            </div>
            <div style={fieldWrap}>
              <label style={metaLabel}>Tags</label>
              <div style={{ ...metaField, minHeight: 38, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <TagEditor tags={draft.tags || []} suggestions={suggestions} onChange={tags => set({ tags })} />
              </div>
              <div style={{ fontSize: 11.5, color: T.gray500, marginTop: 4 }}>Type anything; past tags autocomplete.</div>
            </div>
          </div>

          <div style={fieldWrap}>
            <label style={metaLabel}>Comments</label>
            <textarea rows={3} value={draft.comments || ""} onChange={e => set({ comments: e.target.value })}
              disabled={!fullEdit} style={{ ...metaField, resize: "vertical", ...(fullEdit ? {} : ro) }} />
          </div>

          {isNew && (
            <div style={{ fontSize: 12.5, color: T.gray600, background: T.blue50, border: `1px solid #dbe8f6`, borderRadius: T.radius, padding: "9px 12px" }}>
              This task will be yours — you can edit or delete it at any time.
            </div>
          )}
          {error && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: T.error, background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderRadius: T.radius, padding: "8px 10px" }}>{error}</div>}
        </div>

        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            {!isNew && canEditTask(draft, email, isAdmin) && (
              <button type="button" onClick={remove} style={{ ...btnOutline, color: T.error, borderColor: T.errorBorder }}>
                <Icon name="trash" size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : fullEdit ? "Save task" : "Save tags"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
