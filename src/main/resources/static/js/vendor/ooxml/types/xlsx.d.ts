/**
 * Observe an element's size and invoke a render callback, coalescing bursts to
 * one call per animation frame and serializing overlapping async renders.
 *
 * Framework-agnostic: call from any mount/setup hook and invoke the returned
 * disposer in the corresponding teardown hook.
 *
 * @example
 * const detach = autoResize(
 *   (width) => pres.renderSlide(canvas, 0, { width }),
 *   canvas,
 * );
 * // later
 * detach();
 */
export declare function autoResize(render: (width: number, height: number) => void | Promise<void>, element: Element, opts?: AutoResizeOptions): () => void;

export declare interface AutoResizeOptions {
    /**
     * Skip rendering while `document.hidden` is true and fire once with the latest
     * observed size when the tab becomes visible again. Default: true.
     */
    pauseWhenHidden?: boolean;
}

export declare interface Border {
    left: BorderEdge | null;
    right: BorderEdge | null;
    top: BorderEdge | null;
    bottom: BorderEdge | null;
    diagonalUp?: BorderEdge | null;
    diagonalDown?: BorderEdge | null;
    /** Inner horizontal rule between rows inside a region
     *  (ECMA-376 §18.8.40 `tableStyleElement/border/horizontal`).
     *  Only set on table-style dxfs; absent on cell-level borders. */
    horizontal?: BorderEdge | null;
    /** Inner vertical rule between columns inside a region. */
    vertical?: BorderEdge | null;
}

export declare interface BorderEdge {
    style: string;
    color: string | null;
}

export declare interface Cell {
    col: number;
    row: number;
    value: CellValue;
    /** Style index into the styles table. Omitted on the wire when `0` (the
     *  common unstyled case), so read it as `styleIndex ?? 0`. */
    styleIndex?: number;
    /** Raw `<f>` formula text (ECMA-376 §18.3.1.40), when present. The renderer
     *  uses this to recompute volatile functions (TODAY, NOW) at display time
     *  so the cached `<v>` — frozen when the file was last saved — doesn't
     *  show a stale date. */
    formula?: string;
    /** Whether this cell displays its phonetic hint (furigana). The parser
     *  resolves it as `cell/@ph ?? row/@ph ?? false` — the per-cell `<c ph>`
     *  (ECMA-376 §18.3.1.4) wins when present (an explicit `ph="0"` overrides an
     *  enabled row), otherwise the row-level `<row ph>` (§18.3.1.73) is inherited,
     *  otherwise the schema default (false). Omitted on the wire when false, so
     *  read as `showPhonetic ?? false`. A cell whose String Item carries `<rPh>`
     *  runs still shows NO furigana unless the resolved value is true. */
    showPhonetic?: boolean;
}

export declare interface CellAddress {
    row: number;
    col: number;
}

export declare interface CellFill {
    patternType: string;
    fgColor: string | null;
    bgColor: string | null;
    /** Set when the style's `<fill>` was a `<gradientFill>`; patternType stays "none". */
    gradient?: GradientFillSpec | null;
}

export declare interface CellFont {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    size: number;
    color: string | null;
    name: string | null;
    /** ECMA-376 §18.4.13 ST_UnderlineValues — see RunFont.underlineStyle. */
    underlineStyle?: string;
    /** ECMA-376 §18.4.6 ST_VerticalAlignRun on a cell-level <font>. */
    vertAlign?: 'superscript' | 'subscript';
}

export declare interface CellRange {
    anchor: CellAddress;
    active: CellAddress;
    mode: SelectionMode_2;
}

declare interface CellRange_2 {
    top: number;
    left: number;
    bottom: number;
    right: number;
}

export declare type CellValue = {
    type: 'empty';
} | {
    type: 'text';
    text: string;
    runs?: Run[];
    /** ECMA-376 §18.4.6 phonetic runs (furigana) carried over from the
     *  resolved String Item. Present for inline strings, and populated by
     *  {@link resolveSharedStrings} for shared-string cells. Absent when the
     *  string has no furigana. */
    phoneticRuns?: PhoneticRun[];
    /** ECMA-376 §18.4.3 phonetic display properties (font index / char set /
     *  alignment) for the furigana above. Absent when the `<si>` had no
     *  `<phoneticPr>`. */
    phoneticPr?: PhoneticProperties;
} | {
    type: 'number';
    number: number;
} | {
    type: 'bool';
    bool: boolean;
} | {
    type: 'error';
    error: string;
}
/** Shared-string reference into `ParsedWorkbook.sharedStrings` (ECMA-376
*  §18.4.8). Resolved to `{ type: 'text', ... }` by the workbook before the
*  renderer (or any other consumer) sees it, so downstream code never
*  encounters this variant. */
| {
    type: 'shared';
    si: number;
};

export declare interface CellXf {
    fontId: number;
    fillId: number;
    borderId: number;
    numFmtId: number;
    alignH: string | null;
    alignV: string | null;
    wrapText: boolean;
    /** Indentation level (each level ≈ 3 characters, ECMA-376 §18.8.44) */
    indent?: number;
    /** Text rotation: 1–90 = counter-clockwise °, 91–180 = (val−90)° clockwise, 255 = stacked */
    textRotation?: number;
    shrinkToFit?: boolean;
    /** `<alignment readingOrder>` (ECMA-376 §18.8.1) — 0 = context (default),
     *  1 = LTR, 2 = RTL. Drives canvas `direction`. */
    readingOrder?: number;
}

export declare interface CfIcon {
    iconSet: string;
    iconId: number;
}

export declare type CfRule = {
    type: 'cellIs';
    operator: string;
    formulas: string[];
    dxfId: number | null;
    priority: number;
} | {
    type: 'expression';
    formula: string;
    dxfId: number | null;
    priority: number;
    stopIfTrue: boolean;
} | {
    type: 'colorScale';
    stops: CfStop[];
    priority: number;
} | {
    type: 'dataBar';
    color: string;
    min: CfValue;
    max: CfValue;
    priority: number;
    gradient: boolean;
} | {
    type: 'top10';
    top: boolean;
    percent: boolean;
    rank: number;
    dxfId: number | null;
    priority: number;
} | {
    type: 'aboveAverage';
    aboveAverage: boolean;
    equalAverage?: boolean;
    stdDev?: number;
    dxfId: number | null;
    priority: number;
} | {
    type: 'iconSet';
    iconSet: string;
    cfvos: CfValue[];
    reverse: boolean;
    priority: number;
    customIcons?: CfIcon[];
} | {
    type: 'other';
    kind: string;
    priority: number;
};

export declare interface CfStop {
    kind: string;
    value: string | null;
    color: string;
}

export declare interface CfValue {
    kind: string;
    value: string | null;
}

export declare interface ChartAnchor {
    fromCol: number;
    fromColOff: number;
    fromRow: number;
    fromRowOff: number;
    toCol: number;
    toColOff: number;
    toRow: number;
    toRowOff: number;
    /** The chart payload, already in the canonical {@link ChartModel} shape the
     *  Rust parser emits. The parser adapts its internal parse structure into
     *  `ChartModel` (formerly the TS `adaptChartData`); this is passed straight
     *  to `renderChart`. */
    chart: ChartModel;
}

export declare interface ChartDataLabelOverride {
    idx: number;
    /** Empty string = label deleted (skip drawing). */
    text: string;
    /** "l"|"r"|"t"|"b"|"ctr"|"outEnd"|"bestFit". undefined = inherit. */
    position?: string;
    fontColor?: string;
    fontSizeHpt?: number;
    /** `<a:defRPr b="1">` inside the per-idx rich text. */
    fontBold?: boolean;
    /** Per-point callout box (`<c:dLbl><c:spPr>`, ECMA-376 §21.2.2.47/§21.2.2.197):
     *  overrides the series-default box for this one slice. */
    labelBox?: ChartLabelBox;
    /**
     * Per-point label-content flags (`<c:dLbl>` §21.2.2.47 carries the same
     * show-flag group as the series `<c:dLbls>` §21.2.2.49: §21.2.2.189
     * `<c:showVal>`, §21.2.2.177 `<c:showCatName>`, §21.2.2.180 `<c:showSerName>`,
     * §21.2.2.187 `<c:showPercent>`). When present they OVERRIDE the series-level
     * defaults for that one point (e.g. sample-14 slide-7's pie sets
     * `showCatName=0 showPercent=1` per slice while the series default is
     * `showCatName=1`, so each label is percent only). undefined = inherit the
     * series default for that flag.
     */
    showVal?: boolean;
    showCatName?: boolean;
    showSerName?: boolean;
    showPercent?: boolean;
    /**
     * `<c:dLbl><c:delete val="1"/>` (ECMA-376 §21.2.2.43) — the point's label is
     * removed. Distinguishes a genuine delete from a `<c:dLbl>` that only carries
     * style / flag overrides with no `<c:tx>` (both otherwise present as
     * `text === ''`). true = skip the label; undefined/absent = not deleted.
     */
    deleted?: boolean;
}

export declare interface ChartDataPointOverride {
    idx: number;
    /** Resolved fill hex (no `#`). */
    color?: string;
    markerSymbol?: string;
    markerSize?: number;
    markerFill?: string;
    markerLine?: string;
    /**
     * `<c:dPt><c:explosion val>` (ECMA-376 §21.2.2.61) — the amount this
     * pie/doughnut slice is moved out from the center. The schema type is
     * `CT_UnsignedInt` (unbounded `xsd:unsignedInt`); the spec text only says
     * "the amount the data point shall be moved from the center of the pie"
     * and does not itself define units or a 0–100 range. We treat it as a
     * de-facto percentage of the outer radius (0–100 typical), matching
     * Office's UI (the Point Explosion slider caps at 100%) rather than a
     * spec-mandated bound. undefined/absent = 0 (no explosion, flush with the
     * ring). Only consulted by the pie/doughnut renderer.
     */
    explosion?: number;
}

export declare interface ChartErrBars {
    /** "x" | "y". */
    dir: string;
    /** "plus" | "minus" | "both". */
    barType: string;
    plus: (number | null)[];
    minus: (number | null)[];
    noEndCap: boolean;
    /** Resolved hex (no `#`). */
    color?: string;
    lineWidthEmu?: number;
    /** "solid"|"dash"|"dot"|"dashDot"|... */
    dash?: string;
}

/**
 * One box-and-whisker series (chartEx `boxWhisker`, MS 2014 chartex ext). Each
 * `<cx:series>` references its own raw sample points via `<cx:dataId>`; the
 * parser groups them by category and threads the `<cx:layoutPr>` flags. The
 * renderer derives the statistics.
 */
declare interface ChartexBoxSeries {
    /** Series display name (`<cx:tx><cx:v>`). */
    name: string;
    /** Fill (hex, no '#') — theme accent cycled by series index. null = fall
     *  back to the renderer palette. */
    color?: string | null;
    /** Raw sample values grouped by category (outer = category index parallel to
     *  {@link ChartexBoxWhisker.categories}, inner = the points in that group). */
    valuesByCategory: number[][];
    /** `<cx:visibility meanMarker>` — draw the mean `×`. */
    meanMarker: boolean;
    /** `<cx:visibility meanLine>` — draw a mean connector line across categories. */
    meanLine: boolean;
    /** `<cx:visibility outliers>` — draw outlier points. */
    showOutliers: boolean;
    /** `<cx:visibility nonoutliers>` — draw the interior (non-outlier) sample
     *  points as jittered dots on top of the box. Flag parsed; interior-dot
     *  rendering is pending a fixture that enables it (every sample-24 series
     *  ships `nonoutliers="0"`, so there is nothing to verify against yet). */
    showNonoutliers: boolean;
    /** `<cx:statistics quartileMethod>` — "exclusive" (Excel default) | "inclusive". */
    quartileMethod: string;
}

/** A chartEx box-and-whisker chart: unique categories + one series per column. */
declare interface ChartexBoxWhisker {
    /** Unique category labels in first-seen order. */
    categories: string[];
    /** One entry per `<cx:series>`. */
    series: ChartexBoxSeries[];
}

/** A chartEx sunburst: the flat rows the renderer folds into a ring tree. */
declare interface ChartexSunburst {
    rows: ChartexSunburstRow[];
}

/**
 * One row of a chartEx `sunburst`: the branch→…→leaf label chain (empty
 * trailing segments trimmed) and its size value.
 */
declare interface ChartexSunburstRow {
    /** Label chain root→leaf. */
    path: string[];
    /** `<cx:numDim type="size">` value attaching to the deepest node in `path`. */
    size: number;
}

/** Callout-box style for a pie/doughnut data label — the white (or themed)
 *  rounded rectangle with a thin border Word draws around a `bestFit` label
 *  placed outside its slice. From the label's `<c:spPr>` (§21.2.2.197). All
 *  fields optional: absent → transparent / unbordered. Mirror of Rust
 *  `ChartLabelBox`. */
declare interface ChartLabelBox {
    /** `<a:solidFill>` resolved hex (no `#`). Box background. */
    fill?: string;
    /** `<a:ln><a:solidFill>` resolved hex (no `#`). Border stroke. */
    borderColor?: string;
    /** `<a:ln w>` border width in EMU (12700 EMU = 1 pt). */
    borderWidthEmu?: number;
}

/**
 * `<c:manualLayout>` block. Fractions are of the chart-space rect.
 * `xMode`/`yMode`: "edge" = absolute fraction from top-left, "factor" =
 * fraction offset from default position.
 */
export declare interface ChartManualLayout {
    xMode: string;
    yMode: string;
    layoutTarget?: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
}

