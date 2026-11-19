// JC 427 visual report — what "Complete Review & View Report" on the JC 427
// tab opens. It's separate from the Visit Overview PDF (which doesn't cover
// JC 427 at all) and reads top to bottom for two audiences:
//
//   1. the location manager: a headline, stat tiles, then each employee's
//      missing / expired / expiring records with that employee's comments,
//      and every upcoming expiration in date order;
//   2. the specialist's own record: results by category, an employee
//      overview table, and the full color-coded employee-by-item grid.
//
// Everything is inline-styled, static markup on purpose. The same rendered
// DOM is what "Download HTML report" saves (via outerHTML), so the file opens
// in any browser or phone with every color intact and nothing to load. No
// React-only interactivity, no external images, no stylesheet classes.
//
// Status is never color alone: every colored mark carries a glyph and a word
// (✓ complete, ! expiring soon, ✗ missing/expired, – N/A, ? not answered),
// and every chart has its numbers printed beside it.

import { useMemo } from "react";
import { T, BRAND } from "./theme";
import { buildJC427ReportData, JC427_CELL_STATES } from "./jc427";

const STATE = {
  ok:    { glyph: "✓", label: "Complete / current", short: "Complete", fg: T.success, bg: T.successBg, bar: T.success, border: T.success },
  warn:  { glyph: "!", label: "Expiring within 12 months", short: "Expiring", fg: "#8a5300", bg: "#fff4cc", bar: "#e8a317", border: "#e8a317" },
  bad:   { glyph: "✗", label: "Missing / expired", short: "Missing / expired", fg: T.error, bg: T.errorBg, bar: T.error, border: T.error },
  // N/A is the normal state for most competency rows (they're job-specific),
  // so it stays recessive: it shouldn't compete with the cells that matter.
  na:    { glyph: "–", label: "N/A or no date", short: "N/A", fg: T.gray400, bg: T.gray50, bar: T.gray300, border: T.gray200 },
  blank: { glyph: "?", label: "Not answered", short: "Not answered", fg: T.gray600, bg: T.white, bar: T.gray300, border: T.gray300 },
};

const GRID_CHUNK = 10; // employees per grid block — the spreadsheet's own page size
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" };
const avoidBreak = { pageBreakInside: "avoid", breakInside: "avoid" };
const KEEP_TOGETHER_ROWS = 15; // a table this short moves pages whole, title included

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = us => { const m = /^(\d{2})\/(\d{2})\/\d{2}(\d{2})$/.exec(us || ""); return m ? `${m[1]}/${m[2]}/${m[3]}` : us; };
function daysText(daysLeft) {
  if (daysLeft < 0) return `Expired ${plural(-daysLeft, "day")} ago`;
  if (daysLeft === 0) return "Expires today";
  return `${plural(daysLeft, "day")} left`;
}
function findingDetail(item, cell) {
  if (item.answerType === "yn") return "Not on file";
  return cell.state === "bad"
    ? `Completed ${cell.date} · expired ${cell.expires}`
    : `Completed ${cell.date} · expires ${cell.expires} (${daysText(cell.daysLeft)})`;
}
function findingLabel(item, cell) {
  if (cell.state === "warn") return "Expiring soon";
  return item.answerType === "yn" ? "Missing" : "Expired";
}

// ── Small building blocks ───────────────────────────────────────────────────
function Pill({ state, children }) {
  const s = STATE[state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: s.bg, color: s.fg, border: `1px solid ${s.bar}`, whiteSpace: "nowrap", ...exact }}>
      <span aria-hidden="true">{s.glyph}</span>{children}
    </span>
  );
}

