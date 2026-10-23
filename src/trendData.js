// Storage keys and helpers shared by the visit form (which writes trend
// records on "Finalize Visit") and the Issue Trend dashboard (which reads
// them). Kept in their own module so the dashboard doesn't have to import
// from App.jsx and create an import cycle.

export const TREND_KEY = "rotech_trend_data";
export const TRENDS_COLLECTION = "visitTrends";

export function loadTrendData() {
  try { const r = localStorage.getItem(TREND_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

// Visit dates are captured as free text and default to the browser's en-US
// short format ("7/28/2026"), so a record's `date` is not sortable or
// comparable against the YYYY-MM-DD an <input type="date"> produces. Normalize
// to ISO before doing either — this is what makes the dashboard's date-range
// filter work at all.
export function toIsoDate(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const d = new Date(s);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The Location Name is "Rotech" for most sites, so grouping by it merged every
// plain-"Rotech" branch into one site. A site is identified as
// "City, ST (Lawson)" instead. City/state come from the location roster first:
// the visit form's City / State field is free text, and records written
// without it fell back to the roster's city alone, so reading the record's own
// value would split one Lawson # across several spellings. A visit logged as
// "Other / Not Listed" has no Lawson #, so it falls back to whatever it has.
export function siteLabel(record, rosterByLawson) {
  const lawson = String(record.lawson || "").trim();
  const listed = lawson && lawson !== "other";
  const known = listed ? rosterByLawson.get(lawson) : null;
  const rosterCity = known ? [known.city, known.state].filter(Boolean).join(", ") : "";
  const city = rosterCity || String(record.city || "").trim();
  if (listed) return city ? `${city} (${lawson})` : `Lawson ${lawson}`;
  return city || record.location || "Unknown";
}

// "2026-07" -> "Jul '26". Built from the parts rather than new Date(key) so it
// can't slip a month backwards in a negative-offset timezone.
export function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
