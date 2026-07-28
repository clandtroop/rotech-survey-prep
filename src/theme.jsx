// Shared design tokens, icon set, and form/button chrome for the whole app.
// Lived at the top of App.jsx until the trend dashboard moved into its own
// module and needed the same palette — pulled out here so both import one copy.


// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// Rotech Healthcare design system. Every colour/radius/shadow in the UI comes
// from here — reach for a token rather than a literal hex so a palette change
// stays a one-line edit.
// ─────────────────────────────────────────────────────────────────────────────
export const T = {
  blue600: "#0053a1", // primary
  blue700: "#00468a",
  blue800: "#003a70", // hover / deep
  blue400: "#3d83cc",
  blue50:  "#eef4fb", // tint bg
  blueBorder: "#dbe8f6", // hairline on tinted blue surfaces (report tables)
  teal:    "#00a0c6",
  tealDeep:"#00768f", // teal text on white — the raw teal fails contrast
  success: "#1d7a4d", successBg: "#e7f4ec", successBorder: "#8fc9a3",
  error:   "#c0392b", errorBg:   "#fbeae7", errorBorder:   "#e0a099",
  warning: "#b06a00", warningBg: "#fbf0db",
  ink:     "#131922", // body text
  gray700: "#424b56", // secondary text
  gray600: "#5d6773",
  gray500: "#7c8794", // muted
  gray400: "#9ba5b2",
  gray300: "#c5ccd5", // borders
  gray200: "#e1e6ec", // hairline
  gray100: "#eef1f5",
  gray50:  "#f6f8fa",
  white:   "#ffffff",

  font: "'Source Sans 3', system-ui, sans-serif",
  radius:     8,   // buttons / inputs
  radiusCard: 12,  // cards
  radiusPill: 999,
  shadowCard: "0 1px 3px rgba(19,25,34,.08), 0 1px 2px rgba(19,25,34,.04)",
  shadowSoft: "0 1px 3px rgba(19,25,34,.06)",
  focusRing:  "0 0 0 3px rgba(0,83,161,.30)",
};

// Reusable card chrome — white surface, hairline border, soft shadow. The
// `accent` argument draws the 5px top rule that identifies the card's module.
export function cardStyle(accent) {
  return {
    background: T.white,
    border: `1px solid ${T.gray200}`,
    borderRadius: T.radiusCard,
    boxShadow: T.shadowCard,
    overflow: "hidden",
    ...(accent ? { borderTop: `5px solid ${accent}` } : null),
  };
}

// Lucide icons, inlined as SVG rather than pulled from the unpkg UMD bundle the
// design handoff suggests: this app is an offline-capable PWA, and a CDN
// <script> plus a post-render lucide.createIcons() sweep would both break
// offline and fight React's ownership of the DOM. Paths are Lucide's own
// (ISC licensed); add new glyphs to this map as screens need them.
export const ICON_PATHS = {
  home:            'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
  "clipboard-list":'M8 2h8v4H8z|M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|M12 11h4|M12 16h4|M8 11h.01|M8 16h.01',
  "file-text":     'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z|M14 2v4a2 2 0 0 0 2 2h4|M10 9H8|M16 13H8|M16 17H8',
  "trending-up":   'M22 7l-8.5 8.5-5-5L2 17|M16 7h6v6',
  history:         'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8|M3 3v5h5|M12 7v5l4 2',
  "book-open":     'M12 7v14|M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  "list-checks":   'M3 17l2 2 4-4|M3 7l2 2 4-4|M13 6h8|M13 12h8|M13 18h8',
  "map-pin":       'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0|M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  "git-compare":   'M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6|M13 6h3a2 2 0 0 1 2 2v7|M11 18H8a2 2 0 0 1-2-2V9',
  "check-circle":  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M9 12l2 2 4-4',
  "alert-circle":  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M12 8v4|M12 16h.01',
  clock:           'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20|M12 6v6l4 2',
  search:          'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16|M21 21l-4.3-4.3',
  save:            'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z|M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7|M7 3v4a1 1 0 0 0 1 1h7',
  "trending-down": 'M22 17l-8.5-8.5-5 5L2 7|M16 17h6v-6',
  download:        'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3',
  printer:         'M6 9V2h12v7|M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2|M6 14h12v8H6z',
  "file-spreadsheet": 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z|M14 2v4a2 2 0 0 0 2 2h4|M8 13h2|M14 13h2|M8 17h2|M14 17h2',
  filter:          'M22 3H2l8 9.46V19l4 2v-8.54z',
  "chevron-down":  'M6 9l6 6 6-6',
  "chevron-right": 'M9 18l6-6-6-6',
  x:               'M18 6L6 18|M6 6l12 12',
  "bar-chart":     'M3 3v18h18|M18 17V9|M13 17V5|M8 17v-3',
  repeat:          'M17 2l4 4-4 4|M3 11v-1a4 4 0 0 1 4-4h14|M7 22l-4-4 4-4|M21 13v1a4 4 0 0 1-4 4H3',
  users:           'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  table:           'M12 3v18|M3 9h18|M3 15h18|M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  "layout-grid":   'M3 3h7v7H3z|M14 3h7v7h-7z|M14 14h7v7h-7z|M3 14h7v7H3z',
  minus:           'M5 12h14',
};

export function Icon({ name, size = 16, style }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0, ...style }}>
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// Shared form/button chrome. Spread these and override the one or two
// properties that differ rather than restating the whole block.
export const metaLabel = {
  display: "block", fontSize: 11.5, fontWeight: 700, color: T.gray600,
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
};
export const metaField = {
  width: "100%", padding: "9px 11px", fontSize: 14.5, border: `1.5px solid ${T.gray300}`,
  borderRadius: T.radius, color: T.ink, fontFamily: "inherit", background: T.white,
  boxSizing: "border-box", outline: "none",
};
export const btnPrimary = {
  padding: "9px 16px", fontSize: 13, fontWeight: 600, background: T.blue600, color: T.white,
  border: "none", borderRadius: T.radius, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
export const btnOutline = {
  padding: "9px 16px", fontSize: 13, fontWeight: 600, background: T.white, color: T.blue600,
  border: `1.5px solid ${T.blue600}`, borderRadius: T.radius, cursor: "pointer",
  fontFamily: "inherit", whiteSpace: "nowrap",
};


export const BRAND = T.blue600;
export const ACCENT = T.blue400;
