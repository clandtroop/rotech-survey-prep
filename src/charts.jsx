// ─── CHART PRIMITIVES ─────────────────────────────────────────────────────────
// Hand-rolled inline SVG/HTML rather than a charting library. Same reasoning as
// the inlined Lucide icons in theme.jsx: this app is an offline-capable PWA and
// the trend dashboard is the only screen that plots anything, so a runtime
// dependency (and the bundle it drags in) costs more than the ~200 lines here.
//
// Horizontal bars and the share bar are plain HTML — percentage widths are
// responsive for free and the labels render as ordinary text. Only the monthly
// column chart is SVG, because gridlines and rounded y-axis ticks are genuinely
// easier to place there.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { T, Icon } from "./theme.jsx";

// Categorical series palette. Slot 1 is the Rotech brand blue; slots 2–4 are the
// next hues of a validated categorical order. Checked with the data-viz
// validator against this app's white chart surface: all four sit inside the
// lightness band, clear the chroma floor, and separate under simulated
// protanopia/deuteranopia (worst adjacent pair ΔE 9.1 CVD / 22.9 normal vision).
//
// Slots 3 and 4 fall below 3:1 contrast on white, which obligates a relief
// channel — so every chart that uses them ships visible counts in its legend and
// the full issue log table carries the same numbers. Never rely on the hue alone.
// Assign these in order and never cycle: a 5th series folds into "Other".
export const SERIES = ["#0053a1", "#eb6834", "#1baf7a", "#eda100"];

// Chart chrome. Gridlines and axes are recessive hairlines one step off the
// surface; text always wears a text token, never the series colour.
const chartInk = {
  surface: T.white,
  grid:    T.gray200,
  axis:    T.gray300,
  muted:   T.gray500,
  label:   T.gray600,
  value:   T.ink,
};

// Ink that stays legible on a given fill — used only for labels set *inside* a
// coloured segment, the one place text may sit on a series colour.
function readableInk(hex) {
  const lin = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.18 ? T.ink : T.white;
}

// Axis ticks rounded to 1/2/5×10ⁿ so the gridlines land on numbers a reader can
// actually use, rather than on whatever the max happens to be.
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const mag  = Math.pow(10, Math.floor(Math.log10(max / count)));
  const norm = max / count / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top  = Math.ceil(max / step) * step;
  const out  = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