function SectionTitle({ children, sub, breakBefore }) {
  return (
    <div style={{ margin: "28px 0 12px", pageBreakAfter: "avoid", breakAfter: "avoid", ...(breakBefore ? { pageBreakBefore: "always", breakBefore: "page" } : {}) }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `2px solid ${BRAND}`, paddingBottom: 4, ...exact }}>{children}</div>
      {sub && <div style={{ fontSize: 12.5, color: T.gray600, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Legend({ states = JC427_CELL_STATES }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: T.gray700, marginBottom: 10 }}>
      {states.map(k => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 4, background: STATE[k].bg, border: `1px solid ${STATE[k].border}`, color: STATE[k].fg, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", ...exact }}>{STATE[k].glyph}</span>
          {STATE[k].label}
        </span>
      ))}
    </div>
  );
}

// Thin stacked bar: 2px surface gap between segments, rounded ends, counts
// printed beside it so the bar never has to be read on color alone. N/A is
// left out of the bar — on competency rows it's ~95% of cells and would
// squeeze the expired/expiring records into slivers — and listed in the
// counts line instead.
const BAR_STATES = JC427_CELL_STATES.filter(k => k !== "na");
function StackedBar({ counts, height = 10 }) {
  const total = BAR_STATES.reduce((n, k) => n + counts[k], 0);
  if (total === 0) {
    return <div style={{ height, borderRadius: 3, background: T.gray100, ...exact }} title="All N/A" />;
  }
  return (
    <div role="img" aria-label={BAR_STATES.filter(k => counts[k]).map(k => `${counts[k]} ${STATE[k].short}`).join(", ")}
      style={{ display: "flex", gap: 2, height, width: "100%" }}>
      {BAR_STATES.filter(k => counts[k] > 0).map(k => (
        <div key={k} title={`${STATE[k].label}: ${counts[k]}`}
          style={{ flex: `${counts[k]} 0 0`, minWidth: 3, background: STATE[k].bar, borderRadius: 3, ...exact }} />
      ))}
    </div>
  );
}

function CountsLine({ counts }) {
  const parts = JC427_CELL_STATES.filter(k => counts[k] > 0);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 11.5, color: T.gray600, marginTop: 5 }}>
      {parts.map(k => (
        <span key={k}><span aria-hidden="true" style={{ color: STATE[k].fg, fontWeight: 700 }}>{STATE[k].glyph}</span> {STATE[k].short} <strong style={{ color: T.ink }}>{counts[k]}</strong></span>
      ))}
    </div>
  );
}