export declare interface ChartModel {
    chartType: ChartType;
    title: string | null;
    categories: string[];
    series: ChartSeries[];
    /** Show data labels on bars / points / slices. */
    showDataLabels: boolean;
    /** Explicit Y-axis minimum (OOXML `<c:valAx><c:min>`). */
    valMin: number | null;
    /** Explicit Y-axis maximum (OOXML `<c:valAx><c:max>`). */
    valMax: number | null;
    catAxisTitle: string | null;
    valAxisTitle: string | null;
    /** `<c:catAx><c:delete val="1"/>`. */
    catAxisHidden: boolean;
    /** `<c:valAx><c:delete val="1"/>`. */
    valAxisHidden: boolean;
    /** `<c:catAx><c:spPr><a:ln><a:noFill>` — hide just the axis LINE; labels
     *  and tick marks still render. Distinct from `catAxisHidden` (which
     *  removes everything via `<c:delete val="1"/>`). */
    catAxisLineHidden: boolean;
    /** `<c:valAx><c:spPr><a:ln><a:noFill>` — hide just the axis LINE; labels
     *  and tick marks still render. */
    valAxisLineHidden: boolean;
    /** Hex without '#'. From `<c:plotArea><c:spPr><a:solidFill>`. */
    plotAreaBg: string | null;
    /** Outer chartSpace background (hex without '#'). null when noFill/absent. */
    chartBg: string | null;
    /** True when `<c:legend>` is declared in the chart XML. False = no legend. */
    showLegend: boolean;
    /** `<c:legend><c:legendPos val>` — "r"|"l"|"t"|"b"|"tr". null = default (r). */
    legendPos: 'r' | 'l' | 't' | 'b' | 'tr' | null;
    /** `<c:catAx><c:crossBetween val="..."/>`. "between" inserts 0.5-step padding
     *  on each end of the category axis; "midCat" anchors endpoints to the axes. */
    catAxisCrossBetween: 'between' | 'midCat' | string;
    /** `<c:valAx><c:majorTickMark>`. ECMA-376 default is "cross". */
    valAxisMajorTickMark: 'cross' | 'out' | 'in' | 'none' | string;
    /** `<c:catAx><c:majorTickMark>`. */
    catAxisMajorTickMark: 'cross' | 'out' | 'in' | 'none' | string;
    /** `<c:valAx | catAx><c:minorTickMark>`. ECMA-376 default is "none". */
    valAxisMinorTickMark?: 'cross' | 'out' | 'in' | 'none' | string | null;
    catAxisMinorTickMark?: 'cross' | 'out' | 'in' | 'none' | string | null;
    /** Title font size in OOXML hundredths of a point (1600 = 16pt). null = default. */
    titleFontSizeHpt: number | null;
    /** Title font color as a hex string without '#' (e.g. "1B4332"). null = default. */
    titleFontColor: string | null;
    /** Title font family from `<a:latin typeface>` (ECMA-376 §20.1.4.2.24). null = default. */
    titleFontFace: string | null;
    /** `<c:catAx><c:txPr>` font size (hpt). null = fall back to proportional default. */
    catAxisFontSizeHpt: number | null;
    /** `<c:valAx><c:txPr>` font size (hpt). null = fall back to proportional default. */
    valAxisFontSizeHpt: number | null;
    /** `<c:catAx><c:txPr>…<a:solidFill>` tick-label color (hex without '#').
     *  null = renderer default. Lets templates color category labels gray. */
    catAxisFontColor?: string | null;
    /** `<c:valAx><c:txPr>…<a:solidFill>` tick-label color (hex without '#'). */
    valAxisFontColor?: string | null;
    /** `<c:dLbls><c:txPr>` font size (hpt) for data-point value labels. */
    dataLabelFontSizeHpt: number | null;
    /** Waterfall subtotal category indices. */
    subtotalIndices: number[];
    /** `<c:legend><c:manualLayout>` absolute placement fractions of the chart
     *  space (ECMA-376 §21.2.2.31). Overrides the default side-based legend
     *  rectangle while still letting `legendPos` decide which side of the plot
     *  gets the reserved band. null = use default layout. */
    legendManualLayout?: LegendManualLayout | null;
    /**
     * `<c:valAx><c:numFmt@formatCode>` — format code applied to value-axis tick
     * labels (ECMA-376 §21.2.2.21). null = plain numeric formatting.
     */
    valAxisFormatCode?: string | null;
    /**
     * `<c:barChart><c:gapWidth>` — space between category groups as a
     * percentage of bar width (ECMA-376 §21.2.2.13). Default per spec is 150.
     * null = renderer default.
     */
    barGapWidth?: number | null;
    /**
     * `<c:barChart><c:overlap>` — signed percentage overlap between bars in the
     * same category cluster (ECMA-376 §21.2.2.25). Negative = gap, positive =
     * overlap, 0 = flush. Range [-100, 100]. null = renderer default (0).
     */
    barOverlap?: number | null;
    /**
     * `<c:dLbls><c:dLblPos>` — data label position (ECMA-376 §21.2.2.16).
     * "ctr"|"inBase"|"inEnd"|"outEnd"|"l"|"r"|"t"|"b"|"bestFit" etc.
     */
    dataLabelPosition?: string | null;
    /** Hex (no `#`) for data label text, resolved from `<c:dLbls><c:txPr>`. */
    dataLabelFontColor?: string | null;
    /**
     * `<c:dLbls><c:numFmt@formatCode>` — chart-level override for data label
     * number format (ECMA-376 §21.2.2.35). When absent, `valFormatCode` on each
     * series is used.
     */
    dataLabelFormatCode?: string | null;
    /** `<c:title>...defRPr@b>` chart title bold flag. */
    titleFontBold?: boolean | null;
    /** `<c:catAx><c:txPr>...defRPr@b>` X-axis tick label bold flag. */
    catAxisFontBold?: boolean | null;
    /** `<c:valAx><c:txPr>...defRPr@b>` Y-axis tick label bold flag. */
    valAxisFontBold?: boolean | null;
    /** `<c:catAx><c:title>` run-prop font size (hpt). Distinct from
     *  `catAxisFontSizeHpt` (tick labels). null = renderer default. */
    catAxisTitleFontSizeHpt?: number | null;
    /** `<c:catAx><c:title>` run-prop bold flag. null = not bold. */
    catAxisTitleFontBold?: boolean | null;
    /** `<c:catAx><c:title>` run-prop color (hex without '#'). null = default. */
    catAxisTitleFontColor?: string | null;
    /** `<c:valAx><c:title>` run-prop font size (hpt). null = renderer default. */
    valAxisTitleFontSizeHpt?: number | null;
    /** `<c:valAx><c:title>` run-prop bold flag. null = not bold. */
    valAxisTitleFontBold?: boolean | null;
    /** `<c:valAx><c:title>` run-prop color (hex without '#'). null = default. */
    valAxisTitleFontColor?: string | null;
    /** `<c:catAx><c:txPr>…<a:latin typeface>` tick-label font. */
    catAxisFontFace?: string | null;
    /** `<c:valAx><c:txPr>…<a:latin typeface>` tick-label font. */
    valAxisFontFace?: string | null;
    /** `<c:catAx><c:title>…<a:latin typeface>` axis-title font. */
    catAxisTitleFontFace?: string | null;
    /** `<c:valAx><c:title>…<a:latin typeface>` axis-title font. */
    valAxisTitleFontFace?: string | null;
    /** `<c:dLbls><c:txPr>…<a:latin typeface>` data-label font. */
    dataLabelFontFace?: string | null;
    /** `<c:legend><c:txPr>…<a:latin typeface>` legend font. */
    legendFontFace?: string | null;
    /** `<c:legend><c:txPr>…<a:solidFill>` legend text color (hex without '#'). */
    legendFontColor?: string | null;
    /** `<c:legend><c:txPr>` legend font size (OOXML hundredths of a point). */
    legendFontSizeHpt?: number | null;
    /** `<c:legend><c:txPr>…defRPr@b` legend bold flag. */
    legendFontBold?: boolean | null;
    /**
     * Theme font-scheme faces (`<a:fontScheme>`, ECMA-376 §20.1.4.2). Latin
     * heading (majorFont) and body (minorFont) typefaces, used as the fallback
     * for any chart text element whose own `<c:txPr>` supplies no `<a:latin>`.
     * null when the theme is not threaded to the chart (then the renderer's
     * built-in sans-serif remains, byte-stable). Axis titles / chart title use
     * the major (heading) face; tick labels / data labels / legend use the
     * minor (body) face — matching Office's default chart text styling.
     */
    themeMajorFontLatin?: string | null;
    themeMinorFontLatin?: string | null;
    /** Explicit chart border color (hex without '#') from
     *  `<c:chartSpace><c:spPr><a:ln><a:solidFill><a:srgbClr>`. Only set when the
     *  XML explicitly declares a paintable line; null otherwise (no default
     *  border is drawn). */
    chartBorderColor?: string | null;
    /** `<c:chartSpace><c:spPr><a:ln@w>` border width in EMU. null = 1px hairline
     *  when a color is present. */
    chartBorderWidthEmu?: number | null;
    /**
     * `<c:catAx><c:crosses val>` (`autoZero` | `min` | `max`). Drives the Y
     * coordinate where the X axis is drawn. Default `autoZero` puts the X
     * axis at y=0 — that's how Excel "Project Timeline" templates split
     * milestones (positive Y) above and tasks (negative Y) below the axis.
     */
    catAxisCrosses?: string | null;
    /** `<c:catAx><c:crossesAt val>` — explicit numeric override for the
     *  crossing point. Takes precedence over `catAxisCrosses`. */
    catAxisCrossesAt?: number | null;
    valAxisCrosses?: string | null;
    valAxisCrossesAt?: number | null;
    /** Axis line color (hex without `#`) and width in EMU from
     *  `<c:catAx|valAx><c:spPr><a:ln>`. */
    catAxisLineColor?: string | null;
    catAxisLineWidthEmu?: number | null;
    valAxisLineColor?: string | null;
    valAxisLineWidthEmu?: number | null;
    /**
     * `<c:catAx><c:numFmt@formatCode>` (or scatter X-axis valAx). When set,
     * the renderer formats X-axis tick labels with this code (e.g. dates).
     */
    catAxisFormatCode?: string | null;
    /**
     * `<c:catAx><c:scaling><c:min/max>` — explicit X-axis range. Used by
     * scatter / bubble charts whose X axis is numeric. null = derive from
     * data extents.
     */
    catAxisMin?: number | null;
    catAxisMax?: number | null;
    /**
     * `<c:title><c:layout><c:manualLayout>` (ECMA-376 §21.2.2.27) absolute
     * placement for the chart title.
     */
    titleManualLayout?: ChartManualLayout | null;
    /**
     * `<c:plotArea><c:layout><c:manualLayout>` absolute placement for the
     * plot area. `layoutTarget="inner"` (default) describes the inner plot
     * rect (no axes / labels); `outer` describes the outer rect (axes
     * included).
     */
    plotAreaManualLayout?: ChartManualLayout | null;
    /**
     * `<c:scatterChart><c:scatterStyle val>` (ECMA-376 §21.2.2.42). Drives
     * whether scatter charts connect points with lines and whether those
     * lines are smoothed. Values: "marker" (markers only — Excel default
     * "Scatter"), "line" / "lineMarker" (straight segments), "smooth" /
     * "smoothMarker" (cubic Bézier through points), "lineNoMarker",
     * "smoothNoMarker". null = renderer default ("marker"). Only consulted
     * for `chartType === "scatter"`; bubble ignores it.
     */
    scatterStyle?: string | null;
    /**
     * `<c:radarChart><c:radarStyle val>` (ECMA-376 §21.2.3.10). Controls
     * whether radar series render as line + markers ("standard" / "marker")
     * or as a closed polygon with area fill ("filled"). null = default
     * ("standard" — line, no fill). Only consulted for `chartType === "radar"`.
     */
    radarStyle?: string | null;
    /**
     * Secondary value axis for combo charts (bar + line). When present, series
     * with `useSecondaryAxis` are plotted against this axis's independent scale
     * and the axis is drawn on the right edge of the plot. null/absent = single
     * value axis (the common case). See {@link SecondaryValueAxis}.
     */
    secondaryValAxis?: SecondaryValueAxis | null;
    /**
     * `<c:date1904>` (ECMA-376 §21.2.2.38). When true the chart's serial
     * date-times resolve against the 1904 date system (base 1904-01-01) instead
     * of the default 1900 system. Threaded to the date formatters for date-axis
     * category labels and value-axis tick labels. Omitted/false ⇒ 1900 system.
     * Note: per §21.2.2.38 the element's `val` defaults to true when present but
     * the attribute is omitted, so `<c:date1904/>` alone means date1904=true.
     */
    date1904?: boolean;
    /**
     * `<c:doughnutChart><c:holeSize val>` (ECMA-376 §21.2.2.60,
     * `ST_HoleSizePercent` §21.2.3.55) — the doughnut hole diameter as a
     * percentage 1–90 of the outer diameter. Ignored for pie (which has no
     * hole). null/undefined = use the renderer's doughnut default when the
     * element is absent. Note the ECMA `CT_HoleSize` schema default is 10%, but
     * a real doughnut file always writes an explicit `<c:holeSize>` (Excel /
     * PowerPoint emit 50–75%); the renderer falls back to 50% only for the
     * pathological absent case.
     */
    holeSize?: number | null;
    /**
     * `<c:pieChart | doughnutChart><c:firstSliceAng val>` (ECMA-376 §21.2.2.52,
     * `ST_FirstSliceAng` §21.2.3.15) — the angle in degrees (0–360, clockwise
     * from the 12 o'clock position) at which the first slice begins.
     * null/undefined = 0 (start at 12 o'clock), which matches the renderer's
     * historical fixed −90° (canvas up) start.
     */
    firstSliceAngle?: number | null;
    /**
     * `<c:chartSpace><c:chart><c:dispBlanksAs val>` (ECMA-376 §21.2.2.42,
     * `ST_DispBlanksAs` §21.2.3.10) — how blank (null) cells are plotted on
     * line/area charts:
     *   - "gap"  → leave a gap (break the line). The renderer's historical
     *              behavior and the model default when the element is absent.
     *   - "zero" → plot the blank as the value 0 (the point drops to the axis).
     *   - "span" → skip the blank but connect its neighbours with a straight
     *              line (bridge the gap).
     * Note the XSD `@val` default is "zero" (applies when `<c:dispBlanksAs/>` is
     * present but the attribute is omitted); when the ELEMENT is absent entirely
     * Office falls back to "gap", which is what we model as the default. Only
     * consulted for the line and area families. null/undefined = "gap".
     */
    dispBlanksAs?: string | null;
    /**
     * `<c:valAx><c:majorGridlines>` presence (ECMA-376 §21.2.2.100). `false` when
     * the value axis exists but omits the element (Office suppresses value
     * gridlines). null/undefined ⇒ the renderer's historical always-on value
     * gridlines (byte-stable). `true` is redundant with the default but honored.
     */
    valAxisMajorGridlines?: boolean | null;
    /**
     * `<c:catAx><c:majorGridlines>` presence (§21.2.2.100). `true` turns on
     * category-axis gridlines (Office omits them by default). null/undefined/false
     * ⇒ no category gridlines (the historical default, byte-stable).
     */
    catAxisMajorGridlines?: boolean | null;
    /**
     * `<c:valAx><c:majorGridlines><c:spPr><a:ln><a:solidFill>` resolved gridline
     * color (hex without `#`) — ECMA-376 §21.2.2.100. When set, the value-axis
     * major gridlines are stroked in this color instead of the renderer's faint
     * `#e0e0e0` default (e.g. sample-1 slide 5's `accent3` gridlines). null/absent
     * ⇒ the historical default (byte-stable).
     */
    valAxisGridlineColor?: string | null;
    /**
     * `<c:valAx><c:majorGridlines><c:spPr><a:ln w>` gridline width in EMU. When
     * set, the value-axis gridline stroke width is derived from this (floored so a
     * hairline stays visible). null/absent ⇒ the renderer's 0.5 px default.
     */
    valAxisGridlineWidthEmu?: number | null;
    /**
     * `<c:catAx><c:majorGridlines><c:spPr><a:ln><a:solidFill>` resolved gridline
     * color (hex without `#`). Only meaningful when {@link catAxisMajorGridlines}
     * is on. null/absent ⇒ the faint default.
     */
    catAxisGridlineColor?: string | null;
    /** `<c:catAx><c:majorGridlines><c:spPr><a:ln w>` gridline width in EMU. */
    catAxisGridlineWidthEmu?: number | null;
    /** `<c:valAx><c:minorGridlines>` presence (§21.2.2.109). Only drawn when a
     *  minor step is resolvable (see {@link valAxisMinorUnit}). */
    valAxisMinorGridlines?: boolean | null;
    /**
     * `<c:valAx><c:majorUnit val>` (§21.2.2.103) — explicit distance between major
     * gridlines/ticks, overriding the Excel-style auto "nice" step. null/undefined
     * ⇒ auto step (byte-stable).
     */
    valAxisMajorUnit?: number | null;
    /** `<c:valAx><c:minorUnit val>` (§21.2.2.112) — explicit minor step. Drives
     *  minor gridlines/ticks when present. null ⇒ no minor divisions. */
    valAxisMinorUnit?: number | null;
    /**
     * `<c:valAx><c:scaling><c:logBase val>` (§21.2.2.98, `ST_LogBase` §21.2.3.25)
     * — logarithmic value-axis base (>= 2). When set, values map to pixels in log
     * space and gridlines fall on powers of the base. null/undefined ⇒ linear
     * (byte-stable).
     */
    valAxisLogBase?: number | null;
    /**
     * `<c:valAx><c:scaling><c:orientation val>` (§21.2.2.130, `ST_Orientation`
     * §21.2.3.30) — "minMax" (normal) | "maxMin" (reversed, so the value axis runs
     * top→bottom max→min). null/undefined/"minMax" ⇒ normal (byte-stable).
     */
    valAxisOrientation?: 'minMax' | 'maxMin' | string | null;
    /** `<c:catAx><c:scaling><c:orientation val>` — "maxMin" reverses the category
     *  axis left↔right. null/"minMax" ⇒ normal. */
    catAxisOrientation?: 'minMax' | 'maxMin' | string | null;
    /**
     * `<c:catAx><c:tickLblPos val>` (§21.2.2.207, `ST_TickLblPos` §21.2.3.47) —
     * "nextTo" (default) | "low" | "high" | "none". "none" hides the category tick
     * labels. null/undefined ⇒ nextTo (byte-stable).
     */
    catAxisTickLabelPos?: string | null;
    /** `<c:valAx><c:tickLblPos val>` (§21.2.2.207). "none" hides value tick labels. */
    valAxisTickLabelPos?: string | null;
    /**
     * `<c:catAx><c:txPr><a:bodyPr rot>` (DrawingML `ST_Angle`, 60000ths of a
     * degree) — category tick-label rotation. e.g. -2700000 = -45°. null/undefined
     * /0 ⇒ horizontal labels (byte-stable).
     */
    catAxisLabelRotation?: number | null;
    /**
     * `<c:stockChart><c:hiLowLines>` presence (ECMA-376 §21.2.2.60). When true
     * the stock renderer draws a vertical line spanning each category's low↔high
     * value. Only set for `chartType === "stock"`; null/undefined on every other
     * chart type (byte-stable).
     */
    stockHiLowLines?: boolean | null;
    /**
     * `<c:hiLowLines><c:spPr><a:ln><a:solidFill>` resolved color (hex, no `#`).
     * null = the renderer's default gray hi-lo line.
     */
    stockHiLowLineColor?: string | null;
    /**
     * `<c:stockChart><c:upDownBars>` presence (ECMA-376 §21.2.2.227). Parsed so a
     * stock file carrying open-close up/down bars is recognized; the renderer does
     * NOT yet draw them (tracked follow-up). null/undefined when absent.
     */
    stockUpDownBars?: boolean | null;
    /**
     * Structured box-and-whisker data (`chartType === 'boxWhisker'`). Present
     * ONLY for boxWhisker charts; null/absent otherwise so the flat
     * `categories`/`series` model the other chartEx renderers consume is
     * untouched. The renderer computes quartiles / mean / whiskers / outliers.
     */
    chartexBox?: ChartexBoxWhisker | null;
    /**
     * Structured sunburst hierarchy (`chartType === 'sunburst'`). Present ONLY
     * for sunburst charts; null/absent otherwise.
     */
    chartexSunburst?: ChartexSunburst | null;
    /**
     * Theme accent palette (`accent1..6`, hex without '#') for chartEx charts
     * that color by branch/series index (boxWhisker series, sunburst branches).
     * null/absent when the resolver supplies no default palette (pptx); the
     * renderer then falls back to its own `CHART_PALETTE`.
     */
    chartexAccents?: string[] | null;
}

export declare interface ChartSeries {
    name: string;
    /** Hex without '#'. null = fall back to palette. */
    color: string | null;
    /** Numeric values; null = missing data point. */
    values: (number | null)[];
    /**
     * Per-data-point colors (pie / doughnut). Hex without '#'. null inside the
     * array = use palette for that slice. Omit entirely for non-pie series.
     */
    dataPointColors?: (string | null)[] | null;
    /**
     * Per-data-point data-label text colors. Used by chartEx (`<cx:dataLabel idx>`)
     * to override label colour per bar — sample-2's waterfall paints negative
     * △ values in red while positive values stay black. Null inside the array =
     * fall back to the chart-level `dataLabelFontColor`.
     */
    dataLabelColors?: (string | null)[] | null;
    /**
     * Series-level data-label text colour (`<c:ser><c:dLbls><c:txPr>…solidFill`,
     * ECMA-376 §21.2.2.216). Hex without '#'. Stacked-bar charts colour each
     * segment's label independently (e.g. white on the dark segment, black on
     * the light one), which a single chart-level `dataLabelFontColor` can't
     * express. Takes precedence over `dataLabelFontColor`; null = no override.
     */
    labelColor?: string | null;
    /**
     * Mixed chart: per-series chart type override. Currently only "line" (XLSX
     * and PPTX combo charts) is honoured; other values are treated as the
     * chart's primary type.
     */
    seriesType?: string | null;
    /**
     * Combo chart: this series is plotted against the SECONDARY value axis
     * (`ChartModel.secondaryValAxis`) — the `<c:valAx>` with `axPos="r"` /
     * `<c:crosses val="max">`. When false/absent the series uses the primary
     * (left) value-axis scale. PowerPoint's "Revenue vs. gross margin" combo
     * (sample-14 slide-8) puts the margin line on a 0–100% secondary axis.
     */
    useSecondaryAxis?: boolean | null;
    /**
     * Scatter-only X values (as strings). When null the series uses
     * `ChartModel.categories` as X.
     */
    categories?: string[] | null;
    /**
     * Resolved marker visibility for line/scatter series. ECMA-376 §21.2.2.32
     * `<c:marker><c:symbol>` defaults to "none" for line charts unless the
     * chart-level `<c:marker val="1"/>` or a per-series symbol opts in. When
     * undefined/null the renderer uses its own default (visible) so callers
     * that don't parse markers (e.g. pptx today) keep their existing behavior.
     */
    showMarker?: boolean | null;
    /**
     * Excel number-format code for this series' values (ECMA-376 §21.2.2.37,
     * `<c:val>/<c:numRef>/<c:formatCode>`). Used to format data labels when the
     * chart-level `<c:dLbls><c:numFmt>` is not set. null = no series-level code.
     */
    valFormatCode?: string | null;
    /**
     * `<c:marker><c:symbol val>` (ECMA-376 §21.2.2.32) — point marker shape.
     * One of "circle"|"square"|"diamond"|"triangle"|"x"|"plus"|"star"|
     * "dot"|"dash"|"picture"|"none". null = renderer default (circle when
     * showMarker is true).
     */
    markerSymbol?: string | null;
    /**
     * `<c:marker><c:size val>` (ECMA-376 §21.2.2.34) — marker side length in
     * points. null = renderer default (~5 pt).
     */
    markerSize?: number | null;
    /** `<c:marker><c:spPr><a:solidFill>` resolved hex (no `#`). */
    markerFill?: string | null;
    /** `<c:marker><c:spPr><a:ln><a:solidFill>` resolved hex (no `#`). */
    markerLine?: string | null;
    /**
     * Per-data-point overrides (ECMA-376 §21.2.2.39 `<c:dPt>`). Keyed by point
     * index. Any unset field falls back to the series-level value.
     */
    dataPointOverrides?: ChartDataPointOverride[] | null;
    /**
     * Per-data-point custom labels (ECMA-376 §21.2.2.45 `<c:dLbl idx>`).
     * `text` is the resolved plain string — `<a:fld type="CELLRANGE">`
     * placeholders are already substituted at parse time. An empty string
     * means the point's label was deleted with `<c:delete val="1"/>` and
     * the renderer should skip it.
     */
    dataLabelOverrides?: ChartDataLabelOverride[] | null;
    /**
     * Series-level `<c:dLbls>` block (showVal / showSerName / position).
     * Applied to every point lacking its own `<c:dLbl>` override.
     */
    seriesDataLabels?: ChartSeriesDataLabels | null;
    /**
     * `<c:errBars>` per-series error bars (ECMA-376 §21.2.2.20). Up to two
     * (one per direction). Plus / minus deltas are absolute per-point values
     * regardless of `errValType`.
     */
    errBars?: ChartErrBars[] | null;
    /**
     * `<c:bubbleSize>` per-point sizes for bubble charts (ECMA-376 §21.2.2.4).
     * Drives marker radius — renderer treats the values as areas (radius
     * scales by sqrt) so visual area is proportional to value, matching
     * Excel. null / empty array = uniform marker size. Ignored for non-bubble
     * series.
     */
    bubbleSizes?: (number | null)[] | null;
    /**
     * `<c:ser><c:smooth val>` (ECMA-376 §21.2.2.194) — line/area series flag
     * requesting a smoothed (spline) curve through the points instead of straight
     * segments. Only consulted for the line and area families (scatter carries its
     * smoothing in `ChartModel.scatterStyle`). null/undefined/false = straight
     * polyline (the default; byte-stable for series that never set it).
     */
    smooth?: boolean | null;
    /**
     * `<c:ser><c:trendline>` per-series trendlines (ECMA-376 §21.2.2.211,
     * `CT_Trendline`). A series can carry several (e.g. a linear fit + a moving
     * average). null/undefined/empty = no trendline (the default; byte-stable for
     * series that never declare one).
     */
    trendLines?: ChartTrendline[] | null;
    /**
     * `<c:ser><c:spPr><a:ln><a:noFill/>` (ECMA-376 §21.2.2.198 CT_ShapeProperties
     * → DrawingML §20.1.2.2.24 CT_LineProperties). true when the series connecting
     * line is explicitly turned OFF. For a scatter/line series this OVERRIDES the
     * chart-group `<c:scatterStyle>` (§21.2.2.42) / line default — Excel and
     * PowerPoint draw markers only (no connecting line) even when the group style
     * is `lineMarker`. null/undefined = no explicit line-off, so the group default
     * governs (byte-stable for series that carry a paintable line).
     */
    lineHidden?: boolean | null;
}