// Width of the element, tracked live. The column chart needs a real pixel width
// to place ticks without scaling its own text, which a viewBox alone would do.
function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Floating readout shared by every chart. Values lead, labels follow — the
// reader already knows which mark they're pointing at and wants the number.
function Tooltip({ x, y, title, rows }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y, transform: "translate(-50%, -100%)",
      pointerEvents: "none", zIndex: 5, background: T.white, color: T.ink,
      border: `1px solid ${T.gray200}`, borderRadius: T.radius, boxShadow: "0 4px 14px rgba(19,25,34,.14)",
      padding: "7px 10px", fontSize: 12.5, whiteSpace: "nowrap", marginTop: -8,
    }}>
      <div style={{ color: chartInk.muted, fontSize: 11.5, marginBottom: 3 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {r.color && <span style={{ width: 10, height: 2, borderRadius: 1, background: r.color, flexShrink: 0 }} />}
          <strong style={{ fontWeight: 700 }}>{r.value}</strong>
          <span style={{ color: chartInk.label }}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
// label · value · optional sub-line · optional meter. `tone` colours the value
// for status tiles (clean-visit rate, recurring count) and always ships with an
// icon + label so the state never rides on colour alone.
export function StatTile({ label, value, sub, tone, icon, meter }) {
  const valueColor = tone || T.ink;
  return (
    <div style={{
      background: T.white, border: `1px solid ${T.gray200}`, borderRadius: T.radiusCard,
      boxShadow: T.shadowSoft, padding: "14px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 12, color: chartInk.label, fontWeight: 600, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        {/* Proportional figures: tabular-nums makes a big standalone number look loose. */}
        <span style={{ fontSize: 30, fontWeight: 700, color: valueColor, lineHeight: 1.05, letterSpacing: "-0.02em" }}>{value}</span>
        {icon && <Icon name={icon} size={15} style={{ color: valueColor, alignSelf: "center" }} />}
      </div>
      {meter && (
        <div style={{ marginTop: 9, height: 6, borderRadius: 3, background: T.blue50, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, meter.pct))}%`, height: "100%", borderRadius: 3, background: meter.color || SERIES[0] }} />
        </div>
      )}
      {sub && <div style={{ fontSize: 11.5, color: chartInk.muted, marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

// ── Column chart ─────────────────────────────────────────────────────────────
// Trend over time, one series. Bars cap at 24px, carry a 4px rounded cap and sit
// square on the baseline. Only the highest and the most recent column are
// direct-labelled — a number on every column is noise; the axis and the hover
// readout carry the rest.
export function ColumnChart({ data, color = SERIES[0], height = 168, valueLabel = "issues" }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const padL = 34, padR = 10, padT = 20, padB = 26;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = height - padT - padB;

  const max    = Math.max(1, ...data.map(d => d.value));
  const ticks  = niceTicks(max);
  const top    = ticks[ticks.length - 1];
  const band   = data.length ? plotW / data.length : 0;
  const barW   = Math.max(3, Math.min(24, band - 8));
  const yOf    = v => padT + plotH - (v / top) * plotH;
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  // "Aug 25" needs ~38px. When the card is too narrow to seat every tick, drop
  // to every other one (counting back from the most recent month, which always
  // keeps its label) rather than letting them run together.
  const tickEvery = band >= 38 ? 1 : band >= 20 ? 2 : 3;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      {width > 0 && (
        <svg width={width} height={height} role="img"
             aria-label={`Monthly ${valueLabel}, ${data.length} periods`}
             style={{ display: "block", overflow: "visible" }}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={padL} x2={padL + plotW} y1={yOf(t)} y2={yOf(t)}
                    stroke={t === 0 ? chartInk.axis : chartInk.grid} strokeWidth="1" />
              <text x={padL - 8} y={yOf(t) + 4} textAnchor="end"
                    fontSize="11" fill={chartInk.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = padL + band * i + band / 2;
            const y  = yOf(d.value);
            const h  = Math.max(d.value > 0 ? 2 : 0, padT + plotH - y);
            const r  = Math.min(4, barW / 2, h);
            const on = hover === i;
            return (
              <g key={d.key}>
                {h > 0 && (
                  // Rounded cap, square foot — drawn as a path so only the top
                  // corners round, per the mark spec.
                  <path
                    d={`M${cx - barW / 2},${padT + plotH} V${y + r} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${padT + plotH} Z`}
                    fill={color} opacity={hover === null || on ? 1 : 0.45} />
                )}
                {(i === maxIdx || i === data.length - 1) && d.value > 0 && (
                  <text x={cx} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={chartInk.value}>
                    {d.value}
                  </text>
                )}
                {(data.length - 1 - i) % tickEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="10.5" fill={chartInk.muted}>
                    {d.label}
                  </text>
                )}
                {/* Hit target is the whole band, never just the painted bar. */}
                <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent"
                      onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={padL + band * hover + band / 2} y={yOf(data[hover].value)}
                 title={data[hover].full || data[hover].label}
                 rows={[{ value: data[hover].value, label: valueLabel, color }]} />
      )}
    </div>
  );
}

// ── Horizontal bar chart ─────────────────────────────────────────────────────
// Magnitude across nominal categories (locations, sections, area managers), so
// every bar wears the *same* hue — colouring them by value would spend the
// identity channel re-encoding what bar length already says.
//
// `onSelect` turns each row into a drill-down: clicking a bar filters the whole
// dashboard to that category.
export function HBarChart({ data, color = SERIES[0], onSelect, selected, emptyText = "No issues in the selected range.", unit = "issues" }) {
  if (!data.length) return <div style={{ fontSize: 13, color: chartInk.muted, padding: "6px 0" }}>{emptyText}</div>;
  const max = Math.max(1, ...data.map(d => d.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map(d => {
        const pct = (d.value / max) * 100;
        const isSel = selected === d.label;
        const Row = onSelect ? "button" : "div";
        return (
          <Row
            key={d.label}
            {...(onSelect ? {
              onClick: () => onSelect(isSel ? "" : d.label),
              title: `${isSel ? "Clear filter" : "Filter dashboard"}: ${d.label}`,
              type: "button",
            } : {})}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "2px 4px",
              background: isSel ? T.blue50 : "transparent", border: "none",
              borderRadius: 6, cursor: onSelect ? "pointer" : "default",
              font: "inherit", color: "inherit",
            }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: chartInk.value, lineHeight: 1.35, minWidth: 0 }}>{d.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: chartInk.value, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{d.value}</span>
            </div>
            <div style={{ height: 8, background: T.gray100, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "0 4px 4px 0" }}
                   aria-label={`${d.value} ${unit}`} />
            </div>
            {d.sub && <div style={{ fontSize: 11, color: chartInk.muted, marginTop: 3 }}>{d.sub}</div>}
          </Row>
        );
      })}
    </div>
  );
}

// ── Stacked share bar ────────────────────────────────────────────────────────
// Part-to-whole across a handful of distinct series (which form each issue came
// from). Segments are separated by a 2px surface gap rather than a stroke, and a
// segment is only labelled inline when the text actually fits — otherwise the
// legend below carries the name and the count, which is also the relief channel
// for the two sub-3:1 slots.
export function StackedShareBar({ segments, total }) {
  const [hover, setHover] = useState(null);
  if (!total) return <div style={{ fontSize: 13, color: chartInk.muted }}>No issues in the selected range.</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 30, marginBottom: 14 }}>
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          // ~7px per character at this size, plus 16px of padding — only label
          // inline when it comfortably fits, never clip.
          const fits = pct > 9 && String(s.value).length * 8 + 16 < (pct / 100) * 420;
          return (
            <div key={s.label}
                 onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                 style={{
                   width: `${pct}%`, background: s.color, position: "relative",
                   borderRadius: i === 0 ? "4px 0 0 4px" : i === segments.length - 1 ? "0 4px 4px 0" : 0,
                   display: "flex", alignItems: "center", justifyContent: "center",
                   opacity: hover === null || hover === i ? 1 : 0.55, cursor: "default",
                 }}>
              {fits && (
                <span style={{ fontSize: 12, fontWeight: 700, color: readableInk(s.color) }}>{s.value}</span>
              )}
            </div>
          );
        })}
      </div>
      {/* Legend is always present for ≥2 series, and carries the counts. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: chartInk.label }}>{s.label}</span>
            <strong style={{ color: chartInk.value, fontVariantNumeric: "tabular-nums" }}>{s.value}</strong>
            <span style={{ color: chartInk.muted }}>({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
