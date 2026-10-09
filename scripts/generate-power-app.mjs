#!/usr/bin/env node
/**
 * Generates the paste-in source for the Team Planner Power App:
 *
 *   docs/power-app/screens/*.yaml   one root container per screen, for
 *                                   Power Apps Studio's "Paste code"
 *   docs/power-app/App.Formulas.txt the App object's Formulas property
 *   docs/power-app/App.OnStart.txt  the App object's OnStart property
 *   docs/power-app/OnVisible.txt    the four screens that need an OnVisible
 *
 *   node scripts/generate-power-app.mjs
 *   node scripts/generate-power-app.mjs --formulas out.json   # also dump every formula
 *
 * Why generate rather than hand-write: thirteen screens share a header, card
 * chrome, status chips and date arithmetic, and Studio rejects a paste over a
 * single indentation slip. Fix a pattern here once and every screen gets it.
 * The --formulas dump is what the validation step feeds to Microsoft's Power
 * Fx parser, so every formula is syntax-checked before anyone pastes it.
 *
 * Control types are the updated modern controls (ModernText@1.0.0 and
 * friends, February 2026 onward), whose property names differ from the
 * preview-era Text@0.0.x controls most examples online still use: Color not
 * FontColor, Size not FontSize, FontWeight.Bold not "Bold", four Radius*
 * properties instead of BorderRadius. Checkbox and toggle are deliberately not
 * used — Microsoft doesn't document the updated controls' YAML type names, and
 * a wrong type name fails the whole paste. Tappable ☐/☑ text does the job.
 *
 * Column and list names must match docs/sharepoint-migration-plan.md §3.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO_ROOT, "docs", "power-app");

// ─── COLOURS ─────────────────────────────────────────────────────────────────
// The same tokens as src/theme.jsx, as RGBA() so single-line formulas stay
// free of the "#" that YAML would read as a comment.
const HEX = {
  blue600: "#0053a1", blue50: "#eef4fb", teal: "#00a0c6", tealDeep: "#00768f",
  success: "#1d7a4d", successBg: "#e7f4ec", successBorder: "#8fc9a3",
  error: "#c0392b", errorBg: "#fbeae7", errorBorder: "#e0a099",
  warning: "#b06a00", warningBg: "#fbf0db", warningBorder: "#e3c894",
  ink: "#131922", gray700: "#424b56", gray600: "#5d6773", gray500: "#7c8794",
  gray400: "#9ba5b2", gray300: "#c5ccd5", gray200: "#e1e6ec", gray100: "#eef1f5",
  gray50: "#f6f8fa", white: "#ffffff",
};
const rgba = hex => {
  const n = parseInt(hex.slice(1), 16);
  return `RGBA(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1)`;
};
const K = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, rgba(v)]));

// ─── CONTROL BUILDERS ────────────────────────────────────────────────────────
// Each returns a node { name, type, variant, props, children }. Property
// values are Power Fx without the leading "=", which the emitter adds.

const TYPES = {
  text: "ModernText@1.0.0",
  button: "ModernButton@1.0.0",
  input: "ModernTextInput@1.0.0",
  dropdown: "ModernDropdown@1.0.0",
  combo: "ModernCombobox@1.0.0",
  date: "ModernDatePicker@1.0.0",
  container: "GroupContainer@1.5.0",
  gallery: "Gallery@2.15.0",
  rect: "Rectangle@2.3.0",
  html: "HtmlViewer@2.1.0",
  // No version: the Header control isn't in Microsoft's 2026 rename list, and
  // leaving the version off lets Studio use whichever one the tenant has.
  header: "Header",
};

const node = (type, name, props = {}, children, variant) => ({ name, type, variant, props, children });
const str = s => `"${String(s).replace(/"/g, '""')}"`;
const radius = r => ({ RadiusTopLeft: r, RadiusTopRight: r, RadiusBottomLeft: r, RadiusBottomRight: r });

// Children of an auto-layout container. Explicit FillPortions everywhere so no
// control falls back to a default that stretches it somewhere unexpected.
const fixed = (h, extra = {}) => ({ FillPortions: 0, Height: h, AlignInContainer: "AlignInContainer.Stretch", ...extra });
const fixedW = (w, h, extra = {}) => ({ FillPortions: 0, Width: w, Height: h, AlignInContainer: "AlignInContainer.Center", ...extra });
const fill = (portions = 1, extra = {}) => ({ FillPortions: portions, LayoutMinHeight: 40, LayoutMinWidth: 40, AlignInContainer: "AlignInContainer.Stretch", ...extra });

function text(name, t, props = {}) {
  return node(TYPES.text, name, { Text: t, Size: 13, Color: K.ink, ...props });
}
function label(name, t, props = {}) {
  return text(name, str(t), { Size: 11, FontWeight: "FontWeight.Semibold", Color: K.gray600, ...props });
}
function button(name, t, onSelect, props = {}) {
  return node(TYPES.button, name, { Text: t, OnSelect: onSelect, Size: 13, ...props });
}
function input(name, props = {}) {
  return node(TYPES.input, name, { Appearance: "Appearance.Outline", TriggerOutput: "TriggerOutput.Keypress", ...props });
}
function dropdown(name, items, display, props = {}) {
  return node(TYPES.dropdown, name, { Items: items, ItemDisplayText: display, Appearance: "Appearance.Outline", ...props });
}
function datePicker(name, props = {}) {
  return node(TYPES.date, name, {
    StartOfWeek: "StartOfWeek.Monday", Format: "DatePickerFormat.LongAbbreviated",
    Appearance: "Appearance.Outline", ...props,
  });
}
function vbox(name, props, children) {
  return node(TYPES.container, name, {
    LayoutDirection: "LayoutDirection.Vertical", DropShadow: "DropShadow.None", LayoutGap: 8, ...props,
  }, children, "AutoLayout");
}
function hbox(name, props, children) {
  return node(TYPES.container, name, {
    LayoutDirection: "LayoutDirection.Horizontal", DropShadow: "DropShadow.None",
    LayoutAlignItems: "LayoutAlignItems.Center", LayoutGap: 8, ...props,
  }, children, "AutoLayout");
}
function gallery(name, variant, props, children) {
  return node(TYPES.gallery, name, { TemplatePadding: 0, ShowScrollbar: "true", ...props }, children, variant);
}
function rect(name, props) {
  return node(TYPES.rect, name, props);
}
const spacer = name => text(name, '""', { FillPortions: 1, LayoutMinWidth: 1, Height: 10, AlignInContainer: "AlignInContainer.Center" });

// White card with the hairline border the React app uses.
function card(name, props, children) {
  return vbox(name, {
    Fill: K.white, BorderColor: K.gray200, BorderThickness: 1, ...radius(12),
    PaddingTop: 16, PaddingBottom: 16, PaddingLeft: 18, PaddingRight: 18, LayoutGap: 10, ...props,
  }, children);
}

// A labelled form field: small caps label over the input, sized for a row.
function field(name, lbl, control, portions = 1) {
  return vbox(name, { ...fill(portions, { LayoutMinHeight: 60 }), Height: 62, LayoutGap: 4 }, [
    label(`${name}Lbl`, lbl, fixed(18)),
    { ...control, props: { ...control.props, ...fixed(36) } },
  ]);
}
function row(name, children, props = {}) {
  return hbox(name, { ...fixed(64), LayoutAlignItems: "LayoutAlignItems.Start", LayoutGap: 12, ...props }, children);
}

// A coloured status pill: a Text control with a fill, so it can sit in a
// gallery template and still be tapped.
function chip(name, statusExpr, props = {}) {
  return text(name, statusExpr, {
    Size: 11, FontWeight: "FontWeight.Semibold", Align: "Align.Center",
    Fill: `LookUp(nfStatus, Label = ${statusExpr}, Bg)`,
    Color: `LookUp(nfStatus, Label = ${statusExpr}, Fg)`,
    BorderColor: `LookUp(nfStatus, Label = ${statusExpr}, Bd)`,
    BorderThickness: 1, ...radius(10), ...props,
  });
}

// ─── FORMULA SNIPPETS ────────────────────────────────────────────────────────

const dnum = d => `Value(Text(${d}, "yyyymmdd"))`;
const eom = d => `DateAdd(DateAdd(${d}, 1, TimeUnit.Months), -1, TimeUnit.Days)`;
const weekStart = d => `DateAdd(${d}, 1 - Weekday(${d}, StartOfWeek.Monday), TimeUnit.Days)`;
// Mon–Fri days from a to b inclusive. a and b must be plain names or field
// references: `Value` inside them would mean the Sequence row.
const weekdays = (a, b) =>
  `CountRows(Filter(ForAll(Sequence(Max(0, DateDiff(${a}, ${b}, TimeUnit.Days) + 1)) As wdk, DateAdd(${a}, wdk.Value - 1, TimeUnit.Days)), Weekday(Value, StartOfWeek.Monday) <= 5))`;
// "Jun 8" / "Jun 8 – 12" / "Jun 29 – Jul 2", as formatRange() in teamPlannerData.js.
const range = (s, e) =>
  `If(IsBlank(${e}) || ${e} = ${s}, Text(${s}, "mmm d"), Month(${s}) = Month(${e}) && Year(${s}) = Year(${e}), Text(${s}, "mmm d") & " – " & Day(${e}), Text(${s}, "mmm d") & " – " & Text(${e}, "mmm d"))`;
const personName = key => `Coalesce(LookUp(colPeople, PersonKey = ${key}, Title), ${key})`;
const todayNum = dnum("Today()");
const canEditEntry = e => `(varIsAdmin || (!IsBlank(varMe) && ${e}.PersonKey = varMe.PersonKey))`;
const monthHas = (monthsExpr, m) => `!IsBlank(LookUp(Split(Coalesce(${monthsExpr}, ""), ",") As mh, Trim(mh.Value) = Text(${m})))`;

// cadenceLabel() from teamPlannerData.js, for a task record (prefix "" for row scope).
const cadenceLabel = (t = "") => `Switch(${t}CadenceType.Value,
    "One-off date", If(IsBlank(${t}CadenceDate), "One-off", Text(${t}CadenceDate, "mmm d, yyyy")),
    "Specific month", Coalesce(${t}CadenceLabel, If(CountRows(Split(Coalesce(${t}CadenceMonths, ""), ",")) = 1 && !IsBlank(${t}CadenceMonths), Index(nfMonths, Value(${t}CadenceMonths)).Value, "Specific month")),
    "Month range", Coalesce(${t}CadenceLabel, "Month range"),
    ${t}CadenceType.Value)`;

// Dropdown items with a leading "all" option. Built from a Sequence rather
// than by concatenating tables, which Power Fx has no direct function for.
const withAll = (source, allRecord, mapRecord) =>
  `ForAll(Sequence(CountRows(${source}) + 1) As i, If(i.Value = 1, ${allRecord}, With({r: Index(${source}, i.Value - 1)}, ${mapRecord})))`;
const allTags = `Sort(Distinct(Filter(ForAll(Split(Concat(colTasks, Tags, ","), ",") As tg, Trim(tg.Value)), Value <> ""), Value), Value)`;
const tagsHave = (tagsExpr, tag) => `!IsBlank(LookUp(Split(Coalesce(${tagsExpr}, ""), ",") As th, Trim(th.Value) = ${tag}))`;

// normalizeTag() applied to a comma-separated list: lower-case, spaces to
// dashes, only a-z 0-9 and "-", 24 characters, duplicates dropped.
const normTags = src => `Concat(Distinct(Filter(ForAll(Split(${src}, ",") As nt, Left(Concat(MatchAll(Substitute(Lower(Trim(nt.Value)), " ", "-"), "[a-z0-9-]+"), FullMatch), 24)), Value <> ""), Value), Value, ", ")`;

// ─── HEADER ──────────────────────────────────────────────────────────────────

const NAV = [
  { id: "Today", label: "Today", screen: "scrToday", w: 76 },
  { id: "MyTasks", label: "My Tasks", screen: "scrMyTasks", w: 96 },
  { id: "Tasks", label: "Task Calendar", screen: "scrTaskCalendar", w: 124 },
  { id: "Where", label: "Whereabouts", screen: "scrWhereabouts", w: 116 },
  { id: "Print", label: "Print", screen: "scrPrint", w: 68 },
  { id: "Circuit", label: "Site Circuit", screen: "scrSiteCircuit", w: 108 },
  { id: "Pto", label: "My PTO", screen: "scrMyRequests", w: 84 },
  { id: "Entries", label: "My Entries", screen: "scrMyEntries", w: 102 },
  { id: "Roster", label: "Roster", screen: "scrRoster", w: 80, admin: true },
];

function header(p, active, extra = {}) {
  return hbox(`${p}Header`, {
    ...fixed(60), Fill: K.white, BorderColor: K.gray200, BorderThickness: 1,
    PaddingLeft: 20, PaddingRight: 20, LayoutGap: 4, ...extra,
  }, [
    text(`${p}AppTitle`, '"Team Planner"', { ...fixedW(150, 36), Size: 18, FontWeight: "FontWeight.Bold", Color: K.blue600 }),
    ...NAV.map(n => button(`${p}Nav${n.id}`, str(n.label), `Navigate(${n.screen}, ScreenTransition.None)`, {
      ...fixedW(n.w, 34),
      Appearance: n.id === active ? "ButtonAppearance.Primary" : "ButtonAppearance.Subtle",
      ...(n.admin ? { Visible: "varIsAdmin" } : {}),
    })),
    spacer(`${p}HeaderSpacer`),
    text(`${p}Who`, `Coalesce(varMe.Title, User().FullName) & If(varIsAdmin, " · admin", "")`, {
      ...fixedW(200, 30), Size: 12, Color: K.gray600, Align: "Align.Right",
    }),
  ]);
}

function root(p, active, children, headerExtra) {
  return vbox(`${p}Root`, {
    X: 0, Y: 0, Width: "Parent.Width", Height: "Parent.Height", Fill: K.gray50, LayoutGap: 0,
  }, [header(p, active, headerExtra), ...children]);
}

// ─── PREBUILT-SCREEN LAYOUT ──────────────────────────────────────────────────
// The shape of Power Apps' prebuilt responsive screens (New screen → Header
// and gallery / Approval request): a screen container holding a header
// container with the modern Header control, then a main container of white
// cards. The Header control can't do app navigation (per its docs), so a slim
// nav strip sits between the two.

const PAGE_BG = "RGBA(243, 242, 241, 1)";

function tcard(name, props, children) {
  return vbox(name, {
    Fill: K.white, ...radius(8), DropShadow: "DropShadow.Light",
    PaddingTop: 16, PaddingBottom: 16, PaddingLeft: 16, PaddingRight: 16, LayoutGap: 10, ...props,
  }, children);
}

function navStrip(p, active) {
  return hbox(`${p}NavContainer`, { ...fixed(44), Fill: K.white, ...radius(8), DropShadow: "DropShadow.Light", PaddingLeft: 8, PaddingRight: 8, LayoutGap: 2 },
    NAV.map(n => button(`${p}Nav${n.id}`, str(n.label), `Navigate(${n.screen}, ScreenTransition.None)`, {
      ...fixedW(n.w, 32),
      Appearance: n.id === active ? "ButtonAppearance.Primary" : "ButtonAppearance.Subtle",
      ...(n.admin ? { Visible: "varIsAdmin" } : {}),
    })));
}

function templateScreen(p, title, active, mainChildren) {
  return vbox(`${p}ScreenContainer`, {
    X: 0, Y: 0, Width: "Parent.Width", Height: "Parent.Height", Fill: PAGE_BG,
    PaddingTop: 8, PaddingBottom: 8, PaddingLeft: 8, PaddingRight: 8, LayoutGap: 8,
  }, [
    hbox(`${p}HeaderContainer`, { ...fixed(56), LayoutGap: 0 }, [
      node(TYPES.header, `${p}Header`, {
        ...fill(1, { LayoutMinHeight: 48 }), Height: 56, Title: str(title),
        IsLogoVisible: "false", IsProfilePictureVisible: "true", BasePaletteColor: K.blue600,
      }),
    ]),
    navStrip(p, active),
    hbox(`${p}MainContainer`, { ...fill(1, { LayoutMinHeight: 300 }), LayoutGap: 8, LayoutAlignItems: "LayoutAlignItems.Stretch" }, mainChildren),
  ]);
}

const divider = name => rect(name, { ...fixed(1), Fill: K.gray200 });

// PTO request status pill: Approved green, Pending amber, Rejected red, else grey.
function requestPill(name, statusExpr, props = {}) {
  const pick = (approved, pending, rejected, other) => `Switch(${statusExpr}, "Approved", ${approved}, "Pending", ${pending}, "Rejected", ${rejected}, ${other})`;
  return text(name, statusExpr, {
    Size: 11, FontWeight: "FontWeight.Bold", Align: "Align.Center",
    Fill: pick(K.successBg, K.warningBg, K.errorBg, K.gray100),
    Color: pick(K.success, K.warning, K.error, K.gray600),
    BorderColor: pick(K.successBorder, K.warningBorder, K.errorBorder, K.gray300),
    BorderThickness: 1, ...radius(12), ...props,
  });
}

function toolbar(name, children, props = {}) {
  return hbox(name, { ...fixed(60), PaddingLeft: 20, PaddingRight: 20, ...props }, children);
}

function content(name, children, props = {}) {
  return vbox(name, {
    ...fill(1, { LayoutMinHeight: 200 }), PaddingLeft: 20, PaddingRight: 20, PaddingBottom: 16, LayoutGap: 14, ...props,
  }, children);
}

function pager(p, stepMonths = "1") {
  return [
    button(`${p}Prev`, '""', `Set(varAnchor, DateAdd(varAnchor, -${stepMonths}, TimeUnit.Months))`, {
      ...fixedW(36, 34), Appearance: "ButtonAppearance.Outline", Icon: '"ChevronLeft"', Layout: "ButtonLayout.IconOnly", AccessibleLabel: '"Previous"',
    }),
    text(`${p}Period`, 'Text(varAnchor, "mmmm yyyy")', { ...fixedW(170, 34), Size: 16, FontWeight: "FontWeight.Bold", Align: "Align.Center" }),
    button(`${p}Next`, '""', `Set(varAnchor, DateAdd(varAnchor, ${stepMonths}, TimeUnit.Months))`, {
      ...fixedW(36, 34), Appearance: "ButtonAppearance.Outline", Icon: '"ChevronRight"', Layout: "ButtonLayout.IconOnly", AccessibleLabel: '"Next"',
    }),
    button(`${p}ThisMonth`, '"Today"', "Set(varAnchor, Date(Year(Today()), Month(Today()), 1))", {
      ...fixedW(72, 34), Appearance: "ButtonAppearance.Outline",
    }),
  ];
}

// ─── SCREEN: TODAY ───────────────────────────────────────────────────────────

function screenToday() {
  const p = "tdy";
  const outToday = `With({t: ${todayNum}}, Filter(Filter('TP Entries', StartNum <= t && EndNum >= t), LookUp(nfStatus, Label = Status.Value, Out)))`;
  const summary = `With({t: ${todayNum}},
  With({today: Filter('TP Entries', StartNum <= t && EndNum >= t), act: Filter(colPeople, Active = true)},
    With({
        inOffice: Filter(act As ip, !IsBlank(LookUp(today, PersonKey = ip.PersonKey && !LookUp(nfStatus, Label = Status.Value, Out)))),
        unrecorded: Filter(act As np, IsBlank(LookUp(today, PersonKey = np.PersonKey)))
      },
      CountRows(inOffice) & " in office · " & CountRows(unrecorded) & " with nothing recorded" &
      If(CountRows(unrecorded) > 0, " (" & Concat(unrecorded, First(Split(Title, " ")).Value, ", ") & ")", "")
    )
  )
)`;
  const week = `With({ws: ${weekStart("Today()")}},
  With({wsn: ${dnum("ws")}, wen: ${dnum("DateAdd(ws, 4, TimeUnit.Days)")}},
    With({wk: Filter(Filter('TP Entries', StartNum <= wen && EndNum >= wsn), LookUp(nfStatus, Label = Status.Value, Out))},
      ForAll(Sequence(5) As i,
        With({d: DateAdd(ws, i.Value - 1, TimeUnit.Days)},
          With({n: ${dnum("d")}}, {D: d, Num: n, Outs: Filter(wk, StartNum <= n && EndNum >= n)})
        )
      )
    )
  )
)`;
  const bucket = `With({ws: ${weekStart("Today()")}, inMonth: ${monthHas("CadenceMonths", "Month(Today())")}},
      Switch(CadenceType.Value,
        "One-off date", If(IsBlank(CadenceDate), Blank(),
          CadenceDate = Today(), "Due today",
          CadenceDate >= ws && CadenceDate <= DateAdd(ws, 6, TimeUnit.Days), "This week",
          Year(CadenceDate) = Year(Today()) && Month(CadenceDate) = Month(Today()), "This month",
          Blank()),
        "Weekly", "This week",
        "Monthly", "This month",
        "Quarterly", "This month",
        "Specific month", If(inMonth, "This month", Blank()),
        "Month range", If(inMonth, "This month", Blank()),
        Blank()))`;
  const tasks = `Sort(
  Filter(
    AddColumns(
      AddColumns(colTasks, Bucket, ${bucket}),
      BucketRank, Switch(Bucket, "Due today", 1, "This week", 2, 3),
      CadRank, LookUp(nfCadences, Label = CadenceType.Value, Rank)
    ),
    !IsBlank(Bucket)
  ),
  BucketRank * 100 + CadRank
)`;
  const milestones = `Sort(
  Filter(
    AddColumns(Filter(colMilestones, !IsBlank(ThisRecord.Month) && !IsBlank(ThisRecord.Day)), Days,
      With({nx: Date(Year(Today()), ThisRecord.Month, ThisRecord.Day)},
        DateDiff(Today(), If(nx < Today(), Date(Year(Today()) + 1, ThisRecord.Month, ThisRecord.Day), nx), TimeUnit.Days))),
    Days <= 30
  ),
  Days
)`;

  const leftCol = vbox(`${p}Left`, { ...fill(1), LayoutGap: 14 }, [
    card(`${p}OutCard`, fill(3), [
      text(`${p}OutTitle`, `"Out today — " & Text(Today(), "dddd, mmmm d")`, { ...fixed(26), Size: 15, FontWeight: "FontWeight.Bold" }),
      gallery(`${p}OutGal`, "Vertical", {
        ...fill(1), Items: outToday, TemplateSize: 58,
        OnSelect: "Set(varEntry, ThisItem); Navigate(scrEntryDetail, ScreenTransition.None)",
      }, [
        rect(`${p}OutBg`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: 52, Fill: K.white, BorderColor: K.gray200, BorderThickness: 1, OnSelect: "Select(Parent)" }),
        text(`${p}OutName`, personName("ThisItem.PersonKey"), { X: 12, Y: 7, Width: "Parent.TemplateWidth - 150", Height: 22, Size: 14, FontWeight: "FontWeight.Bold", OnSelect: "Select(Parent)" }),
        text(`${p}OutSub`, `Coalesce(ThisItem.VisitLocation, ThisItem.RawText, ThisItem.Status.Value) & If(ThisItem.EndDate <> ThisItem.StartDate, " · " & ${range("ThisItem.StartDate", "ThisItem.EndDate")}, "") & If(ThisItem.DayPart.Value = "AM" || ThisItem.DayPart.Value = "PM", " · " & ThisItem.DayPart.Value, "")`,
          { X: 12, Y: 30, Width: "Parent.TemplateWidth - 150", Height: 20, Size: 12, Color: K.gray600, OnSelect: "Select(Parent)" }),
        chip(`${p}OutChip`, "ThisItem.Status.Value", { X: "Parent.TemplateWidth - 132", Y: 17, Width: 122, Height: 24, OnSelect: "Select(Parent)" }),
      ]),
      text(`${p}OutEmpty`, '"Nobody is marked out today."', { ...fixed(22), Color: K.gray500, Visible: `CountRows(${p}OutGal.AllItems) = 0` }),
      text(`${p}OutSummary`, summary, { ...fixed(34), Size: 12, Color: K.gray500, Wrap: "true" }),
    ]),
    card(`${p}WeekCard`, fill(2), [
      text(`${p}WeekTitle`, '"This week"', { ...fixed(26), Size: 15, FontWeight: "FontWeight.Bold" }),
      gallery(`${p}WeekGal`, "Horizontal", { ...fill(1), Items: week, TemplateSize: "Self.Width / 5", ShowScrollbar: "false" }, [
        rect(`${p}DayBg`, {
          X: 0, Y: 0, Width: "Parent.TemplateWidth - 6", Height: "Parent.TemplateHeight",
          Fill: `If(ThisItem.D = Today(), ${K.blue50}, ${K.white})`, BorderColor: `If(ThisItem.D = Today(), ${K.blue600}, ${K.gray200})`, BorderThickness: 1,
        }),
        text(`${p}DayLbl`, 'Upper(Text(ThisItem.D, "ddd")) & " " & Day(ThisItem.D)', { X: 6, Y: 4, Width: "Parent.TemplateWidth - 18", Height: 18, Size: 11, FontWeight: "FontWeight.Bold", Color: K.gray600 }),
        text(`${p}DayAllIn`, '"All in"', { X: 6, Y: 26, Width: "Parent.TemplateWidth - 18", Height: 18, Size: 11, Color: K.gray400, Visible: "CountRows(ThisItem.Outs) = 0" }),
        gallery(`${p}DayChips`, "Vertical", {
          X: 4, Y: 26, Width: "Parent.TemplateWidth - 14", Height: "Parent.TemplateHeight - 30",
          Items: "ThisItem.Outs", TemplateSize: 22, TemplatePadding: 1, ShowScrollbar: "false",
          OnSelect: "Set(varEntry, ThisItem); Navigate(scrEntryDetail, ScreenTransition.None)",
        }, [
          chip(`${p}DayChip`, "ThisItem.Status.Value", {
            Text: `First(Split(Coalesce(ThisItem.PersonName, ThisItem.PersonKey), " ")).Value & " · " & LookUp(nfStatus, Label = ThisItem.Status.Value, Short)`,
            X: 0, Y: 0, Width: "Parent.TemplateWidth", Height: 20, Align: "Align.Left", PaddingLeft: 5, ...radius(4), OnSelect: "Select(Parent)",
          }),
        ]),
      ]),
    ]),
  ]);

  const rightCol = vbox(`${p}Right`, { ...fill(1), LayoutGap: 14 }, [
    card(`${p}TaskCard`, fill(3), [
      text(`${p}TaskTitle`, '"Recurring tasks in play"', { ...fixed(26), Size: 15, FontWeight: "FontWeight.Bold" }),
      gallery(`${p}TaskGal`, "Vertical", { ...fill(1), Items: tasks, TemplateSize: 54 }, [
        rect(`${p}TaskBg`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: 48, Fill: K.gray50, BorderColor: K.gray200, BorderThickness: 1 }),
        text(`${p}TaskName`, "ThisItem.Title", { X: 10, Y: 6, Width: "Parent.TemplateWidth - 270", Height: 20, FontWeight: "FontWeight.Semibold" }),
        text(`${p}TaskNote`, "ThisItem.Comments", { X: 10, Y: 27, Width: "Parent.TemplateWidth - 270", Height: 20, Size: 11, Color: K.gray600 }),
        text(`${p}TaskBucket`, "ThisItem.Bucket", {
          X: "Parent.TemplateWidth - 252", Y: 15, Width: 96, Height: 22, Size: 10, FontWeight: "FontWeight.Bold", Align: "Align.Center",
          Fill: K.warningBg, Color: K.warning, ...radius(10),
        }),
        text(`${p}TaskWho`, `If(ThisItem.AssigneeType.Value = "Team", "Team", Coalesce(ThisItem.AssigneeName, If(ThisItem.AssigneeType.Value = "Unassigned", "Unassigned", "—")))`,
          { X: "Parent.TemplateWidth - 150", Y: 6, Width: 140, Height: 20, Size: 12, FontWeight: "FontWeight.Semibold", Align: "Align.Right", Color: K.gray700 }),
        text(`${p}TaskCad`, cadenceLabel("ThisItem."), { X: "Parent.TemplateWidth - 150", Y: 27, Width: 140, Height: 20, Size: 11, Align: "Align.Right", Color: K.gray500 }),
      ]),
    ]),
    card(`${p}MileCard`, fill(2), [
      text(`${p}MileTitle`, '"Birthdays & anniversaries — next 30 days"', { ...fixed(26), Size: 15, FontWeight: "FontWeight.Bold" }),
      gallery(`${p}MileGal`, "Vertical", { ...fill(1), Items: milestones, TemplateSize: 28 }, [
        text(`${p}MileName`, `Coalesce(ThisItem.Title, ${personName("ThisItem.PersonKey")} & " — " & ThisItem.Type.Value)`, { X: 0, Y: 4, Width: "Parent.TemplateWidth - 130", Height: 20 }),
        text(`${p}MileWhen`, 'Left(Index(nfMonths, ThisItem.Month).Value, 3) & " " & ThisItem.Day & If(ThisItem.Days = 0, " · today", "")',
          { X: "Parent.TemplateWidth - 124", Y: 4, Width: 120, Height: 20, Color: K.gray500, Align: "Align.Right" }),
      ]),
      text(`${p}MileEmpty`, '"Nothing in the next 30 days."', { ...fixed(22), Color: K.gray500, Visible: `CountRows(${p}MileGal.AllItems) = 0` }),
    ]),
  ]);

  return root(p, "Today", [
    text(`${p}Unlinked`, `"You can see the whole team's calendar, but your sign-in isn't linked to a roster person yet, so you have nothing of your own to edit. An admin can link it on the Roster screen."`, {
      ...fixed(44), Visible: "IsBlank(varMe) && !varIsAdmin", Fill: K.warningBg, Color: K.warning, Size: 12, Wrap: "true", PaddingLeft: 20, PaddingRight: 20,
    }),
    hbox(`${p}Body`, { ...fill(1, { LayoutMinHeight: 300 }), PaddingTop: 16, PaddingLeft: 20, PaddingRight: 20, PaddingBottom: 16, LayoutGap: 18, LayoutAlignItems: "LayoutAlignItems.Stretch" }, [leftCol, rightCol]),
  ]);
}

// ─── SCREEN: WHEREABOUTS ─────────────────────────────────────────────────────

function screenWhereabouts() {
  const p = "wba";
  const people = withAll("colPeople", '{K: "", N: "Whole team"}', '{K: r.PersonKey, N: r.Title & If(r.Active, "", " (inactive)")}');
  const statuses = withAll("nfStatus", '{V: "", N: "All statuses"}', "{V: r.Label, N: r.Label}");
  // One query for the month's entries and one for pending requests, projected
  // to the same shape and stacked with Ungroup so a day cell needs one gallery.
  const grid = `With(
  {
    s: ${dnum("varAnchor")},
    e: ${dnum(eom("varAnchor"))},
    n: Day(${eom("varAnchor")}),
    wd: Weekday(varAnchor, StartOfWeek.Monday),
    pk: ${p}Person.Selected.K,
    st: ${p}Status.Selected.V
  },
  With(
    {
      lead: If(wd <= 5, wd - 1, 0),
      chips: Filter(
        Ungroup(
          Table(
            {G: ForAll(Filter('TP Entries', StartNum <= e && EndNum >= s) As x,
              {Id: x.ID, Kind: "entry", PersonKey: x.PersonKey, FirstName: First(Split(Coalesce(x.PersonName, x.PersonKey), " ")).Value,
               StartNum: x.StartNum, EndNum: x.EndNum, Status: x.Status.Value, Location: x.VisitLocation, Part: x.DayPart.Value,
               HasNote: !IsBlank(x.Notes), HasTravel: !IsBlank(x.TravelJson)})},
            {G: ForAll(Filter('TP PTO Requests', Status.Value = "Pending" && StartNum <= e && EndNum >= s) As r,
              {Id: r.ID, Kind: "pending", PersonKey: r.PersonKey, FirstName: First(Split(${personName("r.PersonKey")}, " ")).Value,
               StartNum: r.StartNum, EndNum: r.EndNum, Status: r.LeaveType.Value, Location: "", Part: r.DayPart.Value,
               HasNote: false, HasTravel: false})}
          ),
          G
        ),
        (IsBlank(pk) || PersonKey = pk) && (IsBlank(st) || Status = st)
      )
    },
    AddColumns(
      Filter(
        ForAll(Sequence(lead + n) As i,
          If(i.Value <= lead,
            {IsPad: true, D: Blank(), Num: 0},
            With({d: DateAdd(varAnchor, i.Value - lead - 1, TimeUnit.Days)}, {IsPad: false, D: d, Num: ${dnum("d")}}))),
        IsPad || Weekday(D, StartOfWeek.Monday) <= 5
      ),
      Chips, Sort(Filter(chips, !IsPad && StartNum <= Num && EndNum >= Num), FirstName)
    )
  )
)`;
  const chipText = `ThisItem.FirstName & " " &
If(ThisItem.Kind = "pending", ThisItem.Status & "?", Coalesce(ThisItem.Location, LookUp(nfStatus, Label = ThisItem.Status, Short))) &
If(ThisItem.Part = "AM" || ThisItem.Part = "PM", " " & ThisItem.Part, "") &
If(ThisItem.HasTravel, " ✈", "") & If(ThisItem.HasNote, " •", "")`;
  const pending = 'ThisItem.Kind = "pending"';

  const outToday = `With({t: ${todayNum}}, Filter(Filter('TP Entries', StartNum <= t && EndNum >= t), LookUp(nfStatus, Label = Status.Value, Out)))`;
  const pendingMonth = `With({s: ${dnum("varAnchor")}, e: ${dnum(eom("varAnchor"))}}, SortByColumns(Filter('TP PTO Requests', Status.Value = "Pending" && StartNum <= e && EndNum >= s), StartNum, SortOrder.Ascending))`;

  return templateScreen(p, "Team Planner · Whereabouts", "Where", [
    tcard(`${p}CalendarCard`, { ...fill(1, { LayoutMinHeight: 300 }), LayoutGap: 10 }, [
      hbox(`${p}Toolbar`, { ...fixed(40), LayoutGap: 8 }, [
        ...pager(p),
        dropdown(`${p}Person`, people, "ThisItem.N", { ...fixedW(170, 34), Default: '{K: "", N: "Whole team"}', AccessibleLabel: '"Filter by person"' }),
        dropdown(`${p}Status`, statuses, "ThisItem.N", { ...fixedW(160, 34), Default: '{V: "", N: "All statuses"}', AccessibleLabel: '"Filter by status"' }),
        spacer(`${p}ToolSpacer`),
        button(`${p}Request`, '"Request PTO"', "Navigate(scrRequestPTO, ScreenTransition.None)", { ...fixedW(120, 34), Appearance: "ButtonAppearance.Outline", Visible: "!IsBlank(varMe)" }),
        button(`${p}Add`, '"Add entry"', `Set(varEntry, Blank()); Set(varNewDate, Today()); Navigate(scrEntryEdit, ScreenTransition.None, {locShowTravel: false})`, {
          ...fixedW(112, 34), Icon: '"Add"', DisplayMode: "If(IsBlank(varMe) && !varIsAdmin, DisplayMode.Disabled, DisplayMode.Edit)",
        }),
      ]),
      vbox(`${p}GridFrame`, { ...fill(1, { LayoutMinHeight: 260 }), BorderColor: K.gray200, BorderThickness: 1, ...radius(6), LayoutGap: 0 }, [
        hbox(`${p}Dow`, { ...fixed(32), LayoutGap: 0, Fill: K.gray50 },
          ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d =>
            text(`${p}Dow${d.slice(0, 3)}`, str(d.toUpperCase()), { ...fill(1, { LayoutMinHeight: 28 }), Height: 28, Size: 11, FontWeight: "FontWeight.Bold", Color: K.gray600, Align: "Align.Center" }))),
        gallery(`${p}Grid`, "Vertical", {
          ...fill(1), Items: grid, WrapCount: 5,
          TemplateSize: "Max(92, (Self.Height - 4) / Max(1, RoundUp(Self.AllItemsCount / 5, 0)))",
        }, [
          rect(`${p}CellBg`, {
            X: 0, Y: 0, Width: "Parent.TemplateWidth", Height: "Parent.TemplateHeight",
            Fill: `If(ThisItem.IsPad, ${K.gray50}, ThisItem.Num = ${todayNum}, ${K.blue50}, ${K.white})`, BorderColor: K.gray100, BorderThickness: 1,
          }),
          text(`${p}CellDay`, 'If(ThisItem.IsPad, "", Text(Day(ThisItem.D)))', {
            X: 7, Y: 3, Width: 40, Height: 20, Size: 12,
            FontWeight: `If(ThisItem.Num = ${todayNum}, FontWeight.Bold, FontWeight.Semibold)`,
            Color: `If(ThisItem.Num = ${todayNum}, ${K.blue600}, ${K.gray600})`,
          }),
          button(`${p}CellAdd`, '""', `Set(varEntry, Blank()); Set(varNewDate, ThisItem.D); Navigate(scrEntryEdit, ScreenTransition.None, {locShowTravel: false})`, {
            X: "Parent.TemplateWidth - 32", Y: 1, Width: 30, Height: 24,
            Appearance: "ButtonAppearance.Transparent", Icon: '"Add"', Layout: "ButtonLayout.IconOnly",
            AccessibleLabel: '"Add entry for " & Text(ThisItem.D, "mmm d")',
            Visible: "!ThisItem.IsPad && (!IsBlank(varMe) || varIsAdmin)",
          }),
          gallery(`${p}Chips`, "Vertical", {
            X: 3, Y: 25, Width: "Parent.TemplateWidth - 6", Height: "Parent.TemplateHeight - 27",
            Items: "ThisItem.Chips", TemplateSize: 22, TemplatePadding: 1, ShowScrollbar: "false",
          }, [
            text(`${p}Chip`, chipText, {
              X: 0, Y: 0, Width: "Parent.TemplateWidth", Height: 20, Size: 11, PaddingLeft: 5, ...radius(4), BorderThickness: 1,
              Fill: `If(${pending}, ${K.white}, LookUp(nfStatus, Label = ThisItem.Status, Bg))`,
              Color: "LookUp(nfStatus, Label = ThisItem.Status, Fg)",
              BorderColor: `If(${pending}, LookUp(nfStatus, Label = ThisItem.Status, Fg), LookUp(nfStatus, Label = ThisItem.Status, Bd))`,
              BorderStyle: `If(${pending}, BorderStyle.Dashed, BorderStyle.Solid)`,
              OnSelect: `If(${pending}, Navigate(scrMyRequests, ScreenTransition.None), Set(varEntry, LookUp('TP Entries', ID = ThisItem.Id)); Navigate(scrEntryDetail, ScreenTransition.None))`,
            }),
          ]),
        ]),
      ]),
    ]),
    tcard(`${p}SidebarContainer`, { FillPortions: 0, Width: 280, LayoutMinHeight: 300, AlignInContainer: "AlignInContainer.Stretch", LayoutGap: 8 }, [
      text(`${p}OutTitle`, `"Out today · " & Text(Today(), "ddd mmm d")`, { ...fixed(24), Size: 15, FontWeight: "FontWeight.Semibold" }),
      gallery(`${p}OutGal`, "Vertical", {
        ...fill(2, { LayoutMinHeight: 60 }), Items: outToday, TemplateSize: 46,
        OnSelect: "Set(varEntry, ThisItem); Navigate(scrEntryDetail, ScreenTransition.None)",
      }, [
        text(`${p}OutName`, personName("ThisItem.PersonKey"), { X: 0, Y: 3, Width: "Parent.TemplateWidth - 96", Height: 20, FontWeight: "FontWeight.Semibold", OnSelect: "Select(Parent)" }),
        text(`${p}OutSub`, `Coalesce(ThisItem.VisitLocation, ThisItem.RawText, ThisItem.Status.Value) & If(ThisItem.DayPart.Value = "AM" || ThisItem.DayPart.Value = "PM", " · " & ThisItem.DayPart.Value, "")`, {
          X: 0, Y: 23, Width: "Parent.TemplateWidth - 96", Height: 18, Size: 11, Color: K.gray600, OnSelect: "Select(Parent)",
        }),
        chip(`${p}OutChip`, "ThisItem.Status.Value", { X: "Parent.TemplateWidth - 92", Y: 11, Width: 90, Height: 22, OnSelect: "Select(Parent)" }),
      ]),
      text(`${p}OutEmpty`, '"Nobody is marked out today."', { ...fixed(20), Size: 12, Color: K.gray500, Visible: `CountRows(${p}OutGal.AllItems) = 0` }),
      divider(`${p}Divider1`),
      text(`${p}PendingTitle`, `"Awaiting approval · " & Text(varAnchor, "mmmm")`, { ...fixed(24), Size: 15, FontWeight: "FontWeight.Semibold" }),
      gallery(`${p}PendingGal`, "Vertical", {
        ...fill(1, { LayoutMinHeight: 50 }), Items: pendingMonth, TemplateSize: 44,
        OnSelect: "Navigate(scrMyRequests, ScreenTransition.None)",
      }, [
        text(`${p}PendingName`, `${personName("ThisItem.PersonKey")} & " · " & ThisItem.LeaveType.Value`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: 20, FontWeight: "FontWeight.Semibold", OnSelect: "Select(Parent)" }),
        text(`${p}PendingWhen`, `${range("ThisItem.StartDate", "ThisItem.EndDate")} & If(ThisItem.DayPart.Value = "Full day", "", " · " & ThisItem.DayPart.Value)`, {
          X: 0, Y: 23, Width: "Parent.TemplateWidth", Height: 18, Size: 11, Color: K.warning, OnSelect: "Select(Parent)",
        }),
      ]),
      text(`${p}PendingEmpty`, '"No requests waiting this month."', { ...fixed(20), Size: 12, Color: K.gray500, Visible: `CountRows(${p}PendingGal.AllItems) = 0` }),
      divider(`${p}Divider2`),
      text(`${p}KeyTitle`, '"Key"', { ...fixed(22), Size: 13, FontWeight: "FontWeight.Semibold" }),
      gallery(`${p}LegendGal`, "Vertical", { ...fixed(9 * 24), Items: "nfStatus", TemplateSize: 24, ShowScrollbar: "false" }, [
        chip(`${p}LegendChip`, "ThisItem.Label", { X: 0, Y: 1, Width: "Parent.TemplateWidth", Height: 21, Align: "Align.Left", PaddingLeft: 8, ...radius(4) }),
      ]),
      text(`${p}LegendKey`, '"✈ hotel/flight detail · • note · dashed outline = PTO request awaiting approval"', { ...fixed(34), Size: 11, Color: K.gray500, Wrap: "true" }),
    ]),
  ]);
}

// ─── SCREEN: ENTRY DETAIL ────────────────────────────────────────────────────

function screenEntryDetail() {
  const p = "edt";
  const rows = `With(
  {
    e: varEntry,
    tj: IfError(ParseJSON(Coalesce(varEntry.TravelJson, "{}")), ParseJSON("{}")),
    isVisit: varEntry.Status.Value = "Site Visit"
  },
  With(
    {
      outA: Trim(Text(tj.flight.departAirport) & " " & Text(tj.flight.departTime)),
      outB: Trim(Text(tj.flight.arriveAirport) & " " & Text(tj.flight.arriveTime)),
      retA: Trim(Text(tj.flight.returnFlight.departAirport) & " " & Text(tj.flight.returnFlight.departTime)),
      retB: Trim(Text(tj.flight.returnFlight.arriveAirport) & " " & Text(tj.flight.returnFlight.arriveTime))
    },
    Filter(
      Table(
        {L: "Visit · Location", V: If(isVisit, e.VisitLocation, "")},
        {L: "Visit · Purpose", V: If(isVisit, e.VisitPurpose, "")},
        {L: "Visit · Mode", V: If(isVisit, Coalesce(e.VisitMode.Value, "Onsite"), "")},
        {L: "Visit · Confirmation", V: If(isVisit, Coalesce(e.VisitConfirmation.Value, "Scheduled"), "")},
        {L: "Visit · Time", V: If(isVisit, e.VisitTime, "")},
        {L: "Notes", V: e.Notes},
        {L: "Hotel", V: Text(tj.hotel.name)},
        {L: "Hotel · Confirmation #", V: Text(tj.hotel.confirmation)},
        {L: "Hotel · Check-in", V: IfError(Text(DateValue(Text(tj.hotel.checkIn)), "ddd, mmm d"), "")},
        {L: "Hotel · Check-out", V: IfError(Text(DateValue(Text(tj.hotel.checkOut)), "ddd, mmm d"), "")},
        {L: "Hotel · Phone", V: Text(tj.hotel.phone)},
        {L: "Hotel · Notes", V: Text(tj.hotel.notes)},
        {L: "Flight · Airline", V: Text(tj.flight.airline)},
        {L: "Flight · Confirmation #", V: Text(tj.flight.confirmation)},
        {L: "Flight · Outbound", V: outA & If(outB = "", "", " → " & outB)},
        {L: "Flight · Return", V: retA & If(retB = "", "", " → " & retB) &
          If(IsBlank(Text(tj.flight.returnFlight.airline)), "", " · " & Text(tj.flight.returnFlight.airline)) &
          If(IsBlank(Text(tj.flight.returnFlight.confirmation)), "", " · " & Text(tj.flight.returnFlight.confirmation))},
        {L: "Flight · Notes", V: Text(tj.flight.notes)},
        {L: "From the spreadsheet", V: If(IsBlank(e.RawText) || e.RawText = e.VisitLocation, "", "“" & e.RawText & "”")},
        {L: "PTO request", V: If(IsBlank(e.RequestId), "", "Approved through PTO request " & e.RequestId)}
      ),
      !IsBlank(V)
    )
  )
)`;
  const sub = `${range("varEntry.StartDate", "varEntry.EndDate")} & " · " &
With({a: varEntry.StartDate, b: Coalesce(varEntry.EndDate, varEntry.StartDate)}, ${weekdays("a", "b")}) & " weekday(s)" &
If(varEntry.DayPart.Value = "AM" || varEntry.DayPart.Value = "PM", " · " & varEntry.DayPart.Value & " only", "")`;

  return root(p, "Where", [
    hbox(`${p}Body`, { ...fill(1, { LayoutMinHeight: 300 }), PaddingTop: 20, PaddingBottom: 20, LayoutJustifyContent: "LayoutJustifyContent.Center", LayoutAlignItems: "LayoutAlignItems.Stretch" }, [
      card(`${p}Card`, { FillPortions: 0, Width: 740, LayoutMinHeight: 300, AlignInContainer: "AlignInContainer.Stretch" }, [
        text(`${p}Name`, `Coalesce(LookUp(colPeople, PersonKey = varEntry.PersonKey, Title), varEntry.PersonName, varEntry.PersonKey)`, { ...fixed(32), Size: 20, FontWeight: "FontWeight.Bold" }),
        hbox(`${p}SubRow`, { ...fixed(30), LayoutGap: 10 }, [
          chip(`${p}Chip`, "varEntry.Status.Value", fixedW(132, 24)),
          text(`${p}Sub`, sub, { ...fill(1, { LayoutMinHeight: 24 }), Height: 24, Color: K.gray600 }),
        ]),
        gallery(`${p}Rows`, "VariableHeight", { ...fill(1), Items: rows, TemplateSize: 30 }, [
          text(`${p}RowLbl`, "ThisItem.L", { X: 0, Y: 4, Width: 210, Height: 22, Size: 12, Color: K.gray600 }),
          text(`${p}RowVal`, "ThisItem.V", { X: 220, Y: 4, Width: "Parent.TemplateWidth - 220", Height: 22, FontWeight: "FontWeight.Semibold", Wrap: "true", AutoHeight: "true" }),
        ]),
        text(`${p}NoTravel`, '"No hotel or flight details recorded for this visit yet."', {
          ...fixed(22), Color: K.gray500, Visible: 'varEntry.Status.Value = "Site Visit" && IsBlank(varEntry.TravelJson)',
        }),
        hbox(`${p}Footer`, { ...fixed(44), LayoutJustifyContent: "LayoutJustifyContent.End" }, [
          button(`${p}Close`, '"Close"', "Back()", { ...fixedW(90, 36), Appearance: "ButtonAppearance.Outline" }),
          button(`${p}Edit`, '"Edit"', "Navigate(scrEntryEdit, ScreenTransition.None, {locShowTravel: false})", {
            ...fixedW(90, 36), Icon: '"Edit"', Visible: canEditEntry("varEntry"),
          }),
        ]),
      ]),
    ]),
  ]);
}

// ─── SCREEN: ENTRY EDITOR ────────────────────────────────────────────────────

const TRAVEL = [
  // [control suffix, label, json path, placeholder, kind]
  ["HotelName", "Hotel name", "hotel.name"],
  ["HotelConf", "Confirmation #", "hotel.confirmation"],
  ["HotelIn", "Check-in", "hotel.checkIn", "", "date"],
  ["HotelOut", "Check-out", "hotel.checkOut", "", "date"],
  ["HotelPhone", "Phone", "hotel.phone"],
  ["HotelNotes", "Hotel notes", "hotel.notes"],
  ["OutAirline", "Airline", "flight.airline"],
  ["OutConf", "Confirmation #", "flight.confirmation"],
  ["OutFrom", "Departs from", "flight.departAirport", "DFW"],
  ["OutDep", "Departure time", "flight.departTime", "Mon 6:15a"],
  ["OutTo", "Arrives at", "flight.arriveAirport", "LIT"],
  ["OutArr", "Arrival time", "flight.arriveTime", "Mon 8:40a"],
  ["RetAirline", "Airline", "flight.returnFlight.airline"],
  ["RetConf", "Confirmation #", "flight.returnFlight.confirmation"],
  ["RetFrom", "Departs from", "flight.returnFlight.departAirport"],
  ["RetDep", "Departure time", "flight.returnFlight.departTime"],
  ["RetTo", "Arrives at", "flight.returnFlight.arriveAirport"],
  ["RetArr", "Arrival time", "flight.returnFlight.arriveTime"],
  ["FlightNotes", "Flight notes", "flight.notes"],
];
const travelValue = pathStr => `Text(ParseJSON(Coalesce(varEntry.TravelJson, "{}")).${pathStr})`;

function screenEntryEdit() {
  const p = "eed";
  const lock = "(!IsBlank(varEntry.RequestId) && !varIsAdmin)";
  const isVisit = `${p}Status.Selected.Label = "Site Visit"`;
  const showTravel = `${isVisit} && If(locShowTravel, IsBlank(varEntry.TravelJson), !IsBlank(varEntry.TravelJson))`;

  const travelInput = ([suffix, lbl, jsonPath, placeholder, kind]) => {
    const ctl = kind === "date"
      ? datePicker(`${p}${suffix}`, { DefaultDate: `IfError(DateValue(${travelValue(jsonPath)}), Blank())`, Placeholder: '"Select a date"' })
      : input(`${p}${suffix}`, { Default: `IfError(${travelValue(jsonPath)}, "")`, ...(placeholder ? { Placeholder: str(placeholder) } : {}) });
    return field(`${p}${suffix}Field`, lbl, ctl);
  };
  const t = Object.fromEntries(TRAVEL.map(x => [x[0], travelInput(x)]));
  const tv = s => `${p}${s}.Text`;
  const td = s => `If(IsBlank(${p}${s}.SelectedDate), "", Text(${p}${s}.SelectedDate, "yyyy-mm-dd"))`;
  const travelJson = `With(
    {tr: {
      hotel: {name: ${tv("HotelName")}, confirmation: ${tv("HotelConf")}, checkIn: ${td("HotelIn")}, checkOut: ${td("HotelOut")}, phone: ${tv("HotelPhone")}, notes: ${tv("HotelNotes")}},
      flight: {airline: ${tv("OutAirline")}, confirmation: ${tv("OutConf")}, departAirport: ${tv("OutFrom")}, departTime: ${tv("OutDep")}, arriveAirport: ${tv("OutTo")}, arriveTime: ${tv("OutArr")}, notes: ${tv("FlightNotes")},
        returnFlight: {airline: ${tv("RetAirline")}, confirmation: ${tv("RetConf")}, departAirport: ${tv("RetFrom")}, departTime: ${tv("RetDep")}, arriveAirport: ${tv("RetTo")}, arriveTime: ${tv("RetArr")}}}
    }},
    If(Len(${[...TRAVEL.filter(x => x[4] !== "date").map(x => tv(x[0])), td("HotelIn"), td("HotelOut")].join(" & ")}) = 0, "", JSON(tr, JSONFormat.Compact))
  )`;
  const save = `With(
  {
    sd: ${p}Start.SelectedDate,
    ed: Coalesce(${p}End.SelectedDate, ${p}Start.SelectedDate),
    who: If(varIsAdmin, ${p}Person.Selected, LookUp(colPeople, PersonKey = Coalesce(varEntry.PersonKey, varMe.PersonKey))),
    st: ${p}Status.Selected.Label
  },
  If(
    IsBlank(sd) || IsBlank(who), Notify("Pick a person and a start date.", NotificationType.Error),
    ed < sd, Notify("End date can't be before the start date.", NotificationType.Error),
    IfError(
      Set(varEntry, Patch('TP Entries', If(IsBlank(varEntry), Defaults('TP Entries'), varEntry), {
        Title: who.Title & " · " & st & If(st = "Site Visit" && !IsBlank(${p}Location.Text), " · " & ${p}Location.Text, ""),
        PersonKey: who.PersonKey,
        PersonName: who.Title,
        OwnerEmail: Lower(who.Person.Email),
        StartDate: sd,
        EndDate: ed,
        StartNum: ${dnum("sd")},
        EndNum: ${dnum("ed")},
        DayPart: {Value: If(sd = ed, ${p}Part.Selected.Value, "Full day")},
        Status: {Value: st},
        Notes: ${p}Notes.Text,
        VisitLocation: ${p}Location.Text,
        VisitPurpose: ${p}Purpose.Text,
        VisitTime: ${p}Time.Text,
        VisitMode: If(st = "Site Visit", {Value: ${p}Mode.Selected.Value}, Blank()),
        VisitConfirmation: If(st = "Site Visit", {Value: ${p}Confirm.Selected.Value}, Blank()),
        TravelJson: ${travelJson}
      }));
      Set(varAnchor, Date(Year(sd), Month(sd), 1));
      Notify("Entry saved", NotificationType.Success);
      Navigate(scrWhereabouts, ScreenTransition.None),
      Notify("Couldn't save: " & FirstError.Message, NotificationType.Error)
    )
  )
)`;
  const remove = `If(Confirm("Delete " & varEntry.PersonName & "'s entry for " & ${range("varEntry.StartDate", "varEntry.EndDate")} & "?"),
  Remove('TP Entries', varEntry);
  Set(varEntry, Blank());
  Navigate(scrWhereabouts, ScreenTransition.None)
)`;
  const viewIfLocked = `If(${lock}, DisplayMode.View, DisplayMode.Edit)`;

  return root(p, "Where", [
    hbox(`${p}Body`, { ...fill(1, { LayoutMinHeight: 300 }), PaddingTop: 16, PaddingBottom: 16, LayoutJustifyContent: "LayoutJustifyContent.Center", LayoutAlignItems: "LayoutAlignItems.Stretch" }, [
      card(`${p}Card`, { FillPortions: 0, Width: 860, LayoutMinHeight: 300, AlignInContainer: "AlignInContainer.Stretch" }, [
        text(`${p}Title`, 'If(IsBlank(varEntry), "New entry", "Edit entry")', { ...fixed(30), Size: 20, FontWeight: "FontWeight.Bold" }),
        text(`${p}Locked`, '"This PTO came from an approved request, so its dates and status are locked. To change them, cancel the request under My PTO and request again."', {
          ...fixed(40), Visible: lock, Fill: K.warningBg, Color: K.warning, Size: 12, Wrap: "true", PaddingLeft: 10, PaddingRight: 10, ...radius(6),
        }),
        vbox(`${p}Form`, { ...fill(1), LayoutOverflowY: "LayoutOverflow.Scroll", LayoutGap: 6, PaddingRight: 8 }, [
          row(`${p}Row1`, [
            vbox(`${p}PersonField`, { ...fill(1, { LayoutMinHeight: 60 }), Height: 62, LayoutGap: 4 }, [
              label(`${p}PersonLbl`, "Person", fixed(18)),
              dropdown(`${p}Person`, "Filter(colPeople, Active = true)", "ThisItem.Title", {
                ...fixed(36), Default: "LookUp(colPeople, PersonKey = Coalesce(varEntry.PersonKey, varMe.PersonKey))", Visible: "varIsAdmin",
                DisplayMode: viewIfLocked, AccessibleLabel: '"Person"',
              }),
              input(`${p}PersonRO`, { ...fixed(36), Default: "Coalesce(varEntry.PersonName, varMe.Title)", DisplayMode: "DisplayMode.View", Visible: "!varIsAdmin" }),
            ]),
          ]),
          row(`${p}Row2`, [
            field(`${p}StartField`, "Start date", datePicker(`${p}Start`, {
              DefaultDate: "If(IsBlank(varEntry), varNewDate, varEntry.StartDate)", DisplayMode: viewIfLocked,
            })),
            field(`${p}EndField`, "End date — same as start for one day", datePicker(`${p}End`, {
              DefaultDate: "If(IsBlank(varEntry), varNewDate, Coalesce(varEntry.EndDate, varEntry.StartDate))", StartDate: `${p}Start.SelectedDate`, DisplayMode: viewIfLocked,
            })),
            field(`${p}PartField`, "Day part — single days only", dropdown(`${p}Part`, "nfDayParts", "ThisItem.Value", {
              Default: '{Value: Coalesce(varEntry.DayPart.Value, "Full day")}',
              DisplayMode: `If(${lock} || ${p}Start.SelectedDate <> Coalesce(${p}End.SelectedDate, ${p}Start.SelectedDate), DisplayMode.View, DisplayMode.Edit)`,
            })),
          ]),
          row(`${p}Row3`, [
            field(`${p}StatusField`, "Status", dropdown(`${p}Status`, "nfStatus", "ThisItem.Label", {
              Default: 'LookUp(nfStatus, Label = Coalesce(varEntry.Status.Value, "Home Office"))', DisplayMode: viewIfLocked,
            })),
          ]),
          row(`${p}VisitRow1`, [
            field(`${p}LocationField`, "Location", input(`${p}Location`, { Default: "varEntry.VisitLocation", Placeholder: '"Little Rock, AR"' })),
            field(`${p}PurposeField`, "Purpose", input(`${p}Purpose`, { Default: "varEntry.VisitPurpose", Placeholder: '"Site visit / transfill"' })),
          ], { Visible: isVisit }),
          row(`${p}VisitRow2`, [
            field(`${p}ModeField`, "Mode — groups the leadership email", dropdown(`${p}Mode`, "nfVisitModes", "ThisItem.Value", {
              Default: '{Value: Coalesce(varEntry.VisitMode.Value, "Onsite")}',
            })),
            field(`${p}ConfirmField`, "Confirmation", dropdown(`${p}Confirm`, "nfConfirmations", "ThisItem.Value", {
              Default: '{Value: Coalesce(varEntry.VisitConfirmation.Value, "Scheduled")}',
            })),
            field(`${p}TimeField`, "Time (optional)", input(`${p}Time`, { Default: "varEntry.VisitTime", Placeholder: '"10:00 AM CT"' })),
          ], { Visible: isVisit }),
          vbox(`${p}NotesField`, { ...fixed(112), LayoutGap: 4 }, [
            label(`${p}NotesLbl`, "Notes — shows on the calendar as a dot", fixed(18)),
            input(`${p}Notes`, { ...fixed(86), Default: "varEntry.Notes", Type: "TextInputType.Multiline", Placeholder: '"Travelling with Aundrea…"' }),
          ]),
          button(`${p}TravelToggle`, `If(${showTravel}, "▾", "▸") & " Hotel & flight details — never shown on the calendar"`, "UpdateContext({locShowTravel: !locShowTravel})", {
            ...fixed(34), Appearance: "ButtonAppearance.Subtle", Align: "Align.Left", Visible: isVisit,
          }),
          vbox(`${p}Travel`, { ...fixed(820), Visible: showTravel, Fill: K.gray50, BorderColor: K.gray200, BorderThickness: 1, ...radius(8), PaddingTop: 12, PaddingLeft: 14, PaddingRight: 14, PaddingBottom: 12, LayoutGap: 4 }, [
            label(`${p}HotelHead`, "HOTEL", fixed(20)),
            row(`${p}TRow1`, [t.HotelName, t.HotelConf]),
            row(`${p}TRow2`, [t.HotelIn, t.HotelOut]),
            row(`${p}TRow3`, [t.HotelPhone, t.HotelNotes]),
            label(`${p}OutHead`, "FLIGHT — OUTBOUND", fixed(20)),
            row(`${p}TRow4`, [t.OutAirline, t.OutConf]),
            row(`${p}TRow5`, [t.OutFrom, t.OutDep]),
            row(`${p}TRow6`, [t.OutTo, t.OutArr]),
            label(`${p}RetHead`, "FLIGHT — RETURN", fixed(20)),
            row(`${p}TRow7`, [t.RetAirline, t.RetConf]),
            row(`${p}TRow8`, [t.RetFrom, t.RetDep]),
            row(`${p}TRow9`, [t.RetTo, t.RetArr]),
            row(`${p}TRow10`, [t.FlightNotes]),
          ]),
        ]),
        hbox(`${p}Footer`, { ...fixed(44) }, [
          button(`${p}Delete`, '"Delete"', remove, {
            ...fixedW(96, 36), Appearance: "ButtonAppearance.Outline", Icon: '"Delete"', BasePaletteColor: K.error,
            Visible: `!IsBlank(varEntry) && ${canEditEntry("varEntry")}`,
          }),
          spacer(`${p}FootSpacer`),
          button(`${p}Cancel`, '"Cancel"', "Back()", { ...fixedW(90, 36), Appearance: "ButtonAppearance.Outline" }),
          button(`${p}Save`, '"Save entry"', save, { ...fixedW(110, 36) }),
        ]),
      ]),
    ]),
  ]);
}

// Every input on the entry editor, for its OnVisible reset.
const ENTRY_INPUTS = ["Person", "PersonRO", "Start", "End", "Part", "Status", "Location", "Purpose", "Mode", "Confirm", "Time", "Notes", ...TRAVEL.map(x => x[0])].map(s => `eed${s}`);

// ─── SCREEN: TASK EDITOR ─────────────────────────────────────────────────────

function screenTaskEdit() {
  const p = "ted";
  const full = `(IsBlank(varTask) || varIsAdmin || (varTask.Origin.Value = "Personal" && Lower(varTask.OwnerEmail) = Lower(User().Email)))`;
  const editIfFull = `If(${full}, DisplayMode.Edit, DisplayMode.View)`;
  const assignees = `ForAll(Sequence(CountRows(Filter(colPeople, Active = true)) + 1) As i,
  If(i.Value = 1, {K: "__team", N: "Team (everyone)"},
    With({r: Index(Filter(colPeople, Active = true), i.Value - 1)}, {K: r.PersonKey, N: r.Title})))`;
  const assigneeKey = `If(IsBlank(varTask), If(varTaskTeam, "__team", varMe.PersonKey), varTask.AssigneeType.Value = "Team", "__team", varTask.AssigneePersonKey)`;
  const months = `ForAll(Sequence(12) As i, {Num: i.Value, Name: Index(nfMonths, i.Value).Value})`;
  const cad = `${p}Cadence.Selected.Label`;
  const save = `With(
  {
    nm: Trim(${p}Name.Text),
    cad: ${cad},
    asg: ${p}Assignee.Selected,
    tags: ${normTags(`${p}Tags.Text`)},
    full: ${full}
  },
  If(
    full && nm = "", Notify("Give the task a name.", NotificationType.Error),
    !full,
      Patch('TP Tasks', varTask, {Tags: tags});
      ClearCollect(colTasks, Filter('TP Tasks', Active = true));
      Back(),
    With(
      {rec: {
        Title: nm,
        CadenceType: {Value: cad},
        CadenceMonths: If(cad = "Specific month" || cad = "Month range", Concat(Sort(${p}Months.SelectedItems, Num), Num, ","), ""),
        CadenceDate: If(cad = "One-off date", ${p}Date.SelectedDate, Blank()),
        AssigneeType: {Value: If(asg.K = "__team", "Team", "Specialist")},
        AssigneePersonKey: If(asg.K = "__team", "", asg.K),
        AssigneeName: If(asg.K = "__team", "Team", asg.N),
        Scope: ${p}Scope.Text,
        Comments: ${p}Comments.Text,
        Tags: tags
      }},
      If(IsBlank(varTask),
        Patch('TP Tasks', Defaults('TP Tasks'), rec, {
          TaskKey: Text(GUID()),
          SeriesKey: Concat(MatchAll(Lower(nm), "[a-z0-9]+"), FullMatch, "-"),
          Origin: {Value: If(varTaskTeam && varIsAdmin, "Assigned", "Personal")},
          OwnerEmail: If(varTaskTeam && varIsAdmin, "", Lower(User().Email)),
          Active: true
        }),
        Patch('TP Tasks', varTask, rec, {
          CadenceLabel: If(varTask.CadenceType.Value = cad && Coalesce(varTask.CadenceMonths, "") = rec.CadenceMonths, varTask.CadenceLabel, "")
        })
      );
      ClearCollect(colTasks, Filter('TP Tasks', Active = true));
      Back()
    )
  )
)`;
  const remove = `If(Confirm("Delete """ & varTask.Title & """? This removes it from everyone's task list."),
  Remove('TP Tasks', varTask);
  ClearCollect(colTasks, Filter('TP Tasks', Active = true));
  Back()
)`;

  return root(p, "Tasks", [
    hbox(`${p}Body`, { ...fill(1, { LayoutMinHeight: 300 }), PaddingTop: 16, PaddingBottom: 16, LayoutJustifyContent: "LayoutJustifyContent.Center", LayoutAlignItems: "LayoutAlignItems.Stretch" }, [
      card(`${p}Card`, { FillPortions: 0, Width: 760, LayoutMinHeight: 300, AlignInContainer: "AlignInContainer.Stretch" }, [
        text(`${p}Title`, `If(IsBlank(varTask), "Add a task", ${full}, "Edit task", varTask.Title)`, { ...fixed(30), Size: 20, FontWeight: "FontWeight.Bold" }),
        text(`${p}Hint`, `If(!${full}, "Assigned by an admin. You can change its tags — everything else is theirs to edit.", IsBlank(varTask) && !(varTaskTeam && varIsAdmin), "This task will be yours — you can edit or delete it at any time.", "")`, {
          ...fixed(22), Size: 12, Color: K.gray600,
        }),
        vbox(`${p}Form`, { ...fill(1), LayoutOverflowY: "LayoutOverflow.Scroll", LayoutGap: 6 }, [
          row(`${p}Row1`, [field(`${p}NameField`, "Task name", input(`${p}Name`, { Default: "varTask.Title", Placeholder: '"Pull vent binder samples before Kokomo"', DisplayMode: editIfFull }))]),
          row(`${p}Row2`, [
            field(`${p}CadenceField`, "Cadence", dropdown(`${p}Cadence`, "nfCadences", "ThisItem.Label", {
              Default: 'LookUp(nfCadences, Label = Coalesce(varTask.CadenceType.Value, "One-off date"))', DisplayMode: editIfFull,
            })),
            field(`${p}AssigneeField`, "Assigned to — admins only", dropdown(`${p}Assignee`, assignees, "ThisItem.N", {
              Default: `LookUp(${assignees}, K = ${assigneeKey})`,
              DisplayMode: `If(varIsAdmin && ${full}, DisplayMode.Edit, DisplayMode.View)`,
            })),
          ]),
          row(`${p}Row3`, [field(`${p}DateField`, "Date", datePicker(`${p}Date`, { DefaultDate: "Coalesce(varTask.CadenceDate, Today())", DisplayMode: editIfFull }))], {
            Visible: `${cad} = "One-off date"`,
          }),
          row(`${p}Row4`, [field(`${p}MonthsField`, "Which months", node(TYPES.combo, `${p}Months`, {
            Items: months, ItemDisplayText: "ThisItem.Name", SelectMultiple: "true", IsSearchable: "false", Appearance: "Appearance.Outline",
            DefaultSelectedItems: `Filter(${months}, ${monthHas("varTask.CadenceMonths", "Num")})`,
            InputTextPlaceholder: '"Pick months"', DisplayMode: editIfFull,
          }))], { Visible: `${cad} = "Specific month" || ${cad} = "Month range"` }),
          row(`${p}Row5`, [
            field(`${p}ScopeField`, "Applies to", input(`${p}Scope`, { Default: "varTask.Scope", Placeholder: '"All Regions"', DisplayMode: editIfFull })),
            field(`${p}TagsField`, "Tags — comma-separated", input(`${p}Tags`, { Default: "varTask.Tags", Placeholder: '"flu, email"' })),
          ]),
          vbox(`${p}CommentsField`, { ...fixed(112), LayoutGap: 4 }, [
            label(`${p}CommentsLbl`, "Comments", fixed(18)),
            input(`${p}Comments`, { ...fixed(86), Default: "varTask.Comments", Type: "TextInputType.Multiline", DisplayMode: editIfFull }),
          ]),
        ]),
        hbox(`${p}Footer`, { ...fixed(44) }, [
          button(`${p}Delete`, '"Delete"', remove, {
            ...fixedW(96, 36), Appearance: "ButtonAppearance.Outline", Icon: '"Delete"', BasePaletteColor: K.error,
            Visible: `!IsBlank(varTask) && ${full}`,
          }),
          spacer(`${p}FootSpacer`),
          button(`${p}Cancel`, '"Cancel"', "Back()", { ...fixedW(90, 36), Appearance: "ButtonAppearance.Outline" }),
          button(`${p}Save`, `If(${full}, "Save task", "Save tags")`, save, { ...fixedW(110, 36) }),
        ]),
      ]),
    ]),
  ]);
}

const TASK_INPUTS = ["Name", "Cadence", "Assignee", "Date", "Months", "Scope", "Tags", "Comments"].map(s => `ted${s}`);

// ─── SCREEN: MY TASKS ────────────────────────────────────────────────────────
// buildTaskSeries() / seriesBucket() / periodKeyFor() from teamPlannerData.js:
// a duty's recurring rule and its dated rotation rows collapse into one row,
// filed under when it is next due.

function screenMyTasks() {
  const p = "myt";
  const pk = `If(varIsAdmin, Coalesce(${p}Person.Selected.PersonKey, varMe.PersonKey), varMe.PersonKey)`;
  const tagItems = `With({tags: ${allTags}}, ${withAll("tags", '{V: "", N: "All tags"}', '{V: r.Value, N: "#" & r.Value}')})`;
  const sections = `With(
  {
    pk: ${pk},
    tg: ${p}Tag.Selected.V,
    td: Today(),
    ws: ${weekStart("Today()")}
  },
  With(
    {
      wk: Text(Year(DateAdd(td, 4 - Weekday(td, StartOfWeek.Monday), TimeUnit.Days))) & "-W" & Text(ISOWeekNum(td), "00"),
      qk: Text(Year(td)) & "-Q" & RoundUp(Month(td) / 3, 0),
      mk: Text(td, "yyyy-mm"),
      groups: GroupBy(
        AddColumns(
          Filter(colTasks, AssigneePersonKey = pk || AssigneeType.Value = "Team"),
          GKey, SeriesKey & If(AssigneeType.Value = "Team", "::team", "::mine")
        ),
        GKey, Rows
      )
    },
    With(
      {
        series: ForAll(groups As g,
          With(
            {
              occ: Sort(Filter(g.Rows, CadenceType.Value = "One-off date"), CadenceDate),
              rule: First(Sort(Filter(g.Rows, CadenceType.Value <> "One-off date"), If(CadenceType.Value = "Standing duty", 1, 0)))
            },
            With(
              {
                head: If(IsBlank(rule), First(occ), rule),
                nxt: First(Filter(occ, CadenceDate >= td)),
                up: FirstN(Filter(occ, CadenceDate >= td), 3),
                inM: ${monthHas("rule.CadenceMonths", "Month(td)")}
              },
              With(
                {
                  tgt: If(!IsBlank(nxt), nxt, !IsBlank(rule), rule, head),
                  ruleBucket: If(IsBlank(rule), Blank(),
                    Switch(rule.CadenceType.Value,
                      "Weekly", "week", "Monthly", "month", "Quarterly", "month",
                      "Specific month", If(inM, "month", Blank()),
                      "Month range", If(inM, "month", Blank()),
                      Blank()))
                },
                With(
                  {
                    period: Switch(tgt.CadenceType.Value,
                      "One-off date", Text(Coalesce(tgt.CadenceDate, td), "yyyy-mm-dd"),
                      "Weekly", wk, "Quarterly", qk,
                      "Monthly", mk, "Specific month", mk, "Month range", mk,
                      Blank())
                  },
                  {
                    Key: g.GKey,
                    IsTeam: head.AssigneeType.Value = "Team",
                    Name: head.Title,
                    HeadId: head.ID,
                    Bucket: If(
                      head.CadenceType.Value = "Standing duty" && CountRows(occ) = 0, "standing",
                      !IsBlank(nxt), If(
                        nxt.CadenceDate = td, "today",
                        nxt.CadenceDate >= ws && nxt.CadenceDate <= DateAdd(ws, 6, TimeUnit.Days), "week",
                        Year(nxt.CadenceDate) = Year(td) && Month(nxt.CadenceDate) = Month(td), "month",
                        "later"),
                      !IsBlank(ruleBucket), ruleBucket,
                      CountRows(occ) > 0, "overdue",
                      "later"),
                    Info: Concat(
                      Filter(
                        Table(
                          {T: If(CountRows(up) = 0, "", "Your turn: " & Text(First(up).CadenceDate, "ddd, mmm d") &
                            If(CountRows(up) > 1, " · then " & Concat(LastN(up, CountRows(up) - 1), Text(CadenceDate, "mmm d"), ", "), ""))},
                          {T: head.Comments},
                          {T: head.Scope}
                        ),
                        !IsBlank(T)
                      ),
                      T, " · "),
                    Cadence: If(CountRows(occ) > 1 && !IsBlank(rule),
                      ${cadenceLabel("rule.")} & " · " & CountRows(occ) & "×",
                      ${cadenceLabel("head.")}),
                    Completable: !IsBlank(period) && tgt.CadenceType.Value <> "Standing duty",
                    DoneTitle: tgt.TaskKey & "_" & period,
                    Done: LookUp(colDone, Title = tgt.TaskKey & "_" & period),
                    TgtKey: tgt.TaskKey,
                    TgtSeries: tgt.SeriesKey,
                    TgtName: tgt.Title,
                    Period: period,
                    Tags: Concat(Distinct(Filter(ForAll(Split(Concat(g.Rows, Tags, ","), ",") As st, Trim(st.Value)), Value <> ""), Value), Value, ", "),
                    Editable: varIsAdmin || (head.Origin.Value = "Personal" && Lower(head.OwnerEmail) = Lower(User().Email))
                  }
                )
              )
            )
          )
        )
      },
      With(
        {vis: Sort(Filter(series, IsBlank(tg) || ${tagsHave("Tags", "tg")}), Name)},
        Filter(
          Table(
            {Label: "DUE TODAY", Hint: "", Rows: Filter(vis, !IsTeam && Bucket = "today")},
            {Label: "DUE THIS WEEK", Hint: "", Rows: Filter(vis, !IsTeam && Bucket = "week")},
            {Label: "DUE THIS MONTH", Hint: "", Rows: Filter(vis, !IsTeam && Bucket = "month")},
            {Label: "PAST DUE", Hint: "", Rows: Filter(vis, !IsTeam && Bucket = "overdue")},
            {Label: "LATER THIS YEAR", Hint: "", Rows: Filter(vis, !IsTeam && Bucket = "later")},
            {Label: "TEAM TASKS", Hint: "— assigned to everyone, not to you specifically", Rows: Filter(vis, IsTeam)},
            {Label: "STANDING DUTIES", Hint: "— ongoing ownership, nothing to check off", Rows: Filter(vis, !IsTeam && Bucket = "standing")}
          ),
          CountRows(Rows) > 0
        )
      )
    )
  )
)`;
  const toggle = `If(!IsBlank(ThisItem.Done),
  IfError(Remove('TP Task Done', LookUp('TP Task Done', Title = ThisItem.DoneTitle)), true);
  RemoveIf(colDone, Title = ThisItem.DoneTitle),
  Collect(colDone, Patch('TP Task Done', Defaults('TP Task Done'), {
    Title: ThisItem.DoneTitle,
    TaskKey: ThisItem.TgtKey,
    SeriesKey: ThisItem.TgtSeries,
    TaskName: ThisItem.TgtName,
    PeriodKey: ThisItem.Period,
    PersonKey: ${pk},
    DoneBy: User().FullName,
    DoneByEmail: Lower(User().Email),
    DoneAt: Text(Now(), DateTimeFormat.UTC)
  }))
)`;
  const doneLine = `If(IsBlank(ThisItem.Done), "", "✓ Done · " & ThisItem.Done.DoneBy & IfError(", " & Text(DateValue(Left(ThisItem.Done.DoneAt, 10)), "mmm d"), "") & "    ") &
If(ThisItem.Tags = "", "", "#" & Substitute(ThisItem.Tags, ", ", "  #"))`;

  return root(p, "MyTasks", [
    toolbar(`${p}Toolbar`, [
      dropdown(`${p}Person`, "Filter(colPeople, Active = true)", "ThisItem.Title", {
        ...fixedW(200, 34), Default: "LookUp(colPeople, PersonKey = varMe.PersonKey)", Visible: "varIsAdmin", AccessibleLabel: '"Whose tasks"',
      }),
      dropdown(`${p}Tag`, tagItems, "ThisItem.N", { ...fixedW(180, 34), Default: '{V: "", N: "All tags"}', AccessibleLabel: '"Filter by tag"' }),
      spacer(`${p}ToolSpacer`),
      button(`${p}Add`, '"Add a task"', "Set(varTask, Blank()); Set(varTaskTeam, false); Navigate(scrTaskEdit, ScreenTransition.None)", {
        ...fixedW(120, 34), Icon: '"Add"', Visible: "!IsBlank(varMe)",
      }),
    ]),
    content(`${p}Body`, [
      text(`${p}Unlinked`, `"Your sign-in isn't linked to a roster person yet, so there's no task list to show. An admin can link it on the Roster screen."`, {
        ...fixed(40), Visible: "IsBlank(varMe) && !varIsAdmin", Fill: K.warningBg, Color: K.warning, Size: 12, Wrap: "true", PaddingLeft: 12, ...radius(6),
      }),
      gallery(`${p}Sections`, "VariableHeight", { ...fill(1), Items: sections, TemplateSize: 40 }, [
        text(`${p}SecLabel`, 'ThisItem.Label & If(ThisItem.Hint = "", "", "   " & ThisItem.Hint)', {
          X: 0, Y: 10, Width: "Parent.TemplateWidth", Height: 22, Size: 11, FontWeight: "FontWeight.Bold", Color: K.gray600,
        }),
        gallery(`${p}Rows`, "Vertical", {
          X: 0, Y: 36, Width: "Parent.TemplateWidth", Height: "CountRows(ThisItem.Rows) * 70",
          Items: "ThisItem.Rows", TemplateSize: 70, ShowScrollbar: "false",
        }, [
          rect(`${p}RowBg`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: 64, Fill: `If(IsBlank(ThisItem.Done), ${K.white}, ${K.gray50})`, BorderColor: K.gray200, BorderThickness: 1 }),
          text(`${p}Tick`, 'If(IsBlank(ThisItem.Done), "☐", "☑")', {
            X: 8, Y: 14, Width: 30, Height: 30, Size: 20, Color: K.blue600, Align: "Align.Center",
            Visible: "ThisItem.Completable", OnSelect: toggle,
          }),
          text(`${p}Name`, "ThisItem.Name", {
            X: 44, Y: 7, Width: "Parent.TemplateWidth - 400", Height: 22, FontWeight: "FontWeight.Semibold",
            Strikethrough: "!IsBlank(ThisItem.Done)", Color: `If(IsBlank(ThisItem.Done), ${K.ink}, ${K.gray500})`,
          }),
          text(`${p}Info`, "ThisItem.Info", { X: 44, Y: 28, Width: "Parent.TemplateWidth - 400", Height: 18, Size: 11, Color: K.gray600 }),
          text(`${p}Meta`, doneLine, {
            X: 44, Y: 46, Width: "Parent.TemplateWidth - 400", Height: 18, Size: 11,
            Color: `If(IsBlank(ThisItem.Done), ${K.gray500}, ${K.success})`,
          }),
          text(`${p}Team`, '"Team"', {
            X: "Parent.TemplateWidth - 344", Y: 24, Width: 56, Height: 22, Size: 10, FontWeight: "FontWeight.Bold", Align: "Align.Center",
            Fill: K.successBg, Color: K.success, BorderColor: K.successBorder, BorderThickness: 1, ...radius(10), Visible: "ThisItem.IsTeam",
          }),
          text(`${p}Cadence`, "ThisItem.Cadence", {
            X: "Parent.TemplateWidth - 280", Y: 24, Width: 190, Height: 22, Size: 10, FontWeight: "FontWeight.Bold", Align: "Align.Center",
            Fill: K.gray100, Color: K.gray700, BorderColor: K.gray300, BorderThickness: 1, ...radius(10),
          }),
          button(`${p}Edit`, 'If(ThisItem.Editable, "Edit", "Tags")', "Set(varTask, LookUp(colTasks, ID = ThisItem.HeadId)); Set(varTaskTeam, false); Navigate(scrTaskEdit, ScreenTransition.None)", {
            X: "Parent.TemplateWidth - 82", Y: 19, Width: 74, Height: 32, Appearance: "ButtonAppearance.Subtle",
          }),
        ]),
      ]),
      text(`${p}Empty`, `If(IsBlank(${p}Tag.Selected.V), "No tasks assigned to " & Coalesce(${p}Person.Selected.Title, varMe.Title, "you") & " yet.", "Nothing tagged #" & ${p}Tag.Selected.V & ".")`, {
        ...fixed(24), Color: K.gray500, Visible: `!IsBlank(varMe) && CountRows(${p}Sections.AllItems) = 0`,
      }),
    ]),
  ]);
}

// ─── SCREEN: TASK CALENDAR ───────────────────────────────────────────────────

function screenTaskCalendar() {
  const p = "tcl";
  // Two fixed options ahead of the people, so this one is spelled out rather than using withAll.
  const peopleItems = `ForAll(Sequence(CountRows(colPeople) + 2) As i,
  If(i.Value = 1, {K: "", N: "All specialists"}, i.Value = 2, {K: "__team", N: "Team-wide only"},
    With({r: Index(colPeople, i.Value - 2)}, {K: r.PersonKey, N: r.Title})))`;
  const cadences = withAll("nfCadences", '{V: "", N: "All cadences"}', "{V: r.Label, N: r.Label}");
  const tagItems = `With({tags: ${allTags}}, ${withAll("tags", '{V: "", N: "All tags"}', '{V: r.Value, N: "#" & r.Value}')})`;
  const filtered = `With({q: Lower(Trim(${p}Search.Text)), who: ${p}Person.Selected.K, cad: ${p}Cadence.Selected.V, tg: ${p}Tag.Selected.V},
  SortByColumns(
    Filter(
      AddColumns(colTasks, Rank, LookUp(nfCadences, Label = CadenceType.Value, Rank)),
      (IsBlank(who) || (who = "__team" && AssigneeType.Value = "Team") || AssigneePersonKey = who) &&
      (IsBlank(cad) || CadenceType.Value = cad) &&
      (IsBlank(tg) || ${tagsHave("Tags", "tg")}) &&
      (IsBlank(q) || q in Lower(Title & " " & Comments & " " & Scope & " " & Tags))
    ),
    Rank, SortOrder.Ascending, CadenceDate, SortOrder.Ascending, Title, SortOrder.Ascending
  )
)`;
  const COLS = [["Task", 24], ["Cadence", 11], ["Specialist", 12], ["Applies to", 12], ["Tags", 12], ["Comments", 21], ["", 8]];
  const at = i => COLS.slice(0, i).reduce((a, [, w]) => a + w, 0);
  const colX = i => `Parent.TemplateWidth * ${at(i) / 100} + 10`;
  const colW = i => `Parent.TemplateWidth * ${COLS[i][1] / 100} - 14`;
  const months = `With({ft: ${filtered}},
  ForAll(Sequence(12) As m,
    {
      M: m.Value,
      Name: Index(nfMonths, m.Value).Value,
      Tasks: Filter(ft,
        (CadenceType.Value = "One-off date" && !IsBlank(CadenceDate) && Month(CadenceDate) = m.Value) ||
        (CadenceType.Value <> "One-off date" && ${monthHas("CadenceMonths", "m.Value")}))
    }
  )
)`;
  const isList = 'Coalesce(locLayout, "list") = "list"';

  return root(p, "Tasks", [
    toolbar(`${p}Toolbar`, [
      dropdown(`${p}Person`, peopleItems, "ThisItem.N", { ...fixedW(180, 34), Default: '{K: "", N: "All specialists"}', AccessibleLabel: '"Filter by specialist"' }),
      dropdown(`${p}Cadence`, cadences, "ThisItem.N", { ...fixedW(160, 34), Default: '{V: "", N: "All cadences"}', AccessibleLabel: '"Filter by cadence"' }),
      dropdown(`${p}Tag`, tagItems, "ThisItem.N", { ...fixedW(150, 34), Default: '{V: "", N: "All tags"}', AccessibleLabel: '"Filter by tag"' }),
      input(`${p}Search`, { ...fixedW(200, 34), Placeholder: '"Search tasks…"', Type: "TextInputType.Search", AccessibleLabel: '"Search tasks"' }),
      button(`${p}New`, '"New task"', "Set(varTask, Blank()); Set(varTaskTeam, true); Navigate(scrTaskEdit, ScreenTransition.None)", { ...fixedW(110, 34), Icon: '"Add"', Visible: "varIsAdmin" }),
      spacer(`${p}ToolSpacer`),
      button(`${p}ListBtn`, '"List"', 'UpdateContext({locLayout: "list"})', { ...fixedW(72, 34), Appearance: `If(${isList}, ButtonAppearance.Primary, ButtonAppearance.Outline)` }),
      button(`${p}MonthBtn`, '"By month"', 'UpdateContext({locLayout: "months"})', { ...fixedW(96, 34), Appearance: `If(${isList}, ButtonAppearance.Outline, ButtonAppearance.Primary)` }),
    ]),
    content(`${p}Body`, [
      text(`${p}Count`, `With({ft: ${filtered}}, CountRows(ft) & " tasks · " & CountRows(Filter(ft, CadenceType.Value <> "Standing duty")) & " scheduled, " & CountRows(Filter(ft, CadenceType.Value = "Standing duty")) & " standing duties")`, {
        ...fixed(20), Size: 12, Color: K.gray500,
      }),
      vbox(`${p}ListCard`, { ...fill(1), Visible: isList, Fill: K.white, BorderColor: K.gray200, BorderThickness: 1, ...radius(12), LayoutGap: 0 }, [
        hbox(`${p}ListHead`, { ...fixed(36), Fill: K.gray50, LayoutGap: 0, PaddingLeft: 10 },
          COLS.map(([h, w], i) => text(`${p}Head${i}`, str(h.toUpperCase()), { ...fill(w, { LayoutMinHeight: 30 }), Height: 30, Size: 10, FontWeight: "FontWeight.Bold", Color: K.gray600 }))),
        gallery(`${p}List`, "Vertical", { ...fill(1), Items: filtered, TemplateSize: 50 }, [
          rect(`${p}ListLine`, { X: 0, Y: "Parent.TemplateHeight - 1", Width: "Parent.TemplateWidth", Height: 1, Fill: K.gray100 }),
          text(`${p}CTask`, "ThisItem.Title", { X: colX(0), Y: 4, Width: colW(0), Height: 42, FontWeight: "FontWeight.Semibold", Wrap: "true", VerticalAlign: "VerticalAlign.Middle" }),
          text(`${p}CCad`, cadenceLabel("ThisItem."), { X: colX(1), Y: 4, Width: colW(1), Height: 42, Size: 12, Color: K.gray700, VerticalAlign: "VerticalAlign.Middle" }),
          text(`${p}CWho`, `If(ThisItem.AssigneeType.Value = "Team", "Team", Coalesce(ThisItem.AssigneeName, "Unassigned"))`, {
            X: colX(2), Y: 4, Width: colW(2), Height: 42, Size: 12, VerticalAlign: "VerticalAlign.Middle",
            Color: `If(ThisItem.AssigneeType.Value = "Team", ${K.blue600}, ${K.ink})`,
            FontWeight: `If(ThisItem.AssigneeType.Value = "Team", FontWeight.Semibold, FontWeight.Normal)`,
          }),
          text(`${p}CScope`, 'Coalesce(ThisItem.Scope, "—")', { X: colX(3), Y: 4, Width: colW(3), Height: 42, Size: 12, Color: K.gray600, Wrap: "true", VerticalAlign: "VerticalAlign.Middle" }),
          text(`${p}CTags`, 'If(IsBlank(ThisItem.Tags), "", "#" & Substitute(ThisItem.Tags, ", ", "  #"))', { X: colX(4), Y: 4, Width: colW(4), Height: 42, Size: 11, Color: K.gray600, Wrap: "true", VerticalAlign: "VerticalAlign.Middle" }),
          text(`${p}CNote`, "ThisItem.Comments", { X: colX(5), Y: 4, Width: colW(5), Height: 42, Size: 12, Color: K.gray600, Wrap: "true", VerticalAlign: "VerticalAlign.Middle" }),
          button(`${p}CEdit`, '"Edit"', "Set(varTask, LookUp(colTasks, ID = ThisItem.ID)); Set(varTaskTeam, false); Navigate(scrTaskEdit, ScreenTransition.None)", {
            X: colX(6), Y: 9, Width: 64, Height: 32, Appearance: "ButtonAppearance.Subtle", Visible: "varIsAdmin",
          }),
        ]),
        text(`${p}ListEmpty`, '"No tasks match these filters."', { ...fixed(30), Color: K.gray500, PaddingLeft: 14, Visible: `CountRows(${p}List.AllItems) = 0` }),
      ]),
      gallery(`${p}Months`, "Vertical", { ...fill(1), Visible: `!(${isList})`, Items: months, WrapCount: 3, TemplateSize: 210, TemplatePadding: 6 }, [
        rect(`${p}MonBg`, {
          X: 0, Y: 0, Width: "Parent.TemplateWidth", Height: "Parent.TemplateHeight", Fill: K.white, BorderThickness: 1, BorderColor: K.gray200,
        }),
        rect(`${p}MonAccent`, {
          X: 0, Y: 0, Width: "Parent.TemplateWidth", Height: 4,
          Fill: `Switch(RoundUp(ThisItem.M / 3, 0), 1, ${K.blue600}, 2, ${K.teal}, 3, ${K.warning}, ${K.success})`,
        }),
        text(`${p}MonName`, "ThisItem.Name", { X: 14, Y: 10, Width: "Parent.TemplateWidth - 120", Height: 22, Size: 14, FontWeight: "FontWeight.Bold" }),
        text(`${p}MonCount`, '"Q" & RoundUp(ThisItem.M / 3, 0) & " · " & CountRows(ThisItem.Tasks)', { X: "Parent.TemplateWidth - 110", Y: 10, Width: 96, Height: 22, Size: 11, Color: K.gray500, Align: "Align.Right" }),
        gallery(`${p}MonTasks`, "Vertical", { X: 14, Y: 36, Width: "Parent.TemplateWidth - 28", Height: "Parent.TemplateHeight - 44", Items: "ThisItem.Tasks", TemplateSize: 22 }, [
          text(`${p}MonTask`, "ThisItem.Title", { X: 0, Y: 1, Width: "Parent.TemplateWidth - 90", Height: 20, Size: 12, FontWeight: "FontWeight.Semibold" }),
          text(`${p}MonWho`, `If(ThisItem.AssigneeType.Value = "Team", "Team", First(Split(Coalesce(ThisItem.AssigneeName, " "), " ")).Value)`, {
            X: "Parent.TemplateWidth - 86", Y: 1, Width: 84, Height: 20, Size: 11, Color: K.gray500, Align: "Align.Right",
          }),
        ]),
        text(`${p}MonEmpty`, '"Nothing scheduled"', { X: 14, Y: 38, Width: 200, Height: 20, Size: 12, Color: K.gray400, Visible: "CountRows(ThisItem.Tasks) = 0" }),
      ]),
    ]),
  ]);
}

// ─── SCREEN: PRINT SUMMARY ───────────────────────────────────────────────────
// One HtmlViewer holding the grids and the rollup. A people × weekdays grid
// would need galleries nested two deep, which canvas apps don't allow; HTML
// also survives the trip through the printer far better.

function screenPrint() {
  const p = "prn";
  const notPrinting = "!scrPrint.Printing";
  const quarterOf = "Date(Year(varAnchor), (RoundUp(Month(varAnchor) / 3, 0) - 1) * 3 + 1, 1)";
  const step = 'If(locMode = "quarter", 3, 1)';
  const html = `With(
  {
    quarter: locMode = "quarter",
    q0: ${quarterOf},
    ppl: If(CountRows(Filter(colPeople, Active = true)) > 0, Filter(colPeople, Active = true), colPeople)
  },
  With(
    {
      ps: If(quarter, q0, varAnchor),
      pe: DateAdd(DateAdd(If(quarter, q0, varAnchor), If(quarter, 3, 1), TimeUnit.Months), -1, TimeUnit.Days)
    },
    With(
      {
        ents: ForAll(Filter('TP Entries', StartNum <= ${dnum("pe")} && EndNum >= ${dnum("ps")}) As x,
          {PersonKey: x.PersonKey, Status: x.Status.Value, Location: x.VisitLocation, RawText: x.RawText,
           S: x.StartDate, E: Coalesce(x.EndDate, x.StartDate), SN: x.StartNum, EN: x.EndNum,
           Half: x.DayPart.Value = "AM" || x.DayPart.Value = "PM"}),
        months: If(quarter, ForAll(Sequence(3) As i, {M: DateAdd(q0, i.Value - 1, TimeUnit.Months)}), Table({M: varAnchor})),
        td: "border:1px solid #e1e6ec;padding:2px 1px;text-align:center;white-space:nowrap;overflow:hidden;font-size:" & If(quarter, "8", "9") & "px;",
        th: "border:1px solid #c5ccd5;padding:2px 1px;background:#f6f8fa;color:#424b56;font-size:8px;"
      },
      "<div style='font-family:Segoe UI,Arial,sans-serif;color:#131922'>" &
      "<div style='font-size:18px;font-weight:800'>Rotech Accreditation Team — " &
        If(quarter, "Q" & RoundUp(Month(q0) / 3, 0) & " " & Year(q0), Text(varAnchor, "mmmm yyyy")) & "</div>" &
      "<div style='font-size:12px;color:#5d6773;margin-bottom:10px'>Team whereabouts summary · printed " & Text(Today(), "mmmm d, yyyy") & "</div>" &
      Concat(months As mo,
        With(
          {days: Filter(ForAll(Sequence(Day(${eom("mo.M")})) As k, DateAdd(mo.M, k.Value - 1, TimeUnit.Days)), Weekday(Value, StartOfWeek.Monday) <= 5)},
          If(quarter, "<div style='font-size:13px;font-weight:700;margin:8px 0 4px'>" & Text(mo.M, "mmmm yyyy") & "</div>", "") &
          "<table style='border-collapse:collapse;width:100%;table-layout:fixed'><tr><th style='" & th & "width:92px;text-align:left'>Specialist</th>" &
          Concat(days As d, "<th style='" & th & "'>" & Left(Text(d.Value, "ddd"), 1) & "<br>" & Day(d.Value) & "</th>") & "</tr>" &
          Concat(ppl As pp,
            "<tr><td style='" & td & "text-align:left;font-weight:700;font-size:10px'>" & pp.Title & "</td>" &
            Concat(days As d,
              With({n: ${dnum("d.Value")}},
                With({e: LookUp(ents, PersonKey = pp.PersonKey && SN <= n && EN >= n)},
                  With({c: LookUp(nfStatus, Label = e.Status)},
                    "<td style='" & td &
                    If(IsBlank(e), "color:#9ba5b2'>",
                      "background:" & c.BgHex & ";color:" & c.FgHex & ";font-weight:600'>" &
                      If(e.Status = "Site Visit" && !IsBlank(e.Location),
                        Coalesce(Match(e.Location, ",\\s*(?<st>[A-Z]{2})\\s*$").st, Left(e.Location, 4)),
                        c.Short) &
                      If(e.Half, "½", "")) &
                    "</td>"
                  )
                )
              )
            ) & "</tr>"
          ) & "</table>"
        )
      ) &
      "<div style='font-size:14px;font-weight:700;margin:14px 0 4px'>" & If(quarter, "Quarter rollup", "Month rollup") & "</div>" &
      "<table style='border-collapse:collapse;width:100%'><tr>" &
      "<th style='" & th & "text-align:left;font-size:10px;width:130px'>Specialist</th>" &
      "<th style='" & th & "font-size:10px;width:90px'>PTO / FH days</th>" &
      "<th style='" & th & "font-size:10px;width:90px'>Site visit days</th>" &
      "<th style='" & th & "font-size:10px;width:80px'>Travel days</th>" &
      "<th style='" & th & "font-size:10px;text-align:left'>Site visits</th></tr>" &
      Concat(ppl As pp,
        With({mine: Filter(ents, PersonKey = pp.PersonKey)},
          With(
            {cnt: AddColumns(mine, Wd,
              With({a: If(S < ps, ps, S), b: If(E > pe, pe, E)}, ${weekdays("a", "b")}) * If(Half, 0.5, 1))},
            With(
              {
                pto: Sum(Filter(cnt, Status = "PTO" || Status = "Flex Holiday"), Wd),
                vis: Sum(Filter(cnt, Status = "Site Visit"), Wd),
                trv: Sum(Filter(cnt, Status = "Travel"), Wd)
              },
              "<tr><td style='" & td & "text-align:left;font-weight:700;font-size:11px'>" & pp.Title & "</td>" &
              "<td style='" & td & "font-size:11px'>" & If(pto = 0, "—", Text(pto)) & "</td>" &
              "<td style='" & td & "font-size:11px'>" & If(vis = 0, "—", Text(vis)) & "</td>" &
              "<td style='" & td & "font-size:11px'>" & If(trv = 0, "—", Text(trv)) & "</td>" &
              "<td style='" & td & "text-align:left;font-size:10px;white-space:normal'>" &
                If(CountRows(Filter(mine, Status = "Site Visit")) = 0, "—",
                  Concat(Sort(Filter(mine, Status = "Site Visit"), SN) As tr,
                    Coalesce(tr.Location, tr.RawText, "Site visit") & " (" & ${range("tr.S", "tr.E")} & ")", " · ")) &
              "</td></tr>"
            )
          )
        )
      ) &
      "</table></div>"
    )
  )
)`;

  return root(p, "Print", [
    toolbar(`${p}Toolbar`, [
      button(`${p}Prev`, '""', `Set(varAnchor, DateAdd(If(locMode = "quarter", ${quarterOf}, varAnchor), -${step}, TimeUnit.Months))`, {
        ...fixedW(36, 34), Appearance: "ButtonAppearance.Outline", Icon: '"ChevronLeft"', Layout: "ButtonLayout.IconOnly", AccessibleLabel: '"Previous"',
      }),
      text(`${p}Period`, `If(locMode = "quarter", "Q" & RoundUp(Month(varAnchor) / 3, 0) & " " & Year(varAnchor), Text(varAnchor, "mmmm yyyy"))`, {
        ...fixedW(170, 34), Size: 16, FontWeight: "FontWeight.Bold", Align: "Align.Center",
      }),
      button(`${p}Next`, '""', `Set(varAnchor, DateAdd(If(locMode = "quarter", ${quarterOf}, varAnchor), ${step}, TimeUnit.Months))`, {
        ...fixedW(36, 34), Appearance: "ButtonAppearance.Outline", Icon: '"ChevronRight"', Layout: "ButtonLayout.IconOnly", AccessibleLabel: '"Next"',
      }),
      button(`${p}ThisMonth`, '"Today"', "Set(varAnchor, Date(Year(Today()), Month(Today()), 1))", { ...fixedW(72, 34), Appearance: "ButtonAppearance.Outline" }),
      button(`${p}MonthMode`, '"Month"', 'UpdateContext({locMode: "month"})', {
        ...fixedW(80, 34), Appearance: 'If(locMode = "quarter", ButtonAppearance.Outline, ButtonAppearance.Primary)',
      }),
      button(`${p}QuarterMode`, '"Quarter"', 'UpdateContext({locMode: "quarter"})', {
        ...fixedW(86, 34), Appearance: 'If(locMode = "quarter", ButtonAppearance.Primary, ButtonAppearance.Outline)',
      }),
      spacer(`${p}ToolSpacer`),
      text(`${p}Tip`, '"Print uses landscape. Quarter view is compact; use Month if it runs off the page."', { ...fixedW(420, 30), Size: 11, Color: K.gray500, Align: "Align.Right" }),
      button(`${p}Print`, '"Print"', "Print()", { ...fixedW(96, 34), Icon: '"Print"' }),
    ], { Visible: notPrinting }),
    vbox(`${p}Page`, { ...fill(1, { LayoutMinHeight: 300 }), Fill: K.white, PaddingTop: 14, PaddingLeft: 20, PaddingRight: 20, PaddingBottom: 10 }, [
      node(TYPES.html, `${p}Html`, { ...fill(1), HtmlText: html, Fill: K.white, PaddingTop: 0, PaddingLeft: 0, PaddingRight: 0, PaddingBottom: 0 }),
    ]),
  ], { Visible: notPrinting });
}

// ─── SCREEN: MY ENTRIES ──────────────────────────────────────────────────────

function screenMyEntries() {
  const p = "men";
  const statuses = withAll("nfStatus", '{V: "", N: "Any status"}', "{V: r.Label, N: r.Label}");
  const list = `With(
  {
    pk: If(varIsAdmin, ${p}Person.Selected.PersonKey, varMe.PersonKey),
    f: If(IsBlank(${p}From.SelectedDate), 0, ${dnum(`${p}From.SelectedDate`)}),
    t: If(IsBlank(${p}To.SelectedDate), 99991231, ${dnum(`${p}To.SelectedDate`)}),
    st: ${p}Status.Selected.V
  },
  If(IsBlank(st),
    SortByColumns(Filter('TP Entries', PersonKey = pk && EndNum >= f && StartNum <= t), StartNum, SortOrder.Descending),
    SortByColumns(Filter('TP Entries', PersonKey = pk && EndNum >= f && StartNum <= t && Status.Value = st), StartNum, SortOrder.Descending)
  )
)`;
  const preset = (lbl, from, to) => button(`${p}Preset${lbl.replace(/\W/g, "")}`, lbl.startsWith("=") ? lbl.slice(1) : str(lbl),
    `UpdateContext({locFrom: ${from}, locTo: ${to}}); Reset(${p}From); Reset(${p}To); Clear(colSel)`,
    { ...fixedW(lbl.length > 12 ? 112 : 96, 34), Appearance: "ButtonAppearance.Subtle" });
  const allSelected = `(CountRows(colSel) > 0 && CountRows(colSel) = CountRows(${p}List.AllItems))`;
  const remove = `If(Confirm("Delete " & CountRows(colSel) & " entries? This removes them from the team calendar and every print summary covering those months. Hotel and flight details on any site visits go with them. They stay in the site's recycle bin for 93 days."),
  Remove('TP Entries', colSel);
  Notify("Deleted " & CountRows(colSel) & " entries. They're in the site recycle bin if you need them back.", NotificationType.Success);
  Clear(colSel);
  Reset(${p}Typed)
)`;

  return root(p, "Entries", [
    toolbar(`${p}Toolbar`, [
      dropdown(`${p}Person`, "colPeople", "ThisItem.Title", {
        ...fixedW(170, 34), Default: "Coalesce(LookUp(colPeople, PersonKey = varMe.PersonKey), First(colPeople))", Visible: "varIsAdmin",
        OnChange: "Clear(colSel)", AccessibleLabel: '"Person"',
      }),
      datePicker(`${p}From`, { ...fixedW(160, 34), DefaultDate: "locFrom", Placeholder: '"From"', OnChange: "Clear(colSel)" }),
      text(`${p}ToLbl`, '"to"', { ...fixedW(20, 30), Color: K.gray500, Align: "Align.Center" }),
      datePicker(`${p}To`, { ...fixedW(160, 34), DefaultDate: "locTo", Placeholder: '"To"', OnChange: "Clear(colSel)" }),
      dropdown(`${p}Status`, statuses, "ThisItem.N", { ...fixedW(160, 34), Default: '{V: "", N: "Any status"}', OnChange: "Clear(colSel)" }),
      preset(`=\"Before \" & Year(Today())`, "Blank()", "Date(Year(Today()) - 1, 12, 31)"),
      preset(`=Year(Today()) - 1 & \" only\"`, "Date(Year(Today()) - 1, 1, 1)", "Date(Year(Today()) - 1, 12, 31)"),
      preset("All dates", "Blank()", "Blank()"),
    ]),
    content(`${p}Body`, [
      text(`${p}Intro`, `"Every recorded day, all years. Select what you want gone."`, { ...fixed(20), Size: 12, Color: K.gray600 }),
      vbox(`${p}ListCard`, { ...fill(1), Fill: K.white, BorderColor: K.gray200, BorderThickness: 1, ...radius(12), LayoutGap: 0, PaddingLeft: 12, PaddingRight: 12 }, [
        text(`${p}SelectAll`, `If(${allSelected}, "☑", "☐") & "  Select all " & CountRows(${p}List.AllItems) & " shown"`, {
          ...fixed(36), FontWeight: "FontWeight.Semibold",
          OnSelect: `If(${allSelected}, Clear(colSel), ClearCollect(colSel, ${p}List.AllItems))`,
        }),
        gallery(`${p}List`, "Vertical", { ...fill(1), Items: list, TemplateSize: 54 }, [
          rect(`${p}Line`, { X: 0, Y: "Parent.TemplateHeight - 1", Width: "Parent.TemplateWidth", Height: 1, Fill: K.gray100 }),
          text(`${p}Tick`, 'If(ThisItem.ID in colSel.ID, "☑", "☐")', {
            X: 4, Y: 10, Width: 30, Height: 30, Size: 20, Color: K.blue600, Align: "Align.Center",
            OnSelect: "If(ThisItem.ID in colSel.ID, RemoveIf(colSel, ID = ThisItem.ID), Collect(colSel, ThisItem))",
          }),
          text(`${p}When`, `${range("ThisItem.StartDate", "ThisItem.EndDate")}`, { X: 44, Y: 6, Width: 130, Height: 22, Size: 12, FontWeight: "FontWeight.Semibold", Color: K.gray700 }),
          text(`${p}Year`, "Text(Year(ThisItem.StartDate))", { X: 44, Y: 27, Width: 130, Height: 20, Size: 11, Color: K.gray500 }),
          chip(`${p}Chip`, "ThisItem.Status.Value", { X: 180, Y: 15, Width: 130, Height: 24 }),
          text(`${p}What`, "Coalesce(ThisItem.VisitLocation, ThisItem.RawText)", { X: 324, Y: 6, Width: "Parent.TemplateWidth - 330", Height: 22, Size: 13 }),
          text(`${p}Note`, "ThisItem.Notes", { X: 324, Y: 27, Width: "Parent.TemplateWidth - 330", Height: 20, Size: 11, Color: K.gray500 }),
        ]),
        text(`${p}Empty`, '"No entries match these filters."', { ...fixed(30), Color: K.gray500, Visible: `CountRows(${p}List.AllItems) = 0` }),
      ]),
      hbox(`${p}Footer`, { ...fixed(44) }, [
        text(`${p}Count`, `If(CountRows(colSel) = 0, CountRows(${p}List.AllItems) & " shown", CountRows(colSel) & " selected")`, { ...fixedW(200, 30), Color: K.gray600 }),
        spacer(`${p}FootSpacer`),
        input(`${p}Typed`, { ...fixedW(180, 34), Placeholder: '"Type DELETE to confirm"', Visible: "CountRows(colSel) > 20" }),
        button(`${p}Delete`, '"Delete selected"', remove, {
          ...fixedW(150, 36), Icon: '"Delete"', BasePaletteColor: K.error,
          DisplayMode: `If(CountRows(colSel) = 0 || (CountRows(colSel) > 20 && Upper(Trim(${p}Typed.Text)) <> "DELETE"), DisplayMode.Disabled, DisplayMode.Edit)`,
        }),
      ]),
    ]),
  ]);
}

// ─── SCREEN: ROSTER ──────────────────────────────────────────────────────────

function screenRoster() {
  const p = "ros";
  const personRec = email => `{Claims: "i:0#.f|membership|" & ${email}, Department: "", DisplayName: Office365Users.UserProfileV2(${email}).displayName, Email: ${email}, JobTitle: "", Picture: ""}`;
  const save = `With({pe: Lower(Trim(${p}PersonEmail.Text)), ae: Lower(Trim(${p}ApproverEmail.Text))},
  IfError(
    Patch('TP People', LookUp('TP People', ID = ThisItem.ID), {
      Person: If(pe = "", Blank(), ${personRec("pe")}),
      Approver: If(ae = "", Blank(), ${personRec("ae")})
    });
    ClearCollect(colPeople, Sort('TP People', SortOrder));
    Notify(ThisItem.Title & " saved.", NotificationType.Success),
    Notify("Couldn't save — check both addresses are Rotech accounts. " & FirstError.Message, NotificationType.Error)
  )
)`;
  const toggle = (col, guard) => `${guard ? `If(${guard}, Notify("You can't remove your own admin rights here — ask the other admin.", NotificationType.Warning),\n` : ""}Patch('TP People', LookUp('TP People', ID = ThisItem.ID), {${col}: !ThisItem.${col}});
ClearCollect(colPeople, Sort('TP People', SortOrder))${guard ? ")" : ""}`;
  const remove = `Remove('TP Entries', Filter('TP Entries', PersonKey = locRemove.PersonKey));
Remove('TP Milestones', Filter('TP Milestones', PersonKey = locRemove.PersonKey));
Remove('TP People', LookUp('TP People', ID = locRemove.ID));
ClearCollect(colPeople, Sort('TP People', SortOrder));
Notify("Removed " & locRemove.Title & ". Their entries are in the site recycle bin for 93 days.", NotificationType.Success);
UpdateContext({locRemove: Blank()})`;

  return root(p, "Roster", [
    content(`${p}Body`, [
      text(`${p}Intro`, `"Link each specialist to the Microsoft account they sign in with, and set who approves their PTO. Admin here must match the site's Owners group."`, {
        ...fixed(40), Size: 12, Color: K.gray600, Wrap: "true",
      }),
      text(`${p}NotAdmin`, '"Only planner admins can edit the roster."', { ...fixed(30), Visible: "!varIsAdmin", Color: K.warning }),
      gallery(`${p}List`, "Vertical", { ...fill(1), Items: "colPeople", TemplateSize: 76, Visible: "varIsAdmin && IsBlank(locRemove)" }, [
        rect(`${p}Bg`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: 70, Fill: K.white, BorderColor: K.gray200, BorderThickness: 1 }),
        text(`${p}Name`, "ThisItem.Title", { X: 12, Y: 12, Width: 200, Height: 22, FontWeight: "FontWeight.Bold", Color: `If(ThisItem.Active, ${K.ink}, ${K.gray500})` }),
        text(`${p}Key`, 'ThisItem.PersonKey & If(ThisItem.Active, "", " · inactive") & If(ThisItem.Admin, " · admin", "")', { X: 12, Y: 36, Width: 200, Height: 20, Size: 11, Color: K.gray500 }),
        label(`${p}PersonLbl`, "SIGNS IN AS", { X: 224, Y: 8, Width: 250, Height: 16 }),
        input(`${p}PersonEmail`, { X: 224, Y: 26, Width: 250, Height: 34, Default: "ThisItem.Person.Email", Placeholder: '"name@rotech.com"' }),
        label(`${p}ApproverLbl`, "PTO APPROVER", { X: 486, Y: 8, Width: 250, Height: 16 }),
        input(`${p}ApproverEmail`, { X: 486, Y: 26, Width: 250, Height: 34, Default: "ThisItem.Approver.Email", Placeholder: '"manager@rotech.com"' }),
        button(`${p}Save`, '"Save"', save, { X: 748, Y: 26, Width: 76, Height: 34, Appearance: "ButtonAppearance.Outline" }),
        text(`${p}Admin`, 'If(ThisItem.Admin, "☑", "☐") & " Admin"', {
          X: 842, Y: 28, Width: 100, Height: 30, Size: 14,
          OnSelect: toggle("Admin", "ThisItem.Admin && Lower(ThisItem.Person.Email) = Lower(User().Email)"),
        }),
        text(`${p}Active`, 'If(ThisItem.Active, "☑", "☐") & " Active"', { X: 946, Y: 28, Width: 100, Height: 30, Size: 14, OnSelect: toggle("Active") }),
        button(`${p}Remove`, '"Remove…"', "UpdateContext({locRemove: ThisItem}); Reset(rosTyped)", {
          X: "Parent.TemplateWidth - 120", Y: 26, Width: 108, Height: 34, Appearance: "ButtonAppearance.Subtle", BasePaletteColor: K.error,
        }),
      ]),
      text(`${p}Help`, `"Deactivate is the one to use when someone leaves: they drop out of the Today counts, the print grids and the pickers, but their history stays. Deactivating doesn't revoke their Microsoft sign-in. To add someone new, add a row to the TP People list in SharePoint."`, {
        ...fixed(40), Size: 11, Color: K.gray500, Wrap: "true", Visible: "varIsAdmin && IsBlank(locRemove)",
      }),
      card(`${p}RemoveCard`, { ...fixed(330), Visible: "!IsBlank(locRemove)" }, [
        text(`${p}RemoveTitle`, '"Remove " & locRemove.Title', { ...fixed(30), Size: 20, FontWeight: "FontWeight.Bold", Color: K.error }),
        text(`${p}RemoveWhat`, `"This permanently deletes every calendar entry " & locRemove.Title & " has, across all years, plus their birthday and work anniversary and their roster row. Their history disappears from the team calendar and every past print summary. Deleted entries stay in the site recycle bin for 93 days. Deactivating instead hides them and keeps all of it."`, {
          ...fixed(96), Wrap: "true", Fill: K.errorBg, Color: K.gray700, PaddingLeft: 12, PaddingRight: 12, ...radius(8),
        }),
        label(`${p}TypedLbl`, "TYPE THEIR NAME TO CONFIRM", fixed(18)),
        input(`${p}Typed`, { ...fixed(36), Placeholder: "locRemove.Title" }),
        hbox(`${p}RemoveFooter`, { ...fixed(44), LayoutJustifyContent: "LayoutJustifyContent.End" }, [
          button(`${p}RemoveCancel`, '"Cancel"', "UpdateContext({locRemove: Blank()})", { ...fixedW(90, 36), Appearance: "ButtonAppearance.Outline" }),
          button(`${p}RemoveGo`, '"Delete " & locRemove.Title', remove, {
            ...fixedW(220, 36), BasePaletteColor: K.error,
            DisplayMode: `If(Lower(Trim(${p}Typed.Text)) = Lower(Trim(locRemove.Title)), DisplayMode.Edit, DisplayMode.Disabled)`,
          }),
        ]),
      ]),
    ], { PaddingTop: 16 }),
  ]);
}

// ─── SCREEN: SITE CIRCUIT ────────────────────────────────────────────────────

function screenSiteCircuit() {
  const p = "sci";
  const visits = `With({s: ${dnum("varAnchor")}, e: ${dnum(eom("varAnchor"))}},
  SortByColumns(Filter('TP Entries', StartNum >= s && StartNum <= e && Status.Value = "Site Visit"), StartNum, SortOrder.Ascending))`;
  const when = (r = "") => `If(Coalesce(${r}EndDate, ${r}StartDate) <> ${r}StartDate, ${range(`${r}StartDate`, `${r}EndDate`)}, Text(${r}StartDate, "ddd, mmm d")) & If(IsBlank(${r}VisitTime), "", " " & ${r}VisitTime)`;
  const line = `"  - " & Coalesce(VisitLocation, "Untitled location") & " | " & ${when()} & " | Lead: " & Coalesce(PersonName, "TBD") & " | " & Coalesce(VisitConfirmation.Value, "Scheduled") & If(IsBlank(Notes), "", " | " & Notes)`;
  const subject = '"Site Visit Schedule – " & Text(varAnchor, "mmmm yyyy")';
  const body = `With({vis: ${visits}},
  With({vir: Filter(vis, VisitMode.Value = "Virtual"), ons: Filter(vis, VisitMode.Value <> "Virtual" || IsBlank(VisitMode.Value)), lbl: Text(varAnchor, "mmmm yyyy"), vp: First(Split(Trim(Coalesce(varSettings.VpName, "")), " ")).Value},
    "Hi " & Coalesce(vp, "[VP Name]") & "," & Char(10) & Char(10) &
    "Below is the summary of scheduled site audits/inspections for " & lbl & ", covering both virtual and onsite visits. This is a consolidated view for your awareness — individual location notifications go out separately to each site." & Char(10) & Char(10) &
    "VIRTUAL VISITS" & Char(10) & If(CountRows(vir) = 0, "  None scheduled.", Concat(vir, ${line}, Char(10))) & Char(10) & Char(10) &
    "ONSITE VISITS" & Char(10) & If(CountRows(ons) = 0, "  None scheduled.", Concat(ons, ${line}, Char(10))) & Char(10) & Char(10) &
    "Total: " & CountRows(vir) & " virtual, " & CountRows(ons) & " onsite scheduled this month." & Char(10) & Char(10) &
    "Let me know if you'd like more detail on any location, or if any dates need to shift." & Char(10) & Char(10) &
    "Best," & Char(10) & User().FullName
  )
)`;
  const send = `With({html: "<div style='font-family:Segoe UI,Arial,sans-serif'>" & Substitute(Substitute(${p}MailText.Text, "<", "&lt;"), Char(10), "<br>") & "</div>"},
  IfError(
    If(IsBlank(varSettings.Cc),
      Office365Outlook.SendEmailV2(varSettings.VpEmail, ${subject}, html),
      Office365Outlook.SendEmailV2(varSettings.VpEmail, ${subject}, html, {Cc: Substitute(varSettings.Cc, ",", ";")}));
    Notify("Sent to " & varSettings.VpEmail & ".", NotificationType.Success),
    Notify("Couldn't send: " & FirstError.Message, NotificationType.Error)
  )
)`;
  const saveRecipients = `Set(varSettings, Patch('TP Settings', If(IsBlank(varSettings), Defaults('TP Settings'), varSettings), {
  Title: Lower(User().Email),
  VpName: ${p}VpName.Text,
  VpEmail: Trim(${p}VpEmail.Text),
  Cc: Trim(${p}Cc.Text)
}));
Notify("Recipients saved.", NotificationType.Success)`;

  const visitCard = (mode, title, accent, filterExpr) => card(`${p}${mode}Card`, { ...fill(1), BorderColor: K.gray200, PaddingTop: 14 }, [
    rect(`${p}${mode}Accent`, { ...fixed(4), Fill: accent }),
    text(`${p}${mode}Title`, `"${title} visits · " & CountRows(${p}${mode}Gal.AllItems)`, { ...fixed(24), Size: 15, FontWeight: "FontWeight.Bold" }),
    gallery(`${p}${mode}Gal`, "Vertical", { ...fill(1), Items: `Filter(${visits}, ${filterExpr})`, TemplateSize: 112 }, [
      rect(`${p}${mode}Bg`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: 106, Fill: K.white, BorderColor: K.gray200, BorderThickness: 1 }),
      text(`${p}${mode}Loc`, 'Coalesce(ThisItem.VisitLocation, "Untitled location")', { X: 12, Y: 8, Width: "Parent.TemplateWidth - 24", Height: 22, FontWeight: "FontWeight.Bold" }),
      text(`${p}${mode}When`, `${when("ThisItem.")} & " · " & Coalesce(ThisItem.PersonName, "Unassigned")`, { X: 12, Y: 30, Width: "Parent.TemplateWidth - 24", Height: 20, Size: 12, Color: K.gray600 }),
      text(`${p}${mode}Note`, 'Concat(Filter(Table({T: ThisItem.VisitPurpose}, {T: ThisItem.Notes}), !IsBlank(T)), T, " · ")', { X: 12, Y: 50, Width: "Parent.TemplateWidth - 24", Height: 20, Size: 12, Color: K.gray600, Italic: "true" }),
      dropdown(`${p}${mode}Mode`, "nfVisitModes", "ThisItem.Value", {
        X: 12, Y: 72, Width: 120, Height: 32, Default: '{Value: Coalesce(ThisItem.VisitMode.Value, "Onsite")}',
        OnChange: "Patch('TP Entries', ThisItem, {VisitMode: {Value: Self.Selected.Value}})",
        DisplayMode: `If(${canEditEntry("ThisItem")}, DisplayMode.Edit, DisplayMode.View)`, AccessibleLabel: '"Visit mode"',
      }),
      dropdown(`${p}${mode}Confirm`, "nfConfirmations", "ThisItem.Value", {
        X: 140, Y: 72, Width: 170, Height: 32, Default: '{Value: Coalesce(ThisItem.VisitConfirmation.Value, "Scheduled")}',
        OnChange: "Patch('TP Entries', ThisItem, {VisitConfirmation: {Value: Self.Selected.Value}})",
        DisplayMode: `If(${canEditEntry("ThisItem")}, DisplayMode.Edit, DisplayMode.View)`, AccessibleLabel: '"Confirmation status"',
      }),
    ]),
    text(`${p}${mode}Empty`, `"No ${title.toLowerCase()} visits scheduled this month."`, { ...fixed(24), Color: K.gray500, Visible: `CountRows(${p}${mode}Gal.AllItems) = 0` }),
  ]);

  return root(p, "Circuit", [
    toolbar(`${p}Toolbar`, [
      ...pager(p),
      text(`${p}Intro`, '"One consolidated schedule email to leadership, built from the site visits already on the planner."', { ...fill(1, { LayoutMinHeight: 30 }), Height: 30, Size: 12, Color: K.gray600 }),
    ]),
    hbox(`${p}Body`, { ...fill(1, { LayoutMinHeight: 300 }), PaddingLeft: 20, PaddingRight: 20, PaddingBottom: 16, LayoutGap: 16, LayoutAlignItems: "LayoutAlignItems.Stretch" }, [
      hbox(`${p}Visits`, { ...fill(3), LayoutGap: 14, LayoutAlignItems: "LayoutAlignItems.Stretch" }, [
        visitCard("Virtual", "Virtual", K.blue600, 'VisitMode.Value = "Virtual"'),
        visitCard("Onsite", "Onsite", K.warning, 'VisitMode.Value <> "Virtual" || IsBlank(VisitMode.Value)'),
      ]),
      vbox(`${p}Side`, { ...fill(2), LayoutGap: 14 }, [
        card(`${p}RecipCard`, fixed(270), [
          hbox(`${p}RecipHead`, { ...fixed(24) }, [
            text(`${p}RecipTitle`, '"Recipients"', { ...fixedW(120, 24), Size: 15, FontWeight: "FontWeight.Bold" }),
            text(`${p}RecipNote`, '"Yours alone — set once"', { ...fill(1, { LayoutMinHeight: 20 }), Height: 20, Size: 11, Color: K.gray500, Align: "Align.Right" }),
          ]),
          row(`${p}RecipRow1`, [
            field(`${p}VpNameField`, "Division VP name", input(`${p}VpName`, { Default: "varSettings.VpName", Placeholder: '"e.g. Jordan Reyes"' })),
            field(`${p}VpEmailField`, "Division VP email (To)", input(`${p}VpEmail`, { Default: "varSettings.VpEmail", Placeholder: '"vp@rotech.com"' })),
          ]),
          row(`${p}RecipRow2`, [field(`${p}CcField`, "CC — region manager, area manager… (comma-separated)", input(`${p}Cc`, { Default: "varSettings.Cc", Placeholder: '"regionmgr@rotech.com, areamgr@rotech.com"' }))]),
          button(`${p}SaveRecip`, '"Save recipients"', saveRecipients, fixedW(150, 34, { AlignInContainer: "AlignInContainer.Start" })),
        ]),
        card(`${p}MailCard`, fill(1), [
          text(`${p}Subject`, `"Subject: " & ${subject}`, { ...fixed(22), Size: 12, FontWeight: "FontWeight.Semibold", Color: K.gray700 }),
          vbox(`${p}BodyScroll`, { ...fill(1), LayoutOverflowY: "LayoutOverflow.Scroll", Fill: K.gray50, ...radius(8), PaddingTop: 8, PaddingLeft: 10, PaddingRight: 10 }, [
            text(`${p}MailText`, body, { ...fixed(400), AutoHeight: "true", Wrap: "true", Size: 12, VerticalAlign: "VerticalAlign.Top" }),
          ]),
          hbox(`${p}MailButtons`, { ...fixed(40) }, [
            button(`${p}Send`, 'If(IsBlank(varSettings.VpEmail), "Add the VP first", "Send to " & varSettings.VpName)', send, {
              ...fixedW(200, 36), Icon: '"Send"', DisplayMode: "If(IsBlank(varSettings.VpEmail), DisplayMode.Disabled, DisplayMode.Edit)",
            }),
            button(`${p}Copy`, '"Copy email text"', `Copy("Subject: " & ${subject} & Char(10) & Char(10) & ${p}MailText.Text); Notify("Copied.", NotificationType.Success)`, {
              ...fixedW(150, 36), Appearance: "ButtonAppearance.Outline",
            }),
          ]),
        ]),
      ]),
    ]),
  ]);
}

// ─── SCREEN: REQUEST PTO ─────────────────────────────────────────────────────

function screenRequestPTO() {
  const p = "rqp";
  const sd = `${p}Start.SelectedDate`;
  const ed = `Coalesce(${p}End.SelectedDate, ${p}Start.SelectedDate)`;
  const single = `(${sd} = ${ed})`;
  const half = `(${single} && ${p}Part.Selected.Value <> "Full day")`;
  const overlaps = `If(IsBlank(${sd}), Blank(), With({s: ${dnum(sd)}, e: ${dnum(ed)}}, Filter('TP Entries', PersonKey = varMe.PersonKey && StartNum <= e && EndNum >= s)))`;
  const days = `With({a: ${sd}, b: ${ed}}, ${weekdays("a", "b")})`;
  const approver = "LookUp(colPeople, PersonKey = varMe.PersonKey).Approver";
  const submit = `With({sd: ${sd}, ed: ${ed}},
  With({single: sd = ed, wd: ${weekdays("sd", "ed")}},
    If(
      IsBlank(varMe), Notify("Your sign-in isn't linked to a roster person yet. Ask an admin to link it on the Roster screen.", NotificationType.Error),
      IsBlank(${approver}.Email), Notify("No PTO approver is set for you yet. Ask an admin to add one on the Roster screen.", NotificationType.Error),
      IsBlank(sd), Notify("Pick a start date.", NotificationType.Error),
      ed < sd, Notify("The end date can't be before the start date.", NotificationType.Error),
      wd = 0, Notify("Those dates are all weekend days.", NotificationType.Error),
      Set(varPtoResult, TPSubmitPTORequest.Run(
        ${p}Type.Selected.Value,
        Text(sd, "yyyy-mm-dd"),
        Text(ed, "yyyy-mm-dd"),
        If(single, ${p}Part.Selected.Value, "Full day"),
        ${p}Notes.Text,
        If(${half} || CountRows(${overlaps}) = 0, "Keep both", ${p}Overlap.Selected.Value = "Replace these", "Replace", "Keep both"),
        If(${half}, 0.5, wd)
      ));
      If(varPtoResult.ok = "yes",
        Notify("Sent to " & ${approver}.DisplayName & " for approval. You'll get an email when it's decided.", NotificationType.Success);
        Navigate(scrMyRequests, ScreenTransition.None),
        Notify(Coalesce(varPtoResult.message, "The request couldn't be sent."), NotificationType.Error)
      )
    )
  )
)`;

  // The approval path, in the shape of the Approval request screen's
  // ReviewersGallery (Step, Name, Title, Status, Current).
  const stages = `With({ap: ${approver}},
  Table(
    {Step: 1, Name: Coalesce(varMe.Title, User().FullName), Title: "Fills in and sends this request", Status: "In progress", Current: true},
    {Step: 2, Name: If(IsBlank(ap.Email), "No approver set", ap.DisplayName),
     Title: If(IsBlank(ap.Email), "An admin needs to add one on the Roster screen", "Approves or declines from Outlook or Teams"),
     Status: If(IsBlank(ap.Email), "Blocked", "Not started"), Current: false},
    {Step: 3, Name: "Team Planner", Title: "Adds it to the calendar and sends you an Outlook invite", Status: "Not started", Current: false}
  )
)`;
  const stagePick = (inProgress, blocked, other) => `Switch(ThisItem.Status, "In progress", ${inProgress}, "Blocked", ${blocked}, ${other})`;
  const recent = "FirstN(SortByColumns(Filter('TP PTO Requests', PersonKey = varMe.PersonKey), ID, SortOrder.Descending), 5)";

  return templateScreen(p, "Team Planner · Request PTO", "Pto", [
    tcard(`${p}FormContainer`, { ...fill(1, { LayoutMinHeight: 300 }), LayoutOverflowY: "LayoutOverflow.Scroll", LayoutGap: 10, PaddingLeft: 20, PaddingRight: 20 }, [
      text(`${p}FormTitleText`, '"New PTO request"', { ...fixed(32), Size: 20, FontWeight: "FontWeight.Semibold" }),
      text(`${p}GoesTo`, `If(IsBlank(varMe), "Your sign-in isn't linked to a roster person yet — an admin can link it on the Roster screen.", IsBlank(${approver}.Email), "No approver is set for you yet — an admin can add one on the Roster screen.", "Once it's approved, it's added to the planner and your Outlook calendar.")`, {
        ...fixed(22), Size: 12, Color: `If(IsBlank(varMe) || IsBlank(${approver}.Email), ${K.warning}, ${K.gray600})`,
      }),
      row(`${p}Row1`, [
        field(`${p}TypeField`, "Type", dropdown(`${p}Type`, "nfLeaveTypes", "ThisItem.Value", { Default: '{Value: "PTO"}' })),
        field(`${p}PartField`, "Day part — single days only", dropdown(`${p}Part`, "nfDayParts", "ThisItem.Value", {
          Default: '{Value: "Full day"}', DisplayMode: `If(${single}, DisplayMode.Edit, DisplayMode.View)`,
        })),
      ]),
      row(`${p}Row2`, [
        field(`${p}StartField`, "First day", datePicker(`${p}Start`, { DefaultDate: "Today()" })),
        field(`${p}EndField`, "Last day", datePicker(`${p}End`, { DefaultDate: "Today()", StartDate: sd })),
      ]),
      text(`${p}Summary`, `If(IsBlank(${sd}), "", ${half}, "Half day (" & ${p}Part.Selected.Value & ") · " & Text(${sd}, "dddd, mmmm d"), ${days} & " weekday(s) · " & ${range(sd, ed)})`, {
        ...fixed(24), Size: 14, FontWeight: "FontWeight.Semibold", Color: K.blue600,
      }),
      vbox(`${p}NotesField`, { ...fixed(104), LayoutGap: 4 }, [
        label(`${p}NotesLbl`, "Notes for your approver (optional)", fixed(18)),
        input(`${p}Notes`, { ...fixed(78), Type: "TextInputType.Multiline", Placeholder: '"Family trip — Cody has Tuesday coverage"' }),
      ]),
      vbox(`${p}OverlapBox`, { ...fill(1, { LayoutMinHeight: 80 }), Visible: `CountRows(${overlaps}) > 0`, Fill: K.warningBg, ...radius(8), PaddingTop: 10, PaddingLeft: 12, PaddingRight: 12, PaddingBottom: 10, LayoutGap: 6 }, [
        text(`${p}OverlapTitle`, '"You already have entries on these days:"', { ...fixed(22), FontWeight: "FontWeight.Semibold", Color: K.warning }),
        gallery(`${p}OverlapGal`, "Vertical", { ...fill(1, { LayoutMinHeight: 30 }), Items: overlaps, TemplateSize: 26 }, [
          text(`${p}OverlapRow`, `${range("ThisItem.StartDate", "ThisItem.EndDate")} & " · " & ThisItem.Status.Value & If(IsBlank(ThisItem.VisitLocation), "", " · " & ThisItem.VisitLocation)`, {
            X: 0, Y: 2, Width: "Parent.TemplateWidth", Height: 22, Size: 12, Color: K.gray700,
          }),
        ]),
        hbox(`${p}OverlapChoice`, { ...fixed(40), Visible: `!${half}` }, [
          text(`${p}OverlapLbl`, '"When this is approved:"', { ...fixedW(170, 30), Size: 12, FontWeight: "FontWeight.Semibold", Color: K.gray700 }),
          dropdown(`${p}Overlap`, '["Replace these", "Keep both"]', "ThisItem.Value", { ...fixedW(200, 34), Default: '{Value: "Replace these"}' }),
        ]),
        text(`${p}OverlapHalf`, '"Half-day requests keep the existing entry — the other half of the day still needs it."', { ...fixed(20), Size: 12, Color: K.gray700, Visible: half }),
      ]),
      text(`${p}FormSpacer`, '""', { FillPortions: 1, LayoutMinHeight: 1, Height: 1, AlignInContainer: "AlignInContainer.Stretch" }),
      hbox(`${p}ButtonContainer`, { ...fixed(40), LayoutJustifyContent: "LayoutJustifyContent.End" }, [
        button(`${p}Cancel`, '"Cancel"', "Back()", { ...fixedW(90, 34), Appearance: "ButtonAppearance.Outline" }),
        button(`${p}Submit`, '"Submit request"', submit, { ...fixedW(150, 34), Icon: '"Send"' }),
      ]),
    ]),
    tcard(`${p}SidebarContainer`, { FillPortions: 0, Width: 320, LayoutMinHeight: 300, AlignInContainer: "AlignInContainer.Stretch", LayoutGap: 8 }, [
      text(`${p}ReviewersText`, '"Approval path"', { ...fixed(26), Size: 16, FontWeight: "FontWeight.Semibold" }),
      gallery(`${p}ReviewersGallery`, "Vertical", { ...fixed(3 * 84), Items: stages, TemplateSize: 84, ShowScrollbar: "false" }, [
        rect(`${p}StepLine`, { X: 17, Y: 36, Width: 2, Height: "Parent.TemplateHeight - 36", Fill: K.gray300, Visible: "ThisItem.Step < 3" }),
        text(`${p}StepDot`, "Upper(Left(ThisItem.Name, 1))", {
          X: 2, Y: 2, Width: 32, Height: 32, Size: 13, FontWeight: "FontWeight.Bold", Align: "Align.Center", ...radius(16), BorderThickness: 1,
          Fill: stagePick(K.blue600, K.errorBg, K.gray100),
          Color: stagePick(K.white, K.error, K.gray600),
          BorderColor: stagePick(K.blue600, K.errorBorder, K.gray300),
        }),
        text(`${p}StepName`, "ThisItem.Name", {
          X: 46, Y: 2, Width: "Parent.TemplateWidth - 48", Height: 20, Size: 13,
          FontWeight: "If(ThisItem.Current, FontWeight.Bold, FontWeight.Semibold)",
        }),
        text(`${p}StepTitle`, "ThisItem.Title", { X: 46, Y: 22, Width: "Parent.TemplateWidth - 48", Height: 36, Size: 12, Color: K.gray600, Wrap: "true", VerticalAlign: "VerticalAlign.Top" }),
        text(`${p}StepStatus`, "ThisItem.Status", {
          X: 46, Y: 58, Width: "Parent.TemplateWidth - 48", Height: 18, Size: 11, FontWeight: "FontWeight.Semibold",
          Color: stagePick(K.blue600, K.error, K.gray500),
        }),
      ]),
      divider(`${p}Divider`),
      text(`${p}RecentText`, '"Your recent requests"', { ...fixed(24), Size: 14, FontWeight: "FontWeight.Semibold" }),
      gallery(`${p}RecentGallery`, "Vertical", {
        ...fill(1, { LayoutMinHeight: 60 }), Items: recent, TemplateSize: 46,
        OnSelect: "Navigate(scrMyRequests, ScreenTransition.None)",
      }, [
        text(`${p}RecentWhat`, `ThisItem.LeaveType.Value & " · " & ${range("ThisItem.StartDate", "ThisItem.EndDate")}`, {
          X: 0, Y: 3, Width: "Parent.TemplateWidth - 96", Height: 20, Size: 12, FontWeight: "FontWeight.Semibold", OnSelect: "Select(Parent)",
        }),
        text(`${p}RecentSub`, `If(ThisItem.DayPart.Value = "Full day", ThisItem.Weekdays & " weekday(s)", "Half day (" & ThisItem.DayPart.Value & ")")`, {
          X: 0, Y: 23, Width: "Parent.TemplateWidth - 96", Height: 18, Size: 11, Color: K.gray600, OnSelect: "Select(Parent)",
        }),
        requestPill(`${p}RecentStatus`, "ThisItem.Status.Value", { X: "Parent.TemplateWidth - 90", Y: 11, Width: 88, Height: 24, OnSelect: "Select(Parent)" }),
      ]),
      text(`${p}RecentEmpty`, '"No requests yet."', { ...fixed(20), Size: 12, Color: K.gray500, Visible: `CountRows(${p}RecentGallery.AllItems) = 0` }),
      button(`${p}ViewAll`, '"See all my requests"', "Navigate(scrMyRequests, ScreenTransition.None)", fixedW(170, 32, { Appearance: "ButtonAppearance.Subtle", AlignInContainer: "AlignInContainer.Start" })),
    ]),
  ]);
}

const PTO_INPUTS = ["Type", "Start", "End", "Part", "Notes", "Overlap"].map(s => `rqp${s}`);

// ─── SCREEN: MY REQUESTS ─────────────────────────────────────────────────────

function screenMyRequests() {
  const p = "mrq";
  const items = `SortByColumns(If(varIsAdmin && locAll, 'TP PTO Requests', Filter('TP PTO Requests', PersonKey = varMe.PersonKey)), StartNum, SortOrder.Descending)`;
  const live = 'ThisItem.Status.Value = "Pending" || ThisItem.Status.Value = "Approved"';
  const cancel = `If(Confirm(If(ThisItem.Status.Value = "Pending", "Withdraw this request?", "Cancel this approved PTO? It comes off the planner and the Outlook calendar, and the approver is told.")),
  Set(varPtoCancel, TPCancelPTORequest.Run(ThisItem.ID));
  If(varPtoCancel.ok = "yes",
    Notify(If(ThisItem.Status.Value = "Pending", "Request withdrawn.", "PTO cancelled."), NotificationType.Success),
    Notify(Coalesce(varPtoCancel.message, "That didn't work."), NotificationType.Error));
  Refresh('TP PTO Requests')
)`;

  return root(p, "Pto", [
    toolbar(`${p}Toolbar`, [
      text(`${p}Title`, 'If(varIsAdmin && locAll, "Everyone\'s PTO requests", "My PTO requests")', { ...fixedW(300, 34), Size: 16, FontWeight: "FontWeight.Bold" }),
      text(`${p}All`, 'If(locAll, "☑", "☐") & " Everyone\'s requests"', { ...fixedW(200, 30), Visible: "varIsAdmin", OnSelect: "UpdateContext({locAll: !locAll})" }),
      spacer(`${p}ToolSpacer`),
      button(`${p}New`, '"Request PTO"', "Navigate(scrRequestPTO, ScreenTransition.None)", { ...fixedW(130, 34), Icon: '"Add"', Visible: "!IsBlank(varMe)" }),
    ]),
    content(`${p}Body`, [
      gallery(`${p}List`, "VariableHeight", { ...fill(1), Items: items, TemplateSize: 96 }, [
        rect(`${p}Bg`, { X: 0, Y: 3, Width: "Parent.TemplateWidth", Height: "Parent.TemplateHeight - 6", Fill: K.white, BorderColor: K.gray200, BorderThickness: 1 }),
        text(`${p}Head`, `If(varIsAdmin && locAll, ThisItem.Requester.DisplayName & " · ", "") & ThisItem.LeaveType.Value & " · " & ${range("ThisItem.StartDate", "ThisItem.EndDate")}`, {
          X: 14, Y: 10, Width: "Parent.TemplateWidth - 330", Height: 22, Size: 14, FontWeight: "FontWeight.Bold",
        }),
        text(`${p}Sub`, `If(ThisItem.DayPart.Value = "Full day", ThisItem.Weekdays & " weekday(s)", "Half day (" & ThisItem.DayPart.Value & ")") & " · requested " & Text(ThisItem.Created, "mmm d") & " · approver " & Coalesce(ThisItem.Approver.DisplayName, "—")`, {
          X: 14, Y: 34, Width: "Parent.TemplateWidth - 330", Height: 20, Size: 12, Color: K.gray600,
        }),
        text(`${p}Decision`, `Concat(Filter(Table(
  {T: ThisItem.Notes},
  {T: If(IsBlank(ThisItem.ApproverComments), "", "Approver: “" & ThisItem.ApproverComments & "”")},
  {T: If(IsBlank(ThisItem.DecidedAt), "", "Decided " & Text(ThisItem.DecidedAt, "mmm d"))},
  {T: ThisItem.ReplacedSummary}), !IsBlank(T)), T, " · ")`, {
          X: 14, Y: 56, Width: "Parent.TemplateWidth - 330", Height: 20, Size: 12, Color: K.gray600, Wrap: "true", AutoHeight: "true",
        }),
        // A Text pill rather than ModernBadge: the updated Badge control isn't
        // rolled out everywhere yet, and Studio rejected it ("Unknown control
        // type 'ModernBadge'") on the first real paste.
        requestPill(`${p}Status`, "ThisItem.Status.Value", { X: "Parent.TemplateWidth - 300", Y: 13, Width: 110, Height: 26 }),
        button(`${p}Cancel`, 'If(ThisItem.Status.Value = "Pending", "Withdraw", "Cancel PTO")', cancel, {
          X: "Parent.TemplateWidth - 170", Y: 10, Width: 150, Height: 34, Appearance: "ButtonAppearance.Outline",
          Visible: `(${live}) && (ThisItem.PersonKey = varMe.PersonKey || varIsAdmin)`,
        }),
      ]),
      text(`${p}Empty`, '"No PTO requests yet."', { ...fixed(24), Color: K.gray500, Visible: `CountRows(${p}List.AllItems) = 0` }),
    ]),
  ]);
}

// ─── APP-LEVEL TEXT ──────────────────────────────────────────────────────────

const STATUS_ROWS = [
  ["Home Office", "HOME", false, "gray100", "gray700", "gray300"],
  ["Site Visit", "VISIT", true, "blue50", "blue600", "#b8d3ee"],
  ["Travel", "TRVL", true, "#e6f6fa", "tealDeep", "#a5dfeb"],
  ["PTO", "PTO", true, "successBg", "success", "successBorder"],
  ["Flex Holiday", "FH", true, "successBg", "success", "successBorder"],
  ["Limited Availability", "LTD", false, "warningBg", "warning", "warningBorder"],
  ["Meeting", "MTG", true, "#f0ecfa", "#5b4b9e", "#cfc4ea"],
  ["Company Holiday", "HOL", true, "errorBg", "error", "errorBorder"],
  ["Other", "—", false, "white", "gray600", "gray300"],
];
const hexOf = k => (k.startsWith("#") ? k : HEX[k]);

const NAMED_FORMULAS = [
  ["nfStatus", `Table(\n${STATUS_ROWS.map(([lbl, short, out, bg, fg, bd]) =>
    `    {Label: "${lbl}", Short: "${short}", Out: ${out}, Bg: ${rgba(hexOf(bg))}, Fg: ${rgba(hexOf(fg))}, Bd: ${rgba(hexOf(bd))}, BgHex: "${hexOf(bg)}", FgHex: "${hexOf(fg)}"}`).join(",\n")}\n)`,
    "Status vocabulary — STATUSES in src/teamPlannerData.js, with the colours the React app uses. Out = counts as out of office on Today."],
  ["nfCadences", `Table(
    {Label: "Weekly", Rank: 1},
    {Label: "Monthly", Rank: 2},
    {Label: "Quarterly", Rank: 3},
    {Label: "Specific month", Rank: 4},
    {Label: "Month range", Rank: 5},
    {Label: "One-off date", Rank: 0},
    {Label: "Standing duty", Rank: 6}
)`, "Cadence vocabulary in picker order. Rank is CADENCE_ORDER: most time-critical first."],
  ["nfMonths", `["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]`, ""],
  ["nfLeaveTypes", `["PTO", "Flex Holiday"]`, ""],
  ["nfDayParts", `["Full day", "AM", "PM"]`, ""],
  ["nfVisitModes", `["Onsite", "Virtual"]`, ""],
  ["nfConfirmations", `["Scheduled", "Confirmed", "Needs reschedule"]`, ""],
];

const ON_START = `// Team Planner — App.OnStart. Small lists load once into collections; the
// calendar screens query TP Entries directly so they're always current.
Set(varAnchor, Date(Year(Today()), Month(Today()), 1));
ClearCollect(colPeople, Sort('TP People', SortOrder));
Set(varMe, LookUp(colPeople, Lower(Person.Email) = Lower(User().Email)));
Set(varIsAdmin, !IsBlank(varMe) && varMe.Admin);
ClearCollect(colTasks, Filter('TP Tasks', Active = true));
ClearCollect(colMilestones, 'TP Milestones');
ClearCollect(colDone, Filter('TP Task Done', StartsWith(PeriodKey, Text(Year(Today())))));
Set(varSettings, LookUp('TP Settings', Title = Lower(User().Email)))`;

const ON_VISIBLE = [
  ["scrEntryEdit", ENTRY_INPUTS.map(n => `Reset(${n})`).join("; ")],
  ["scrTaskEdit", TASK_INPUTS.map(n => `Reset(${n})`).join("; ")],
  ["scrRequestPTO", PTO_INPUTS.map(n => `Reset(${n})`).join("; ")],
  ["scrMyEntries", "Clear(colSel); UpdateContext({locFrom: Blank(), locTo: Blank()}); Reset(menFrom); Reset(menTo); Reset(menTyped)"],
];

// ─── EMIT ────────────────────────────────────────────────────────────────────

const SCREENS = [
  ["01", "scrToday", screenToday],
  ["02", "scrMyTasks", screenMyTasks],
  ["03", "scrTaskCalendar", screenTaskCalendar],
  ["04", "scrWhereabouts", screenWhereabouts],
  ["05", "scrEntryDetail", screenEntryDetail],
  ["06", "scrEntryEdit", screenEntryEdit],
  ["07", "scrTaskEdit", screenTaskEdit],
  ["08", "scrPrint", screenPrint],
  ["09", "scrMyEntries", screenMyEntries],
  ["10", "scrRoster", screenRoster],
  ["11", "scrSiteCircuit", screenSiteCircuit],
  ["12", "scrRequestPTO", screenRequestPTO],
  ["13", "scrMyRequests", screenMyRequests],
];

// YAML rules from the Power Fx YAML grammar: every value starts with "=", and
// a single-line formula may not contain "#" or ":" anywhere — not even inside
// a string — so those, and anything multi-line, become "|-" block scalars.
function emitFormula(key, value, indent) {
  const f = String(value);
  const pad = " ".repeat(indent);
  if (!/[#:\n]/.test(f) && f === f.trim()) return `${pad}${key}: =${f}\n`;
  const lines = f.split("\n");
  return `${pad}${key}: |-\n` + lines.map((l, i) => `${pad}  ${i === 0 ? "=" : ""}${l}`.replace(/\s+$/, "")).join("\n") + "\n";
}

function emitNode(n, indent, out) {
  const pad = " ".repeat(indent);
  out.push(`${pad}- ${n.name}:\n`);
  out.push(`${pad}    Control: ${n.type}\n`);
  if (n.variant) out.push(`${pad}    Variant: ${n.variant}\n`);
  const keys = Object.keys(n.props);
  if (keys.length) {
    out.push(`${pad}    Properties:\n`);
    for (const k of keys) out.push(emitFormula(k, n.props[k], indent + 6));
  }
  if (n.children?.length) {
    out.push(`${pad}    Children:\n`);
    for (const c of n.children) emitNode(c, indent + 6, out);
  }
}

function walk(n, fn, parent = null) {
  fn(n, parent);
  (n.children || []).forEach(c => walk(c, fn, n));
}

export function build() {
  const screens = SCREENS.map(([num, screen, fn]) => ({ num, screen, tree: fn() }));
  return { screens, namedFormulas: NAMED_FORMULAS, onStart: ON_START, onVisible: ON_VISIBLE };
}

function main() {
  const { screens } = build();
  const fdump = [];
  const dumpArg = process.argv.indexOf("--formulas");

  fs.mkdirSync(path.join(OUT, "screens"), { recursive: true });
  for (const s of screens) {
    const out = [];
    emitNode(s.tree, 0, out);
    const file = `${s.num}-${s.screen}.yaml`;
    fs.writeFileSync(path.join(OUT, "screens", file), out.join(""), "utf8");
    walk(s.tree, n => Object.entries(n.props).forEach(([k, v]) => fdump.push({ id: `${s.screen}/${n.name}.${k}`, formula: String(v) })));
    console.log(`  screens/${file}`);
  }

  const formulasTxt = "// Team Planner — paste into the App object's Formulas property.\n" +
    "// Shared lookup tables. Mirrors src/teamPlannerData.js; keep the two in step.\n\n" +
    NAMED_FORMULAS.map(([name, f, note]) => (note ? `// ${note}\n` : "") + `${name} = ${f};`).join("\n\n") + "\n";
  fs.writeFileSync(path.join(OUT, "App.Formulas.txt"), formulasTxt, "utf8");
  NAMED_FORMULAS.forEach(([name, f]) => fdump.push({ id: `App.Formulas/${name}`, formula: f }));

  fs.writeFileSync(path.join(OUT, "App.OnStart.txt"), ON_START + "\n", "utf8");
  fdump.push({ id: "App.OnStart", formula: ON_START });

  const visTxt = "// Paste each formula into that screen's OnVisible property.\n" +
    "// They clear the form inputs so a new entry never opens with the last one's values.\n\n" +
    ON_VISIBLE.map(([scr, f]) => `// ${scr}.OnVisible\n${f}`).join("\n\n") + "\n";
  fs.writeFileSync(path.join(OUT, "OnVisible.txt"), visTxt, "utf8");
  ON_VISIBLE.forEach(([scr, f]) => fdump.push({ id: `${scr}.OnVisible`, formula: f }));

  console.log("  App.Formulas.txt\n  App.OnStart.txt\n  OnVisible.txt");
  if (dumpArg > -1) {
    fs.writeFileSync(process.argv[dumpArg + 1], JSON.stringify(fdump, null, 1), "utf8");
    console.log(`  ${fdump.length} formulas → ${process.argv[dumpArg + 1]}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