export declare interface ChartSeriesDataLabels {
    showVal: boolean;
    showCatName: boolean;
    showSerName: boolean;
    showPercent: boolean;
    position?: string;
    fontColor?: string;
    formatCode?: string;
    /** Series-level bold default for data labels. */
    fontBold?: boolean;
    /** Series-level font size for data labels (OOXML hundredths of a point). */
    fontSizeHpt?: number;
    /** Series-default callout box (`<c:dLbls><c:spPr>`, ECMA-376 §21.2.2.49/
     *  §21.2.2.197). When present the pie/doughnut renderer draws Word's boxed
     *  callout layout (box + optional leader line) instead of plain text. */
    labelBox?: ChartLabelBox;
    /** `<c:dLbls><c:showLeaderLines val>` (§21.2.2.183) — draw leader lines from
     *  a pulled-away label back to its slice. Default false. */
    showLeaderLines?: boolean;
    /** `<c:leaderLines><c:spPr><a:ln><a:solidFill>` (§21.2.2.92) resolved hex
     *  (no `#`). undefined → renderer uses a neutral grey. */
    leaderLineColor?: string;
    /** `<c:leaderLines><c:spPr><a:ln w>` leader-line width in EMU. */
    leaderLineWidthEmu?: number;
}

/**
 * `<c:ser><c:trendline>` (ECMA-376 §21.2.2.211). A regression/smoothing curve
 * fitted to the series' data points.
 */
declare interface ChartTrendline {
    /**
     * `<c:trendlineType val>` (§21.2.2.213, `ST_TrendlineType` §21.2.3.50):
     * "linear" | "exp" | "log" | "power" | "poly" | "movingAvg". The renderer
     * currently draws "linear" (least squares) and "movingAvg"; other types parse
     * but are not yet plotted (tracked as a follow-up).
     */
    trendlineType: string;
    /** `<c:order val>` — polynomial order (`poly`, default 2). */
    order?: number | null;
    /** `<c:period val>` — moving-average window (`movingAvg`, default 2). */
    period?: number | null;
    /** `<c:forward val>` — units to extend the line past the last point. */
    forward?: number | null;
    /** `<c:backward val>` — units to extend the line before the first point. */
    backward?: number | null;
    /** `<c:intercept val>` — forced y-intercept (linear/exp). null = free fit. */
    intercept?: number | null;
    /** `<c:dispRSqr val="1">` — show the R² value (label; not yet rendered). */
    dispRSqr?: boolean | null;
    /** `<c:dispEq val="1">` — show the fit equation (label; not yet rendered). */
    dispEq?: boolean | null;
    /** `<c:spPr><a:ln><a:solidFill>` trendline color (hex without '#'). null =
     *  inherit the series color. */
    lineColor?: string | null;
    /** `<c:spPr><a:ln w>` trendline width in EMU. */
    lineWidthEmu?: number | null;
}

/**
 * Canonical chart type vocabulary. Embeds direction (`H` = horizontal) and
 * grouping (`Pct` = percent-stacked) so renderers do not need to inspect
 * separate `barDir`/`grouping` fields.
 */
declare type ChartType = 'line' | 'stackedLine' | 'stackedLinePct' | 'clusteredBar' | 'clusteredBarH' | 'stackedBar' | 'stackedBarH' | 'stackedBarPct' | 'stackedBarHPct' | 'area' | 'stackedArea' | 'stackedAreaPct' | 'pie' | 'doughnut' | 'scatter' | 'bubble' | 'radar' | 'waterfall' | 'stock' | 'boxWhisker' | 'sunburst' | string;

export declare interface ConditionalFormat {
    sqref: CellRange_2[];
    rules: CfRule[];
}

/** @deprecated Use `ChartDataLabelOverride` from @silurus/ooxml-core. */
export declare type DataLabelOverride = ChartDataLabelOverride;

/** @deprecated Use `ChartDataPointOverride` from @silurus/ooxml-core. */
export declare type DataPointOverride = ChartDataPointOverride;

/** One `<dataValidation>` rule (ECMA-376 §18.3.1.33). `type` is the constraint
 *  class (`list` | `whole` | `decimal` | `date` | `time` | `textLength` |
 *  `custom`); `operator` qualifies it (`between` | `notBetween` | `equal` | …).
 *  `formula1` / `formula2` are the operands (for `list`, `formula1` is the
 *  comma-separated literal list or a range/named reference). 1:1 with the Rust
 *  `DataValidation` (serde camelCase). */
export declare interface DataValidation {
    /** Affected cell ranges, verbatim from `@sqref` (space-separated A1 refs). */
    sqref: string;
    /** Constraint class. Absent means the spec default (`none`, no constraint). */
    validationType?: string;
    operator?: string;
    formula1?: string;
    formula2?: string;
    /** `@allowBlank` — empty input is permitted. */
    allowBlank?: boolean;
    promptTitle?: string;
    prompt?: string;
    errorTitle?: string;
    errorMessage?: string;
}

export declare interface DefinedName {
    name: string;
    formula: string;
}

/** ECMA-376 §20.1.8.23 `<a:duotone>` image effect, resolved to its two endpoint
 *  colours (mirrors the shared Rust `ooxml_common::blip::Duotone`). `clr1` is the
 *  dark endpoint (luminance 0), `clr2` the light endpoint (luminance 1); both are
 *  6-char uppercase hex WITHOUT a leading `#`, with per-colour transforms already
 *  applied by the parser. */
export declare interface Duotone {
    clr1: string;
    clr2: string;
}

export declare interface Dxf {
    font: CellFont | null;
    fill: CellFill | null;
    border: Border | null;
    /** Number format override from the dxf (ECMA-376 §18.8.17). When a
     *  conditional-formatting rule matches, this numFmt replaces the cell's own
     *  style numFmt for rendering — e.g. switching a calendar cell from `d` to
     *  `m"月"d"日"` on the first day of each month. */
    numFmt?: NumFmt | null;
}

/** @deprecated Use `ChartErrBars` from @silurus/ooxml-core. */
export declare type ErrBars = ChartErrBars;

/**
 * IX2 public find-result shape, shared by all three viewers.
 *
 * `findText` returns an ordered list of {@link FindMatch}. Every match carries
 * its ordinal position (`matchIndex`, 0-based, document order — the same index
 * `findNext` / `findPrev` cycle through), the matched `text`, and a
 * format-specific `location`. The location is where the three formats
 * legitimately differ — a docx match lives on a page, a pptx match on a slide,
 * an xlsx match in a sheet cell — so `FindMatch` is generic over it rather than
 * forcing an artificial common shape. Each viewer instantiates it with its own
 * location type:
 *
 *   - `DocxViewer.findText` → `FindMatch<DocxMatchLocation>`  ({ page })
 *   - `PptxViewer.findText` → `FindMatch<PptxMatchLocation>`  ({ slide })
 *   - `XlsxViewer.findText` → `FindMatch<XlsxMatchLocation>`  ({ sheet, ref, … })
 *
 * The generic default is `unknown` so `FindMatch` can be referenced without a
 * type argument (e.g. in generic UI code) while each viewer's return type stays
 * precise.
 */
export declare interface FindMatch<Loc = unknown> {
    /** 0-based ordinal among all matches, in document order. This is the index
     *  `findNext`/`findPrev` make active, so a caller can correlate the array it
     *  got from `findText` with the active-match reported by navigation. */
    matchIndex: number;
    /** The text that matched (the query as it appears in the document — its
     *  original case, not the folded form used for case-insensitive matching). */
    text: string;
    /** Where the match is, in the format's own coordinates. */
    location: Loc;
}

/** Options for {@link findMatches}. */
export declare interface FindMatchesOptions {
    /**
     * Match case exactly. Default `false` (case-insensitive, like a browser's
     * find-in-page). IX2 default — an integrator can pass `true`.
     */
    caseSensitive?: boolean;
}

export declare interface GradientFillSpec {
    /** "linear" (default) or "path". */
    gradientType: string;
    /** Rotation in degrees for linear gradients (0 = left→right). */
    degree: number;
    /** Path-gradient bounding box (0..1) — unused for linear. */
    left: number;
    right: number;
    top: number;
    bottom: number;
    stops: {
        position: number;
        color: string;
    }[];
}

/** How {@link XlsxViewer} presents hidden sheets (`<sheet state>`, §18.2.19). */
export declare type HiddenSheetMode = 'show' | 'skip' | 'dim';

export declare interface Hyperlink {
    col: number;
    row: number;
    /** External target (ECMA-376 §18.3.1.47 `r:id`, resolved via worksheet rels).
     *  `null` for a purely internal hyperlink. */
    url: string | null;
    /** Internal target (§18.3.1.47 `location`): a defined name or a cell reference
     *  such as `Sheet1!A1`. Present when the hyperlink navigates within the
     *  workbook rather than to an external URL. */
    location?: string | null;
    /** Optional display text (§18.3.1.47 `display`). Not used for rendering. */
    display?: string | null;
}

/**
 * Shared hyperlink model + URL sanitisation for docx / pptx / xlsx (IX1).
 *
 * All three formats carry the same two ECMA-376 concepts:
 *   - an **external** hyperlink — an absolute URL resolved from a relationship
 *     part target (`document.xml.rels` for docx §17.16.22, the slide rels for
 *     pptx §21.1.2.3.5, the worksheet rels for xlsx §18.3.1.47), with
 *     `TargetMode="External"`.
 *   - an **internal** hyperlink — a jump within the document itself:
 *     docx `w:anchor` -> a `<w:bookmarkStart w:name>` (§17.16.23), pptx
 *     `action="ppaction://hlinksldjump"` -> a slide, xlsx `location` -> a defined
 *     name or a `Sheet!A1` cell reference.
 *
 * The parsers (Rust, one per format) do the format-specific rels lookup and hand
 * each run / shape / cell a {@link HyperlinkTarget}. Everything downstream — the
 * text-layer overlay, the viewer default click behaviour, and any integrator
 * callback — is format-agnostic and consumes this one shape. Keeping the type +
 * the pure `sanitizeHyperlinkUrl` predicate here (not duplicated per package)
 * follows the cross-package unification principle: a scheme-allowlist bug fixed
 * once is fixed everywhere.
 */
/**
 * A resolved hyperlink attached to a run, shape, or cell.
 *
 *   - `external` — `url` is the raw target as authored in the file. It is NOT
 *     guaranteed safe; run it through {@link sanitizeHyperlinkUrl} before
 *     navigating. It is kept verbatim here so an integrator can apply its own
 *     policy (e.g. allow `file:` on a trusted intranet viewer).
 *   - `internal` — `ref` is the in-document destination, verbatim from the file:
 *       docx: the bookmark name (`w:anchor`).
 *       pptx: the internal action (e.g. `ppaction://hlinksldjump`), with the
 *             resolved 0-based `slideIndex` when the rels target names a slide.
 *       xlsx: the `location` string (a defined name or `Sheet1!A1`).
 */
export declare type HyperlinkTarget = {
    kind: 'external';
    url: string;
} | {
    kind: 'internal';
    ref: string;
    slideIndex?: number;
};

/**
 * Image anchored to a rectangle of cells (EMU offsets within the anchor cells).
 * 914400 EMU = 1 inch, 9525 EMU = 1 px @ 96 DPI.
 */
export declare interface ImageAnchor {
    fromCol: number;
    fromColOff: number;
    fromRow: number;
    fromRowOff: number;
    toCol: number;
    toColOff: number;
    toRow: number;
    toRowOff: number;
    /** `twoCellAnchor@editAs` (ECMA-376 §20.5.2.33). `"oneCell"` instructs the
     *  renderer to use `nativeExtCx`/`nativeExtCy` as the size and ignore the
     *  `to` anchor (Excel's "Move but don't size with cells"). Absent ⇒ default
     *  `"twoCell"`. */
    editAs?: string;
    /** `<xdr:pic><xdr:spPr><a:xfrm><a:ext cx cy>` in EMU — the picture's saved
     *  size. Authoritative when `editAs === "oneCell"`. 0 = unavailable. */
    nativeExtCx: number;
    nativeExtCy: number;
    /** Zip path of the blip inside the package (e.g. `xl/media/image1.png`). The
     *  blip's own `r:embed` raster fallback when an svgBlip extension is present;
     *  otherwise the only source. Falls back to the SVG part itself when the
     *  picture has no raster `r:embed`. Bytes are fetched lazily by path. */
    imagePath: string;
    /** MIME type of the blip at {@link ImageAnchor.imagePath} (e.g. `image/png`,
     *  or `image/svg+xml` for the SVG-only fallback). */
    mimeType: string;
    /** Vector original from the Microsoft `asvg:svgBlip` extension (MS-ODRAWXML),
     *  as a zip path. Preferred over `imagePath` (the raster fallback, or the SVG
     *  itself when no raster blip is embedded). Absent when the picture carries no
     *  svgBlip extension. Its MIME is always `image/svg+xml` and is owned by the
     *  SVG decoder. */
    svgImagePath?: string;
    /** ECMA-376 §20.1.8.55 `<a:srcRect>` source-image crop. Each edge inset is a
     *  fraction `0..1` of the source bitmap, measured inward, so the visible
     *  source region is `[l, t, 1-r, 1-b]`. Absent (the common case) ⇒ the whole
     *  blip fills the anchor rect; when present, the renderer draws only the
     *  cropped sub-rectangle (raster only — a metafile is rasterized to the
     *  display box, so its crop can't be honored faithfully and is skipped). */
    srcRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    /** ECMA-376 §20.1.8.6 `<a:alphaModFix@amt>` — the blip's overall opacity as a
     *  fraction (0..1). Absent ⇒ opaque. The renderer sets `ctx.globalAlpha` so the
     *  picture composites over the cells beneath it (e.g. a pink translucent photo
     *  over a matching cell fill). */
    alpha?: number;
    /** ECMA-376 §20.1.8.23 `<a:duotone>` recolour effect. Absent (the common case)
     *  ⇒ no effect. When present, the renderer remaps the image along the
     *  `clr1`→`clr2` luminance ramp before drawing. */
    duotone?: Duotone;
}