function StatTile({ value, label, state, sub }) {
  const s = state ? STATE[state] : null;
  return (
    <div style={{ background: T.white, border: `1px solid ${T.gray200}`, borderTop: `3px solid ${s ? s.bar : BRAND}`, borderRadius: 8, padding: "12px 14px", ...exact }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: T.ink, lineHeight: 1 }}>{value}</span>
        {s && <span aria-hidden="true" style={{ fontSize: 14, fontWeight: 700, color: s.fg }}>{s.glyph}</span>}
      </div>
      <div style={{ fontSize: 12, color: T.gray700, marginTop: 6, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.gray500, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: T.gray600, textTransform: "uppercase", letterSpacing: "0.05em", padding: "7px 10px", borderBottom: `1px solid ${T.gray300}`, background: T.gray50, ...exact };
const td = { fontSize: 12.5, color: T.ink, padding: "7px 10px", borderBottom: `1px solid ${T.gray200}`, verticalAlign: "top" };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ── Report ──────────────────────────────────────────────────────────────────
export default function JC427Report({ slots, items, answers, dates, comments, meta = {}, rootRef }) {
  const generatedAt = useMemo(() => new Date(), [slots, items, answers, dates, comments]);
  const data = useMemo(
    () => buildJC427ReportData({ slots, items, answers, dates, comments }, generatedAt),
    [slots, items, answers, dates, comments, generatedAt]
  );
  const { employees, categories, expirations, totals } = data;
  const withFindings = employees.filter(e => e.findings.length > 0);
  const clearWithNotes = employees.filter(e => e.findings.length === 0 && e.notes.length > 0);
  const clearNoNotes = employees.filter(e => e.findings.length === 0 && e.notes.length === 0);
  const findingCount = totals.missing + totals.expired + totals.expiring;

  const lawson = meta.lawson && meta.lawson !== "other" ? meta.lawson : "";
  const metaCells = [
    [`Location${lawson ? ` (Lawson # ${lawson})` : ""}`, meta.location],
    ["City / State", meta.city],
    ["Visit Date", meta.date],
    ["Accreditation Specialist", meta.specialist],
  ];

  const headline = employees.length === 0
    ? "No employees have been added to this review yet."
    : findingCount === 0
      ? `All ${plural(employees.length, "employee")} reviewed have complete, current records — no corrective action needed.`
      : `${plural(findingCount, "finding")} across ${withFindings.length} of ${plural(employees.length, "employee")} need attention.`;

  return (
    <div ref={rootRef} style={{ fontFamily: T.font, color: T.ink, background: T.white, maxWidth: 1040, margin: "0 auto", border: `1px solid ${T.gray200}`, borderRadius: 10, overflow: "hidden", lineHeight: 1.45 }}>
      {/* Header band */}
      <div style={{ background: BRAND, color: T.white, padding: "16px 22px", ...exact }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>JC 427 Personnel Records Review</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>
          Visual report · generated {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
      </div>

      {/* Visit details */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", background: T.blue50, borderBottom: `1px solid ${T.blueBorder}`, ...exact }}>
        {metaCells.map(([label, value]) => (
          <div key={label} style={{ padding: "9px 22px" }}>
            <div style={{ fontSize: 11, color: T.gray500 }}>{label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.blue800 }}>{value || "—"}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "18px 22px 26px" }}>
        {/* Headline + tiles */}
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{headline}</div>
        {totals.unanswered > 0 && (
          <div style={{ fontSize: 12.5, color: T.gray600, marginBottom: 4 }}>
            <span style={{ color: STATE.blank.fg, fontWeight: 700 }}>?</span> {plural(totals.unanswered, "Y/N item")} still unanswered — those aren't counted as findings.
          </div>
        )}

        {employees.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
            <StatTile value={totals.employees} label="Employees reviewed" />
            <StatTile value={totals.missing} label="Missing documents" state="bad" sub="Y/N items marked N" />
            <StatTile value={totals.expired} label="Expired dates" state="bad" sub="Past their valid period" />
            <StatTile value={totals.expiring} label="Expiring within 12 months" state="warn" sub="3-year items in their final year" />
            <StatTile value={`${totals.clearEmployees} / ${totals.employees}`} label="Employees with no findings" state="ok" />
          </div>
        )}

        {employees.length > 0 && (<>
          {/* ── Part 1: action items ── */}
          <SectionTitle sub="Each employee's missing or expired records and anything expiring within 12 months, with the specialist's comment for that employee.">
            Action items by employee
          </SectionTitle>

          {withFindings.length === 0 && (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: T.successBg, color: T.success, fontSize: 13, fontWeight: 600, ...exact }}>
              ✓ No missing, expired or expiring records for any employee.
            </div>
          )}

          {withFindings.map(emp => (
            <div key={emp.index} style={{ border: `1px solid ${T.gray200}`, borderLeft: `4px solid ${emp.missing + emp.expired > 0 ? STATE.bad.bar : STATE.warn.bar}`, borderRadius: "0 8px 8px 0", marginBottom: 12, ...exact }}>
              <div style={{ padding: "10px 14px", background: T.gray50, borderBottom: `1px solid ${T.gray200}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", pageBreakAfter: "avoid", breakAfter: "avoid", ...exact }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{emp.name}</div>
                  <div style={{ fontSize: 12, color: T.gray600 }}>{[emp.jobTitle, emp.hireDate && `Hired ${emp.hireDate}`].filter(Boolean).join(" · ") || "No job title or hire date entered"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {emp.missing > 0 && <Pill state="bad">{emp.missing} missing</Pill>}
                  {emp.expired > 0 && <Pill state="bad">{emp.expired} expired</Pill>}
                  {emp.expiring > 0 && <Pill state="warn">{emp.expiring} expiring</Pill>}
                </div>
              </div>
              <div style={{ padding: "4px 14px 8px" }}>
                {emp.findings.map(({ item, cell }) => (
                  <div key={item.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.gray100}`, alignItems: "flex-start", flexWrap: "wrap", ...avoidBreak }}>
                    <div style={{ flex: "0 0 auto", minWidth: 118 }}><Pill state={cell.state}>{findingLabel(item, cell)}</Pill></div>
                    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.text}</div>
                      <div style={{ fontSize: 11.5, color: T.gray600 }}>{item.category} · {findingDetail(item, cell)}</div>
                      {cell.comment && (
                        <div style={{ fontSize: 12.5, color: T.gray700, marginTop: 4, padding: "5px 9px", background: T.blue50, borderLeft: `3px solid ${T.blue400}`, borderRadius: "0 4px 4px 0", whiteSpace: "pre-wrap", ...exact }}>
                          <strong>Comment:</strong> {cell.comment}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {emp.notes.length > 0 && <NotesList notes={emp.notes} />}
              </div>
            </div>
          ))}

          {clearWithNotes.map(emp => (
            <div key={emp.index} style={{ border: `1px solid ${T.gray200}`, borderLeft: `4px solid ${STATE.ok.bar}`, borderRadius: "0 8px 8px 0", marginBottom: 12, padding: "10px 14px", ...avoidBreak, ...exact }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{emp.name}</div>
                  <div style={{ fontSize: 12, color: T.gray600 }}>{[emp.jobTitle, emp.hireDate && `Hired ${emp.hireDate}`].filter(Boolean).join(" · ")}</div>
                </div>
                <Pill state="ok">No findings</Pill>
              </div>
              <NotesList notes={emp.notes} />
            </div>
          ))}

          {clearNoNotes.length > 0 && (
            <div style={{ padding: "10px 14px", border: `1px solid ${T.successBorder}`, background: T.successBg, borderRadius: 8, fontSize: 13, ...avoidBreak, ...exact }}>
              <strong style={{ color: T.success }}>✓ No action needed:</strong>{" "}
              <span style={{ color: T.ink }}>{clearNoNotes.map(e => e.counts.blank > 0 ? `${e.name} (${e.counts.blank} not yet answered)` : e.name).join(", ")}</span>
            </div>
          )}

          {/* ── Expirations timeline ── */}
          {/* Short tables move to the next page as one block with their title,
              so a title is never stranded at the foot of a printed page. */}
          <div style={expirations.length <= KEEP_TOGETHER_ROWS ? avoidBreak : undefined}>
          <SectionTitle sub="Every dated record that has expired or expires within the next 12 months, soonest first.">
            Expired &amp; upcoming expirations
          </SectionTitle>
          {expirations.length === 0 ? (
            <div style={{ fontSize: 13, color: T.gray600 }}>No dated records are expired or due within 12 months.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead><tr>
                  <th style={th}>Employee</th><th style={th}>Record</th><th style={th}>Completed</th><th style={th}>Expires</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {expirations.map(({ employee, item, cell }) => (
                    <tr key={`${employee.index}-${item.id}`} style={avoidBreak}>
                      <td style={{ ...td, fontWeight: 600 }}>{employee.name}</td>
                      <td style={td}>{item.text}<div style={{ fontSize: 11, color: T.gray500 }}>{item.category}</div></td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{cell.date}</td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{cell.expires}</td>
                      <td style={td}><Pill state={cell.state}>{daysText(cell.daysLeft)}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>

          {/* ── Part 2: the full record ── */}
          <SectionTitle sub="Every answer for every employee, grouped by category of the JC 427 form. Bars show the records that apply; N/A (including blank competency dates) is counted beside each bar instead.">
            Results by category
          </SectionTitle>
          <Legend />
          {categories.map(c => (
            <div key={c.cat} style={{ marginBottom: 14, ...avoidBreak }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 5 }}>
                <strong>{c.cat}</strong>
                <span style={{ color: T.gray500, fontSize: 12 }}>{plural(c.items.length, "item")} × {plural(employees.length, "employee")}</span>
              </div>
              <StackedBar counts={c.counts} />
              <CountsLine counts={c.counts} />
            </div>
          ))}

          <div style={employees.length <= KEEP_TOGETHER_ROWS ? avoidBreak : undefined}>
          <SectionTitle sub="One row per employee — the same counts as the grid below.">
            Employee overview
          </SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr>
                <th style={th}>Employee</th><th style={th}>Job title</th><th style={th}>Hire date</th>
                {JC427_CELL_STATES.map(k => (
                  <th key={k} style={{ ...th, textAlign: "right" }} title={STATE[k].label}>
                    <span aria-hidden="true" style={{ color: STATE[k].fg }}>{STATE[k].glyph}</span> {STATE[k].short}
                  </th>
                ))}
                <th style={th}>Status</th>
              </tr></thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.index}>
                    <td style={{ ...td, fontWeight: 600 }}>{emp.name}</td>
                    <td style={td}>{emp.jobTitle || "—"}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{emp.hireDate || "—"}</td>
                    {JC427_CELL_STATES.map(k => <td key={k} style={{ ...num, color: emp.counts[k] ? T.ink : T.gray400 }}>{emp.counts[k]}</td>)}
                    <td style={td}>{emp.findings.length > 0 ? <Pill state={emp.missing + emp.expired > 0 ? "bad" : "warn"}>Action needed</Pill>
                      : emp.counts.blank > 0 ? <Pill state="blank">{emp.counts.blank} unanswered</Pill>
                      : <Pill state="ok">No findings</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          <SectionTitle breakBefore sub="Each cell is one employee's answer: Y / N / N/A, or the date on file colored by the JC 427 spreadsheet's own rules. ✎ marks a cell with a comment (hover to read it on screen; all comments are listed under Action items).">
            Full detail grid
          </SectionTitle>
          <Legend />
          {Array.from({ length: Math.ceil(employees.length / GRID_CHUNK) }, (_, i) => employees.slice(i * GRID_CHUNK, (i + 1) * GRID_CHUNK)).map((chunk, ci, all) => (
            <DetailGrid key={ci} chunk={chunk} categories={categories}
              title={all.length > 1 ? `Employees ${chunk[0].index + 1}–${chunk[chunk.length - 1].index + 1}` : null}
              breakBefore={ci > 0} />
          ))}
        </>)}

        {/* Footer: how statuses were decided */}
        <div style={{ marginTop: 26, paddingTop: 12, borderTop: `1px solid ${T.gray200}`, fontSize: 11.5, color: T.gray600 }}>
          <strong>How dates are judged.</strong> These match the color rules in the JC 427 spreadsheet: Storage &amp; Distribution Training (FDA 019) and every competency assessment are valid for 3 years and flagged as expiring in their final 12 months; Annual N95 Mask Fit Testing is valid for 1 year. A blank date counts as N/A, per the form's "date only, blank if NA" instruction. Statuses are as of {generatedAt.toLocaleDateString("en-US")}.
          <div style={{ marginTop: 6, color: T.gray500 }}>Generated by Rotech Survey Prep.</div>
        </div>
      </div>
    </div>
  );
}

function NotesList({ notes }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.blue600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Other comments</div>
      {notes.map(({ item, cell }) => (
        <div key={item.id} style={{ fontSize: 12.5, color: T.gray700, padding: "4px 0" }}>
          <span style={{ fontWeight: 600, color: T.ink }}>{item.text}</span>
          <span style={{ color: T.gray500 }}> ({STATE[cell.state].short})</span>: <span style={{ whiteSpace: "pre-wrap" }}>{cell.comment}</span>
        </div>
      ))}
    </div>
  );
}

function DetailGrid({ chunk, categories, title, breakBefore }) {
  const nameW = 26; // % of table width for the item column
  const colW = (100 - nameW) / GRID_CHUNK;
  return (
    <div style={{ marginBottom: 18, ...(breakBefore ? { pageBreakBefore: "always", breakBefore: "page" } : {}) }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 6px" }}>{title}</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "separate", borderSpacing: 2, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: `${nameW}%` }} />
            {Array.from({ length: GRID_CHUNK }, (_, i) => <col key={i} style={{ width: `${colW}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, borderBottom: "none", background: "transparent" }}>Item</th>
              {chunk.map(emp => (
                <th key={emp.index} style={{ fontSize: 10.5, fontWeight: 700, color: T.ink, padding: "4px 3px", textAlign: "center", verticalAlign: "bottom", wordBreak: "break-word", lineHeight: 1.2 }}>
                  {emp.name}
                  {emp.jobTitle && <div style={{ fontWeight: 500, color: T.gray500 }}>{emp.jobTitle}</div>}
                </th>
              ))}
              {Array.from({ length: GRID_CHUNK - chunk.length }, (_, i) => <th key={`pad${i}`} />)}
            </tr>
          </thead>
          <tbody>
            {categories.map(c => [
              <tr key={`${c.cat}-h`}>
                <td colSpan={1 + GRID_CHUNK} style={{ fontSize: 11, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.05em", padding: "8px 4px 2px" }}>{c.cat}</td>
              </tr>,
              ...c.items.map(item => (
                <tr key={item.id} style={avoidBreak}>
                  <td style={{ fontSize: 11, color: T.ink, padding: "3px 6px 3px 2px", lineHeight: 1.25, wordBreak: "break-word" }}>{item.text}</td>
                  {chunk.map(emp => {
                    const cell = emp.cells[item.id];
                    const s = STATE[cell.state];
                    const text = item.answerType === "yn"
                      ? (cell.state === "blank" ? s.glyph : `${cell.state === "na" ? "" : `${s.glyph} `}${cell.label}`)
                      : (cell.date ? shortDate(cell.date) : s.glyph);
                    const tip = [`${emp.name} — ${item.text}`, cell.detail, cell.comment && `Comment: ${cell.comment}`].filter(Boolean).join("\n");
                    return (
                      <td key={emp.index} title={tip}
                        style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}`, borderRadius: 3, fontSize: 10, fontWeight: 700, textAlign: "center", padding: "3px 1px", lineHeight: 1.15, fontVariantNumeric: "tabular-nums", ...exact }}>
                        {item.answerType === "date" && (cell.state === "bad" || cell.state === "warn") && <span aria-hidden="true">{s.glyph} </span>}
                        {text}
                        {cell.comment && <span aria-label="has comment" style={{ color: T.blue600, marginLeft: 2 }}>✎</span>}
                      </td>
                    );
                  })}
                  {Array.from({ length: GRID_CHUNK - chunk.length }, (_, i) => <td key={`pad${i}`} />)}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Download as a standalone HTML file ──────────────────────────────────────
// Saves the report exactly as rendered: the root element's outerHTML carries
// every style inline, so the file needs nothing but a page skeleton around it.
// The web font is linked the same way index.html does; offline it falls back
// to the system sans without breaking layout.
export function downloadJC427ReportHtml(rootEl, meta = {}) {
  if (!rootEl) return false;
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const loc = meta.location || "Location";
  const title = `JC 427 Report — ${loc}${meta.date ? ` — ${meta.date}` : ""}`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: #f6f8fa; padding: 24px 16px; font-family: 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
  @page { margin: 0.45in; }
  @media print {
    body { background: #fff; padding: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
${rootEl.outerHTML}
</body>
</html>
`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = s => String(s || "").replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "_");
  a.href = url;
  a.download = `JC427_Report_${safe(loc) || "Location"}${meta.date ? `_${safe(meta.date.replace(/\//g, "-"))}` : ""}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