export declare interface LegendManualLayout {
    /** `"edge"` = `x`/`y` are fractions from top-left of chart space;
     *  `"factor"` = fractions offset from the default position. */
    xMode: string;
    yMode: string;
    /** Fractions of chart space width/height. */
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Options for {@link XlsxWorkbook.load}. Extends the shared load-options type
 *  from `@silurus/ooxml-core` (`useGoogleFonts`, `maxZipEntryBytes`, `math`)
 *  with the worker-rendering mode. */
export declare interface LoadOptions extends LoadOptions_2 {
    /**
     * 'main' (default): parse in a worker, render on the main thread (current
     * behaviour). 'worker': parse AND render inside the worker; use
     * {@link XlsxWorkbook.renderViewportToBitmap} and paint the returned
     * ImageBitmap via an `ImageBitmapRenderingContext`. Requires OffscreenCanvas.
     * The math engine is unavailable in this mode (equations are skipped).
     */
    mode?: 'main' | 'worker';
}

/**
 * Common load-time options shared by the docx / pptx / xlsx
 * `Document.load` / `Presentation.load` / `Workbook.load` factories and their
 * viewer wrappers.
 *
 * This is the single source of truth — each package re-exports this exact type
 * as its `LoadOptions` so application code can pass one options object to any
 * of the three.
 */
declare interface LoadOptions_2 {
    /**
     * Opt in to loading webfont substitutes from Google Fonts
     * (`fonts.googleapis.com`). Default `false` — the canvas falls back to
     * locally available fonts.
     *
     * When enabled, end-user IP / User-Agent is sent to Google, which may
     * have privacy / GDPR implications for your application. To avoid the
     * third-party request, host the substitutes yourself and reference them
     * via `@font-face` in your application CSS.
     */
    useGoogleFonts?: boolean;
    /**
     * Password for an encrypted OOXML file ([MS-OFFCRYPTO] Agile Encryption).
     *
     * Password-protected Office documents are CFB (OLE2) containers, not ZIPs.
     * When this is set and the input is Agile-encrypted, `load()` decrypts it on
     * the main thread (via WebCrypto) and parses the recovered plaintext ZIP.
     *
     * Errors (thrown as {@link import('../errors/ooxml-error').OoxmlError}):
     *   - no `password` on an encrypted file → code `'encrypted'`
     *   - wrong `password`                   → code `'invalid-password'`
     *   - a non-Agile scheme (Standard / Extensible / legacy) → code
     *     `'unsupported-encryption'`
     *
     * Note: Agile Encryption uses a high password-hash spin count (commonly
     * 100,000), so decryption of a protected file adds roughly a second of
     * WebCrypto work before parsing begins.
     *
     * Security notes:
     *   - This value is held as an ordinary JS `string` in memory for the
     *     duration of key derivation. The library does not zero it, and does
     *     not wrap it in a `SecureString`-equivalent — it becomes eligible for
     *     garbage collection like any other string once nothing references it,
     *     but no explicit wipe is performed. It is never logged or included in
     *     thrown errors.
     *   - Decryption recovers the plaintext but does not verify the file's HMAC
     *     data-integrity tag ([MS-OFFCRYPTO] §2.3.4.14), so ciphertext tampering
     *     is not detected — see "Security & Privacy" in the README.
     */
    password?: string;
    /**
     * Override the URL the parser worker fetches the WebAssembly module from.
     *
     * By default each format resolves the `.wasm` asset that ships next to its
     * bundle (relative to the module URL), so no configuration is needed. Set
     * this to serve the parser WASM from a CDN or a self-hosted path instead — a
     * relative value is resolved against the current document URL. The same
     * dependency-injection contract across docx / pptx / xlsx.
     *
     * The referenced file must be the matching format's `*_parser_bg.wasm`
     * artifact (the one wasm-bindgen emitted for that parser); pointing it at a
     * mismatched or missing file makes `load()` reject when the worker
     * instantiates it.
     */
    wasmUrl?: string | URL;
    /**
     * Override the per-entry ZIP decompression cap (bytes) used by the zip-bomb
     * guard in the Rust parser. Defaults to 512 MiB. Raise it to load documents
     * with very large embedded media, or lower it to tighten the budget for
     * untrusted input. Zero / negative values fall back to the default.
     */
    maxZipEntryBytes?: number;
    /**
     * Reject the parse request if the parser worker does not answer within this
     * many milliseconds. Opt-in safety net for a wedged or crashed worker that
     * would otherwise leave `load()` pending forever. **Default: unlimited** —
     * parsing a large document with heavy embedded media can legitimately take
     * tens of seconds, so no timeout is imposed unless you set one. A worker that
     * throws or fails to load already rejects immediately regardless of this
     * value; this bound only covers the "silent, never-responds" case.
     */
    workerTimeoutMs?: number;
    /**
     * Opt-in OMML equation engine (MathJax + STIX Two Math, ~3 MB). Inject it
     * **once** here and every render of this document / presentation / workbook
     * uses it — the same dependency-injection contract across all three formats
     * and their viewers. Import it from the separate `@silurus/ooxml/math` entry
     * (`import { math } from '@silurus/ooxml/math'`). Omit it and equations are
     * skipped and the engine tree-shakes away entirely (no network, no bundle
     * cost).
     */
    math?: MathRenderer;
}

/** @deprecated Use `ChartManualLayout` from @silurus/ooxml-core. */
export declare type ManualLayout = ChartManualLayout;

/** Accent (`m:acc`), e.g. hat, bar, vector arrow over the base. */
declare interface MathAccent {
    kind: 'accent';
    char: string;
    base: MathNode[];
}

/** Matrix (`m:m`) or aligned equation array (`m:eqArr`). rows → cells → nodes. */
declare interface MathArray {
    kind: 'array';
    rows: MathNode[][][];
    /** 'eq' = alternating right/left (eqArr); 'center' = matrix; 'left'. */
    align: 'eq' | 'center' | 'left';
}

/** Over/under bar (`m:bar`). */
declare interface MathBar {
    kind: 'bar';
    pos: 'top' | 'bot';
    base: MathNode[];
}

/** Border-box object (`m:borderBox`, §22.1.2.11): a border/strikes around the
 *  base. Absent flags ⇒ a full rectangular box. */
declare interface MathBorderBox {
    kind: 'borderBox';
    /** §22.1.2 hide* — when true the corresponding edge is NOT drawn. */
    hideTop?: boolean;
    hideBot?: boolean;
    hideLeft?: boolean;
    hideRight?: boolean;
    /** §22.1.2 strike* — strikeBLTR = bottom-left→top-right, strikeTLBR =
     *  top-left→bottom-right diagonal. */
    strikeH?: boolean;
    strikeV?: boolean;
    strikeBltr?: boolean;
    strikeTlbr?: boolean;
    base: MathNode[];
}

/** Box object (`m:box`, §22.1.2.13): a logical grouping (operator emulator /
 *  line-break control). Draws NO border — a transparent group around `base`. */
declare interface MathBox {
    kind: 'box';
    base: MathNode[];
}

declare interface MathDelimiter {
    kind: 'delimiter';
    /** opening char (default '('). */
    begChar: string;
    /** closing char (default ')'). */
    endChar: string;
    /** separated groups (e.g. for cases / multiple args). */
    items: MathNode[][];
}

declare interface MathFraction {
    kind: 'fraction';
    num: MathNode[];
    den: MathNode[];
    /** false = no rule (e.g. binomial); defaults to true. */
    bar?: boolean;
}

declare interface MathFunc {
    kind: 'func';
    name: MathNode[];
    arg: MathNode[];
}

declare interface MathGroup {
    kind: 'group';
    items: MathNode[];
}

/** Group character (`m:groupChr`), e.g. under/over brace. */
declare interface MathGroupChr {
    kind: 'groupChr';
    char: string;
    pos: 'top' | 'bot';
    base: MathNode[];
}

/** Lower/upper limit (`m:limLow` / `m:limUpp`), e.g. lim under n→∞. */
declare interface MathLimit {
    kind: 'limit';
    base: MathNode[];
    lower?: MathNode[];
    upper?: MathNode[];
}

declare interface MathNary {
    kind: 'nary';
    /** operator char, e.g. '∑', '∫', '∏'. */
    op: string;
    /** limit location (`m:limLoc`): 'subSup' = beside the op, 'undOvr' = above/below.
     *  Empty/omitted = default by operator class (integrals → subSup, others → undOvr). */
    limLoc?: string;
    sub?: MathNode[];
    sup?: MathNode[];
    body: MathNode[];
}

declare type MathNode = MathRun | MathFraction | MathScript | MathNary | MathDelimiter | MathRadical | MathLimit | MathArray | MathGroupChr | MathBar | MathAccent | MathFunc | MathGroup | MathPhant | MathSPre | MathBox | MathBorderBox;

/** Phantom object (`m:phant`, §22.1.2.81): contributes the spacing of `base`
 *  while optionally hiding it and/or zeroing individual dimensions. */
declare interface MathPhant {
    kind: 'phant';
    /** §22.1.2.96 `m:show` — `false` hides the base (invisible but occupies space,
     *  i.e. `<mphantom>`); `true` (default) shows it and the phant only tweaks
     *  spacing. */
    show: boolean;
    /** §22.1.2 zeroWid / zeroAsc / zeroDesc — suppress width / ascent / descent so
     *  the base takes no space along that axis. Omitted ⇒ false. */
    zeroWid?: boolean;
    zeroAsc?: boolean;
    zeroDesc?: boolean;
    base: MathNode[];
}

declare interface MathRadical {
    kind: 'radical';
    /** optional index (e.g. cube root); empty/omitted = square root. */
    index?: MathNode[];
    radicand: MathNode[];
}

/**
 * The math engine contract a viewer needs to render equations. Satisfied by the
 * `math` named export of the separate `@silurus/ooxml/math` entry point, which
 * the consumer opts into:
 *
 * ```ts
 * import { DocxViewer } from '@silurus/ooxml/docx';
 * import { math } from '@silurus/ooxml/math';
 * new DocxViewer(canvas, { math });
 * ```
 *
 * Omit it and the equation engine (MathJax + STIX Two Math, ~3 MB) is never
 * imported, so a bundler drops it entirely.
 */
declare interface MathRenderer {
    /** Preload the engine. Called once before converting equations. */
    loadMathJax(): Promise<void>;
    /** MathML string → standalone SVG + baseline-relative em extents. */
    mathMLToSvg(mathml: string): Promise<MathSvg>;
}

declare interface MathRun {
    kind: 'run';
    text: string;
    style: MathStyle;
}

declare interface MathScript {
    kind: 'sup' | 'sub' | 'subSup';
    base: MathNode[];
    sup?: MathNode[];
    sub?: MathNode[];
}

/** Pre-sub-superscript object (`m:sPre`, §22.1.2.99): sub + sup to the LEFT of
 *  the base (e.g. ²₁A). */
declare interface MathSPre {
    kind: 'sPre';
    sub: MathNode[];
    sup: MathNode[];
    base: MathNode[];
}

declare type MathStyle = 'roman' | 'italic' | 'bold' | 'boldItalic';

declare interface MathSvg {
    /** standalone `<svg>…</svg>` markup. */
    svg: string;
    /** extents in em (the SVG viewBox uses 1em = 1000 units). */
    widthEm: number;
    ascentEm: number;
    descentEm: number;
}

export declare interface MergeCell {
    top: number;
    left: number;
    bottom: number;
    right: number;
}

export declare interface NumFmt {
    numFmtId: number;
    formatCode: string;
}

/**
 * Typed error thrown by the docx / pptx / xlsx `load()` factories for failures
 * that carry a stable, programmatic {@link OoxmlErrorCode} (e.g. a
 * password-protected or legacy-binary file detected from its container magic).
 *
 * Note on workers: `instanceof OoxmlError` does not survive a structured-clone
 * across the worker boundary. Detection that needs a typed error is therefore
 * done on the main thread (before the worker is involved) so a genuine
 * `OoxmlError` instance is thrown to the caller. Errors that must cross the
 * worker boundary should carry the `code` string and be reconstructed on the
 * main side.
 */
export declare class OoxmlError extends Error {
    readonly code: OoxmlErrorCode;
    constructor(code: OoxmlErrorCode, message: string);
}

/**
 * Machine-readable code for a typed load-time failure.
 *
 * The container-level failures the `load()` factories detect on the main thread
 * before handing bytes to the parser worker (see `sniffCfb` / `decryptOoxml`).
 * This is the seed of the broader typed-error surface tracked as PD4 (OoxmlError
 * typed errors). Add codes here rather than throwing bare `Error(string)`, so
 * callers can `switch` on `err.code` instead of matching message text.
 *
 *   - `'encrypted'`             — password-protected, but no `password` was
 *     supplied (pass `LoadOptions.password` to decrypt).
 *   - `'invalid-password'`      — a `password` was supplied but did not match.
 *   - `'unsupported-encryption'`— encrypted with a scheme other than Agile
 *     (Standard / Extensible / a legacy binary encryptor), which this library
 *     cannot decrypt (PD8 implements Agile only).
 *   - `'legacy-binary-format'`  — a raw .doc / .xls / .ppt (not OOXML).
 *   - `'not-ooxml'`             — a CFB of an unrecognised kind, or otherwise
 *     not an OOXML ZIP.
 */
export declare type OoxmlErrorCode = 'encrypted' | 'invalid-password' | 'unsupported-encryption' | 'legacy-binary-format' | 'not-ooxml';

/**
 * The default action a viewer takes for an **external** hyperlink click when
 * the integrator supplies no `onHyperlinkClick` handler: sanitise the URL and,
 * if allowed, open it in a new tab with `noopener,noreferrer` so the opened page
 * gets no `window.opener` handle back into this document. A blocked scheme is a
 * silent no-op (returns `false`) — the click does nothing rather than navigate
 * somewhere dangerous.
 *
 * Internal targets are intentionally NOT handled here: the in-document jump
 * (page / slide / cell) is format-specific and lives in each viewer.
 *
 * Split out (not inlined in three viewers) so the "open in new tab, drop opener,
 * refuse unsafe schemes" policy is defined once. `win` is injected for tests;
 * defaults to the ambient `window`.
 *
 * @returns `true` if navigation was initiated, `false` if the URL was blocked.
 */
export declare function openExternalHyperlink(url: string, allowed?: readonly string[], win?: Pick<Window, 'open'> | undefined): boolean;

/** `<sheetPr><outlinePr>` flags (ECMA-376 §18.3.1.61). Both default to `true`. */
export declare interface OutlinePr {
    /** `true` (default) ⇒ a group's summary row sits *below* its detail rows;
     *  `false` ⇒ above. */
    summaryBelow: boolean;
    /** `true` (default) ⇒ a group's summary column sits to the *right* of its
     *  detail columns; `false` ⇒ to the left. */
    summaryRight: boolean;
}

export declare interface ParsedWorkbook {
    workbook: Workbook;
    styles: Styles;
    sharedStrings: SharedString[];
}

export declare type PathCmd = {
    op: 'moveTo';
    x: number;
    y: number;
} | {
    op: 'lineTo';
    x: number;
    y: number;
} | {
    op: 'cubicBezTo';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
} | {
    op: 'quadBezTo';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** ECMA-376 §20.1.9.3. stAng/swAng in 60000ths of a degree. wr/hr in
*  the path's own coordinate units. Pen position is the arc start. */
| {
    op: 'arcTo';
    wr: number;
    hr: number;
    stAng: number;
    swAng: number;
} | {
    op: 'close';
};

export declare interface PathInfo {
    w: number;
    h: number;
    commands: PathCmd[];
}

/** ECMA-376 §18.18.56 ST_PhoneticAlignment — how the furigana is aligned over
 *  the base text. Absent on {@link PhoneticProperties} defaults to `'left'`. */
export declare type PhoneticAlignment = 'left' | 'center' | 'distributed' | 'noControl';

/** ECMA-376 §18.4.3 `<phoneticPr>` — phonetic display properties. */
export declare interface PhoneticProperties {
    /** Zero-based index into `Styles.fonts` (§18.18.32 ST_FontId). Out of bounds
     *  falls back to font 0 (§18.4.3). Drives the furigana font size / family. */
    fontId: number;
    /** §18.18.57 — absent means `'fullwidthKatakana'` (schema default). */
    type?: PhoneticType;
    /** §18.18.56 — absent means `'left'` (schema default). */
    alignment?: PhoneticAlignment;
}

/** ECMA-376 §18.4.6 `<rPh sb=".." eb="..">` — one furigana run. `sb`/`eb` are
 *  zero-based character offsets into the base text; the hint `text` is shown
 *  over base characters `[sb, eb)`. */
export declare interface PhoneticRun {
    /** Zero-based start character offset into the base text (inclusive). */
    sb: number;
    /** Zero-based end character offset into the base text (exclusive). */
    eb: number;
    /** The phonetic hint text (e.g. the katakana reading). */
    text: string;
}

/** ECMA-376 §18.18.57 ST_PhoneticType — the East-Asian character set the
 *  furigana is displayed in. Absent on {@link PhoneticProperties} defaults to
 *  `'fullwidthKatakana'` per the CT_PhoneticPr schema. */
export declare type PhoneticType = 'fullwidthKatakana' | 'halfwidthKatakana' | 'Hiragana' | 'noConversion';

export declare interface RenderViewportOptions {
    width?: number;
    height?: number;
    dpr?: number;
    defaultFontFamily?: string;
    defaultFontSize?: number;
    scrollOffsetX?: number;
    scrollOffsetY?: number;
    freezeRows?: number;
    freezeCols?: number;
    /** Scale factor applied to all cell/header dimensions (default 1). */
    cellScale?: number;
    /** Pre-decoded image sources keyed by their zip `imagePath` (for ImageAnchor
     *  and group-leaf image rendering). */
    loadedImages?: Map<string, CanvasImageSource | null>;
    /** Fetch an embedded image's bytes by zip path, wrapped in a Blob of the given
     *  MIME (twin of pptx/docx `fetchImage`). The orchestrator decodes these into
     *  {@link loadedImages} before the synchronous draw. Supplied by
     *  {@link XlsxWorkbook} (routing through the worker) or the render worker
     *  (reading its retained buffer). Absent ⇒ no images are decoded. */
    fetchImage?: (path: string, mimeType: string) => Promise<Blob>;
    /** Called once per cell that contains text, with canvas-pixel position and cell address. */
    onTextRun?: (info: XlsxTextRunInfo) => void;
    /** Highlighted row range for selected row headers (1-indexed inclusive).
     *  `strong: true` → light blue + blue border (rows / cols / all selection modes).
     *  `strong: false` → slightly darker grey (cells selection mode). */
    selectedRowRange?: {
        start: number;
        end: number;
        strong: boolean;
    } | null;
    /** Same shape as selectedRowRange, for column headers. */
    selectedColRange?: {
        start: number;
        end: number;
        strong: boolean;
    } | null;
}

/**
 * Resolved allowed-value set for a list validation. Either concrete display
 * `values` (inline list or expanded range), or — when the operand is a defined
 * name / complex formula we cannot expand — the raw `formula` text so the panel
 * can disclose it instead of showing nothing.
 */
export declare type ResolvedList = {
    kind: 'values';
    values: string[];
} | {
    kind: 'formula';
    formula: string;
};

/**
 * Resolve every `{ type: 'shared', si }` cell in `ws` to a concrete
 * `{ type: 'text', text, runs? }` by looking `si` up in the workbook
 * `sharedStrings` table (ECMA-376 §18.4.8). Mutates cells in place and returns
 * `ws` for chaining. Out-of-range / missing `si` resolves to empty text —
 * matching the parser's historical fallback. Idempotent: a `Worksheet` with no
 * `shared` cells is returned unchanged.
 *
 * This keeps the dedup win on the wire (each shared string ships ONCE in the
 * workbook) while every downstream consumer — renderer, formula engine, number
 * formatter, markdown — still sees fully-resolved cell text.
 */
export declare function resolveSharedStrings(ws: Worksheet, sharedStrings: SharedString[]): Worksheet;

export declare interface Row {
    index: number;
    height: number | null;
    cells: Cell[];
    /** Outline (grouping) depth 0-7 (ECMA-376 §18.3.1.73 `<row outlineLevel>`).
     *  Omitted on the wire when `0` (ungrouped); read as `outlineLevel ?? 0`. */
    outlineLevel?: number;
    /** `<row collapsed>` (§18.3.1.73): `true` on a summary row whose
     *  one-level-deeper detail rows are collapsed. Omitted when false. */
    collapsed?: boolean;
    /** `<row hidden>` (§18.3.1.73): `true` when the row is hidden — most often
     *  because a collapsed outline hides its detail rows. Distinct from
     *  `height === 0`. Omitted on the wire when false. */
    hidden?: boolean;
}

export declare interface Run {
    text: string;
    font?: RunFont;
}

export declare interface RunFont {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    size?: number;
    color?: string | null;
    name?: string | null;
    /**
     * Underline style when not the default single line. ECMA-376 §18.4.13
     * (`ST_UnderlineValues`): "double" | "singleAccounting" | "doubleAccounting".
     * Absent means single (when `underline` is true) or no underline.
     */
    underlineStyle?: string;
    /**
     * ECMA-376 §18.4.6 (`ST_VerticalAlignRun`): "superscript" | "subscript".
     * Absent leaves the run on the baseline.
     */
    vertAlign?: 'superscript' | 'subscript';
}

/**
 * A secondary value axis (combo charts). Mirrors the primary value-axis
 * properties but lives in its own object so the flat primary-axis fields stay
 * untouched. Parsed from the right-hand `<c:valAx>` (`axPos="r"`,
 * `<c:crosses val="max">`).
 */
declare interface SecondaryValueAxis {
    /** `<c:scaling><c:min val>`. null = derive from the series data. */
    min: number | null;
    /** `<c:scaling><c:max val>`. null = derive from the series data. */
    max: number | null;
    /** `<c:title>` plain text. null = no title. */
    title: string | null;
    /** `<c:delete val="1"/>` — hide labels/ticks entirely. */
    hidden: boolean;
    /** `<c:numFmt formatCode>` for tick labels. */
    formatCode?: string | null;
    /** `<c:txPr>…<a:solidFill>` tick-label color (hex without '#'). */
    fontColor?: string | null;
    /** `<c:txPr>` tick-label font size (hpt). */
    fontSizeHpt?: number | null;
    /** `<c:spPr><a:ln><a:solidFill>` axis-line color (hex without '#'). */
    lineColor?: string | null;
    /** `<c:spPr><a:ln w>` axis-line width in EMU. */
    lineWidthEmu?: number | null;
    /** `<c:spPr><a:ln><a:noFill>` — hide just the axis rule. */
    lineHidden: boolean;
    /** `<c:majorTickMark>` — "cross" (default) | "out" | "in" | "none". */
    majorTickMark: string;
    /**
     * `<c:valAx><c:majorUnit val>` (§21.2.2.103) — explicit distance between
     * major ticks/gridlines on THIS secondary axis, overriding the Excel-style
     * auto "nice" step. null/undefined ⇒ auto step (byte-stable). Symmetric with
     * {@link ChartModel.valAxisMajorUnit} on the primary axis.
     */
    majorUnit?: number | null;
    /** `<c:title>` run-prop font size (hpt). */
    titleFontSizeHpt?: number | null;
    /** `<c:title>` run-prop bold flag. */
    titleFontBold?: boolean | null;
    /** `<c:title>` run-prop color (hex without '#'). */
    titleFontColor?: string | null;
}

declare type SelectionMode_2 = 'cells' | 'rows' | 'cols' | 'all';
export { SelectionMode_2 as SelectionMode }

/** @deprecated Use `ChartSeriesDataLabels` from @silurus/ooxml-core. */
export declare type SeriesDataLabels = ChartSeriesDataLabels;

export declare interface ShapeAnchor {
    fromCol: number;
    fromColOff: number;
    fromRow: number;
    fromRowOff: number;
    toCol: number;
    toColOff: number;
    toRow: number;
    toRowOff: number;
    /** `twoCellAnchor@editAs` (ECMA-376 §20.5.2.33). With `"oneCell"` the
     *  renderer uses `nativeExtCx`/`nativeExtCy` as the on-sheet size, since
     *  Excel preserves the group's saved EMU extent regardless of cell
     *  resizing ("Move but don't size with cells"). Absent ⇒ default `"twoCell"`. */
    editAs?: string;
    /** Saved EMU extent of the top-level grpSp (or the stand-alone sp/pic).
     *  Authoritative when `editAs === "oneCell"`. 0 = unavailable. */
    nativeExtCx: number;
    nativeExtCy: number;
    shapes: ShapeInfo[];
}

export declare type ShapeGeom = {
    type: 'preset';
    name: string;
    /** Adjust handles from `<a:avLst><a:gd>` in `adj1..adj8` order
     *  (ECMA-376 §19.5.31.3 / §20.1.9.5). `null` entries mean "use the
     *  preset's declared default". Omitted entirely when the shape has no
     *  `<a:avLst>`. Consumed by the shared `renderPresetShape` engine. */
    adj?: (number | null)[];
} | {
    type: 'custom';
    paths: PathInfo[];
}
/** Bitmap (or vector) picture leaf inside a `<xdr:grpSp>`. `imagePath` is the
*  zip path of the drawing's relationship target — the blip's raster `r:embed`
*  fallback, or the SVG itself when no raster is embedded — and `mimeType` its
*  MIME. Bytes are fetched lazily by path; nothing is inlined as base64. */
| {
    type: 'image';
    imagePath: string;
    /** MIME type of the blip at {@link imagePath} (e.g. `image/png`, or
     *  `image/svg+xml` for the SVG-only fallback). */
    mimeType: string;
    /** Vector original from the Microsoft `asvg:svgBlip` extension
     *  (MS-ODRAWXML), as a zip path. Prefer this over `imagePath` (the raster
     *  fallback, or the SVG itself when no raster blip is embedded). Absent
     *  when the picture carries no svgBlip extension. Its MIME is always
     *  `image/svg+xml` and is owned by the SVG decoder. */
    svgImagePath?: string;
    /** ECMA-376 §20.1.8.55 `<a:srcRect>` source-image crop on the leaf pic
     *  (fractions `0..1` inward from each edge; visible region `[l, t, 1-r,
     *  1-b]`). Absent ⇒ the whole blip fills the leaf rect. Honored identically
     *  to the top-level {@link ImageAnchor.srcRect} (raster only). */
    srcRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    /** ECMA-376 §20.1.8.6 `<a:alphaModFix@amt>` opacity fraction (0..1) on the
     *  leaf pic. Absent ⇒ opaque. Applied via `globalAlpha`. */
    alpha?: number;
    /** ECMA-376 §20.1.8.23 `<a:duotone>` recolour on the leaf pic. Absent ⇒
     *  no effect. */
    duotone?: Duotone;
};

export declare interface ShapeInfo {
    /** Normalized [0,1] position/size relative to the anchor rect. */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Rotation in degrees, clockwise. */
    rot: number;
    fillColor?: string;
    strokeColor?: string;
    /** Stroke width in EMU. 0 = no stroke. */
    strokeWidth: number;
    geom: ShapeGeom;
    /** Optional text body (`<xdr:txBody>`, ECMA-376 §20.5.2.34). Present for
     *  text boxes (`txBox="1"`) and any other shape that carries visible text. */
    text?: ShapeText;
}

export declare interface ShapeParagraph {
    /** `<a:pPr@algn>` — `l` (default) | `ctr` | `r` | `just` | `dist`. */
    align: string;
    /** `<a:pPr@rtl>` — whether the paragraph reads right-to-left
     *  (ECMA-376 §21.1.2.2.7). Omitted (undefined) when false. */
    rtl?: boolean;
    /** `<a:pPr@marL>` — left margin in EMU (ECMA-376 §21.1.2.2.7,
     *  `CT_TextParagraphProperties`). Direct attribute only — xlsx text boxes
     *  have no lstStyle/level cascade. Omitted (undefined) when unset. */
    marL?: number;
    /** `<a:pPr@marR>` — right margin in EMU (ECMA-376 §21.1.2.2.7).
     *  Omitted (undefined) when unset. */
    marR?: number;
    /** `<a:pPr@indent>` — first-line indent in EMU (negative = hanging),
     *  ECMA-376 §21.1.2.2.7. Omitted (undefined) when unset. */
    indent?: number;
    /** `<a:pPr>/<a:lnSpc>` line spacing (ECMA-376 §21.1.2.2.5). Direct-only;
     *  omitted when unset. */
    spaceLine?: SpaceLine | null;
    runs: ShapeTextRun[];
}

export declare interface ShapeText {
    /** `<a:bodyPr@anchor>` — vertical alignment of the text block within the
     *  shape rect. `t` (top, default), `ctr` (middle), `b` (bottom). */
    anchor: string;
    /** `<a:bodyPr@wrap>` — `square` (wrap to width) | `none`. */
    wrap: string;
    /** `<a:bodyPr>` autofit child — `'sp'` (`spAutoFit`), `'norm'` (`normAutofit`),
     *  or `'none'` (`noAutofit`/absent). ECMA-376 §21.1.2.1.1-.3. Always present
     *  (default `'none'`), mirroring the core `TextBody.autoFit`. */
    autoFit?: string;
    /** `<a:normAutofit@fontScale>` — stored font-shrink fraction (e.g. 0.625 for
     *  `fontScale="62500"`). Null/absent when unset. Modeled for parity with
     *  pptx; the xlsx renderer does not currently apply it. */
    fontScale?: number | null;
    /** `<a:normAutofit@lnSpcReduction>` — stored line-spacing reduction fraction
     *  (e.g. 0.20 for `lnSpcReduction="20000"`). Null/absent when unset. */
    lnSpcReduction?: number | null;
    /** `<a:bodyPr@lIns>` — left text inset in EMU (ECMA-376 §21.1.2.1.1). Always
     *  present; the spec default 91440 EMU (7.2 pt) when the attribute is absent.
     *  Same EMU convention as `ShapeParagraph.marL`. */
    lIns: number;
    /** `<a:bodyPr@tIns>` — top text inset in EMU. Default 45720 (3.6 pt). */
    tIns: number;
    /** `<a:bodyPr@rIns>` — right text inset in EMU. Default 91440 (7.2 pt). */
    rIns: number;
    /** `<a:bodyPr@bIns>` — bottom text inset in EMU. Default 45720 (3.6 pt). */
    bIns: number;
    paragraphs: ShapeParagraph[];
}

/** A run within a shape paragraph — tagged union mirroring the Rust enum
 *  (matches the pptx `TextRun` shape): styled text, a soft line break, or an
 *  OMML equation. Excel stores "Insert > Equation" as OMML inside the shared
 *  DrawingML `<xdr:txBody>` grammar (ECMA-376 §22.1), like PowerPoint. */
export declare type ShapeTextRun = {
    type: 'text';
    text: string;
    bold: boolean;
    italic: boolean;
    /** Font size in points (already converted from `<a:rPr@sz>` 100ths-of-a-pt).
     *  0 = inherit (renderer falls back to its default). */
    size: number;
    color?: string;
    fontFace?: string;
    /** East-Asian typeface (`<a:ea@typeface>`, ECMA-376 §21.1.2.3.1). The
     *  common Japanese encoding sets Meiryo here while leaving `<a:latin>`
     *  default; the renderer floors the line box by this face's design line
     *  too (see `drawShapeText`). Undefined when the run declares no `<a:ea>`. */
    fontFaceEa?: string;
    /** Complex-script typeface (`<a:cs@typeface>`, ECMA-376 §21.1.2.3.1).
     *  Parsed/modeled but NOT used in the line-box floor: the cs face renders
     *  only complex-script glyphs (Arabic/Hebrew/Thai), so flooring the whole
     *  line box by it would over-grow Latin/CJK runs (deferred to per-glyph
     *  handling — see `drawShapeText`). Undefined when the run declares no
     *  `<a:cs>`. */
    fontFaceCs?: string;
} | {
    type: 'break';
} | {
    type: 'math';
    /** OMML AST (shared `MathNode` model) for the equation. */
    nodes: MathNode[];
    /** true = block (`m:oMathPara`), false = inline (`m:oMath`). */
    display: boolean;
    /** Point size when the run carries an explicit `rPr@sz`; else inherit. */
    fontSize?: number;
    color?: string;
};

export declare interface SharedString {
    text: string;
    runs?: Run[];
    /** ECMA-376 §18.4.6 phonetic runs (furigana). Absent when the `<si>` has no
     *  `<rPh>`. */
    phoneticRuns?: PhoneticRun[];
    /** ECMA-376 §18.4.3 phonetic display properties. Absent when the `<si>` has
     *  no `<phoneticPr>`. */
    phoneticPr?: PhoneticProperties;
}

export declare interface SheetMeta {
    name: string;
    sheetId: number;
    rId: string;
    /** Sheet tab color (`<sheetPr><tabColor>`, ECMA-376 §18.3.1.93) resolved to
     *  `#RRGGBB`. Surfaced at workbook-list time so tabs can be painted up front.
     *  Absent when the sheet declares no tab color. */
    tabColor?: string | null;
    /** Sheet visibility (`<sheet state>`, ECMA-376 §18.2.19 `ST_SheetState`).
     *  Absent ⇒ visible. `'veryHidden'` sheets are revealable only
     *  programmatically in Excel. Read via `XlsxWorkbook.isHidden` /
     *  `XlsxWorkbook.sheetVisibility`. */
    visibility?: 'hidden' | 'veryHidden';
}

/** Sheet visibility (`<sheet state>`, ECMA-376 §18.2.19 `ST_SheetState`). */
export declare type SheetVisibility = 'visible' | 'hidden' | 'veryHidden';

export declare interface SlicerAnchor {
    fromCol: number;
    fromColOff: number;
    fromRow: number;
    fromRowOff: number;
    toCol: number;
    toColOff: number;
    toRow: number;
    toRowOff: number;
    caption: string;
    items: SlicerItem[];
}

export declare interface SlicerItem {
    name: string;
    selected: boolean;
}

declare type SpaceLine = {
    type: 'pct';
    val: number;
} | {
    type: 'pts';
    val: number;
};

export declare interface Sparkline {
    /** 1-based row of the destination cell (`<xm:sqref>`). */
    row: number;
    /** 1-based column of the destination cell. */
    col: number;
    /** Numeric values resolved from the `<xm:f>` range. `null` for empty
     *  / non-numeric cells; honored as gaps at render time. */
    values: (number | null)[];
}

export declare interface SparklineGroup {
    /** `line` (default) | `column` | `stem` (win-loss). */
    kind: 'line' | 'column' | 'stem';
    markers: boolean;
    high: boolean;
    low: boolean;
    first: boolean;
    last: boolean;
    negative: boolean;
    /** Show the horizontal axis line through 0 when data crosses it. */
    displayXAxis: boolean;
    /** `gap` (default) | `zero` | `span`. */
    displayEmptyCellsAs: string;
    /** `individual` (default) | `group` | `custom`. */
    minAxisType: string;
    maxAxisType: string;
    manualMin?: number;
    manualMax?: number;
    /** Stroke weight in pt for `line`. ECMA-376 default 0.75. */
    lineWeight: number;
    /** Resolved RGB hex strings (theme/tint already flattened by the parser). */
    colorSeries?: string;
    colorNegative?: string;
    colorAxis?: string;
    colorMarkers?: string;
    colorFirst?: string;
    colorLast?: string;
    colorHigh?: string;
    colorLow?: string;
    sparklines: Sparkline[];
}

export declare interface Styles {
    fonts: CellFont[];
    fills: CellFill[];
    borders: Border[];
    cellXfs: CellXf[];
    numFmts: NumFmt[];
    dxfs: Dxf[];
}

/** Per-column DXF references inside a `<table>` element
 *  (ECMA-376 §18.5.1.3 `tableColumn`). */
export declare interface TableColumnInfo {
    /** `<tableColumn dataDxfId>` — applied to data cells in this column. */
    dataDxfId?: number;
    /** `<tableColumn headerRowDxfId>` — applied to the header cell of this column. */
    headerRowDxfId?: number;
    /** `<tableColumn totalsRowDxfId>` — applied to the totals cell of this column. */
    totalsRowDxfId?: number;
}

export declare interface TableInfo {
    range: CellRange_2;
    styleName: string;
    headerRowCount: number;
    totalsRowCount: number;
    showRowStripes: boolean;
    showColumnStripes: boolean;
    showFirstColumn: boolean;
    showLastColumn: boolean;
    /** Accent color resolved by the parser from the built-in style name against
     *  the file's theme accents (e.g. `TableStyleLight18` → accent3). */
    accentColor: string;
    /** `true` when `styleName` is defined in the file's `<tableStyles>` block,
     *  i.e. a *custom* style (ECMA-376 §18.5.1.2). The renderer draws such tables
     *  strictly from their declared element dxfs and must NOT apply the accent
     *  approximation (banding / synthesized rules / header) reserved for built-in
     *  style names whose definitions are absent from the file. */
    isCustom?: boolean;
    /** Dxf index for the `wholeTable` element of a custom `<tableStyle>`
     *  (ECMA-376 §18.8.83). When set, its border/fill apply to every cell of
     *  the table as a base layer. Undefined for built-in style names. */
    wholeTableDxf?: number;
    /** Dxf index for the `headerRow` element of a custom `<tableStyle>` —
     *  provides header background, font color/weight, and vertical separators. */
    headerRowDxf?: number;
    /** Dxf index for the `totalRow` element (ECMA-376 §18.18.93). */
    totalRowDxf?: number;
    /** Dxf index for the `firstColumn` element. */
    firstColumnDxf?: number;
    /** Dxf index for the `lastColumn` element. */
    lastColumnDxf?: number;
    /** Dxf index for `firstRowStripe` (band1 horizontal) — odd banded-row stripe. */
    band1HorizontalDxf?: number;
    /** Dxf index for `secondRowStripe` (band2 horizontal) — even banded-row stripe. */
    band2HorizontalDxf?: number;
    /** Per-column DXF references (ECMA-376 §18.5.1.3 `tableColumn`). Index by
     *  `cellCol - range.left`. The renderer can use these to apply column-level
     *  overlays for named-style tables; for files where Excel pre-bakes the
     *  column DXF result into the cell `xf` (the common case), reading `xf` is
     *  sufficient and these fields are informational. */
    columns: TableColumnInfo[];
}

export declare interface ViewportRange {
    row: number;
    col: number;
    rows: number;
    cols: number;
}

/** Serializable subset of RenderViewportOptions: drop the callback, the image
 *  cache, and the `fetchImage` loader (all non-cloneable; the worker owns its
 *  own cache and supplies its own in-worker fetchImage). Extended with the
 *  optional {@link WireSizeOverrides} so view-only size mutations reach the
 *  worker's local sheet copy; absent (the common case) when nothing has been
 *  resized or collapsed, keeping the wire payload unchanged. */
export declare type WireRenderViewportOptions = Omit<RenderViewportOptions, 'onTextRun' | 'loadedImages' | 'fetchImage'> & {
    sizeOverrides?: WireSizeOverrides;
};

/**
 * View-only per-band size overrides for one sheet, carried with every worker
 * `renderViewport` request. The render worker draws from its own worker-local
 * parsed-sheet cache, so main-thread Worksheet mutations (outline
 * collapse/expand via the size-0 hidden encoding, drag-to-resize #567) never
 * reach it on their own — without this channel the gutter/overlays update but
 * the grid bitmap stays stale.
 *
 * Semantics: keys are 1-based band indices; a number is the band's current
 * `rowHeights` / `colWidths` model value, `null` means "no entry — fall back
 * to the sheet default". The main thread accumulates every band the user has
 * touched this session (entries are updated in place, never removed), so
 * re-applying the full map is idempotent and converges the worker's cached
 * sheet to the main model even across worker-side re-parses.
 */
export declare interface WireSizeOverrides {
    rows?: Record<number, number | null>;
    cols?: Record<number, number | null>;
}

export declare interface Workbook {
    sheets: SheetMeta[];
    /** Workbook date system (`<workbookPr date1904>`, ECMA-376 §18.2.28).
     *  `true` selects the 1904 date system (Mac-authored workbooks); serial
     *  dates are resolved against the 1904 epoch (§18.17.4.1). Omitted from the
     *  parser JSON when false (default 1900 date system). */
    date1904?: boolean;
    /** #773 partial degradation: a WORKBOOK-LEVEL degradation that leaves every
     *  sheet openable. Set when a shared workbook part was PRESENT but corrupt —
     *  most commonly `xl/sharedStrings.xml` (§18.4.9): a broken shared-string table
     *  silently blanks every string cell across ALL sheets, so unlike a per-sheet
     *  break it can't be attributed to one placeholder sheet. Tagged with the
     *  offending part (e.g. `"xl/sharedStrings.xml: <detail>"`) so the loss is
     *  surfaced instead of silent, while every sheet still renders its non-string
     *  content. Absent (`undefined`) when every shared part read cleanly. Also set
     *  (`"(zip container): <detail>"`) for a whole-container degradation (#774). */
    parseError?: string;
}

export declare interface Worksheet {
    name: string;
    rows: Row[];
    colWidths: Record<number, number>;
    rowHeights: Record<number, number>;
    /** Per-column outline (grouping) depth 0-7 (ECMA-376 §18.3.1.13
     *  `<col outlineLevel>`), keyed by 1-based column index. Present only for
     *  grouped columns; absent (⇒ level 0) on outline-free sheets. */
    colOutlineLevels?: Record<number, number>;
    /** Per-column `<col collapsed>` (§18.3.1.13): `true` on a summary column whose
     *  one-level-deeper detail columns are collapsed. Only `true` entries. */
    colCollapsed?: Record<number, boolean>;
    /** Per-column `<col hidden>` (§18.3.1.13): `true` when the column is hidden
     *  (e.g. a collapsed outline hides its detail columns). Distinct from
     *  `colWidths[c] === 0`. Only `true` entries. */
    colHidden?: Record<number, boolean>;
    defaultColWidth: number;
    defaultRowHeight: number;
    mergeCells: MergeCell[];
    freezeRows: number;
    freezeCols: number;
    conditionalFormats: ConditionalFormat[];
    images: ImageAnchor[];
    charts: ChartAnchor[];
    /** Grouped shapes from `<xdr:grpSp>` inside twoCellAnchors
     *  (ECMA-376 §20.5.2.17). Each anchor holds leaf shapes pre-flattened
     *  with normalized [0,1] geometry relative to the anchor rect. */
    shapeGroups?: ShapeAnchor[];
    /** Whether to display zero values (ECMA-376 §18.3.1.94). Defaults to true. */
    showZeros?: boolean;
    /** Whether to draw default grid lines (ECMA-376 §18.3.1.83
     *  `<sheetView showGridLines>`). Mirrors the Excel "View → Gridlines"
     *  checkbox. Defaults to true. */
    showGridlines?: boolean;
    /** Whether the sheet grid is laid out right-to-left, mirroring the entire
     *  grid so column A sits on the right (ECMA-376 §18.3.1.87
     *  `<sheetView rightToLeft>`). Defaults to false. */
    rightToLeft?: boolean;
    /** Outline display flags from `<sheetPr><outlinePr>` (ECMA-376 §18.3.1.61).
     *  Absent when the sheet declares no `<outlinePr>`; consumers apply the
     *  schema defaults (`summaryBelow` / `summaryRight` both `true`). Decides
     *  which side of a group the summary row/column (and its +/- toggle) sits. */
    outlinePr?: OutlinePr;
    /** Sheet tab color (ECMA-376 §18.3.1.79). */
    tabColor?: string | null;
    /** AutoFilter header range (ECMA-376 §18.3.1.2). */
    autoFilter?: CellRange_2 | null;
    /** Hyperlinks in this worksheet (ECMA-376 §18.3.1.47). */
    hyperlinks?: Hyperlink[];
    /** A1-style cell refs of commented cells (ECMA-376 §18.7.3). Rendered as a
     *  small red triangle in each cell's top-right corner. */
    commentRefs?: string[];
    /** Full-fidelity comment bodies (cell ref + author + plain text) for every
     *  `<comment>` in `xl/commentsN.xml` (ECMA-376 §18.7). Parallel to
     *  {@link commentRefs} (one entry per ref). Consume this to read the note
     *  text; the renderer uses {@link commentRefs} for the red indicator and the
     *  viewer surfaces these bodies in an Excel-style hover popup. */
    comments?: XlsxComment[];
    /** Data-validation rules on this sheet (ECMA-376 §18.3.1.32–33). Exposed for
     *  tooling. The viewer draws a list-dropdown arrow on the active cell when the
     *  selection intersects a `list`-type rule's `sqref` (display only — opening
     *  the list / picking a value is out of scope for a viewer). */
    dataValidations?: DataValidation[];
    /** Defined names in scope for this sheet (ECMA-376 §18.2.5). Used by
     *  conditional-formatting `expression` rules that call named ranges
     *  (e.g. `task_start`, `today`). */
    definedNames?: DefinedName[];
    /** Excel Tables on this sheet (ECMA-376 §18.5). The renderer overlays a
     *  built-in style (bold header, banded rows) on the given ranges. */
    tables?: TableInfo[];
    /** Pivot / table slicers (Office 2010+ extension). Each anchor carries a
     *  caption and the saved item list (with selection flags) so the renderer
     *  can draw a static button bank without the live pivot engine. */
    slicers?: SlicerAnchor[];
    /** Sparkline groups (Office 2010+ extension `x14:sparklineGroup`).
     *  Cross-sheet `<xm:f>` data references are resolved to numeric values at
     *  parse time, and theme + tint colors are flattened to `#RRGGBB`. */
    sparklineGroups?: SparklineGroup[];
    /** Family name of the workbook's Normal-style font, resolved by the parser
     *  from `<cellStyleXfs>[0].fontId` → `<fonts>[fontId].name.val`. The
     *  renderer uses this together with `defaultFontSize` to compute the Max
     *  Digit Width for column-width pixel conversion (ECMA-376 §18.3.1.13).
     *  Workbook-wide value, denormalized onto every worksheet. */
    defaultFontFamily?: string;
    /** Point size of the workbook's Normal-style font (`<fonts>[N].sz.val`). */
    defaultFontSize?: number;
    /** Workbook date system (`<workbookPr date1904>`, ECMA-376 §18.2.28),
     *  denormalized onto every worksheet by the parser so the cell formatter can
     *  resolve serial dates (§18.17.4.1) without a workbook back-reference.
     *  `true` = 1904 date system. Omitted (⇒ false) for the default 1900 system. */
    date1904?: boolean;
    /** RB7 partial degradation: set when THIS sheet's part could not be
     *  read/parsed. The workbook still opens with the OTHER sheets intact; this one
     *  is an empty placeholder (`rows` empty) whose `parseError` names the offending
     *  part (e.g. `"xl/worksheets/sheet3.xml: <detail>"`). Absent (`undefined`) for
     *  every healthy sheet. The renderer paints a visible error overlay. */
    parseError?: string;
}

/**
 * @deprecated Chart series are now the core {@link ChartModel}'s `ChartSeries`.
 * Kept as an alias for backward-compatible imports.
 */
export declare type XlsxChartSeries = ChartSeries;

/** One cell comment. Sourced from the classic notes file `xl/commentsN.xml`
 *  (ECMA-376 §18.7) when present, otherwise from the Office-365 threaded
 *  comments part `xl/threadedComments/` (MS-XLSX schema
 *  `…/spreadsheetml/2018/threadedcomments`, `personId` resolved via
 *  `xl/persons/`). `text` is the joined plain text — every `<r><t>` run for
 *  classic notes, every reply in the thread (newline-joined) for threaded
 *  comments; rich-text formatting is dropped. 1:1 with the Rust `XlsxComment`
 *  (serde camelCase). */
export declare interface XlsxComment {
    /** A1-style cell reference (`@ref` on the comment element). */
    cellRef: string;
    /** Resolved author name — the `<authors>` entry (classic) or the `<person>`
     *  `displayName` (threaded). Absent when unresolved. */
    author?: string;
    /** Concatenated plain text of every run / threaded reply. */
    text: string;
}

/** Where an xlsx match lives: the sheet, its name, and the cell (A1 + row/col). */
export declare interface XlsxMatchLocation {
    /** 0-based sheet index. */
    sheet: number;
    /** The sheet's display name. */
    sheetName: string;
    /** A1 cell reference, e.g. `"B7"`. */
    ref: string;
    /** 1-based row. */
    row: number;
    /** 1-based column. */
    col: number;
}

/** Emitted once per cell that has text, with the cell's canvas-pixel bounds. */
export declare interface XlsxTextRunInfo {
    text: string;
    /** Canvas CSS-pixel x of the cell's top-left corner. */
    x: number;
    /** Canvas CSS-pixel y of the cell's top-left corner. */
    y: number;
    /** Cell width in canvas CSS pixels. */
    width: number;
    /** Cell height in canvas CSS pixels. */
    height: number;
    row: number;
    col: number;
}

export declare class XlsxViewer implements ZoomableViewer {
    private wb;
    /** The single subtree root the constructor appended to the caller's
     *  container. destroy() removes it to return the container to its original
     *  (empty) state. */
    private wrapper;
    private canvas;
    /** Region holding the outline gutters (top/left) and the inset {@link canvasArea}.
     *  When the active sheet has no outlining the gutters collapse to 0 px and this
     *  is a transparent pass-through, so an outline-free sheet lays out identically. */
    private gridRegion;
    /** Left gutter canvas: row group brackets + toggles (XL4). */
    private rowGutter;
    /** Top gutter canvas: column group brackets + toggles (XL4). */
    private colGutter;
    /** Top-left corner canvas: numbered level buttons (XL4). */
    private cornerGutter;
    /** Cached extents (unscaled CSS px) of the current sheet's gutters; both 0 for
     *  an outline-free sheet. `w` insets {@link canvasArea} from the left, `h` from
     *  the top. */
    private gutter;
    /** Per-axis outline layout (group brackets + toggles) for the current sheet,
     *  recomputed on sheet switch and after each collapse/expand. `null` axis ⇒ no
     *  outlining on that axis. */
    private rowOutline;
    private colOutline;
    private rowOutlineBands;
    private colOutlineBands;
    /** Original row heights / column widths stashed the first time a band is
     *  collapsed, so expanding restores a custom size rather than the default.
     *  Keyed by band index; per current worksheet (cleared on sheet switch). */
    private stashedRowHeights;
    private stashedColWidths;
    /**
     * Per-sheet cumulative record of every view-only size mutation (outline
     * collapse/expand, drag-to-resize #567), keyed by sheet index. Value = the
     * band's current model size, or `null` when the model has no entry (default
     * size). Serialized as {@link WireSizeOverrides} with every worker
     * `renderViewport` so the worker's local sheet cache converges to the
     * main-thread model — without it the worker keeps drawing the file's
     * original sizes and the grid bitmap goes stale under the (up-to-date)
     * gutter and overlays. Entries are updated in place and never removed
     * (idempotent re-application); the whole store resets when a new workbook
     * loads. Main mode never reads it (the main renderer draws from the mutated
     * model directly).
     */
    private sizeOverrideStore;
    private canvasArea;
    private scrollHost;
    private spacer;
    private tabBar;
    private tabStrip;
    private navPrev;
    private navNext;
    private navGroup;
    private tabs;
    /** Per-tab colors parallel to `tabs`, from `<sheetPr><tabColor>`. */
    private tabColors;
    private zoomSlider;
    private zoomLabel;
    private currentSheet;
    private _hiddenSheetMode;
    private currentWorksheet;
    private opts;
    /** 'main' renders on this thread; 'worker' paints worker-produced bitmaps. */
    private readonly _mode;
    /** The canvas's bitmaprenderer context, used only in worker mode. A canvas
     *  holds one context type for its lifetime, so this is obtained once and the
     *  main-mode 2d render path is never used on the same canvas. */
    private _bitmapCtx;
    /** Set by {@link destroy} (first line). Guards {@link _reportRenderError} so a
     *  render rejection that lands AFTER teardown is swallowed rather than surfaced
     *  to an `onError` / `console.error` on a dead viewer — parity with the scroll
     *  viewers' `_destroyed` flag. */
    private _destroyed;
    /**
     * Concurrent-load latch (generation token). Every {@link load} increments this
     * and captures the value; after its workbook finishes loading it re-checks the
     * live value and BAILS (destroying its own just-loaded workbook) if a newer
     * `load()` has since started. Without it, two overlapping `load(A)`/`load(B)`
     * calls race the WASM parse / worker init, and whichever RESOLVES last wins the
     * swap — even the stale `load(A)` resolving after `load(B)`; the loser's freshly
     * created workbook (never installed, or installed then overwritten) then leaks
     * its worker + pinned WASM allocation. The latch composes with SC20: the check
     * runs AFTER the new workbook loads but BEFORE the field assignment and
     * `previous?.destroy()`, so a superseded load never touches `this.wb` nor frees
     * the current (newer) workbook. {@link destroy} also bumps it so a load in
     * flight at teardown is treated as superseded and its workbook cleaned up.
     */
    private _loadGen;
    private resizeObserver;
    /**
     * Pending `requestAnimationFrame` handle for a coalesced re-render, or `null`
     * when none is scheduled. High-frequency event-driven repaints (scroll, live
     * resize drag, selection drag, container resize) route through
     * {@link scheduleRender} so at most one render runs per animation frame: a
     * burst of scroll events within a single frame collapses to one draw at the
     * frame's latest scroll position (`renderCurrentSheet` reads the live scroll
     * offset, so "latest wins" needs no stored position). Explicit API calls
     * (`showSheet`/`goToSheet`, `select`, `setScale`) stay synchronous — they must
     * paint immediately, not a frame later. `destroy()` cancels any pending frame.
     */
    private _rafId;
    /**
     * Monotonic render-request counter for worker-mode stale-frame dropping.
     * Every {@link renderCurrentSheet} bumps it and captures the value before it
     * awaits the worker's bitmap; on resolution a captured value below the current
     * one means a newer render was requested meanwhile (scroll moved on, the sheet
     * switched, a zoom changed), so that bitmap is stale and must be closed and
     * dropped instead of painted over the fresher frame. The WorkerBridge already
     * correlates each request↔response by id, but requests overlap — a slow bitmap
     * for an old scroll position can resolve after a newer one — so the viewer
     * needs this generation guard, the single-canvas analogue of the pptx
     * scroll-viewer's per-slot render epoch (PR #663). The main-thread path renders
     * synchronously and cannot interleave, so it needs no guard.
     */
    private _renderSeq;
    /**
     * Start-anchored horizontal scroll position (the {@link effectiveScrollLeft}
     * value last produced by a real user scroll or a programmatic reset), kept
     * as the source of truth across container size changes. The native
     * `scrollLeft` cannot serve that role for RTL sheets (ECMA-376 §18.3.1.87):
     * it is the *inverse* of the start-anchored offset, and the browser clamps
     * any assignment to 0 while the host is unlaid-out (`display:none` mount —
     * e.g. a host revealed only after `load()` resolves), which would otherwise
     * strand the view at the sheet's far end once the host gains its real size.
     */
    private effectiveH;
    /** Gesture-only pointer anchor for the NEXT `setScale`, in canvasArea-viewport
     *  px (`{ x, y }` from the wheel event, relative to the grid's top-left). Set by
     *  the Ctrl/⌘+wheel handler right before it calls `setScale` so the zoom pivots
     *  on the cursor ("zoom toward the pointer") in BOTH axes, past the fixed
     *  header + frozen-pane lead-in; consumed and cleared by `setScale`. `null` for
     *  every non-gesture source (the public `setScale`, the +/- steppers, the zoom
     *  slider, `fitWidth`/`fitPage`), which keep the historical START-anchored
     *  (top-left) preservation so their behaviour is unchanged. */
    private _pendingZoomAnchor;
    private anchorCell;
    private activeCell;
    private selectionMode;
    private isSelecting;
    private selectionOverlay;
    /** IX2 — find-highlight overlay (matched-cell boxes). */
    private findOverlay;
    /** IX2 — find state (matches + active cursor). */
    private _find;
    private keydownHandler;
    private pendingTap;
    private pendingClick;
    private resizeDrag;
    /** DOM overlay element that shows the hovered cell's comment. Lives in
     *  canvasArea above the scrollHost; `pointer-events:none` so it never blocks
     *  cell interaction. */
    private commentPopup;
    /** `"row:col"` → comment for the current sheet, rebuilt on every showSheet. */
    private commentMap;
    /** IX1 — `"row:col"` → hyperlink for the current sheet, rebuilt on every
     *  showSheet. Keys mirror the renderer's `hyperlinkMap` (1-based row/col, the
     *  first cell of a hyperlink `ref` range per the parser), so a `getCellAt`
     *  {row,col} looks up directly. */
    private hyperlinkMap;
    /** `"row:col"` of the cell whose popup is currently shown (or pending), so a
     *  pointermove within the same cell doesn't restart the show timer. */
    private commentPopupKey;
    /** Pending show timer (see {@link COMMENT_POPUP_DELAY_MS}). */
    private commentPopupTimer;
    /** DOM overlay listing a list-validated cell's allowed values. Lives in
     *  canvasArea above the scrollHost; unlike the comment popup this is a click
     *  target (`pointer-events:auto`). Read-only: hovering an item highlights it
     *  but selecting does NOT change the cell. */
    private validationPanel;
    /** `"row:col"` of the cell whose panel is currently open, or null. Lets a
     *  re-click on the same arrow toggle the panel closed. */
    private validationPanelKey;
    /** Screen rect (canvasArea CSS px) of the dropdown arrow button last drawn by
     *  {@link maybeDrawValidationDropdown}, so pointerdown can hit-test it. Null
     *  when no arrow is currently visible. */
    private validationArrowRect;
    /** Document-level pointerdown listener that closes the panel on an outside
     *  click; installed only while the panel is open. */
    private validationOutsideHandler;
    constructor(container: HTMLElement, opts?: XlsxViewerOptions);
    /** Every non-empty cell of a sheet with its rendered display text (IX2 find
     *  source). Reads the parsed worksheet model directly — no render — so search
     *  covers the whole sheet, not just the on-screen viewport. */
    private _collectSheetCells;
    /**
     * Load an XLSX from URL or ArrayBuffer and render the first sheet.
     *
     * Error contract (shared by all three viewers):
     * - Parse/load failure (the underlying `XlsxWorkbook.load()` call itself
     *   rejects): if an `onError` callback was provided it is invoked and `load`
     *   resolves normally; if not, the error is rethrown so it is never silently
     *   swallowed.
     * - Render failure (the first sheet fails to draw AFTER a successful
     *   parse/load): routed to the shared `_reportRenderError` contract (`onError`
     *   if provided, else `console.error` — never silent) and `load` still
     *   RESOLVES, matching every subsequent navigation call.
     */
    load(source: string | ArrayBuffer): Promise<void>;
    /** The loaded workbook, or throws if {@link load} has not completed. */
    private get workbook();
    showSheet(index: number): Promise<void>;
    /** Recompute the per-axis outline layout for `ws` and cache the band lists.
     *  Both axes are `null` (gutters collapse to 0) when the sheet has no
     *  outlining, so an outline-free sheet is untouched. */
    private buildOutline;
    /** Size and place the three gutter canvases (corner / col / row) from the
     *  current outline, and inset {@link canvasArea} by the gutter extents. When
     *  neither axis is grouped both extents are 0 and canvasArea covers the whole
     *  region — pixel-identical to a viewer built before XL4. */
    private layoutGutters;
    /** Paint all visible gutter strips for the current scroll offset. Called at the
     *  end of every grid render so the brackets track scroll / zoom exactly. */
    private renderGutters;
    /** Draw one axis's group brackets and +/- toggles into its gutter canvas,
     *  aligned to the on-screen band positions via {@link getCellRect}. */
    private paintAxisGutter;
    /** Draw a small square +/- toggle centered at (cx, cy) in gutter-canvas CSS px. */
    private drawToggleBox;
    /** Draw one numbered level button centered at (cx, cy) in gutter-canvas CSS
     *  px. Shared by the row bank (in the row gutter's top strip) and the column
     *  bank (in the column gutter's left strip). */
    private drawLevelButton;
    /** Paint the corner (intersection of the two gutters) as plain background.
     *  The numbered level banks live in each axis gutter's own header strip
     *  (see paintAxisGutter), so the corner carries no interactive content. */
    private paintCornerGutter;
    /** Handle a click in a row/col gutter: hit-test the +/- toggles and toggle the
     *  matching group's collapse state. */
    private onGutterPointerDown;
    /** Flip a single group's collapse state in the in-memory model, then rebuild
     *  the outline + repaint. View-only: the file is never written. */
    private applyGroupToggle;
    /** Collapse/expand the whole sheet to `level` on one axis. */
    private applyLevelButton;
    /** Set a row/column hidden by mapping to the size-0 encoding the axis/renderer
     *  already understand, stashing the original size so expand can restore it. */
    private setBandHidden;
    /** Record band `index`'s CURRENT model size (or `null` = no entry) in the
     *  per-sheet override store. Called after every view-only size mutation —
     *  outline hide/show above and drag-to-resize (#567) — so worker renders
     *  converge to the main model. */
    private recordSizeOverride;
    /** The current sheet's override store serialized for the wire, or undefined
     *  when nothing has been mutated (keeps the request payload unchanged). */
    private wireSizeOverrides;
    /** Update the `collapsed` flag on a band's model entry so the outline rebuild
     *  reflects the new state. */
    private setBandCollapsed;
    /** Shared tail of a gutter interaction: invalidate the axis cache, rebuild the
     *  outline (collapsed flags changed), refresh dependent geometry, re-render. */
    private afterOutlineMutation;
    /** Rebuild only the layout + band lists (not the stashes) after a collapse
     *  state change, so the +/- glyphs and bracket set stay in sync. */
    private buildOutlineLayoutOnly;
    /** True when the current sheet's grid is laid out right-to-left. */
    private get isRtl();
    /** Maximum horizontal scroll offset the native scroll host allows (≥ 0). */
    private get maxScrollLeft();
    /**
     * The logical horizontal scroll position used to find the start-of-sheet
     * (col A) edge, in *scaled* CSS pixels — the same unit as
     * `scrollHost.scrollLeft`. The renderer always lays the grid out LTR and then
     * mirrors it (ECMA-376 §18.3.1.87), so the viewer must hand it a position
     * where 0 = the START of the sheet (col A) and increasing values reveal later
     * columns.
     *
     * For LTR that is exactly the native `scrollLeft`. For RTL the sheet starts at
     * the RIGHT, so the native scrollbar runs the opposite way: thumb fully right
     * (`scrollLeft = maxScrollLeft`) is the start, thumb left is the far columns.
     * Inverting here makes wheel/trackpad follow the finger and aligns the
     * thumb↔page mapping with Excel, without depending on browser-specific RTL
     * `scrollLeft` sign conventions.
     */
    private get effectiveScrollLeft();
    /**
     * Map between the logical-LTR x used by all the cell-geometry math and the
     * on-screen (canvasArea CSS-pixel) x, applying the RTL mirror (ECMA-376
     * §18.3.1.87) via the same {@link rtlMirrorX} the renderer uses. For LTR this
     * is the identity. The mirror is an involution, so this one method serves
     * both cell→px (overlay draw, `w` = cell width) and px→cell (pointer
     * hit-testing, `w` = 0 for a point) — guaranteeing the overlay sits exactly
     * where the cell is drawn and a click resolves to that same cell at every
     * scroll offset. `canvasArea.clientWidth` equals the renderer's `canvasW`.
     */
    private screenX;
    /** Park the scrollbar at the sheet's natural start: scrollLeft=0 for LTR,
     *  the right end for RTL (so col A shows first). */
    private resetHorizontalScroll;
    /** Re-derive the native scrollLeft from the tracked start-anchored
     *  position after the scroll host's size changes. Only RTL needs this:
     *  for LTR the native scrollLeft *is* start-anchored and the browser
     *  already clamps it sensibly on resize. */
    private reanchorHorizontalScroll;
    /** 0-based index of the currently displayed sheet. */
    get sheetIndex(): number;
    /** Total number of sheets in the loaded workbook. */
    get sheetCount(): number;
    /**
     * Navigate to a sheet by index, clamped to range. Canonical navigation verb
     * matching {@link PptxViewer.goToSlide} / {@link DocxViewer.goToPage};
     * {@link showSheet} is the lower-level form that assumes a valid index.
     */
    goToSheet(index: number): Promise<void>;
    nextSheet(): Promise<void>;
    prevSheet(): Promise<void>;
    /** Next sheet index for sequential nav: skip mode jumps over hidden sheets. */
    private _stepSheet;
    /** Initial sheet for load() / entering skip mode: land on a visible sheet. */
    private _initialSheet;
    /** Returns the cell at canvas-client coordinates, or null if outside the cell grid. */
    getCellAt(clientX: number, clientY: number): CellAddress | null;
    /** Returns the CSS-pixel rect of a cell within canvasArea, or null if not
     *  computable. Mirrors the renderer's per-cell rounding (Math.round(px * cs))
     *  so the selection overlay sits exactly on the canvas's drawn cell borders;
     *  multiplying logical accumulators by `cs` once at the end (the previous
     *  approach) drifted by up to 1 px per cell at non-integer scales.
     */
    private getCellRect;
    /** Returns the current selection, including mode. */
    get selection(): CellRange | null;
    /**
     * Programmatically select a single cell by A1 reference (e.g. `"B2"`), as if
     * the user had clicked it: updates the active/anchor cell, redraws the
     * selection overlay (including any list-validation dropdown arrow), and fires
     * `onSelectionChange`. A no-op for malformed refs. Closes any open validation
     * panel, matching the click path.
     */
    select(ref: string): void;
    /**
     * Returns what the header area contains at the given client coordinates.
     * Returns null when the point is in the cell grid (not a header).
     */
    private getHeaderHit;
    /**
     * If the pointer sits on a column/row-header border (within {@link
     * RESIZE_GRAB_PX}), return the resize target: which index to resize and the
     * fixed LTR edge it grows from (in canvasArea CSS px). Excel resizes the band
     * whose *trailing* border you grab — the column to the left of a vertical
     * border, the row above a horizontal one — so both that band and its
     * neighbour-to-the-far-side are checked. Geometry comes straight from {@link
     * getCellRect}, so the grab line always coincides with the drawn border at any
     * scroll offset / zoom / RTL. Returns null off the header borders.
     */
    private getResizeTarget;
    /**
     * Apply a live resize drag: size the band from its fixed origin edge to the
     * current pointer, clamp to {@link RESIZE_MIN_PX}, and write the result back
     * into the in-memory worksheet model in its native unit (Excel column widths /
     * points). This is a *view-only* mutation — the file is never written. The
     * memoized axis cache for this sheet is invalidated so every geometry read
     * (spacer, hit-test, overlay, renderer) sees the new size on the next frame.
     */
    private applyResize;
    /**
     * Change the cell-selection highlight color at runtime (see {@link
     * XlsxViewerOptions.selectionColor}). The border takes the color as-is and the
     * fill becomes a translucent shade of it; the current selection repaints
     * immediately.
     */
    setSelectionColor(color: string): void;
    /**
     * Switch the hidden-sheet mode at runtime: restyle the tabs and re-render.
     * Entering `'skip'` while on a hidden sheet advances to the nearest visible.
     */
    setHiddenSheetMode(mode: HiddenSheetMode): Promise<void>;
    /** The current hidden-sheet mode. */
    get hiddenSheetMode(): HiddenSheetMode;
    /** Number of non-hidden sheets (absolute `sheetCount` is unchanged). */
    get visibleSheetCount(): number;
    /** Copy the selected cell range as tab-separated text to the clipboard. */
    private copySelection;
    private updateSelectionOverlay;
    /** Draw the Excel list-validation dropdown button just outside the
     *  bottom-right corner of the *active* cell when that cell is covered by a
     *  `list` data-validation rule. Anchored to the single active cell (not the
     *  whole range) to mirror Excel, which attaches the button to the active
     *  cell of the selection. */
    private maybeDrawValidationDropdown;
    /**
     * Redraw the find-highlight overlay: one translucent box per matched cell on
     * the current sheet, the active match in a stronger colour. Uses the SAME
     * `getCellRect` + `screenX` + header/frozen clamp the selection overlay uses,
     * so a box lands exactly on the drawn cell at any scroll offset / zoom / RTL.
     * Rebuilt on every render and scroll (cheap DOM geometry, no canvas paint).
     */
    private updateFindOverlay;
    /**
     * IX2 — find every occurrence of `query` across every sheet and highlight the
     * matched cells. Returns every match in document order (sheet ascending, then
     * row-major within a sheet), each tagged with its
     * `{ sheet, sheetName, ref, row, col }`. A cell is the search unit: search
     * runs over each cell's *rendered* display text (number formats, dates, rich
     * text flattened), so a query matches what the grid shows. Case-insensitive by
     * default; pass `{ caseSensitive: true }` for an exact match. An empty query
     * clears the find.
     */
    findText(query: string, opts?: FindMatchesOptions): Promise<FindMatch<XlsxMatchLocation>[]>;
    /**
     * IX2 — move to the next match (wrap-around), switching sheets and scrolling
     * the matched cell into view as needed, and highlight it as the active match.
     * Returns the now-active match, or `null` when there are none. Call
     * {@link findText} first.
     */
    findNext(): Promise<FindMatch<XlsxMatchLocation> | null>;
    /** IX2 — move to the previous match (wrap-around). */
    findPrev(): Promise<FindMatch<XlsxMatchLocation> | null>;
    /** IX2 — clear all highlights and reset the find state. */
    clearFind(): void;
    private _activateMatch;
    /**
     * Scroll the grid so cell (row, col) is comfortably in view. Computes the
     * cell's absolute logical offset from the axis metrics (the same the renderer
     * uses) and nudges `scrollHost.scrollTop` / start-anchored horizontal scroll
     * only when the cell is outside the scrollable viewport — an in-view cell is
     * left where it is (Excel's find behaviour). Frozen cells are always visible,
     * so they need no scroll.
     */
    private _scrollCellIntoView;
    /** Toggle the dropdown panel for the active cell's list validation. Called
     *  from pointerdown when the arrow rect is hit. Re-clicking the same arrow
     *  closes it. */
    private toggleValidationPanel;
    /** Resolve the allowed values for `formula1` (relative to the current sheet)
     *  and render them in the panel anchored below the active cell. Async because
     *  cross-sheet range references may need a lazily-parsed worksheet. */
    private openValidationPanel;
    /** Build the panel's children. Uses textContent throughout (no HTML injection
     *  from cell values). Items highlight on hover but are NOT selectable —
     *  this is a read-only viewer, so clicking a value must not change the cell. */
    private renderValidationPanel;
    /** Position the (already-populated, visible-or-becoming-visible) panel below
     *  the dropdown arrow / active cell using the pure geometry calculator. */
    private positionValidationPanel;
    /** Install a document-level pointerdown listener that closes the panel on a
     *  click outside it (and outside the arrow, which toggles via its own path).
     *  Removed by {@link hideValidationPanel}. */
    private installValidationOutsideHandler;
    /** Hide the panel and detach its outside-click listener. Called on re-click,
     *  outside click, Esc, scroll, selection change, sheet switch and destroy. */
    private hideValidationPanel;
    /** Build the `"row:col"` → comment index for the given sheet. Parses each
     *  `XlsxComment.cellRef` with the shared {@link parseA1}; later refs win on a
     *  collision (Excel allows at most one note per cell, so this is moot in
     *  practice). */
    private buildCommentMap;
    /** IX1 — index the current sheet's hyperlinks by `"row:col"` (1-based, first
     *  cell of the `ref` range) so a clicked/hovered cell resolves in O(1). Keys
     *  match the renderer's `hyperlinkMap` exactly (`${hl.row}:${hl.col}`). */
    private buildHyperlinkMap;
    /** IX1 — the hyperlink at a cell, or null. `getCellAt` returns 1-based
     *  {row,col}, matching the parser/renderer keying. */
    private hyperlinkAtCell;
    /**
     * IX1 — dispatch a click on a hyperlinked cell. Builds a
     * {@link HyperlinkTarget} from the parsed hyperlink (external `url` wins over
     * internal `location`, matching Excel: a `<hyperlink>` carrying both navigates
     * to the external target) and routes it to the caller's `onHyperlinkClick`
     * (which fully owns behaviour) or the built-in default. Returns true when a
     * hyperlink was found and dispatched.
     */
    private dispatchHyperlink;
    /**
     * IX1 default handler for an internal `location` target (§18.3.1.47): a defined
     * name or a cell ref like `Sheet1!A1`. Best-effort: if the part before `!`
     * names a sheet in the workbook, switch to it. There is no scroll-to-cell
     * primitive on this viewer, so the cell part is not yet honoured (switching the
     * sheet already lands the user on the right surface). A bare defined name that
     * does not resolve to a sheet is a documented no-op.
     */
    private navigateInternalHyperlink;
    /** Show the popup for the comment on `cell` after the hover dwell, anchored to
     *  the cell's current on-screen rect. No-op when the cell carries no comment.
     *  Re-hovering the same cell does not restart the timer. */
    private scheduleCommentPopup;
    /** Immediately render the popup for `comment` anchored to `cell` (used by the
     *  hover-dwell timer and by touch selection, which has no hover). */
    private renderCommentPopup;
    /** Hide the popup and cancel any pending show. Called on cell-out, scroll,
     *  sheet switch and destroy. */
    private hideCommentPopup;
    private applyPointerSelection;
    private setupSelectionEvents;
    private buildTabs;
    private makeNavButton;
    private navButtonStyle;
    private scrollTabs;
    private updateNavButtons;
    private updateTabActive;
    private tabStyle;
    /**
     * Full inline style for the tab of sheet `i`, honoring the hidden-sheet mode:
     * `'skip'` hides the tab of a hidden/veryHidden sheet (`display:none`); `'dim'`
     * greys it but leaves it clickable; `'show'` styles every tab normally. Used
     * by both buildTabs and updateTabActive so navigation never wipes the styling.
     */
    private tabCss;
    /** Excel-style zoom control pinned to the right end of the tab bar:
     *  `−  [────slider────]  +  100%`. Live-updates the cell scale on input. */
    private buildZoomControl;
    /** Map a slider position [0,100] to a scale factor. 50 → 1.0 (100%), with a
     *  separate linear segment on each side so the center is always 100%. */
    private zoomPosToScale;
    /** Inverse of {@link zoomPosToScale}: scale factor → slider position [0,100]. */
    private zoomScaleToPos;
    /**
     * IX9 {@link ZoomableViewer} — set the cell/header scale (`1` = 100%; the
     * viewer's `cellScale`) and re-lay-out the current sheet. Clamped to the zoom
     * bounds and snapped to whole percent; keeps the slider thumb, percentage label
     * and the row-header-aligned tab-nav width in sync, and fires `onScaleChange`
     * when the resolved scale actually changes.
     */
    setScale(scale: number): void;
    /** IX9 {@link ZoomableViewer} — the current zoom factor (`1` = 100%). This is
     *  the viewer's `cellScale`; `1` before anything is set. */
    getScale(): number;
    /** IX9 {@link ZoomableViewer} — step up to the next rung of the shared zoom
     *  ladder (clamped to `zoomMax` by {@link setScale}). */
    zoomIn(): void;
    /** IX9 {@link ZoomableViewer} — step down to the next lower ladder rung. */
    zoomOut(): void;
    /**
     * IX9 {@link ZoomableViewer} — fit the used data range's WIDTH to the canvas
     * area. The "content" is the natural (100%) width of the row header plus the
     * used columns; the container is `canvasArea.clientWidth`. A no-op (defers) when
     * nothing is loaded or the container is unlaid-out. Routes through
     * {@link setScale}, so the result is clamped/snapped and fires `onScaleChange`.
     */
    fitWidth(): void;
    /**
     * IX9 {@link ZoomableViewer} — fit the used data range's WIDTH AND HEIGHT inside
     * the canvas area (header + used columns/rows), so the whole used range is
     * visible without scrolling. Takes the tighter of the width- and height-fit
     * factors. Defers when unloaded / unlaid-out; routes through {@link setScale}.
     */
    fitPage(): void;
    /** Shared fit implementation for {@link fitWidth} / {@link fitPage}: derive the
     *  natural (cs=1) content extent of the used data range, ask core's pure
     *  {@link fitScale} for the factor, and apply it via {@link setScale}. */
    private _fit;
    /** Natural (unscaled, cs=1) CSS-px extent of a worksheet's used data range:
     *  the row/column header plus every used column width / row height. Mirrors
     *  {@link updateSpacerSize} at cs=1 (same used-range detection) so the fit
     *  targets exactly the region the spacer/scroll extent covers. */
    private _naturalContentExtent;
    private updateSpacerSize;
    /**
     * Coalesce a re-render into the next animation frame. Called from the
     * high-frequency event-driven paths (scroll, live column/row resize, drag-
     * selection, container resize); a burst of these within one frame schedules a
     * single {@link renderCurrentSheet}, avoiding the previous behavior where every
     * scroll event forced its own synchronous full redraw. Already-scheduled frames
     * are not re-scheduled — the one pending render reads the live scroll/scale
     * state when it runs, so the most recent position always wins without threading
     * a coordinate through. Falls back to a synchronous render when
     * `requestAnimationFrame` is unavailable (e.g. a non-DOM host), preserving the
     * old semantics there.
     */
    private scheduleRender;
    private renderCurrentSheet;
    /** Route a render failure to `onError`, or `console.error` when none is given
     *  (never fully silent), and never after teardown. Mirrors the scroll viewers'
     *  `_reportRenderError`. */
    private _reportRenderError;
    private _renderCurrentSheet;
    private computeHeaderHighlight;
    get sheetNames(): string[];
    /** The underlying <canvas> element the grid is drawn on. */
    get canvasElement(): HTMLCanvasElement;
    /**
     * Tear down the viewer and release resources.
     *
     * The caller's container is returned to the state it had before construction
     * (empty): the entire wrapper subtree the constructor appended is removed.
     * All document-level listeners are detached — the keydown handler here, and
     * the validation-panel outside-click handler via {@link hideValidationPanel}.
     * Listeners on elements inside the wrapper (scrollHost, tabs, …) need no
     * explicit removal: removing the subtree makes them unreachable and eligible
     * for GC. Safe to call more than once.
     *
     * NOTE: the shared `<style>` in `document.head` is intentionally NOT removed —
     * it is a class constant that any still-live viewer may depend on, and one
     * leftover sheet is a bounded, harmless cost (see {@link ensureViewerStyleInjected}).
     */
    destroy(): void;
}

export declare interface XlsxViewerOptions extends LoadOptions_2 {
    /** Scale factor for cell/header dimensions (default 1). 0.5 = half size. */
    cellScale?: number;
    /**
     * Enable drag-to-resize of column widths / row heights by dragging header
     * borders. Resizing only changes the on-screen view — it never modifies the
     * loaded file. Default: true.
     */
    resizable?: boolean;
    /** Show the Excel-style zoom slider at the right end of the sheet-tab bar.
     *  Default `true`. Set `false` to hide it (e.g. when the host supplies its
     *  own zoom control). */
    showZoomSlider?: boolean;
    /** Lower/upper bounds for the zoom slider as scale factors. Default 0.1–4
     *  (10%–400%, matching Excel's zoom range). Also the clamp range for the IX9
     *  {@link ZoomableViewer} zoom contract ({@link XlsxViewer.setScale} etc.). */
    zoomMin?: number;
    zoomMax?: number;
    /**
     * IX9 — fires whenever the zoom factor actually changes (`1` = 100%), whatever
     * the source: {@link XlsxViewer.setScale}, {@link XlsxViewer.zoomIn} /
     * {@link XlsxViewer.zoomOut}, {@link XlsxViewer.fitWidth} /
     * {@link XlsxViewer.fitPage}, the built-in zoom slider, the +/- buttons, or a
     * Ctrl/⌘+wheel gesture. Named `onScaleChange` to match the docx/pptx viewers so
     * all five share one notification shape. Not fired when a call resolves to the
     * same (clamped/snapped) scale.
     */
    onScaleChange?: (scale: number) => void;
    onReady?: (sheetNames: string[]) => void;
    /**
     * Called when the active sheet changes, with the new sheet's zero-based
     * `index` and the `total` number of sheets in the workbook. This mirrors the
     * docx `onPageChange` and pptx `onSlideChange` contracts so all three viewers
     * share one callback shape. To get the sheet *name*, look it up by index from
     * `viewer.sheetNames[index]` (or the `sheetNames` array delivered to
     * `onReady`).
     */
    onSheetChange?: (index: number, total: number) => void;
    onError?: (err: Error) => void;
    /** Called when the selected cell range changes. null means no selection. */
    onSelectionChange?: (selection: CellRange | null) => void;
    /**
     * IX1 (design decision — NOT user-confirmed, integrator may veto). Fires when a
     * cell carrying a hyperlink (ECMA-376 §18.3.1.47) is clicked. Default when
     * omitted: external → {@link openExternalHyperlink} (new tab, sanitised,
     * noopener); internal (`location`) → navigate to the referenced sheet/cell
     * when resolvable. When supplied, this callback fully owns the behaviour and
     * receives the raw {@link HyperlinkTarget} verbatim (URL sanitisation is the
     * default handler's job, so a blocked scheme still reaches a custom callback).
     */
    onHyperlinkClick?: (target: HyperlinkTarget) => void;
    /**
     * Color of the cell-selection highlight. A single CSS color drives both the
     * selection rectangle's border (drawn in this color) and its fill (the same
     * color made translucent — see {@link selectionOverlayStyle}), so callers pick
     * one accent color instead of a separate border + background. Any CSS color
     * string works (`#1a73e8`, `rgb(...)`, `tomato`, …). Default `#1a73e8`
     * (Google blue), matching the historical look. Can also be changed at runtime
     * via {@link XlsxViewer.setSelectionColor}.
     */
    selectionColor?: string;
    /**
     * `'main'` (default): parse in a worker, render on the main thread. `'worker'`:
     * parse AND render entirely inside the worker and paint the returned
     * ImageBitmap onto the viewer's canvas, so document rendering never blocks the
     * UI thread. All interaction (scroll, sheet tabs, frozen panes, zoom, cell
     * selection) is unchanged. Requires `Worker` + `OffscreenCanvas`. Equations
     * require `'main'` (the math engine cannot cross the worker boundary).
     */
    mode?: 'main' | 'worker';
    /**
     * How hidden / veryHidden sheets (`<sheet state>`, ECMA-376 §18.2.19) are
     * presented:
     * - `'show'` (default): every sheet gets a tab — current behavior.
     * - `'skip'`: hidden/veryHidden sheets get no tab and are jumped over by
     *   `nextSheet`/`prevSheet` and initial load; absolute indices are unchanged,
     *   and an explicit `goToSheet(i)` to a hidden sheet is still honored.
     * - `'dim'`: hidden/veryHidden tabs are shown greyed but stay selectable.
     *
     * Named to match the {@link XlsxViewer.hiddenSheetMode} getter and
     * {@link XlsxViewer.setHiddenSheetMode} setter. Mirrors pptx `hiddenSlideMode`.
     */
    hiddenSheetMode?: HiddenSheetMode;
}

export declare class XlsxWorkbook {
    private worker;
    private bridge;
    private parsedWorkbook;
    private sheetCache;
    /** Cache of decoded image sources keyed by their zip `imagePath`. Shared
     *  across sheets. */
    private imageCache;
    /** Cache of fetched image *bytes* (as Blobs) keyed by zip path, populated by
     *  {@link XlsxWorkbook.getImage}. Twin of pptx/docx's per-instance
     *  `_imageCache`; kept separate from {@link XlsxWorkbook.imageCache} (decoded
     *  sources) so each layer dedupes independently. */
    private imageBlobCache;
    /** One stable closure per instance: core's path-keyed SVG cache namespaces on
     *  this identity, so two open workbooks never swap a shared zip path (e.g.
     *  xl/media/image1.svg). Reusing one reference also lets the SVG cache hit
     *  across viewport renders. */
    private readonly _fetchImage;
    private rawData;
    private maxZipEntryBytes;
    /** Opt-in OMML equation engine, injected once at {@link load}. Every
     *  `renderViewport` call reuses it — equations in shapes render when present,
     *  and are skipped (engine tree-shaken) when omitted. */
    private math;
    /** Google-Fonts `FontFace` objects this workbook preloaded into `document.fonts`
     *  (main mode only — in worker mode the worker owns them and terminates with its
     *  own FontFaceSet). Released in {@link destroy} so they do not leak into the
     *  shared FontFaceSet for the lifetime of the SPA (deduped + refcounted in core,
     *  so a web font shared with another open workbook survives until both go). */
    private googleFontFaces;
    private _mode;
    private constructor();
    /** Parse an XLSX from a URL or ArrayBuffer. */
    static load(source: string | ArrayBuffer, opts?: LoadOptions): Promise<XlsxWorkbook>;
    private _load;
    get sheetNames(): string[];
    get sheetCount(): number;
    /** Per-sheet tab colors (`#RRGGBB`) parallel to {@link sheetNames}.
     *  `null` for sheets that declare no tab color. */
    get tabColors(): (string | null)[];
    /**
     * Full visibility fact for the sheet at `sheetIndex` (0-based):
     * `'visible'` | `'hidden'` | `'veryHidden'` (`<sheet state>`, ECMA-376
     * §18.2.19). NOT clamped — out-of-range / non-integer ⇒ `'visible'`. This is a
     * *fact*; deciding what to do with a hidden sheet (hide/skip/dim its tab) is
     * {@link XlsxViewer}'s policy. `'veryHidden'` is revealable only
     * programmatically in Excel; it is surfaced distinctly here.
     */
    sheetVisibility(sheetIndex: number): SheetVisibility;
    /**
     * Whether the sheet at `sheetIndex` is hidden or veryHidden. Convenience over
     * {@link sheetVisibility}; mirrors {@link PptxPresentation.isHidden} (non-
     * clamped: out-of-range / non-integer ⇒ `false`).
     */
    isHidden(sheetIndex: number): boolean;
    getWorksheet(sheetIndex: number): Promise<Worksheet>;
    /**
     * Fetch an embedded image's bytes by zip path (e.g. `xl/media/image1.png`),
     * wrapped in a Blob of the given MIME. The bytes are pulled through the
     * persistent worker via the `extractImage` message (twin of pptx/docx's
     * `getImage`/`getMedia`); results are cached by path for the lifetime of this
     * instance. The renderer's `fetchImage` option points here so image bytes are
     * extracted lazily rather than inlined as base64 at parse time.
     *
     * Routed through the worker even though the main thread also retains
     * `rawData`, to keep all WASM `extract_image` decoding on the worker (the
     * route-through-worker decision).
     */
    getImage(imagePath: string, mimeType: string): Promise<Blob>;
    /**
     * Project the workbook to GitHub-flavoured markdown: each sheet becomes a
     * `## SheetName` section followed by a pipe table of its populated bounding
     * box (fully-empty middle rows trimmed, ULP noise masked). Styling, charts,
     * and drawings are discarded — the projection is meant for AI ingestion and
     * full-text search, not layout.
     *
     * Runs entirely in the worker off the archive opened at {@link load} (no
     * re-copy of the file, no re-parse of the model on the main thread), so it
     * works in BOTH `mode: 'main'` and `mode: 'worker'`.
     *
     * @example
     * const wb = await XlsxWorkbook.load(buffer);
     * const md = await wb.toMarkdown();
     */
    toMarkdown(): Promise<string>;
    /**
     * Resolve a `list`-type data-validation `formula1` (ECMA-376 §18.3.1.32) into
     * the set of allowed values to display, evaluated relative to `sheetIndex`
     * (the sheet that owns the validation, used to resolve unqualified ranges):
     *
     * - Inline quoted list `"A,B,C"`        → the literal values.
     * - Range ref `$B$2:$B$5`               → each non-empty cell's *display
     *   string* (the same formatted text the grid shows, via {@link formatCellValue}),
     *   walked row-major. `Sheet2!$A$1:$A$9` resolves against the named sheet
     *   (lazily parsed via {@link getWorksheet}, hence async).
     * - Named range / complex formula       → `{ kind: 'formula' }` carrying the
     *   raw text so the caller can disclose it rather than blanking it.
     *
     * Read-only: this only reads cell values for display; it never writes.
     */
    resolveValidationList(sheetIndex: number, formula1: string | undefined): Promise<ResolvedList>;
    /**
     * IX2 — the display string a cell shows on the grid, i.e. exactly what
     * {@link renderViewport} would draw (number formats, dates, booleans, rich
     * text flattened). Used by {@link XlsxViewer.findText} to search the *rendered*
     * text rather than the raw stored value, so a search matches what the user
     * sees. Threads the workbook styles + the sheet's date system through the
     * shared {@link formatCellValue} (the same call the renderer and
     * validation-list expansion use). Returns `''` before the workbook is loaded.
     */
    cellText(ws: Worksheet, cell: Cell): string;
    renderViewport(target: HTMLCanvasElement | OffscreenCanvas, sheetIndex: number, viewport: ViewportRange, opts?: RenderViewportOptions): Promise<void>;
    /**
     * Render a sheet viewport and return it as an ImageBitmap (both modes; in
     * worker mode the render runs entirely off the main thread). `opts.width` /
     * `opts.height` are required: there is no DOM element to measure in a worker
     * or on an OffscreenCanvas. Paint with
     * `canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap)`.
     *
     * The returned ImageBitmap is owned by the caller: pass it to
     * `transferFromImageBitmap` (which consumes it) or call `bitmap.close()`
     * when done, or its backing memory is held until GC.
     */
    renderViewportToBitmap(sheetIndex: number, viewport: ViewportRange, opts: WireRenderViewportOptions & {
        width: number;
        height: number;
    }): Promise<ImageBitmap>;
    destroy(): void;
}

/**
 * IX9 — the shared zoom API contract for every viewer (DocxViewer, PptxViewer,
 * DocxScrollViewer, PptxScrollViewer, XlsxViewer).
 *
 * This module owns ONLY the pure, DOM-free pieces of the contract: the type
 * ({@link ZoomableViewer}), the discrete zoom-step ladder ({@link nextZoomStep} /
 * {@link prevZoomStep}), the fit-to-content scale math ({@link fitScale}), and the
 * range clamp ({@link clampScale}). Each viewer implements the interface with its
 * own scale field and re-render path; this keeps ONE definition of "what a zoom
 * factor means" and "what the +/- steps are" across all five, so a host can drive
 * any viewer through the same six calls without special-casing the format.
 *
 * SCALE SEMANTICS (the contract): a scale of `1` means 100% — the content at its
 * natural size (a docx page at `widthPt × PT_TO_PX`, a pptx slide at
 * `slideWidth / EMU_PER_PX`, an xlsx grid at `cellScale` 1). `getScale()` and
 * `setScale(n)` speak this user-facing factor for EVERY viewer.
 *
 * KNOWN FAMILY DIFFERENCE — the INITIAL scale right after load (deliberate,
 * documented rather than papered over): the single-canvas viewers (DocxViewer /
 * PptxViewer) and XlsxViewer start at `1` (or the effective factor implied by an
 * explicit `width` option); the continuous-scroll viewers (DocxScrollViewer /
 * PptxScrollViewer) AUTO-FIT to the container on first layout, so their
 * `getScale()` right after load reports the fit-to-width BASE factor (≠ 1 unless
 * the container happens to match the natural width). The unit is identical — only
 * the starting point differs, because fit-to-width is the natural resting state
 * of a continuous document viewer.
 *
 * PRE-LOAD `setScale` (family-unified, IX9 F1): a `setScale` called before the
 * content is loaded / before the layout is established is LATCHED — never
 * silently dropped — and applied once the viewer establishes its scale (the
 * single-canvas viewers honour it on the first render; the scroll viewers apply
 * it right after the base fit establishes, firing `onScaleChange` at application
 * time). `getScale()` reports the latched factor while it is pending.
 *
 * API SHAPE (idiomatic default — the integrator MAY veto; see the IX9 PR): a
 * six-method surface plus one change notification (`onScaleChange`). Deliberately
 * NO new UI here — the contract is API only (design decision IX9 §4). Touch-pinch
 * (IX8) is out of scope.
 */
/**
 * The zoom contract every viewer satisfies. All scales are the user-facing factor
 * where `1` = 100% (see the module note). `fitWidth`/`fitPage` are async because a
 * fit re-renders at the new scale; the getters/steppers resolve synchronously.
 */
declare interface ZoomableViewer {
    /** The current zoom factor (`1` = 100%). Never throws — returns the default
     *  (`1`) before anything is loaded, or the latched pending factor when a
     *  pre-load `setScale` is waiting to be applied (see the module note). */
    getScale(): number;
    /** Set the absolute zoom factor (`1` = 100%), clamped to the viewer's
     *  `[zoomMin, zoomMax]`. Re-renders at the new scale and fires `onScaleChange`
     *  when the clamped value actually changes. Called BEFORE the content is
     *  loaded / the layout is established, the (clamped) factor is LATCHED and
     *  applied once the viewer establishes its scale — family-unified semantics
     *  (IX9 F1): never silently dropped by any viewer. */
    setScale(scale: number): void | Promise<void>;
    /** Step up to the next larger rung of the shared zoom ladder (25 %→400 %),
     *  clamped to `zoomMax`. Equivalent to `setScale(nextZoomStep(getScale()))`. */
    zoomIn(): void | Promise<void>;
    /** Step down to the next smaller ladder rung, clamped to `zoomMin`. */
    zoomOut(): void | Promise<void>;
    /** Fit the content's WIDTH to the container (the common "fit width" / "fit
     *  page width" verb). Sets the scale so one page/slide/sheet-column-run spans
     *  the available width, then re-renders. Resolves once the fit render settles.
     *
     *  PERSISTENCE is viewer-implementation-dependent (deliberate, by family): the
     *  single-canvas viewers (DocxViewer / PptxViewer) and XlsxViewer apply the fit
     *  ONE-SHOT — they observe no container resizes, so a later resize does NOT
     *  re-fit (call `fitWidth()` again after a layout change). The continuous-
     *  scroll viewers (DocxScrollViewer / PptxScrollViewer) re-fit their width-fit
     *  base on every container resize, so a `fitWidth()` there effectively
     *  PERSISTS across resizes (the resize re-fit preserves the width-fit state). */
    fitWidth(): void | Promise<void>;
    /** Fit the WHOLE content (width AND height) inside the container, so an entire
     *  page/slide is visible without scrolling. Sets the scale to the smaller of the
     *  width- and height-fit factors, then re-renders.
     *
     *  PERSISTENCE is viewer-implementation-dependent, and — unlike `fitWidth` —
     *  a page fit does NOT persist across container resizes on ANY viewer: the
     *  single-canvas viewers and XlsxViewer observe no resizes at all (one-shot),
     *  and the continuous-scroll viewers' resize handler re-applies the WIDTH fit
     *  (preserving the zoom multiplier), not the page fit. Re-invoke `fitPage()`
     *  after a layout change to re-fit. */
    fitPage(): void | Promise<void>;
}

export { }
