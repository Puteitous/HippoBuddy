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

export declare type BodyElement = {
    type: 'paragraph';
} & DocParagraph | {
    type: 'table';
} & DocTable | {
    type: 'pageBreak';
    parity?: 'odd' | 'even';
}
/** ECMA-376 §17.3.1.20 `<w:br w:type="column"/>` — force the following content
*  into the next newspaper column (or the next page's first column when
*  already in the last column). Hoisted to the body level by the parser. */
| {
    type: 'columnBreak';
}
/** ECMA-376 §17.6.x — a section boundary in the body. A `<w:sectPr>` carried in
*  a paragraph's `pPr` (or a loose mid-body one) defines the section that ENDS
*  here; the FINAL section's settings live on {@link DocxDocumentModel.section}.
*  `columns` is the ENDING section's `<w:cols>` (§17.6.4; absent ⇒ single
*  full-width column — the spec default for `@w:num` 1). `kind` is the
*  ST_SectionMark (§17.18.79) controlling how the NEXT section starts:
*  "continuous" (same page), "nextPage" (default; page break), "oddPage" /
*  "evenPage" (page break + parity padding). The paginator switches its active
*  newspaper-column geometry per section at each marker — fixing the regression
*  where every section inherited the body-level section's columns.
*
*  `headers`/`footers` carry the ENDING section's resolved (§17.10.1-inherited)
*  header/footer set, and `titlePage` its own `<w:titlePg>` flag, so the renderer
*  can pick the active section's header/footer per page (mirroring how `columns`
*  drives per-section column geometry). The body-level (final) section's sets
*  live on {@link DocxDocumentModel.section}/`.headers`/`.footers` instead. */
| {
    type: 'sectionBreak';
    kind: 'continuous' | 'nextPage' | 'oddPage' | 'evenPage' | string;
    columns?: ColumnsSpec | null;
    headers?: HeadersFooters;
    footers?: HeadersFooters;
    titlePage?: boolean;
    /** ECMA-376 §17.6.13 / §17.6.11 — this ENDING section's page geometry
     *  (size + margins). Absent when the sectPr inherits both pgSz and pgMar
     *  (the renderer then falls back to the body-level section geometry). */
    geom?: SectionGeom;
    /** ECMA-376 §17.6.12 `<w:pgNumType>` — this ENDING section's page-numbering
     *  settings (start / fmt). Absent ⇒ numbering continues; decimal. Carried
     *  separately from `geom` because a section may inherit its geometry yet
     *  still restart / re-format its page numbers. */
    pageNumType?: PageNumType | null;
};

export declare interface BorderSpec {
    width: number;
    color: string | null;
    style: string;
}

/**
 * Populate a highlight overlay layer with one box per matched run-slice.
 *
 * @param layer    the overlay div (cleared and re-sized to the canvas here).
 * @param runs     the page's runs (same array the page was rendered/text-layered from).
 * @param matches  the page's matches (run-slices + active flag).
 * @param canvasCssWidth  the rendered canvas's CSS width (e.g. `"700px"`).
 * @param canvasCssHeight the rendered canvas's CSS height.
 * @param measureForFont  returns a width-measurer primed with a run's `font`
 *                        (the viewer closes over a canvas 2d context). Kept as a
 *                        factory so the font is set once per run, not per glyph.
 * @param colors   optional colour overrides.
 */
export declare function buildDocxHighlightLayer(layer: HTMLDivElement, runs: DocxTextRunInfo[], matches: DocxHighlightMatch[], canvasCssWidth: string, canvasCssHeight: string, measureForFont: (font: string) => (s: string) => number, colors?: DocxHighlightColors): void;

/**
 * Build the transparent text-selection overlay for a rendered docx page: one
 * absolutely-positioned, color-transparent `<span>` per {@link DocxTextRunInfo}
 * (emitted by `renderPage`'s `onTextRun`), so the browser's native selection
 * lands on the drawn glyphs. Extracted verbatim from `DocxViewer._buildTextLayer`
 * so both the pager (DocxViewer) and the continuous-scroll viewer (DocxScrollViewer)
 * share one implementation; also public API for integrators building their own
 * overlay (design §10). IX6 — usable in BOTH render modes: worker mode collects
 * the same `DocxTextRunInfo[]` off-thread and ships it back beside the bitmap, so
 * the overlay is built from identical geometry regardless of thread.
 *
 * @param layer            the overlay div (position:relative parent expected).
 * @param runs             per-run geometry from `renderPage({ onTextRun })`.
 * @param canvasCssWidth   the rendered canvas's CSS width (e.g. `"700px"`), used
 *                         to size the overlay to match the canvas.
 * @param canvasCssHeight  the rendered canvas's CSS height.
 * @param onHyperlinkClick IX1 — invoked when a run carrying a resolved
 *                         {@link HyperlinkTarget} is clicked. A hyperlink run's
 *                         span keeps its transparent glyphs (the visible link
 *                         colour/underline is already drawn on the canvas) but
 *                         gains `cursor:pointer`, a `title` tooltip (the URL or
 *                         bookmark ref) and this click handler. A plain
 *                         `<span>` — not an `<a href>` — is used deliberately so
 *                         the browser's own navigation can never bypass the
 *                         caller's URL sanitisation. When omitted, link runs are
 *                         rendered exactly like plain runs (no click affordance).
 * @param measureForFont   optional width-measurer factory (primed with a run's
 *                         `font`), used ONLY to clamp a §17.3.2.10 縦中横
 *                         (eastAsianVert) span to its drawn one-em cell (#836):
 *                         the span composes a `scaleX(run.w / naturalWidth)` so
 *                         its selection extent matches the compressed glyphs
 *                         instead of the run's natural ~2× width. When omitted,
 *                         a 縦中横 span keeps the bare rotate (no regression for
 *                         callers that do not thread a measurer).
 */
export declare function buildDocxTextLayer(layer: HTMLDivElement, runs: DocxTextRunInfo[], canvasCssWidth: string, canvasCssHeight: string, onHyperlinkClick?: (target: HyperlinkTarget) => void, measureForFont?: (font: string) => (s: string) => number): void;

export declare interface CellBorders {
    top: BorderSpec | null;
    bottom: BorderSpec | null;
    left: BorderSpec | null;
    right: BorderSpec | null;
    /** ECMA-376 §17.4.34 (tcBorders w:insideH/w:insideV): the interior
     *  horizontal/vertical border this cell contributes. Folded from the cell's
     *  inline tcBorders OVER the resolved conditional table-style borders (§17.7.6)
     *  at parse time. `null` = unset (the renderer falls back to the table-level
     *  insideH/insideV); a spec with style "nil"/"none" = an explicit "no interior
     *  border" (e.g. banded data rows in Medium List 2 / Medium Shading 2). */
    insideH: BorderSpec | null;
    insideV: BorderSpec | null;
}

/** ECMA-376 §17.4.7: a table cell may contain paragraphs AND nested tables. */
export declare type CellElement = {
    type: 'paragraph';
} & DocParagraph | {
    type: 'table';
} & DocTable;

declare interface ChartDataLabelOverride {
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

declare interface ChartDataPointOverride {
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

declare interface ChartErrBars {
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
declare interface ChartManualLayout {
    xMode: string;
    yMode: string;
    layoutTarget?: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
}

declare interface ChartModel {
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

/** ECMA-376 §21.2 — a DrawingML chart embedded in the run flow via
 *  `<w:drawing><wp:inline|wp:anchor>…<a:graphicData uri=".../chart"><c:chart r:id>`.
 *  Mirrors the Rust `ChartRun`. `chart` is the shared {@link ChartModel} the
 *  core `renderChart` consumes (identical to what pptx/xlsx pass), so a docx
 *  chart draws at the same quality through the same code path. `widthPt`/
 *  `heightPt` are the `<wp:extent>` natural size. An inline chart flows as an
 *  inline box of that size; an anchored chart (§20.4.2.3) is painted at its
 *  absolute page box by `renderAnchorImages` — both via `renderChart`. */
export declare interface ChartRun {
    chart: ChartModel;
    widthPt: number;
    heightPt: number;
    /** true = `<wp:anchor>` (absolute page position, drawn by the anchor path);
     *  false = `<wp:inline>` (flows with text). */
    anchor: boolean;
    anchorXPt?: number;
    anchorYPt?: number;
    anchorXFromMargin?: boolean;
    anchorYFromPara?: boolean;
}

declare interface ChartSeries {
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

declare interface ChartSeriesDataLabels {
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

/** ECMA-376 §17.6.3 `<w:col>` — one column's width and trailing space (pt). */
export declare interface ColSpec {
    widthPt: number;
    spacePt: number;
}

/** ECMA-376 §17.6.4 `<w:cols>` — the section's multi-column configuration. */
export declare interface ColumnsSpec {
    /** `@w:num` — number of columns (>= 2 when emitted). */
    count: number;
    /** `@w:space` in pt — inter-column gap for equal-width columns (default 36pt
     *  = 720 twips per the spec). */
    spacePt: number;
    /** `@w:equalWidth` (default true) — all columns share one width + `spacePt`.
     *  When false, `cols` carries explicit per-column geometry. */
    equalWidth: boolean;
    /** `@w:sep` — draw vertical separator rules between columns. */
    sep: boolean;
    /** Per-column `<w:col>` entries (width + trailing space, pt). Empty when
     *  `equalWidth` is true. */
    cols: ColSpec[];
}

export declare interface DocComment {
    id: string;
    author?: string;
    initials?: string;
    date?: string;
    text: string;
}

export declare interface DocNote {
    id: string;
    /** ECMA-376 §17.11.2 / §17.11.10 — the note's block-level content
     *  (paragraphs / nested tables), parsed with the document's styles +
     *  numbering. The leading run is the `<w:footnoteRef/>` auto-number marker
     *  (carries a {@link DocxTextRun.noteRef}). Use {@link noteText} to extract
     *  the plain-text body without the marker. */
    content: BodyElement[];
}

export declare interface DocParagraph {
    /**
     * ECMA-376 §17.18.44 ST_Jc. Renderer honors left, start, center, right, end,
     * both, distribute. Other values (kashida variants, numTab, thaiDistribute)
     * are treated as start-aligned.
     */
    alignment: 'left' | 'start' | 'center' | 'right' | 'end' | 'justify' | 'both' | 'distribute' | 'lowKashida' | 'mediumKashida' | 'highKashida' | 'thaiDistribute' | string;
    indentLeft: number;
    indentRight: number;
    indentFirst: number;
    spaceBefore: number;
    spaceAfter: number;
    lineSpacing: LineSpacing | null;
    numbering: NumberingInfo | null;
    tabStops: TabStop[];
    runs: DocRun[];
    /**
     * ECMA-376 §17.13.6.2 `<w:bookmarkStart w:name>` — names of the bookmarks that
     * start within (or at the head of) this paragraph, in document order. A
     * `<w:hyperlink w:anchor="X">` internal link (§17.16.23) targets the paragraph
     * whose `bookmarks` contains `"X"`; {@link buildBookmarkPageMap} turns these
     * into a `bookmarkName → pageIndex` map after pagination. Absent (`undefined`)
     * for the common paragraph that anchors nothing.
     */
    bookmarks?: string[];
    /** Paragraph background hex color (w:shd fill) */
    shading?: string | null;
    /** Force a page break before this paragraph (w:pageBreakBefore) */
    pageBreakBefore?: boolean;
    /** Suppress spacing between adjacent same-style paragraphs (w:contextualSpacing) */
    contextualSpacing?: boolean;
    /** Keep paragraph on same page as the next paragraph (w:keepNext) */
    keepNext?: boolean;
    /** Keep all lines of this paragraph on the same page (w:keepLines) */
    keepLines?: boolean;
    /** Widow/orphan control (w:widowControl). ECMA-376 default is true. */
    widowControl?: boolean;
    /** Paragraph borders (w:pBdr) */
    borders?: ParagraphBorders | null;
    /** Style ID of the applied paragraph style */
    styleId?: string | null;
    /** Default font size (pt) inherited from style + direct pPr/rPr. Falls back to 10pt. */
    defaultFontSize?: number;
    /** Default font family resolved from the style chain. Used to size empty
     *  paragraphs (no runs) with the intended font's line metrics. */
    defaultFontFamily?: string | null;
    /**
     * ECMA-376 §17.3.1.6 `<w:bidi>` — right-to-left paragraph. `true` = RTL,
     * `false` = explicitly LTR, absent = unspecified (inherit). The renderer uses
     * this as the paragraph base direction: it seeds the UAX#9 reordering pass
     * (`computeLineVisualOrder`), swaps the left/right indents, resolves the
     * `w:jc` start/end edges (`resolveAlignEdge`), and lays out lines from the
     * right.
     */
    bidi?: boolean;
    /**
     * ECMA-376 §17.3.1.32 `<w:snapToGrid>` — when `false`, this paragraph opts out
     * of the section's document grid (`w:docGrid`): its lines use natural font
     * metrics / the line-spacing multiplier directly instead of snapping to the
     * grid pitch. `undefined` = inherit (default on). Set on Word's "Footnote
     * Text" style, so footnote bodies use compact natural line height.
     */
    snapToGrid?: boolean;
    /**
     * ECMA-376 §17.3.1.11 `<w:framePr>` — text-frame / drop-cap properties.
     * Present ⇒ this paragraph is part of a text frame; the renderer positions it
     * as a frame (drop cap or generic frame) and registers a wrap exclusion so
     * following body text flows around it. Absent ⇒ ordinary in-flow paragraph.
     */
    framePr?: FramePr;
}

export declare interface DocRevision {
    /** "insertion" | "deletion" */
    kind: 'insertion' | 'deletion' | string;
    author?: string;
    /** ISO-8601 timestamp */
    date?: string;
    text: string;
}

export declare type DocRun = {
    type: 'text';
} & DocxTextRun | {
    type: 'image';
} & ImageRun | {
    type: 'chart';
} & ChartRun | {
    type: 'break';
    breakType: 'line' | 'page' | 'column';
} | {
    type: 'field';
} & FieldRun | {
    type: 'shape';
} & ShapeRun | {
    type: 'math';
    nodes: MathNode[];
    display: boolean;
    fontSize: number;
    jc?: string;
} | {
    type: 'ptab';
} & PTabRun;

export declare interface DocSettings {
    /** §17.15.1.58 `w:kinsoku` — East-Asian line-breaking toggle. `undefined`
     *  means the element is absent; the spec default is ON (treated as `true`). */
    kinsoku?: boolean;
    /** §17.15.1.60 `w:noLineBreaksBefore@w:val` — custom set of characters that
     *  cannot begin a line (行頭禁則). When present it REPLACES the application
     *  default set. Word's per-`w:lang` sets are merged into one string. */
    noLineBreaksBefore?: string;
    /** §17.15.1.59 `w:noLineBreaksAfter@w:val` — custom set of characters that
     *  cannot end a line (行末禁則). Replaces the default when present. */
    noLineBreaksAfter?: string;
    /** §22.1.2.30 `m:mathPr/m:defJc@m:val` — document-wide default math
     *  justification (ST_Jc math: left|right|center|centerGroup). `undefined`
     *  ⇒ the renderer uses the spec default `centerGroup`. */
    mathDefJc?: string;
    /** §17.15.1.25 `w:defaultTabStop@w:val` — interval (points) between automatic
     *  tab stops generated after all custom stops. `undefined` ⇒ the renderer
     *  uses the spec default of 720 twips (36pt). */
    defaultTabStop?: number;
}

export declare interface DocTable {
    colWidths: number[];
    rows: DocTableRow[];
    borders: TableBorders;
    cellMarginTop: number;
    cellMarginBottom: number;
    cellMarginLeft: number;
    cellMarginRight: number;
    /** table horizontal alignment on the page: 'left' | 'center' | 'right'. */
    jc: string;
    /** ECMA-376 §17.4.50 `<w:tblInd>` — indentation added before the table's
     *  LEADING edge (left in an LTR table, right in an RTL/`bidiVisual` table), in
     *  pt. SIGNED: a negative value pulls the table outward past the leading margin
     *  toward the page edge (Word writes this for a header banner that must reach
     *  the physical page edge). `type="dxa"` only; `pct`/`auto` are dropped by the
     *  parser per §17.4.50. Absent ⇒ no direct indent. The renderer applies it only
     *  when the resolved `jc` is left/leading (§17.4.50). */
    tblInd?: number;
    /** ECMA-376 §17.4.52 `<w:tblLayout w:type>` — 'fixed' | 'autofit'. Absent
     *  (undefined) ⇒ spec default 'autofit'. Both paths size columns from the
     *  tblGrid (§17.4.48) scaled to fit: 'fixed' uses the grid verbatim; 'autofit'
     *  additionally lets content min-width grow a column. Per-cell `widthPt`/
     *  `widthPct` (`<w:tcW>`) is NOT re-applied — Word bakes the resolved widths
     *  into the saved grid (see resolveColumnWidths). Only a degenerate all-zero
     *  grid falls back to tcW-preference sizing. */
    layout?: string;
    /** ECMA-376 §17.4.63 `<w:tblW>` preferred table width (type="dxa"), pt. */
    widthPt?: number;
    /** `<w:tblW>` type="pct": 50ths of a percent of available content width. */
    widthPct?: number;
    /**
     * ECMA-376 §17.4.1 `<w:bidiVisual>` — render columns in right-to-left
     * (visual) order. `true` = RTL columns, `false` = explicitly LTR, absent =
     * unspecified. When `true` the renderer mirrors the grid so logical column 0
     * is placed rightmost, and flips per-cell left/right borders accordingly.
     */
    bidiVisual?: boolean;
    /** ECMA-376 §17.4.57 `<w:tblpPr>` — when present the table is FLOATING
     *  (absolutely positioned, out of the main text flow). Absent ⇒ block table. */
    tblpPr?: TblpPr;
    /** ECMA-376 §17.4.56 `<w:tblOverlap w:val>` — 'never' | 'overlap'. 'never' ⇒
     *  the floating table must be repositioned to avoid overlapping other floats.
     *  Default 'overlap' (omitted ⇒ overlap allowed). Ignored when not floating. */
    overlap?: string;
}

export declare interface DocTableCell {
    content: CellElement[];
    colSpan: number;
    vMerge: boolean | null;
    borders: CellBorders;
    background: string | null;
    vAlign: 'top' | 'center' | 'bottom';
    /** ECMA-376 §17.4.71 `<w:tcW>` preferred cell width (type="dxa"), pt. A
     *  PREFERRED width only: autofit column sizing is driven by the tblGrid
     *  (§17.4.48), not by re-applying this (Word bakes the resolved widths into
     *  the saved grid — see resolveColumnWidths). Consulted only for the
     *  degenerate all-zero-grid fallback. */
    widthPt: number | null;
    /** `<w:tcW>` type="pct": 50ths of a percent of available content width.
     *  Resolved against the available width at render time. Preferred width only
     *  (see `widthPt`). */
    widthPct?: number;
    /** Per-cell margins (pt) from `<w:tcPr><w:tcMar>` (ECMA-376 §17.4.42). Each
     *  edge overrides the table-level `cellMargin*` default when set; null/absent
     *  = inherit the table default. */
    marginTop?: number | null;
    marginBottom?: number | null;
    marginLeft?: number | null;
    marginRight?: number | null;
}

export declare interface DocTableRow {
    cells: DocTableCell[];
    rowHeight: number | null;
    /** ECMA-376 §17.4.80 hRule. "auto" (default) = informational; "atLeast" =
     *  lower bound; "exact" = fixed clip. */
    rowHeightRule: 'auto' | 'atLeast' | 'exact' | string;
    isHeader: boolean;
}

export declare class DocxDocument {
    private _document;
    private _meta;
    private _pages;
    /** Lazily-built `bookmarkName → 0-based page index` map for internal hyperlink
     *  anchors (IX-nav). Built on first {@link getBookmarkPage} from the paginated
     *  pages (main) or the worker meta's `bookmarkPages` (worker). Nulled by
     *  {@link destroy} so a reused reference never serves a stale document. */
    private _bookmarkPages;
    private _mode;
    private _worker;
    private _bridge;
    private _imageCache;
    /** Embedded `FontFace` objects this document registered into `document.fonts`
     *  (main mode only — in worker mode the worker owns them and terminates with
     *  its own FontFaceSet). Released in {@link destroy} so they do not leak into
     *  the shared FontFaceSet for the lifetime of the SPA (deduped + refcounted in
     *  core, so a font shared with another open document survives until both go). */
    private _embeddedFontFaces;
    /** Google-Fonts `FontFace` objects this document preloaded into `document.fonts`
     *  (main mode only — in worker mode the worker owns them and terminates with its
     *  own FontFaceSet). Released in {@link destroy} so they do not leak into the
     *  shared FontFaceSet for the lifetime of the SPA (deduped + refcounted in core,
     *  so a web font shared with another open document survives until both go). */
    private _googleFontFaces;
    /** One stable closure per instance: core's path-keyed SVG cache namespaces on
     *  this identity, so two open documents never swap a shared zip path (e.g.
     *  word/media/image1.svg). Reusing one reference also lets the SVG cache hit
     *  across page renders. */
    private readonly _fetchImage;
    private constructor();
    static load(source: string | ArrayBuffer, opts?: LoadOptions): Promise<DocxDocument>;
    private _parse;
    destroy(): void;
    /**
     * Extract raw bytes for an embedded image by zip path (e.g.
     * `word/media/image1.png`), wrapped in a Blob of the given MIME type. Routes
     * through the persistent worker via the `extractImage` message (twin of
     * pptx's `getImage`/`getMedia`); results are cached by path for the lifetime
     * of this instance. The renderer's `fetchImage` option points here so images
     * are decoded lazily rather than inlined as base64 at parse time.
     */
    getImage(imagePath: string, mimeType: string): Promise<Blob>;
    /**
     * Extract raw bytes for an embedded font part by zip path (e.g.
     * `word/fonts/font1.odttf`). Routes through the SAME persistent-worker
     * `extractImage` message as {@link getImage} — `DocxArchive.extract_image`
     * reads ANY zip entry, not just media — returning the raw (still obfuscated)
     * `.odttf` bytes rather than a Blob. Consumed by {@link loadEmbeddedFonts},
     * which de-obfuscates (ECMA-376 §17.8.1) and registers each as a FontFace.
     */
    getFontBytes(partPath: string): Promise<Uint8Array>;
    /**
     * Project the document to GitHub-flavoured markdown: headings (from
     * `<w:outlineLvl>`), bullet / numbered lists, tables (with vMerge
     * continuation), and rich-text formatting (bold / italic / strikethrough /
     * hyperlink), with footnotes / endnotes / comments collated at the end.
     * Positioning, section properties, fonts, and drawing shapes are discarded —
     * the projection is meant for AI ingestion and full-text search, not layout.
     *
     * Runs entirely in the worker off the archive opened at {@link load} (no
     * re-copy of the file, no re-parse of the model on the main thread), so it
     * works in BOTH `mode: 'main'` and `mode: 'worker'`.
     *
     * @example
     * const doc = await DocxDocument.load(buffer);
     * const md = await doc.toMarkdown();
     */
    toMarkdown(): Promise<string>;
    get pageCount(): number;
    /** The render mode this engine was loaded with ('main' | 'worker'). A fact for
     *  integrators and the scroll viewer: an injected engine's mode decides whether
     *  pages render via renderPage (main) or renderPageToBitmap (worker) — no
     *  probing (design §11: no silent mis-pathing). */
    get mode(): 'main' | 'worker';
    /**
     * The raw parsed document model. Available only in `mode: 'main'`; in
     * `mode: 'worker'` the model stays in the worker and this throws.
     */
    get document(): DocxDocumentModel;
    /**
     * ECMA-376 §17.13.4 — the document's comments (`word/comments.xml`), each with
     * id / author / initials / date / plain-text body. Comments are a data-only
     * API: they are NOT drawn on the page (Word renders them in a margin pane /
     * balloons, which this viewer does not reproduce). Use this to build a review
     * panel, export an annotation list, etc. Returns `[]` when the document has no
     * comments part. The same data is also reachable via `document.comments`.
     */
    get comments(): DocComment[];
    /**
     * ECMA-376 §17.11.10 — the document's footnotes (`word/footnotes.xml`),
     * excluding the reserved separator entries. Each note carries its `id` and
     * block-level `content`; use {@link noteText} for the plain-text body. These
     * ARE drawn at the bottom of the page that holds their reference; this getter
     * additionally exposes them as data. Returns `[]` when absent.
     */
    get footnotes(): DocNote[];
    /**
     * ECMA-376 §17.11.4 — the document's endnotes (`word/endnotes.xml`). Same
     * shape as {@link footnotes}; rendered at the end of the document. Returns
     * `[]` when absent.
     */
    get endnotes(): DocNote[];
    private _getPages;
    /** Lazily build (and cache) the `bookmarkName → page index` map from either
     *  the worker meta (worker mode) or the paginated pages (main mode). */
    private _getBookmarkPages;
    /**
     * ECMA-376 §17.13.6.2 / §17.16.23 — resolve a bookmark name (a
     * `<w:hyperlink w:anchor>` internal-link target) to the 0-based index of the
     * page its `<w:bookmarkStart w:name>` destination falls on, or `undefined`
     * when the document has no bookmark of that name. When a bookmark's paragraph
     * spans a page break, the page where it *begins* is returned.
     *
     * This is the map an internal-hyperlink click resolves against: a viewer's
     * `onHyperlinkClick` default (or an integrator) turns the anchor into a page
     * and calls {@link DocxViewer.goToPage} (or scrolls the scroll viewer to it).
     * Works in BOTH `main` and `worker` mode (the map rides along in the worker
     * meta, built from the same paginated pages as `pageSizes`).
     */
    getBookmarkPage(bookmarkName: string): number | undefined;
    /**
     * ECMA-376 §17.6.13 / §17.6.11 — the page size (pt) of page `pageIndex`, per
     * section (a mixed portrait/landscape document returns different sizes per page).
     * Available in BOTH modes: worker mode reads the worker-built `pageSizes` meta;
     * main mode reads the paginated pages' stamped geometry. Returns the body-level
     * section size for an out-of-range index (clamped) or a page with no stamped
     * geometry. `{ 0, 0 }` means "not loaded" (before `load()` resolves or after
     * `destroy()`). Returns a fresh object per call — safe to mutate.
     * The recommended way to ask "how big is page i?" for layout.
     */
    pageSize(pageIndex: number): {
        widthPt: number;
        heightPt: number;
    };
    renderPage(target: HTMLCanvasElement | OffscreenCanvas, pageIndex: number, opts?: RenderPageOptions): Promise<void>;
    /**
     * Render a page and return it as an ImageBitmap. Works in both modes; in
     * worker mode the render runs entirely off the main thread. Paint with:
     * `canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap)`.
     *
     * The returned ImageBitmap is owned by the caller: pass it to
     * `transferFromImageBitmap` (which consumes it) or call `bitmap.close()`
     * when done, or its backing memory is held until GC.
     *
     * IX6 — an optional `onTextRun` in `opts` receives the page's text-run
     * geometry (the same stream `renderPage` emits in main mode), so a caller can
     * build the selection / find overlay from a worker-rendered page on the SAME
     * code path as main mode. In worker mode the runs ride back beside the bitmap
     * (one round-trip, no second render).
     */
    renderPageToBitmap(pageIndex: number, opts?: RenderPageToBitmapOptions): Promise<ImageBitmap>;
    /**
     * IX6 — collect a page's text-run geometry (`DocxTextRunInfo[]`) without
     * painting a visible canvas. Works in BOTH modes: worker mode renders the page
     * off-thread and ships only the runs (no bitmap transfer); main mode renders
     * to a throwaway offscreen canvas. Used by the find controller to scan every
     * page for matches. The geometry is identical to a `renderPage` of the same
     * page at the same width/dpr.
     */
    collectPageRuns(pageIndex: number, opts?: WireRenderPageOptions): Promise<DocxTextRunInfo[]>;
}

export declare interface DocxDocumentModel {
    section: SectionProps;
    body: BodyElement[];
    headers: HeadersFooters;
    footers: HeadersFooters;
    /** Theme `<a:fontScheme><a:majorFont><a:latin@typeface>` (heading face). */
    majorFont?: string;
    /** Theme `<a:fontScheme><a:minorFont><a:latin@typeface>` (body face). */
    minorFont?: string;
    /**
     * ECMA-376 §17.8.3.10 — font family classification from `word/fontTable.xml`.
     * Maps font name to `<w:family @w:val>`: "roman" | "swiss" | "modern" |
     * "script" | "decorative" | "auto". The renderer uses this as the primary
     * source for serif/sans-serif decisions (roman→serif, swiss→sans-serif,
     * modern→monospace), falling back to name-pattern matching only when the
     * entry is absent or classified as "auto".
     */
    fontFamilyClasses?: Record<string, string>;
    /** ECMA-376 §17.8.3.3-.6 — embedded fonts from `word/fontTable.xml`, resolved
     *  to their `.odttf` part paths + fontKey. The viewer de-obfuscates (§17.8.1)
     *  and registers each as a FontFace before pagination so text measures/draws
     *  with the authored typeface. */
    embeddedFonts?: EmbeddedFontRef[];
    /** ECMA-376 §17.13.5 — flat list of `<w:ins>` / `<w:del>` events in the
     *  body. Each entry carries author / date / text. The renderer marks
     *  runs inline via {@link DocxTextRun.revision}; this array is primarily for
     *  tooling (MCP, agents, change-summary panels). */
    revisions?: DocRevision[];
    /** ECMA-376 §17.13.4 — `word/comments.xml`. Each comment carries id,
     *  author, initials, date, and plain-text body. */
    comments?: DocComment[];
    /** ECMA-376 §17.11.10 — `word/footnotes.xml` (id + text). Excludes the
     *  spec-defined separator / continuation-separator entries. */
    footnotes?: DocNote[];
    /** ECMA-376 §17.11.4 — `word/endnotes.xml` (id + text). Same shape as
     *  `footnotes`. */
    endnotes?: DocNote[];
    /** ECMA-376 §17.15.1.* — document-wide compatibility / typography settings
     *  from `word/settings.xml`. Currently carries the Japanese line-breaking
     *  (kinsoku) configuration. Absent when settings.xml has no relevant
     *  elements (the renderer then uses spec defaults: kinsoku ON). */
    settings?: DocSettings;
    /** RB7 partial degradation: set when `word/document.xml` (the body part) could
     *  not be read or parsed. The document still "opens" — `body` is empty and this
     *  part-tagged error (e.g. `"word/document.xml: <detail>"`) is carried — so the
     *  viewer shows a visible placeholder page instead of throwing. Absent
     *  (`undefined`) for every healthy document. */
    parseError?: string;
}

export declare interface DocxHighlightColors {
    /** Fill for non-active matches. */
    match?: string;
    /** Fill for the active match. */
    active?: string;
}

/** One page's highlight input: the run-slices a match covers, and whether that
 *  match is the active one (emphasis colour). */
export declare interface DocxHighlightMatch {
    slices: MatchRunSlice[];
    active: boolean;
}

/** Where a docx match lives: its 0-based page index. */
export declare interface DocxMatchLocation {
    page: number;
}

/** ECMA-376 §17.3.2.4 `<w:bdr>` — a run-level border drawn as a box around the
 *  run's text. Parallel to {@link ParaBorderEdge} but applies per run. */
export declare interface DocxRunBorder {
    /** "single" | "double" | "dashed" | ... (w:bdr/@w:val) */
    style: string;
    /** hex 6-char, or null for automatic (renderer falls back to text color) */
    color?: string | null;
    /** pt (sz / 8) */
    width: number;
    /** pt spacing between the border and the run text (w:space) */
    space: number;
}

export declare class DocxScrollViewer implements ZoomableViewer {
    private _doc;
    private readonly _injected;
    private readonly _opts;
    private readonly _container;
    private readonly _wrapper;
    private readonly _scrollHost;
    private readonly _spacer;
    /** Resolved render mode. When an engine is injected the engine's own `mode`
     *  is authoritative (design §11 — no silent mis-pathing / no probing); an
     *  explicitly conflicting `opts.mode` is rejected at construction. When self-
     *  loading, `opts.mode` decides and `load()` passes it to `DocxDocument.load`. */
    private _mode;
    /** px-per-pt zoom multiplier. Base fit maps the first page's width to the
     *  container width (or opts.width). Zoom multiplies this (design §7). */
    private _scale;
    /** Whether the base fit scale has been established. Set true the first time
     *  `relayout()` resolves a positive base scale. We use an explicit flag rather
     *  than a `_scale === 1` sentinel because a fit scale of exactly 1 is a valid
     *  established state (a 1× fit would otherwise be re-fit forever). */
    private _scaleEstablished;
    /**
     * IX9 F1 — a `setScale` factor requested BEFORE the base fit is established
     * (pre-load, or a zero-width container), already clamped to
     * `[zoomMin, zoomMax]`, or `null` when none is pending. The single-canvas
     * viewers latch a pre-load `setScale` and honour it on the first render; the
     * scroll viewers used to silently DROP it — the family-unified semantics are
     * "latch and apply once the layout establishes". `relayout()` applies (and
     * clears) this right after establishing the base, firing `onScaleChange` at
     * application time; `getScale()` reports it while pending so the caller sees
     * the same value a single-canvas viewer would show.
     */
    private _pendingScale;
    /** Live slots keyed by page index. */
    private readonly _slots;
    /** Recyclable detached slots (canvas + textLayer reused across pages). */
    private readonly _free;
    /** Cached per-page heights in px at the current scale (index-aligned). */
    private _heights;
    private _lastRange;
    private _lastTopIndex;
    private _scrollListener;
    /** Set by `destroy()`. Async render callbacks (main + worker) check it before
     *  reporting an error so a rejection that lands after teardown is swallowed
     *  rather than surfaced to a `onError` on a dead viewer. */
    private _destroyed;
    /** Throwaway 2D context reused to measure text for the §17.3.2.10 縦中横 overlay
     *  clamp (#836). Lazily created; `null` when canvas metrics are unavailable
     *  (headless), in which case the overlay degrades to the un-clamped span. */
    private _measureCtx;
    /**
     * Concurrent-load latch (generation token). Every self-loading `load()`
     * increments this and captures the value; after its engine finishes loading it
     * re-checks the live value and BAILS (destroying its own just-loaded engine) if
     * a newer `load()` has since started. Without it, two overlapping
     * `load(A)`/`load(B)` calls race the WASM parse / worker init, and whichever
     * RESOLVES last wins the swap — even the stale `load(A)` resolving after
     * `load(B)`; the loser's freshly created engine (never installed, or installed
     * then overwritten) then leaks its worker + pinned WASM allocation. The latch
     * composes with SC20: the check runs AFTER the new engine loads but BEFORE the
     * field assignment, `previous?.destroy()`, and the recycle/relayout post-load
     * work, so a superseded load never touches `this._doc` nor frees the current
     * (newer) engine. Only the self-loading path uses it — the injected path throws
     * up-front and never reaches here. `destroy()` also bumps it so a load in flight
     * at teardown is treated as superseded and its engine cleaned up.
     */
    private _loadGen;
    /** Worker mode: page indices whose bitmap render is currently dispatched to the
     *  engine. Coalesces a scroll storm — we never dispatch a second render for a
     *  page whose first is still in flight — and lets us drop pages that scrolled
     *  out of the window before dispatch (design §11 worker coalescing).
     *
     *  T4 ZOOM HAZARD (RESOLVED by the render epoch below): coalescing keys on page
     *  INDEX only, with no notion of the scale a dispatch was made at. Once
     *  `setScale` can change the zoom mid-flight, an in-flight bitmap dispatched at
     *  the OLD scale can still pass the on-resolution identity check if the SAME
     *  slot object is re-mounted for page `i` (the pool reuses slot objects, so
     *  `_slots.get(i) === slot && slot.renderedPage === i` can hold for an old
     *  dispatch), and get painted at the WRONG resolution. We fix this with a render
     *  epoch (`_renderEpoch`): each dispatch captures the epoch, and on resolution a
     *  moved epoch ⇒ STALE (close + re-dispatch the live slot). See
     *  `_renderSlotBitmap`. */
    private readonly _bitmapInFlight;
    /** Render generation, bumped on every effective `setScale` (and the resize
     *  re-fit in `_onResize`, which routes through `setScale`). Stamped into each async render
     *  dispatch; a resolution whose captured epoch ≠ this value is STALE — its
     *  pixels/geometry are at a superseded scale. Worker path: close the orphan
     *  bitmap + re-dispatch the live slot. Main path: skip the (stale) text-layer
     *  build; the engine's per-canvas token already discards the stale pixels. */
    private _renderEpoch;
    /** Pending settle-render timer handle (design §7 mechanism 2). Set by
     *  `_scheduleSettle` after each `setScale`, reset on the next one so a burst
     *  dispatches ONE settle at the end, and cleared in `destroy()`. `ReturnType`
     *  of `setTimeout` (a number in the DOM, a Timeout object in node) so the type
     *  is host-agnostic. */
    private _settleTimer;
    private _wheelListener;
    /** Gesture-only pointer anchor for the NEXT `setScale`, in scrollHost-viewport
     *  px (`{ x, y }` from the wheel event, relative to the scroll host's top-left).
     *  Set by the Ctrl/⌘+wheel handler right before it calls `setScale` so the zoom
     *  pivots on the cursor ("zoom toward the pointer") in BOTH axes; consumed and
     *  cleared by `setScale`. `null` for every non-gesture source (the public
     *  `setScale`, the +/- steppers, `fitWidth`/`fitPage`, the resize re-fit), which
     *  keep the historical viewport-TOP re-anchor so their behaviour is unchanged. */
    private _pendingZoomAnchor;
    /** Observes the container so a width change re-fits the base scale. Disconnected
     *  in `destroy()`. */
    private _resizeObserver;
    /** The base fit scale at the last established/re-fit layout. `_onResize` divides
     *  `_scale` by this to recover the current zoom multiplier so a width change
     *  re-fits the base while preserving the user's zoom (design §11). */
    private _prevBase;
    /** The fit width (px) the base scale was last established at. Lets `_onResize`
     *  skip the re-fit when only the height changed (a ResizeObserver fires on ANY
     *  box change, but only a WIDTH change alters the fit-to-width base scale). */
    private _lastFitWidth;
    /** Resolved page-canvas `box-shadow` (design: the recipe drop shadow by
     *  default). Resolved ONCE with `??` — NOT `||` — so `pageShadow: false`
     *  survives as the "no shadow" sentinel (a `||` would treat `false` as absent
     *  and wrongly re-apply the default). Applied by `_applyPageShadow` at EVERY
     *  canvas-creation site (`_acquireSlot` and the double-buffer spare in
     *  `_settleSlot`) so a recycled/re-mounted slot and a settle-swapped spare all
     *  carry it. */
    private readonly _pageShadow;
    constructor(container: HTMLElement, opts?: DocxScrollViewerOptions);
    /**
     * Load a DOCX from URL or ArrayBuffer and render the first window.
     * UNSUPPORTED when an engine was injected via `opts.document` (throws) — the
     * caller already owns the parsed engine.
     */
    load(source: string | ArrayBuffer): Promise<void>;
    get pageCount(): number;
    /** CSS px width of page `i` at the current scale. */
    private _pageWidthPx;
    /** CSS px height of page `i` at the current scale. */
    private _pageHeightPx;
    /** The fit width (px), deferring when the container is unlaid-out. An EXPLICIT
     *  `opts.width` is the page's CSS-width contract and is returned UNCHANGED (the
     *  gutters still apply around placement, not to the width). The container-derived
     *  default instead targets `containerWidth − padL − padR` so a page sits INSIDE
     *  the horizontal gutters at 100%. A non-positive result (gutters wider than the
     *  container) is treated as unlaid-out — the same deferral as a zero-width box. */
    private _fitWidthPx;
    /** Base scale: first page's width fit to the fit-width. Returns 0 when the
     *  container has no width yet (deferral). */
    private _baseScale;
    /**
     * Recompute per-page heights + the spacer and re-mount the visible window.
     *
     * The viewer already calls this automatically after `load()`, an injected
     * engine, a container resize, and a zoom, so most integrations never need it.
     * It is public as a deliberate escape hatch: if the host mutates the layout in
     * a way the `ResizeObserver` cannot observe (e.g. a CSS change on an ancestor
     * that resizes the container without a box-size event, or a font that finishes
     * loading after first paint), call `relayout()` to force a re-fit. Idempotent —
     * safe to call repeatedly, and a no-op while the container has zero width (the
     * fit is deferred until width appears, design §11).
     */
    relayout(): void;
    private _recomputeHeights;
    private _gap;
    private _overscan;
    /** Desk padding fed to `computeVisibleRange`: `paddingTop`/`paddingBottom`,
     *  each defaulting to `gap` (uniform rhythm). Resolved here (not stored) to
     *  mirror `_gap()`/`_overscan()`, and consumed at EVERY `computeVisibleRange`
     *  call site so the padded offsets are the single source of geometry. */
    private _pad;
    /** Horizontal desk gutters: `paddingLeft`/`paddingRight`, each defaulting to
     *  `gap` (uniform rhythm — the horizontal gutters match the vertical padding).
     *  Consumed by `_fitWidthPx` (to shrink the container-derived fit), by
     *  `_positionSlot` (the flush-left floor), and by `_syncSpacer` (the spacer
     *  width). Resolved here (not stored) to mirror `_gap()`/`_pad()`. */
    private _padH;
    /** Index of the page whose slot spans content-offset `y` (largest `i` with
     *  `offsets[i] <= y`), for the pointer-anchored zoom re-anchor. Mirrors the
     *  `topIndex` search `computeVisibleRange` runs for the scrollTop, but for an
     *  ARBITRARY content-y (the pointer, not the viewport top). Clamped into
     *  `[0, n-1]`; a `y` below the first page (inside the leading pad) yields 0. */
    private _pageIndexAtOffset;
    private _range;
    private _syncSpacer;
    /** Horizontal scroll extent: the widest page (docx pages can differ in width)
     *  plus both gutters. A spacer NARROWER than the container never creates a
     *  scrollbar (scrollWidth = max(clientWidth, content)), so it is always safe to
     *  set — it only matters when a zoomed-in page grows past the viewport, where it
     *  gives the gutters something to scroll to on either side. Max over per-page
     *  widths so the extent covers the widest page in the document. Called from
     *  `_syncSpacer` and after every scale change (zoom / resize re-fit) so the
     *  extent tracks the current page px width. */
    private _syncSpacerWidth;
    private _onScroll;
    /** Mount/recycle slots for the current visible window. */
    private _mountVisible;
    /** Apply the resolved page-canvas shadow (design: recipe drop shadow by
     *  default, `false` ⇒ none). Single source so `_acquireSlot` and the
     *  double-buffer spare in `_settleSlot` stay in lock-step — a spare that missed
     *  this would lose the shadow on the settle swap. `box-shadow` never affects
     *  layout, so this is safe to (re)set on a live/pooled canvas without shifting
     *  any offset. */
    private _applyPageShadow;
    private _acquireSlot;
    private _recycleSlot;
    private _positionSlot;
    /** Device-pixel ratio for a render (opts override → window → 1). */
    private _dpr;
    /**
     * Render page `i` into `slot`. Routes strictly on the constructor-resolved
     * `_mode` (design §11 — no probing, no silent mis-pathing): `main` ⇒ paint the
     * slot's canvas directly via `renderPage`; `worker` ⇒ transfer an ImageBitmap
     * from `renderPageToBitmap`.
     *
     * Slot-identity guard: a slot recycled to a DIFFERENT page while a previous
     * render is in flight must not repaint the stale page. `slot.renderedPage`
     * tracks the page this slot is committed to; we stamp it up-front and bail on
     * resolution if it changed (the engine's own token guard is per-canvas; this is
     * the viewer's per-slot page-identity check).
     *
     * Render epoch (main path): pixel staleness after a mid-flight `setScale` is
     * already handled by the engine's per-canvas token (the newer renderPage on the
     * same canvas wins) — `setScale` recycles + re-mounts, and the re-mount always
     * re-dispatches `renderPage` (renderedPage reset to -1), so a fresh render is
     * always issued. But the viewer-side side effects of a STALE resolution — the
     * text-layer build (its run geometry is at the OLD scale) and the renderedPage
     * bookkeeping — must NOT run, or a superseded render would rebuild the overlay
     * with stale x/y/w/h (the pool reuses slot objects, so the identity check alone
     * can pass for an old-epoch resolution). We gate them on the captured epoch.
     */
    private _renderSlot;
    /**
     * IX1/IX-nav — the click handler passed to the text-layer overlay. When the
     * caller supplied `onHyperlinkClick`, it fully owns the behaviour (the default
     * is suppressed). Otherwise the built-in default is: an external link opens in
     * a new tab through core `openExternalHyperlink` (URL sanitised against the
     * safe scheme allowlist, `noopener,noreferrer`); an internal `<w:anchor>` link
     * resolves its bookmark name to its destination page via
     * {@link DocxDocument.getBookmarkPage} (ECMA-376 §17.16.23) and scrolls there
     * with {@link scrollToPage}. An anchor naming no known bookmark is a safe no-op
     * rather than a scroll to a guessed page.
     */
    private _hyperlinkHandler;
    /** A width-measurer primed with a run's `font` — used ONLY to clamp a §17.3.2.10
     *  縦中横 selection span to its drawn one-em cell (#836). Mirrors DocxViewer's
     *  `_measureForFont`. Returns a length-based fallback when canvas metrics are
     *  unavailable so the caller still gets a callable (the overlay then sees scale
     *  1 and leaves the span un-clamped). */
    private _measureForFont;
    /** Route an async render failure to `onError`, or `console.error` when none is
     *  set (so failures are never fully silent), and never after teardown. */
    private _reportRenderError;
    /**
     * Worker-mode slot render: dispatch `renderPageToBitmap`, transfer the result
     * via a per-slot `bitmaprenderer` context, and manage the ImageBitmap lifecycle.
     *
     * Coalescing / drop-stale (design §11):
     *  - Skip if page `i` is already in flight (a scroll storm won't double-dispatch).
     *  - Skip if page `i` already left the mounted window before dispatch.
     *  - On resolution, if `slot` is no longer THIS page's live slot (it recycled to
     *    another page, or page `i` re-mounted onto a DIFFERENT slot while this render
     *    was in flight), close the orphan bitmap and skip the paint. In that
     *    re-mount case a live slot for `i` still awaits a render, so once we clear
     *    the in-flight guard we re-dispatch it — a page that recycled and re-mounted
     *    mid-flight must never stay blank.
     *  - RENDER EPOCH: the dispatch captures `this._renderEpoch`. `setScale` bumps
     *    the epoch, so a resolution whose captured epoch ≠ the live epoch is STALE
     *    even when the SAME slot object is still mounted for page `i` (the pool
     *    reuses slot objects, so the identity check alone can't catch a zoom that
     *    happened mid-flight). A moved epoch ⇒ close the orphan + re-dispatch the
     *    live slot at the new scale, never paint the old-scale bitmap.
     */
    private _renderSlotBitmap;
    /**
     * Set the absolute px-per-pt zoom scale, clamped inline to
     * `[zoomMin ?? 0.1, zoomMax ?? 4]` (absolute bounds, XlsxViewer convention — NOT
     * multiples of the base fit; design §3 keeps the clamp in the viewer, not core),
     * then re-anchor VERTICALLY so the page currently under the viewport top stays
     * fixed. A no-op when the clamped scale is unchanged. Called BEFORE the doc is
     * loaded / the base fit is established, the clamped factor is LATCHED (IX9 F1,
     * family-unified with the single-canvas viewers) and applied by `relayout()`
     * once the layout establishes — `onScaleChange` fires then.
     *
     * FLICKER-FREE (design §7): this does NOT re-render the visible pages inline.
     * It shows an immediate CSS preview (stretch the existing bitmaps, scale the
     * overlays) and DEBOUNCES a full-resolution settle re-render for ZOOM_SETTLE_MS,
     * so a wheel/pinch burst never blanks a page and coalesces into one crisp render.
     *
     * Re-anchor (written from scratch — XlsxViewer only re-anchors horizontally):
     * capture `top = topIndex` and the intra-page fraction `intraFrac` from the
     * CURRENT range BEFORE rescale; after recomputing heights at the new scale,
     * `newScrollTop = offsets'[top] + intraFrac × heights'[top]`, clamped to
     * `[0, totalHeight' − viewportHeight]`. Because a page's height scales linearly
     * with `_scale`, the same fractional position maps exactly to the new geometry.
     *
     * CAVEAT — base fit below the floor: `relayout()` sets `_scale = base` WITHOUT
     * clamping to `[zoomMin, zoomMax]`. If the base fit is below `zoomMin` (a wide
     * page in a narrow container), the initial scale sits under the floor, but once
     * the user zooms via `setScale` the clamp pins the minimum to `zoomMin`, so they
     * can no longer return below the floor to the original base fit through this API.
     */
    setScale(scale: number): void;
    /** IX9 {@link ZoomableViewer} — the current zoom factor, where `1` = 100% (a
     *  page at its natural pt→px width). This is the viewer's absolute `_scale`
     *  (`widthPt × PT_TO_PX × _scale` is the drawn width), so it reads `1` at true
     *  100% and, after the initial fit-to-width, the base fit factor. Before the
     *  fit is established it reports a latched pre-load `setScale` (IX9 F1) if one
     *  is pending — matching what a single-canvas viewer would show — else `1`. */
    getScale(): number;
    /** IX9 {@link ZoomableViewer} — step up to the next rung of the shared zoom
     *  ladder above the current factor (clamped to `zoomMax` by {@link setScale}). */
    zoomIn(): void;
    /** IX9 {@link ZoomableViewer} — step down to the next lower ladder rung. */
    zoomOut(): void;
    /**
     * IX9 {@link ZoomableViewer} — fit a page's WIDTH to the container (the classic
     * continuous-scroll "fit width"). Sets the scale to the width-fit base for the
     * current container, then re-anchors + re-renders via {@link setScale}. Defers
     * (no-op) while the container is unlaid-out. Note the `zoomMin`/`zoomMax` clamp
     * still applies, so a fit below `zoomMin` pins to `zoomMin`.
     */
    fitWidth(): void;
    /**
     * IX9 {@link ZoomableViewer} — fit a WHOLE page (width and height) inside the
     * container so one page is visible without scrolling; takes the tighter of the
     * width/height fit. Uses the FIRST page's size (the continuous viewer's fit
     * reference, matching the base-fit convention). Defers while unlaid-out.
     */
    fitPage(): void;
    /** Shared fit for {@link fitWidth}/{@link fitPage}: the width-fit factor is the
     *  established base (`_baseScale`); the page-fit additionally bounds by the
     *  container height against the first page's height. Applies via {@link setScale}
     *  so the flicker-free re-anchor / settle path and `onScaleChange` all run. */
    private _fit;
    /**
     * CSS preview of the visible window at the current `_scale` (design §7
     * mechanism 1), WITHOUT re-rendering. Slots leaving the window recycle normally;
     * slots ENTERING the window mount fresh (rendered at the current scale directly,
     * so they never need a preview); slots that STAY are repositioned and their
     * canvas + text overlay are CSS-transformed to the new size (the device buffer
     * is untouched — that is the whole point: no synchronous clear, no blank frame).
     */
    private _previewVisible;
    /**
     * CSS-preview a single already-mounted slot at the new geometry (design §7): the
     * wrapper is repositioned + sized (via `_positionSlot`), the canvas bitmap is
     * STRETCHED to the new CSS size (no `canvas.width` — the device buffer, and thus
     * the drawn pixels, are left intact, just scaled by the browser), and the text
     * overlay is scaled by `newScale / renderedScale` so it tracks the stretched
     * page. `renderedScale <= 0` means the slot's first render hasn't resolved yet
     * (nothing to stretch); the pending render captured the current scale, so it
     * lands correct and no preview is needed.
     */
    private _previewSlot;
    /** (Re)schedule the debounced settle re-render (design §7 mechanism 2). Resets
     *  the timer on every call so a burst of `setScale` dispatches ONE settle
     *  ZOOM_SETTLE_MS after the LAST call. Cleared in `destroy()`. */
    private _scheduleSettle;
    /** Full-resolution settle re-render of the visible window (design §7 mechanisms
     *  2+3). Re-renders each mounted slot at the current scale via the double-buffer
     *  swap (main) / same-canvas transfer (worker). Both modes rebuild the text
     *  overlay from the fresh render's run geometry (IX6 — worker mode collects the
     *  runs off-thread via `_renderSlotBitmap`) and clear the preview transform.
     *  Dispatched at the CURRENT epoch; the existing epoch gate discards it if a
     *  later `setScale` supersedes it mid-render. */
    private _settleRender;
    /**
     * Settle-render one slot at the current scale (design §7 mechanism 3).
     *
     * WORKER: re-dispatch the bitmap render into the SAME canvas. The worker path
     * sizes the device buffer and `transferFromImageBitmap`s it in ONE synchronous
     * step (no await between `canvas.width = …` and the transfer), so the browser
     * never composites an intermediate blank frame — no spare canvas is needed. The
     * `renderedScale === _scale` gate in `_settleRender` plus the epoch gate inside
     * `_renderSlotBitmap` keep this correct and idempotent.
     *
     * MAIN: `renderPage` (via renderDocumentToCanvas) synchronously sets
     * `canvas.width = …` (which CLEARS the backing store to blank) BEFORE its first
     * await and paints AFTER — so rendering into the on-screen canvas would flash it
     * white. Render into a SPARE off-DOM canvas instead; only once it resolves at the
     * current epoch do we swap it into the wrapper (replacing the old canvas, which is
     * DISCARDED — the pooled unit is the slot, not the canvas). The old canvas keeps
     * showing the stretched preview until the instant of the swap — blank-free.
     */
    private _settleSlot;
    /**
     * Scroll so page `index`'s top edge sits at the viewport top. Clamps `index` to
     * `[0, pageCount-1]` (the pager convention) and the resulting scrollTop to
     * `[0, totalHeight − viewportHeight]` so the last pages don't scroll past the
     * end. A no-op when nothing is loaded or the document is empty.
     *
     * `opts.behavior` ('auto' | 'smooth', default 'auto') is honoured via
     * `scrollHost.scrollTo({ top, behavior })` when the host supports it (a real
     * browser); the stub-DOM has no `scrollTo`, so the fallback sets `scrollTop`
     * directly (which is what the tests assert). We then call `_mountVisible` once.
     *
     * MOUNTING CAVEAT: synchronous mounting of the target page is guaranteed only on
     * the DEFAULT/'auto' path — there `scrollTop` has already jumped to `top`, so the
     * `_mountVisible` call reads the final scroll position and the target page's slots
     * exist immediately. With `behavior: 'smooth'` the scroll animates ASYNCHRONOUSLY:
     * `scrollTop` is still near the old position when `_mountVisible` runs, so the
     * target page mounts lazily via the animation's subsequent `scroll` events, not
     * from this call.
     */
    scrollToPage(index: number, opts?: {
        behavior?: 'auto' | 'smooth';
    }): void;
    /**
     * Re-fit the base scale on a container resize while PRESERVING the current zoom
     * multiplier (design §11), then re-anchor + re-render. A `ResizeObserver` fires
     * on any box change, but only a WIDTH change alters the fit-to-width base scale;
     * a height-only change skips the re-fit yet STILL re-mounts the visible window
     * (via `_mountVisible`), because a taller viewport reveals rows that were below
     * the fold and would otherwise stay blank until the next scroll. Empty/unloaded
     * ⇒ no-op; a still-zero width ⇒ defer.
     *
     * Zero-width recovery: a container that was 0-wide at construction never
     * established a scale (`_scaleEstablished` is false), so the first non-zero
     * resize establishes it here via `relayout()` — completing the T2 deferral.
     *
     * Re-fit math (zoom multiplier preserved):
     *   mult      = _scale / _prevBase            (the user's zoom over the old base)
     *   newScale  = newBase × mult
     * Routing through `setScale(newScale)` bumps `_renderEpoch` (resize IS an epoch
     * event — T4 banner) and re-anchors + CSS-previews + debounces a settle re-render
     * of every slot at the new geometry, exactly like a zoom (design §7 flicker-free
     * path — a rapid ResizeObserver burst therefore also coalesces into one settle).
     * `setScale`'s clamp/no-op guards apply: an unchanged newScale (identical width)
     * is a no-op there — so we short-circuit BEFORE it when the fit-width is
     * unchanged (mounting the revealed window without a needless re-render), and
     * after it we call `_mountVisible` again to cover the case where the clamp made
     * `setScale` no-op yet the viewport still grew.
     */
    private _onResize;
    get topVisiblePage(): number;
    /* Excluded from this release type: mountedPageIndicesForTest */
    /* Excluded from this release type: scaleForTest */
    /* Excluded from this release type: baseScaleForTest */
    /* Excluded from this release type: renderEpochForTest */
    /* Excluded from this release type: resizeForTest */
    /* Excluded from this release type: contentAtViewportYForTest */
    /* Excluded from this release type: viewportYOfForTest */
    /**
     * Tear down the viewer: remove the DOM subtree and (only for a self-loaded
     * engine) destroy the engine. An injected engine is left intact — the caller
     * owns its lifecycle. Per-slot worker ImageBitmaps are closed on recycle.
     */
    destroy(): void;
}

/**
 * Options for {@link DocxScrollViewer}. Extends `RenderPageOptions` (per-page
 * render knobs, minus `onTextRun`) and `LoadOptions` (parse/worker knobs). See
 * design §8.1.
 *
 * `onTextRun` is omitted deliberately: the viewer drives it internally per
 * mounted slot to build the optional per-page selection overlay (gated by
 * `enableTextSelection`), so exposing it here would let a caller's callback be
 * silently overridden.
 */
export declare interface DocxScrollViewerOptions extends Omit<RenderPageOptions, 'onTextRun'>, LoadOptions {
    /** Base fit width in CSS px → base zoom scale. Default: the container's width
     *  at first non-zero layout (design §7/§11 zero-width deferral). */
    width?: number;
    /** Vertical gap (px) between consecutive pages. Default 16. */
    gap?: number;
    /** Desk padding (px) ABOVE the FIRST page — the margin a PDF reader leaves
     *  between the top of the scroll surface and the first sheet. Default: `gap`
     *  (uniform desk rhythm — the first page sits the same distance from the top as
     *  pages sit from each other). Pass `0` for a flush-top layout. */
    paddingTop?: number;
    /** Desk padding (px) BELOW the LAST page — the margin below the final sheet.
     *  Default: `gap`. Pass `0` for a flush-bottom layout. */
    paddingBottom?: number;
    /** Desk gutter (px) to the LEFT of the pages — the horizontal margin between the
     *  left edge of the scroll surface and a page sitting flush-left (i.e. once
     *  zoomed wide enough that centering no longer applies). Default: `gap` (uniform
     *  desk rhythm — the horizontal gutters match the vertical ones). It also shrinks
     *  the container-derived FIT width so a page sits inside the gutters at 100%
     *  (an EXPLICIT `opts.width` is the page's CSS-width contract and is NOT reduced;
     *  the gutters still apply around placement). Pass `0` for a flush-left layout. */
    paddingLeft?: number;
    /** Desk gutter (px) to the RIGHT of the pages. Default: `gap`. Shrinks the
     *  container-derived fit width symmetrically with `paddingLeft`. Pass `0` for a
     *  flush-right layout. */
    paddingRight?: number;
    /** Pages kept mounted beyond the viewport on each side. Default 1. */
    overscan?: number;
    /** Per-page transparent text-selection overlay. IX6 — works in BOTH render
     *  modes: in worker mode the per-run geometry is collected off-thread and
     *  shipped back beside the page bitmap, so the overlay is populated identically
     *  to main mode (no more empty overlay / one-time warning). */
    enableTextSelection?: boolean;
    /** Minimum zoom scale (px-per-pt multiplier floor). Default 0.1. */
    zoomMin?: number;
    /** Maximum zoom scale. Default 4. */
    zoomMax?: number;
    /** Enable `Ctrl`/`Cmd`+wheel zoom. Default true. */
    enableZoom?: boolean;
    /**
     * CSS `background` shorthand for the scroll surface (the "desk") visible
     * behind and between pages — the gray a PDF reader paints around the sheet.
     * Applied to the viewer-owned scroll host. The pages themselves are always
     * drawn on the document's own white canvas and are unaffected. Default
     * `undefined`: the scroll surface stays transparent so the host container's
     * background shows through (non-breaking).
     */
    background?: string;
    /**
     * CSS `box-shadow` painted on every page CANVAS (not the wrapper — the
     * text-selection overlay must not cast its own shadow). The soft drop shadow a
     * PDF reader leaves under each sheet.
     *
     * - Default (`undefined`): `'0 1px 3px rgba(0,0,0,0.2)'` — the recipe look, so
     *   the scroll viewer reproduces the Examples appearance with zero config.
     * - `false`: NO shadow (flat pages).
     * - A custom string is applied verbatim. A spread-only ring such as
     *   `'0 0 0 1px #c8ccd0'` gives a crisp 1px BORDER look — and because
     *   `box-shadow` never affects layout (unlike `border`, which would grow the
     *   box and shift every offset), a border and a drop shadow are the SAME knob
     *   here rather than two competing options.
     */
    pageShadow?: string | false;
    /**
     * Inject an already-loaded engine to share one parse across panes (design §14).
     * When set: `load()` is unsupported (throws), the engine's own `mode` wins (an
     * explicitly conflicting `opts.mode` throws at construction, design §11), and
     * `destroy()` does NOT destroy this engine (the caller owns its lifecycle).
     */
    document?: DocxDocument;
    /** Fires when the top-most visible page changes. `topIndex` from
     *  `computeVisibleRange` (the first page intersecting the viewport top,
     *  EXCLUDING overscan). */
    onVisiblePageChange?: (topIndex: number, total: number) => void;
    /** IX9 — fires whenever the zoom factor actually changes (`1` = 100% = a page
     *  at its natural pt→px size): from {@link DocxScrollViewer.setScale},
     *  `zoomIn`/`zoomOut`, `fitWidth`/`fitPage`, a Ctrl/⌘+wheel gesture, or a
     *  container-resize re-fit. Named `onScaleChange` to match the single-canvas
     *  viewers so all five share one notification shape. */
    onScaleChange?: (scale: number) => void;
    /** IX1 (design decision — NOT user-confirmed, integrator may veto). Called when
     *  a hyperlink run is clicked. When omitted, the default is: external → open in a
     *  new tab via core `openExternalHyperlink` (sanitised, noopener,noreferrer);
     *  internal → jump to the page whose text contains the bookmark (best-effort). */
    onHyperlinkClick?: (target: HyperlinkTarget) => void;
    /** Error callback. When set, `load()` invokes it and resolves (otherwise the
     *  error is rethrown — shared viewer error contract). It ALSO fires for async
     *  per-slot render failures (both main `renderPage` and worker
     *  `renderPageToBitmap` rejections); a failed page is left blank rather than
     *  crashing the loop. Without an `onError`, render failures are logged via
     *  `console.error` so they are never fully silent. */
    onError?: (err: Error) => void;
}

export declare interface DocxTextRun {
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    /** ECMA-376 §17.3.2.40 `<w:u w:val>` — the raw ST_Underline (§17.18.99) style
     *  value (`double` / `thick` / `dotted` / `wave` / `dashLong` / …). Absent for
     *  the plain single rule (or no underline). The renderer normalizes this
     *  WordprocessingML vocabulary to the shared DrawingML ST_TextUnderlineType
     *  (§20.1.10.82) that `core.drawUnderline` dispatches on. */
    underlineStyle?: string;
    /** ECMA-376 §17.3.2.40 `<w:u w:color>` — underline-only colour (hex 6, or the
     *  literal `auto`). Absent ⇒ the underline follows the glyph colour. */
    underlineColor?: string;
    strikethrough: boolean;
    fontSize: number;
    color: string | null;
    fontFamily: string | null;
    /** ECMA-376 §17.3.2.26 eastAsia axis (`<w:rFonts w:eastAsia>`), resolved
     *  through the style chain + docDefaults. CJK code points in this run render
     *  with this family; {@link DocxTextRun.fontFamily} keeps the conflated single-
     *  font fallback (ascii → eastAsia) for paths that do not split per character.
     *  The renderer routes consecutive CJK code points to this axis (the same per-
     *  script rule {@link ShapeTextRun.fontFamilyEastAsia} uses), so a Gothic
     *  eastAsia title sits beside a serif ascii number with no name heuristics.
     *  Absent ⇒ the renderer falls back to {@link DocxTextRun.fontFamily}. */
    fontFamilyEastAsia?: string | null;
    isLink: boolean;
    background: string | null;
    /** ECMA-376 §17.3.2.6 — `<w:color w:val="auto"/>` was set on this run. When
     *  true and {@link DocxTextRun.color} is absent, the renderer resolves the
     *  glyph color from the effective background (an implementation-defined
     *  black/white contrast pick; ECMA-376 gives no normative algorithm) instead
     *  of the default text color. */
    colorAuto?: boolean | null;
    /** ECMA-376 §17.3.2.4 `<w:bdr>` — a run-level border (box) drawn around the
     *  run text. Absent when the run has no border. */
    border?: DocxRunBorder | null;
    vertAlign: 'super' | 'sub' | null;
    /** Target URL for hyperlinks (resolved from relationships.xml) */
    hyperlink: string | null;
    /** ECMA-376 §17.16.23 `<w:hyperlink w:anchor>` — internal bookmark name this
     *  link jumps to (a `<w:bookmarkStart w:name>` in the same document). Set for an
     *  internal cross-reference / TOC entry. When a link carries both `r:id` and
     *  `w:anchor`, {@link DocxTextRun.hyperlink} (external) wins and this still
     *  records the anchor. Absent when the link has no anchor. */
    hyperlinkAnchor?: string | null;
    allCaps?: boolean;
    smallCaps?: boolean;
    doubleStrikethrough?: boolean;
    highlight?: string | null;
    /** ECMA-376 §17.3.2.12 `<w:em w:val>` — emphasis (boten / 圏点) mark drawn on
     *  every non-space character of the run (§17.18.24 ST_Em). `'dot'` = filled
     *  dot above, `'comma'` = sesame/comma above, `'circle'` = hollow circle
     *  above, `'underDot'` = filled dot below (horizontal writing). Absent (or the
     *  authored `val="none"`) ⇒ no mark. The renderer stamps the mark per glyph
     *  after the text and does NOT change the glyph advance. */
    emphasisMark?: EmphasisMark;
    /** ECMA-376 §17.3.3.25 ruby annotation (furigana). Renders above the
     *  base text in a smaller font; line height is expanded to fit it. */
    ruby?: RubyAnnotation;
    /** ECMA-376 §17.13.5 — set when this run sits inside `<w:ins>` or
     *  `<w:del>`. The renderer paints insertions with an author-coloured
     *  underline and deletions with an author-coloured strikethrough so
     *  tracked changes appear inline. */
    revision?: RunRevision;
    /** ECMA-376 §17.3.2.30 `<w:rtl>` — complex-script / right-to-left run.
     *  `true` = RTL, `false` = explicitly LTR, absent = unspecified. The renderer
     *  treats a `true` run as RTL for the UAX#9 pass (it forces complex-script
     *  shaping and marks the segment so `computeLineVisualOrder` reorders it), and
     *  draws the slice with `ctx.direction = 'rtl'` so Canvas mirrors the glyphs. */
    rtl?: boolean;
    /** ECMA-376 §17.3.2.7 `<w:cs/>` — complex-script run toggle: cs formatting
     *  applies to ALL characters of the run (§17.3.2.26). Distinct from
     *  `rFonts@cs` (`fontFamilyCs`), which is only a font slot. */
    cs?: boolean;
    /** ECMA-376 §17.3.2.26 `<w:rFonts w:cs>` — complex-script typeface
     *  (theme references resolved to a literal family). */
    fontFamilyCs?: string;
    /** ECMA-376 §17.3.2.39 `<w:szCs>` — complex-script font size in pt
     *  (same units as `fontSize`). */
    fontSizeCs?: number;
    /** ECMA-376 §17.3.2.3 `<w:bCs>` — complex-script bold toggle. */
    boldCs?: boolean;
    /** ECMA-376 §17.3.2.17 `<w:iCs>` — complex-script italic toggle. */
    italicCs?: boolean;
    /** ECMA-376 §17.3.2.20 `<w:lang w:bidi>` — complex-script (RTL) language tag,
     *  lower-cased (e.g. "ar-sa", "ae-ar"). Drives Word's AN digit ordering. */
    langBidi?: string;
    /** ECMA-376 §17.3.2.35 `<w:spacing w:val>` — character-spacing adjustment in
     *  POINTS (signed): the extra pitch added after each character before the next
     *  is rendered. The renderer feeds it to `ctx.letterSpacing` on BOTH the
     *  measure and paint passes so line breaking / pagination stay consistent.
     *  Absent ⇒ no extra pitch. */
    charSpacing?: number;
    /** ECMA-376 §17.3.2.43 `<w:w w:val>` — horizontal text scale as a FRACTION of
     *  normal character width (0.67 = 67%, 2.0 = 200%). Stretches each glyph's
     *  width, not the gap between glyphs. Absent ⇒ 100%. */
    charScale?: number;
    /** ECMA-376 §17.3.2.24 `<w:position w:val>` — baseline raise (positive) /
     *  lower (negative) in POINTS, without changing the font size or line box.
     *  Absent ⇒ no shift. */
    position?: number;
    /** ECMA-376 §17.3.2.19 `<w:kern w:val>` — font-kerning threshold in POINTS
     *  (the smallest font size that is kerned). Presence enables kerning subject
     *  to the threshold; absent ⇒ kerning off (the hierarchy default). `0` = kern
     *  at all sizes. */
    kerning?: number;
    /** ECMA-376 §17.3.2.10 `<w:eastAsianLayout w:vert>` — horizontal-in-vertical
     *  (縦中横 / tate-chū-yoko). `true` means that in a VERTICAL (tbRl) page this
     *  run's characters are laid out horizontally side by side within ONE cell of
     *  the vertical line (rotated 90° relative to the vertical flow). Absent ⇒
     *  normal vertical stacking. Inert in a horizontal page. */
    eastAsianVert?: boolean;
    /** ECMA-376 §17.3.2.10 `<w:eastAsianLayout w:vertCompress>` — compress the
     *  縦中横 run to fit the existing line height without growing the line. Ignored
     *  unless {@link eastAsianVert} is set. Absent ⇒ not compressed. */
    eastAsianVertCompress?: boolean;
    /** ECMA-376 §17.3.2.10 `<w:eastAsianLayout w:combine>` — two-lines-in-one.
     *  PARSED for completeness; not yet rendered (no fixture). */
    eastAsianCombine?: boolean;
    /** ECMA-376 §17.3.2.10 `<w:eastAsianLayout w:combineBrackets>` (§17.18.8) —
     *  bracket style around two-lines-in-one text. PARSED for completeness; the
     *  two-lines-in-one draw is a follow-up. */
    eastAsianCombineBrackets?: string;
    /** ECMA-376 §17.11.6/.7/.16/.17 — set when this run is a footnote/endnote
     *  reference marker (`<w:footnoteReference>` in the body, `<w:footnoteRef>` at
     *  the start of the note's content, and the endnote equivalents). `text` holds
     *  the raw `@w:id`; the renderer overrides the displayed glyph with the note's
     *  sequential number. */
    noteRef?: NoteRef;
}

/** Information about a rendered text segment for building a transparent selection overlay. */
export declare interface DocxTextRunInfo {
    text: string;
    /** Left edge in canvas CSS px. */
    x: number;
    /** Top of line box in canvas CSS px. */
    y: number;
    /** Measured text width in CSS px. */
    w: number;
    /** Line height in CSS px. */
    h: number;
    /** Font size in CSS px. */
    fontSize: number;
    /** CSS `font` shorthand used for canvas drawing (e.g. `"bold 16px Arial"`). */
    font: string;
    /** ECMA-376 §17.6.20 (tbRl) — when the page is vertical the canvas is the
     *  physical landscape page rotated +90° at paint, so this run's `x`/`y` are the
     *  PHYSICAL top-left the overlay span must sit at, and `transform` is the CSS
     *  rotation (`"rotate(90deg)"`, applied about the span's top-left) that lays the
     *  horizontal DOM span along the drawn (rotated) glyph run. Absent for
     *  horizontal pages (the span is placed at `x`/`y` untransformed). */
    transform?: string;
    /** IX1 — the resolved hyperlink target of this run (ECMA-376 §17.16.22
     *  external URL / §17.16.23 internal `w:anchor` bookmark), or absent for a
     *  non-link run. The text-layer overlay turns a run carrying this into a
     *  clickable region; the drawn glyphs are unaffected. */
    hyperlink?: HyperlinkTarget;
    /** ECMA-376 §17.3.2.10 eastAsianLayout `w:vert` (縦中横 / horizontal-in-vertical):
     *  `true` when this run was drawn as tate-chu-yoko — its glyphs laid out
     *  horizontally, side by side, COMPRESSED into ONE em cell of the vertical
     *  column (see {@link drawTateChuYokoRun}). `w` is the drawn cell extent (one
     *  em), NOT the natural text width, so the find / selection overlays must clamp
     *  their horizontal extent to `w` rather than re-measuring the run's natural
     *  glyphs (issue #836). Absent for every ordinary run. */
    eastAsianVert?: boolean;
}

export declare class DocxViewer implements ZoomableViewer {
    private _doc;
    private _currentPage;
    /**
     * IX9 explicit zoom factor (`1` = 100% = the page at its natural pt→px width),
     * or `null` when the caller has never invoked a zoom method. `null` preserves
     * the pre-IX9 render path EXACTLY: the page renders at `opts.width` (or its
     * natural width when that is unset), so default rendering is byte-identical. The
     * first `setScale`/`zoomIn`/`zoomOut`/`fitWidth`/`fitPage` call latches a number
     * here, after which `_renderPage` derives the canvas width from it instead.
     */
    private _scale;
    private _canvas;
    private _wrapper;
    /** The canvas's DOM position BEFORE the constructor reparented it into
     *  {@link _wrapper}, captured so {@link destroy} can return the caller-owned
     *  canvas to exactly where it was. `null` parent = canvas was passed
     *  detached. */
    private _originalParent;
    private _originalNextSibling;
    /** The canvas's inline `display` before the constructor forced `block`
     *  (empty string if it was unset), restored on {@link destroy}. */
    private _originalDisplay;
    private _textLayer;
    /** IX2 — the find-highlight overlay layer. Always created (independent of
     *  `enableTextSelection`): highlights ride the same positioned-DOM overlay
     *  mechanism as the selection layer but are visible boxes, not transparent
     *  spans. Sits above the text layer so a highlight shows over a link's hit
     *  region without stealing its clicks (`pointer-events:none`). */
    private _highlightLayer;
    /** IX2 — find state (per-page runs, matches, active cursor). */
    private _find;
    /** A 2d context used only to measure text for highlight geometry (its own
     *  1×1 offscreen canvas, so measuring never touches the visible canvas). */
    private _measureCtx;
    private _opts;
    private readonly _mode;
    /** The canvas's bitmaprenderer context, used only in worker mode (a canvas
     *  holds one context type for its lifetime; the main-mode 2d render path is
     *  never used on the same canvas). */
    private _bitmapCtx;
    /** Set by {@link destroy} (first line). Guards {@link _reportRenderError} so a
     *  render rejection that lands AFTER teardown is swallowed rather than surfaced
     *  to an `onError` / `console.error` on a dead viewer — parity with the scroll
     *  viewers' `_destroyed` flag. */
    private _destroyed;
    /**
     * Concurrent-load latch (generation token). Every {@link load} increments this
     * and captures the value; after its engine finishes loading it re-checks the
     * live value and BAILS (destroying its own just-loaded engine) if a newer
     * `load()` has since started. Without it, two overlapping `load(A)`/`load(B)`
     * calls race the WASM parse / worker init, and whichever RESOLVES last wins the
     * swap — even the stale `load(A)` resolving after `load(B)`; the loser's freshly
     * created engine (never installed, or installed then overwritten) then leaks its
     * worker + pinned WASM allocation. The latch composes with SC20: the check runs
     * AFTER the new engine loads but BEFORE the field assignment and
     * `previous?.destroy()`, so a superseded load never touches `this._doc` nor
     * frees the current (newer) engine. {@link destroy} also bumps it so a load in
     * flight at teardown is treated as superseded and its engine cleaned up.
     */
    private _loadGen;
    constructor(canvas: HTMLCanvasElement, opts?: DocxViewerOptions);
    /**
     * Load a DOCX from URL or ArrayBuffer and render the first page.
     *
     * Error contract (shared by all three viewers):
     * - Parse/load failure (the underlying `DocxDocument.load()` call itself
     *   rejects): if an `onError` callback was provided it is invoked and `load`
     *   resolves normally; if not, the error is rethrown so it is never silently
     *   swallowed.
     * - Render failure (the first page fails to draw AFTER a successful
     *   parse/load): routed to the shared `_reportRenderError` contract (`onError`
     *   if provided, else `console.error` — never silent) and `load` still
     *   RESOLVES, matching every subsequent navigation call.
     */
    load(source: string | ArrayBuffer): Promise<void>;
    get pageCount(): number;
    get currentPage(): number;
    /** The underlying <canvas> element. */
    get canvasElement(): HTMLCanvasElement;
    goToPage(index: number): Promise<void>;
    nextPage(): Promise<void>;
    prevPage(): Promise<void>;
    /** Natural (100%) CSS-px width of the current page — `widthPt × PT_TO_PX`.
     *  This is the scale-1 reference every zoom factor multiplies. 0 when nothing
     *  is loaded. */
    private _naturalWidthPx;
    /**
     * The width (CSS px) `_renderPage` renders the current page at, honouring the
     * zoom state. `_scale === null` (no zoom method ever called) ⇒ the pre-IX9
     * value `opts.width` verbatim (byte-identical default: `undefined` lets the
     * renderer use the page's natural width). Once a factor latched ⇒
     * `naturalWidth × scale` (rounded), so the on-screen page is exactly `scale ×`
     * its natural size regardless of the original `opts.width`.
     */
    private _renderWidth;
    /** IX9 {@link ZoomableViewer} — the current zoom factor (`1` = 100%). Before
     *  any zoom method is called this is the EFFECTIVE scale implied by the current
     *  render width: `opts.width / naturalWidth`, or `1` when `opts.width` is unset
     *  (the page renders at its natural size) or nothing is loaded. */
    getScale(): number;
    private _zoomMin;
    private _zoomMax;
    /**
     * IX9 {@link ZoomableViewer} — set the absolute zoom factor (`1` = 100% = the
     * page at its natural pt→px width), clamped to `[zoomMin, zoomMax]`, and
     * re-render the current page at the new size. Fires `onScaleChange` when the
     * clamped factor actually changes. Resolves once the re-render settles. A no-op
     * (but still latches the scale) when nothing is loaded.
     */
    setScale(scale: number): Promise<void>;
    /** IX9 {@link ZoomableViewer} — step up to the next rung of the shared zoom
     *  ladder (clamped to `zoomMax`). */
    zoomIn(): Promise<void>;
    /** IX9 {@link ZoomableViewer} — step down to the next lower ladder rung. */
    zoomOut(): Promise<void>;
    /**
     * IX9 {@link ZoomableViewer} — fit the current page's WIDTH to the host
     * container (the element the canvas lives in, or `opts.container` if supplied),
     * then re-render. Defers (no-op) when nothing is loaded or the container is
     * unlaid-out. Routes through {@link setScale}, so the factor is clamped and
     * `onScaleChange` fires.
     */
    fitWidth(): Promise<void>;
    /**
     * IX9 {@link ZoomableViewer} — fit the WHOLE current page (width and height)
     * inside the container so it is visible without scrolling; takes the tighter of
     * the width/height fit. Defers when unloaded / unlaid-out.
     */
    fitPage(): Promise<void>;
    /** Shared fit for {@link fitWidth}/{@link fitPage}: measure the natural page
     *  size + the container box, ask core's pure `fitScale`, apply via setScale. */
    private _fit;
    /** The element a fit measures against: the explicit `opts.container`, else the
     *  host the wrapper was inserted into (`_wrapper.parentElement`). `null` when
     *  the canvas was mounted detached (no host to fit to). */
    private _fitContainer;
    /**
     * IX2 — find every occurrence of `query` in the document and highlight them
     * all (a soft box per match, drawn on the highlight overlay over the drawn
     * glyphs). Returns every match in document order, each tagged with its
     * `{ page }` (0-based). Case-insensitive by default (browser find-in-page);
     * pass `{ caseSensitive: true }` to match case exactly.
     *
     * Scans all pages, so a large document renders each page once (offscreen) to
     * read its text (the visible page reuses its on-screen render). IX6 — works in
     * BOTH `mode: 'main'` and `mode: 'worker'`: in worker mode each page's run
     * geometry is collected off-thread and shipped back, so find returns the same
     * matches on the same code path. An empty query clears the find and returns `[]`.
     */
    findText(query: string, opts?: FindMatchesOptions): Promise<FindMatch<DocxMatchLocation>[]>;
    /**
     * IX2 — move to the next match (wrap-around from last to first), navigating to
     * its page if needed, and draw it in the distinct active-match colour. Returns
     * the now-active match, or `null` when there are no matches. Call
     * {@link findText} first.
     */
    findNext(): Promise<FindMatch<DocxMatchLocation> | null>;
    /** IX2 — move to the previous match (wrap-around from first to last). */
    findPrev(): Promise<FindMatch<DocxMatchLocation> | null>;
    /** IX2 — clear all highlights and reset the find state. */
    clearFind(): void;
    /** Navigate to the active match's page (if not already there) and redraw the
     *  highlights so the active box shows in the emphasis colour. */
    private _activateMatch;
    /** Rebuild the highlight overlay for the current page from cached runs
     *  (no page re-render). */
    private _redrawHighlights;
    /**
     * Terminate the parser worker and release resources.
     *
     * The caller-owned `<canvas>` is returned to the DOM position it held before
     * the constructor was called (same parent, same next-sibling) and its inline
     * `display` is restored, so the canvas can be reused — e.g. to construct a new
     * viewer on the same element. If the canvas was passed detached (no parent) it
     * is simply removed from the internal wrapper. Safe to call more than once.
     */
    destroy(): void;
    private _render;
    /** Route a render failure to `onError`, or `console.error` when none is given
     *  (never fully silent), and never after teardown. Mirrors the scroll viewers'
     *  `_reportRenderError`. */
    private _reportRenderError;
    private _renderPage;
    /** Draw the find-highlight boxes for the current page from its runs. Clears
     *  the overlay when there is no active find. */
    private _buildHighlightLayer;
    /** A width-measurer primed with `font`, backed by a private 1×1 canvas so it
     *  never disturbs the visible canvas's context state. */
    private _measureForFont;
    /** Render a page to a throwaway offscreen canvas purely to collect its runs
     *  (text + geometry) for search, without touching the visible canvas. Used by
     *  the find controller for pages other than the one on screen. */
    private _collectPageRuns;
    private _buildTextLayer;
    /**
     * IX1/IX-nav — the click handler passed to the text-layer overlay. When the
     * caller supplied `onHyperlinkClick`, it fully owns the behaviour (the default
     * is suppressed). Otherwise the built-in default is: an external link opens in
     * a new tab through core `openExternalHyperlink` (URL sanitised against the
     * safe scheme allowlist, `noopener,noreferrer`); an internal `<w:anchor>` link
     * resolves its bookmark name to a page via
     * {@link DocxDocument.getBookmarkPage} (ECMA-376 §17.16.23) and jumps there
     * with {@link goToPage}. An anchor naming no known bookmark is a safe no-op
     * rather than a jump to a guessed page.
     */
    private _hyperlinkHandler;
}

export declare interface DocxViewerOptions extends RenderPageOptions, LoadOptions {
    container?: HTMLElement;
    /**
     * When true, adds a transparent text overlay div over the canvas so the
     * browser's native text selection works on document content.
     */
    enableTextSelection?: boolean;
    /** Called when a page finishes rendering. */
    onPageChange?: (index: number, total: number) => void;
    /** IX9 zoom contract ({@link ZoomableViewer}) — the clamp range for
     *  {@link DocxViewer.setScale} / `zoomIn` / `zoomOut` / `fitWidth` / `fitPage`,
     *  as user-facing zoom factors (`1` = 100% = the page at its natural pt→px
     *  size). Defaults 0.1–4 (10%–400%), matching the other viewers. */
    zoomMin?: number;
    zoomMax?: number;
    /** IX9 — fires whenever the zoom factor actually changes (`1` = 100%): from
     *  {@link DocxViewer.setScale}, `zoomIn`/`zoomOut`, or `fitWidth`/`fitPage`.
     *  Named `onScaleChange` to match the pptx/xlsx viewers so all five share one
     *  notification shape. */
    onScaleChange?: (scale: number) => void;
    /** IX1 (design decision — NOT user-confirmed, integrator may veto). Called when
     *  a hyperlink run is clicked. When omitted, the default is: external → open in a
     *  new tab via core `openExternalHyperlink` (sanitised, noopener,noreferrer);
     *  internal → jump to the page whose text contains the bookmark (best-effort). */
    onHyperlinkClick?: (target: HyperlinkTarget) => void;
    /** Called on parse or render errors. */
    onError?: (err: Error) => void;
}

/** A duotone effect resolved to its two endpoint colours. Both are 6-char
 *  uppercase hex WITHOUT a leading `#` (the form the Rust parsers emit). `clr1`
 *  is the dark endpoint (luminance 0), `clr2` the light endpoint (luminance 1),
 *  matching the child order of `<a:duotone>` in §20.1.8.23. Any per-colour
 *  transforms (lumMod/lumOff/tint/satMod/…) are already baked into these hexes
 *  by the parser's colour-resolution machinery. */
declare interface Duotone {
    /** First `EG_ColorChoice` child — the dark endpoint. 6-char hex, no `#`. */
    clr1: string;
    /** Second `EG_ColorChoice` child — the light endpoint. 6-char hex, no `#`. */
    clr2: string;
}

/** ECMA-376 §17.8.3.3-.6 — one embedded font-style slot from
 *  `word/fontTable.xml`, resolved to its obfuscated part path + fontKey. */
export declare interface EmbeddedFontRef {
    fontName: string;
    style: 'regular' | 'bold' | 'italic' | 'boldItalic';
    partPath: string;
    fontKey: string;
}

/** ECMA-376 §17.18.24 ST_Em — the emphasis-mark styles a run may carry via
 *  `<w:em w:val>` (§17.3.2.12). `'none'` is filtered out by the parser, so the
 *  model only ever carries one of these four positive marks (or `undefined`). */
declare type EmphasisMark = 'dot' | 'comma' | 'circle' | 'underDot';

export declare interface FieldRun {
    /** "page" | "numPages" | "other" */
    fieldType: string;
    instruction: string;
    fallbackText: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    fontSize: number;
    color: string | null;
    fontFamily: string | null;
    background: string | null;
    vertAlign: 'super' | 'sub' | null;
    allCaps?: boolean;
    smallCaps?: boolean;
    doubleStrikethrough?: boolean;
    highlight?: string | null;
    /** ECMA-376 §17.3.2.12 `<w:em w:val>` — emphasis (boten / 圏点) mark, mirrors
     *  {@link DocxTextRun.emphasisMark} (§17.18.24 ST_Em). Absent (or the
     *  authored `val="none"`) ⇒ no mark. */
    emphasisMark?: EmphasisMark;
}

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

/**
 * ECMA-376 §17.3.1.11 `<w:framePr>` — text-frame / drop-cap properties.
 *
 * Lengths are pt (parser converts from twips). Per the spec, `x`/`y` are
 * ignored when `xAlign`/`yAlign` are set, and for a drop cap `y`/`yAlign` are
 * ignored entirely while `lines` drives the height. `w`/`h`/`x`/`y` are
 * `undefined` when the attribute was absent (distinct from an explicit 0).
 */
export declare interface FramePr {
    /** ST_DropCap (§17.18.20): 'none' | 'drop' | 'margin'. Default 'none'. */
    dropCap: 'none' | 'drop' | 'margin' | string;
    /** §17.3.1.11 `lines` — drop-cap vertical height in anchor lines. Default 1. */
    lines: number;
    /** ST_Wrap (§17.18.104): 'around'|'auto'|'none'|'notBeside'|'through'|'tight'. Default 'around'. */
    wrap: 'around' | 'auto' | 'none' | 'notBeside' | 'through' | 'tight' | string;
    /** ST_HAnchor (§17.18.35): 'text'(=column) | 'margin' | 'page'. Default 'page'. */
    hAnchor: 'text' | 'margin' | 'page' | string;
    /** ST_VAnchor (§17.18.100): 'text' | 'margin' | 'page'. Default 'page'. */
    vAnchor: 'text' | 'margin' | 'page' | string;
    /** ST_HeightRule (§17.18.37): 'auto' | 'atLeast' | 'exact'. Default 'auto'. */
    hRule: 'auto' | 'atLeast' | 'exact' | string;
    /** hSpace — min wrap padding L/R when wrap='around' (pt). Default 0. */
    hSpace: number;
    /** vSpace — min wrap padding top/bottom (pt). Default 0. */
    vSpace: number;
    /** w — exact frame width (pt). Absent ⇒ auto (max content line width). */
    w?: number;
    /** h — frame height (pt). Meaning gated by hRule. Absent ⇒ auto. */
    h?: number;
    /** x — absolute horizontal offset from hAnchor (pt). Ignored when xAlign set. */
    x?: number;
    /** y — absolute vertical offset from vAnchor (pt). Ignored when yAlign set / drop cap. */
    y?: number;
    /** ST_XAlign (§22.9.2.18): 'left'|'center'|'right'|'inside'|'outside'. Supersedes x. */
    xAlign?: 'left' | 'center' | 'right' | 'inside' | 'outside' | string;
    /** ST_YAlign (§22.9.2.20): 'inline'|'top'|'center'|'bottom'|'inside'|'outside'. Supersedes y. */
    yAlign?: 'inline' | 'top' | 'center' | 'bottom' | 'inside' | 'outside' | string;
}

export declare interface GradientStop {
    /** 0.0–1.0 */
    position: number;
    /** hex 6-char */
    color: string;
}

export declare interface HeaderFooter {
    body: BodyElement[];
}

export declare interface HeadersFooters {
    default: HeaderFooter | null;
    first: HeaderFooter | null;
    even: HeaderFooter | null;
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

export declare interface ImageRun {
    /**
     * Embedded zip path of the raster blip (e.g. `word/media/image1.png`) — the
     * raster fallback (PNG/JPEG), or the SVG part itself when no raster blip is
     * embedded. The renderer fetches the bytes lazily by path (see {@link
     * DocxDocument.getImage}) instead of inlining base64.
     */
    imagePath: string;
    /** MIME type of the blip at {@link ImageRun.imagePath} (e.g. `image/png`, or
     *  `image/svg+xml` for an svg-only picture). */
    mimeType: string;
    /**
     * Vector original from the Microsoft `asvg:svgBlip` extension (MS-ODRAWXML) —
     * the zip path of the `.svg` part. When present the renderer prefers it over
     * {@link ImageRun.imagePath} (the raster fallback). Absent for a plain raster
     * image. Its MIME is always `image/svg+xml` and is owned by the SVG decoder.
     */
    svgImagePath?: string;
    /**
     * ECMA-376 §20.1.8.55 `<a:srcRect>` — the source-rectangle crop applied to
     * the decoded bitmap before it is drawn into the display box. The four values
     * are inset FRACTIONS 0..1 of the source bitmap measured inward from each
     * edge (`l`/`t` from left/top, `r`/`b` from right/bottom); the visible source
     * region is `[l, t, 1−r, 1−b]`. The parser converts the raw ST_Percentage
     * (1000ths of a percent) to fractions, so the renderer crops in bitmap pixels
     * (`sx = l*w`, `sy = t*h`, `sw = (1−l−r)*w`, `sh = (1−t−b)*h`) without unit
     * knowledge. Absent / null when there is no crop (the full bitmap is drawn).
     */
    srcRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    } | null;
    widthPt: number;
    heightPt: number;
    /** true = wp:anchor (absolute positioned), false/undefined = wp:inline (flows with text) */
    anchor?: boolean;
    /** X offset in pt (anchor only) */
    anchorXPt?: number;
    /** Y offset in pt (anchor only) */
    anchorYPt?: number;
    /**
     * If true, anchorXPt is relative to the left margin — add section.marginLeft to get page X.
     * If false/absent, anchorXPt is already page-absolute.
     */
    anchorXFromMargin?: boolean;
    /**
     * If true, anchorYPt is relative to the paragraph's top Y in the renderer.
     * If false/absent, anchorYPt is already page-absolute.
     */
    anchorYFromPara?: boolean;
    /**
     * When set, the renderer replaces all pixels of this hex color (e.g. "FFFFFF") with full
     * transparency. Implements a:clrChange (make-background-transparent).
     */
    colorReplaceFrom?: string;
    /**
     * ECMA-376 §20.1.8.23 `<a:duotone>` recolour, resolved to its two endpoint
     * colours (through the document theme). Absent ⇒ no duotone. When present the
     * renderer decodes the raster once, remaps it along the `clr1`→`clr2`
     * luminance ramp, and caches the recoloured bitmap under a colour-suffixed key.
     */
    duotone?: Duotone;
    /**
     * ECMA-376 §20.1.8.6 `<a:alphaModFix@amt>` opacity as 0..1. Absent ⇒ fully
     * opaque. When present the renderer multiplies the picture's `globalAlpha` by
     * this fraction.
     */
    alpha?: number;
    /**
     * Wrap mode for anchor images:
     *   "square" | "topAndBottom" | "none" | "tight" | "through"
     * Inline images and undetermined cases leave this undefined.
     * MVP renders "tight" and "through" as "square".
     */
    wrapMode?: string;
    /** Padding top (pt). Anchor-only. */
    distTop?: number;
    /** Padding bottom (pt). Anchor-only. */
    distBottom?: number;
    /** Padding left (pt). Anchor-only. */
    distLeft?: number;
    /** Padding right (pt). Anchor-only. */
    distRight?: number;
    /** wrapText attribute: "bothSides" | "left" | "right" | "largest". */
    wrapSide?: string;
    /**
     * ECMA-376 §20.4.2.3 `wp:anchor/@allowOverlap` — whether this floating object
     * may overlap other floats. Spec default is true (the attribute is optional);
     * absent/undefined is treated as true. `false` mandates the renderer
     * reposition the object to prevent any overlap.
     */
    allowOverlap?: boolean;
    /** ECMA-376 §20.4.3.1 wp:align horizontal: "left" | "center" | "right" |
     *  "inside" | "outside". When set the renderer aligns the image inside the
     *  container indicated by `anchorXFromMargin` and ignores `anchorXPt`.
     *  Mirrors {@link ShapeRun.anchorXAlign}. Absent for inline images and
     *  offset-based anchors. */
    anchorXAlign?: string | null;
    /** Vertical equivalent of anchorXAlign: "top" | "center" | "bottom". */
    anchorYAlign?: string | null;
    /**
     * ECMA-376 §20.4.3.2 `<wp:positionH/@relativeFrom>` / §20.4.3.5
     * `<wp:positionV/@relativeFrom>` — names the container the offset / align /
     * pctPos is measured against. Raw spec string: `"page"`, `"margin"`,
     * `"paragraph"`, `"line"`, `"leftMargin"`, `"rightMargin"`, `"topMargin"`,
     * `"bottomMargin"`, `"insideMargin"`, `"outsideMargin"`, `"column"`,
     * `"character"`. Mirrors {@link ShapeRun.anchorXRelativeFrom} /
     * {@link ShapeRun.anchorYRelativeFrom}. When present, supersedes the legacy
     * coarse boolean hints (`anchorXFromMargin` / `anchorYFromPara`) for the
     * align and pctPos paths so e.g. `relativeFrom="margin"` + `align="top"`
     * pins the image to the top content margin rather than the page top. Absent
     * for inline images and for anchors that omitted `<wp:positionH/V>`.
     */
    anchorXRelativeFrom?: string | null;
    anchorYRelativeFrom?: string | null;
}

declare interface LegendManualLayout {
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

/** DrawingML line-end (arrow head). ECMA-376 §20.1.8.3 CT_LineEndProperties.
 *  Maps 1:1 to core's `ArrowEnd`. */
export declare interface LineEnd {
    /** "triangle" | "stealth" | "diamond" | "oval" | "arrow" (never "none"). */
    type: string;
    /** Width step: "sm" | "med" | "lg". */
    w: string;
    /** Length step: "sm" | "med" | "lg". */
    len: string;
}

/** ECMA-376 §17.6.8 `<w:lnNumType>` — line numbering for a section. Mirrors the
 *  Rust `LineNumbering`. A number is drawn in the left margin of each body line
 *  whose count is a multiple of `countBy`. Absent on {@link SectionProps}
 *  (`lineNumbering` undefined) ⇒ line numbering off. */
export declare interface LineNumbering {
    /** `@w:countBy` — only lines whose number is a multiple of this display a
     *  number. Required (absent ⇒ the whole struct is absent per §17.6.8). */
    countBy: number;
    /** `@w:start` — the starting number after each restart. Default 1. */
    start: number;
    /** `@w:distance` in pt (twips ÷ 20) — gap between the text margin and the
     *  number glyphs. Absent ⇒ implementation-defined (renderer uses a default). */
    distance?: number;
    /** `@w:restart` (§17.18.47): "newPage" (default) | "newSection" |
     *  "continuous" — when the counter resets to `start`. */
    restart: string;
}

export declare interface LineSpacing {
    value: number;
    rule: 'auto' | 'exact' | 'atLeast';
    /** True when `w:spacing/@w:line` was set on the paragraph's own pPr or on a
     *  named style (not inherited solely from docDefault). Per ECMA-376 §17.6.5,
     *  an inherited-only paragraph in a docGrid section snaps to one grid pitch
     *  per line, ignoring the multiplier. Defaults to false on JSON parse. */
    explicit?: boolean;
}

/** Options for {@link DocxDocument.load}. Extends the shared load-options type
 *  from `@silurus/ooxml-core` (`useGoogleFonts`, `maxZipEntryBytes`) with the
 *  opt-in math engine. */
export declare interface LoadOptions extends LoadOptions_2 {
    /**
     * Opt-in OMML equation engine. Import it from the separate `@silurus/ooxml/math`
     * entry and pass it in: `import { math } from '@silurus/ooxml/math'`. When
     * omitted, equations are skipped and the ~3 MB engine never enters the bundle.
     */
    math?: MathRenderer;
    /**
     * 'main' (default): parse in a worker, render on the main thread (current
     * behaviour). 'worker': parse, paginate AND render inside the worker; use
     * {@link DocxDocument.renderPageToBitmap} and paint the returned ImageBitmap
     * via an `ImageBitmapRenderingContext`. Requires OffscreenCanvas. The math
     * engine is unavailable in this mode (equations are skipped).
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

/**
 * The slice of one run a match covers: the run's index in the original `runs[]`
 * and the `[start, end)` character range within that run's own `text`. A match
 * that straddles N runs yields N of these (the first sliced from its start
 * offset to the run end, the last from 0 to its end offset, any middle run
 * whole). The viewer measures each slice against that run's font to get a pixel
 * rectangle.
 */
declare interface MatchRunSlice {
    /** Index into the original `runs[]` handed to {@link buildTextIndex}. */
    runIndex: number;
    /** Start offset within `runs[runIndex].text` (inclusive). */
    start: number;
    /** End offset within `runs[runIndex].text` (exclusive). */
    end: number;
}

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

/** A footnote / endnote reference marker (ECMA-376 §17.11). */
export declare interface NoteRef {
    /** "footnote" | "endnote" */
    kind: 'footnote' | 'endnote' | string;
    /** `@w:id` linking the marker to its note. Empty for the in-note
     *  `<w:footnoteRef/>` placeholder (the renderer uses the enclosing note). */
    id: string;
}

/** Flatten a footnote/endnote's content to its plain-text body, excluding the
 *  auto-number reference marker. Convenience for data-only consumers
 *  (the renderer draws {@link DocNote.content} directly). */
export declare function noteText(note: DocNote): string;

export declare interface NumberingInfo {
    numId: number;
    level: number;
    format: string;
    text: string;
    indentLeft: number;
    tab: number;
    /** ECMA-376 §17.9.28 `<w:suff>` — "tab" (default) | "space" | "nothing".
     *  Where body text starts after the marker on the first line. */
    suff: string;
    /** ECMA-376 §17.9.8 `<w:lvlJc>` — marker justification: "left" (default) |
     *  "right" (period-aligned numerals: marker RIGHT edge at the hanging-indent
     *  position) | "center". The renderer offsets the marker draw accordingly.
     *  Always emitted by the parser; optional here so hand-built fixtures may omit
     *  it (the renderer treats absent as "left"). */
    jc?: string;
    /** ECMA-376 §17.3.2.26 ascii axis for the marker glyph, resolved through the
     *  level's `rPr` (§17.9.6) merged over the paragraph's run formatting. The
     *  renderer draws Latin marker chars (e.g. a decimal "1") with this family, so
     *  a heading whose ascii=Times renders its auto-number in Times (serif) even
     *  when eastAsia=Gothic. Absent ⇒ the renderer falls back to its default. */
    fontFamily?: string | null;
    /** ECMA-376 §17.3.2.26 eastAsia axis for the marker glyph (same resolution as
     *  {@link NumberingInfo.fontFamily}). The renderer draws CJK marker chars with
     *  this family. Absent ⇒ the renderer falls back to
     *  {@link NumberingInfo.fontFamily}. */
    fontFamilyEastAsia?: string | null;
    /** ECMA-376 §17.9.9/§17.9.20 — when the level uses a `<w:lvlPicBulletId>`,
     *  the marker is this image (zip path, e.g. `word/media/image1.gif`), drawn in
     *  place of {@link NumberingInfo.text}. Absent ⇒ ordinary text/glyph marker. */
    picBulletImagePath?: string;
    /** MIME type of {@link NumberingInfo.picBulletImagePath} (e.g. `image/gif`). */
    picBulletMimeType?: string;
    /** Picture-bullet marker width in pt (from the `<v:shape style="width">`). */
    picBulletWidthPt?: number;
    /** Picture-bullet marker height in pt (from the `<v:shape style="height">`). */
    picBulletHeightPt?: number;
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

/** ECMA-376 §17.18.4 CT_Border for one edge of `<w:pgBorders>`. Mirrors the Rust
 *  `PageBorderEdge`. Same shape as a paragraph border edge. */
export declare interface PageBorderEdge {
    /** `@w:val` — ST_Border line style ("single" | "double" | "dashed" | …). */
    style: string;
    /** `@w:color` hex 6, or absent for "auto" (renderer defaults to black). */
    color?: string;
    /** `@w:sz` in pt (eighths of a point ÷ 8). */
    width: number;
    /** `@w:space` in pt — a POINT measure (§17.18.68, 0–31) for page borders, NOT
     *  twips — the inset from the `offsetFrom` reference. */
    space: number;
}

/** ECMA-376 §17.6.10 `<w:pgBorders>` — page borders drawn around each page of a
 *  section. Mirrors the Rust `PageBorders`. Each edge is a CT_Border (§17.18.4);
 *  the container carries the placement globals. Absent on {@link SectionProps}
 *  (`pageBorders` undefined) ⇒ no page border (the common case). Art borders
 *  (§17.18.2 decorative-image styles) are unsupported — the renderer draws only
 *  the standard line styles (single/double/dashed/dotted/thick/…). */
export declare interface PageBorders {
    /** `@w:offsetFrom` (§17.18.63): "page" ⇒ each edge's `space` is from the PAGE
     *  edge; "text" (the default) ⇒ from the text margin. */
    offsetFrom: string;
    /** `@w:display` (§17.18.62): "allPages" (default) | "firstPage" |
     *  "notFirstPage" — which physical pages of the section show the border. */
    display: string;
    /** `@w:zOrder` (§17.18.64): "front" (default; over text) | "back" (under). */
    zOrder: string;
    top?: PageBorderEdge;
    bottom?: PageBorderEdge;
    left?: PageBorderEdge;
    right?: PageBorderEdge;
}

/** ECMA-376 §17.6.12 `<w:pgNumType>` — a section's page-numbering settings.
 *  Mirrors the Rust `PageNumType`. Only the two attributes that change the
 *  DISPLAYED page number are carried:
 *  - `start` — the number shown on the FIRST page of the section (§17.6.12);
 *    absent ⇒ numbering continues from the previous section's highest number.
 *    Kept as a possibly-zero / possibly-negative integer (Word writes `start="0"`).
 *  - `fmt` — the ST_NumberFormat (§17.18.59) for the section's page numbers
 *    (decimal / upperRoman / lowerLetter / …); absent ⇒ decimal.
 *  `chapStyle`/`chapSep` (chapter-prefixed numbering) are out of scope for this
 *  pass and never surfaced. Field names match the Rust `PageNumType` serialization
 *  (`start`, `fmt`). */
export declare interface PageNumType {
    start?: number;
    fmt?: string;
}

export declare interface ParaBorderEdge {
    style: string;
    color: string | null;
    /** pt (sz / 8) */
    width: number;
    /** pt spacing between border and text */
    space: number;
}

export declare interface ParagraphBorders {
    top: ParaBorderEdge | null;
    bottom: ParaBorderEdge | null;
    left: ParaBorderEdge | null;
    right: ParaBorderEdge | null;
    between: ParaBorderEdge | null;
}

export declare type PathCmd = {
    cmd: 'moveTo';
    x: number;
    y: number;
} | {
    cmd: 'lineTo';
    x: number;
    y: number;
} | {
    cmd: 'cubicBezTo';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x: number;
    y: number;
} | {
    cmd: 'arcTo';
    wr: number;
    hr: number;
    stAng: number;
    swAng: number;
} | {
    cmd: 'close';
};

/** ECMA-376 §17.3.3.23 `<w:ptab>` — an absolute-position tab. Advances to a
 *  position derived from {@link PTabRun.alignment} and {@link PTabRun.relativeTo},
 *  independent of the paragraph's custom tab stops / default-tab interval. */
export declare interface PTabRun {
    /** ST_PTabAlignment (§17.18.71): where on the line the tab lands, and how the
     *  following text aligns to it. */
    alignment: 'left' | 'center' | 'right';
    /** ST_PTabRelativeTo (§17.18.73): the base the position is measured from —
     *  the text margins or the paragraph indents. */
    relativeTo: 'margin' | 'indent';
    /** ST_PTabLeader (§17.18.72): the character repeated to fill the tab gap. */
    leader: 'none' | 'dot' | 'hyphen' | 'underscore' | 'middleDot';
    /** Resolved run font size (pt) — matches the surrounding text's leader/gap. */
    fontSize: number;
}

export declare interface RenderPageOptions {
    /** Canvas CSS width in px; height is auto-computed from page aspect ratio.
     *  Applies per CALL — pages of different physical widths (per-section pgSz,
     *  §17.6.13) rendered at the same `width` get different px-per-pt scales.
     *  For a uniform document scale, derive a per-page width from
     *  `DocxDocument.pageSize(i)` instead of passing a constant. */
    width?: number;
    dpr?: number;
    defaultTextColor?: string;
    /** Called for each rendered text segment. Used to build a transparent text
     *  selection overlay. On a vertical (§17.6.20 tbRl) page `x`/`y` are the
     *  PHYSICAL top-left and `transform` is the CSS rotation the overlay span
     *  applies about its top-left; absent for horizontal pages. */
    onTextRun?: (run: {
        text: string;
        x: number;
        y: number;
        w: number;
        h: number;
        fontSize: number;
        font: string;
        transform?: string;
    }) => void;
    /** Default `true`. When false, ECMA-376 §17.13.5 track-changes runs render
     *  in their normal style (no author colour, no underline / strikethrough)
     *  — equivalent to Word's "Final / No Markup" view. */
    showTrackChanges?: boolean;
    /** ECMA-376 §17.16.5.16 DATE / §17.16.5.72 TIME — the "current" instant a
     *  DATE/TIME field formats through its `\@` date picture (§17.16.4.1). A `Date`
     *  or epoch-ms number. Default = the real current time at render. Set a fixed
     *  value for deterministic / reproducible DATE/TIME field output. */
    currentDate?: Date | number;
}

/** IX6 — options for {@link DocxDocument.renderPageToBitmap}: the serializable
 *  render knobs plus an OPTIONAL `onTextRun`. The callback stays main-thread (it
 *  never crosses the wire); in worker mode the proxy invokes it with the runs
 *  the worker shipped back beside the bitmap, so a caller gets the selection /
 *  find geometry on the same path in both modes. */
export declare type RenderPageToBitmapOptions = WireRenderPageOptions & {
    onTextRun?: (run: DocxTextRunInfo) => void;
};

export declare interface RubyAnnotation {
    text: string;
    /** Annotation font size in pt. Word stores this as half-points in `<w:hps>`. */
    fontSizePt: number;
}

export declare interface RunRevision {
    /** "insertion" or "deletion" */
    kind: 'insertion' | 'deletion' | string;
    /** `<w:ins w:author>` / `<w:del w:author>`. Used to colour the markup. */
    author?: string;
    /** ISO-8601 timestamp. */
    date?: string;
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

/** ECMA-376 §17.6.13 `<w:pgSz>` + §17.6.11 `<w:pgMar>` — a section's page
 *  geometry: page size + margins + header/footer distances (pt). Mirrors the Rust
 *  `SectionGeom`. Carried on a {@link BodyElement} `sectionBreak` arm (`geom`) so a
 *  mid-body section keeps its own page size; the FINAL section's geometry lives on
 *  {@link DocxDocumentModel.section}. Also stamped per {@link PaginatedBodyElement}
 *  (`sectionGeom`) by the paginator so the renderer sizes each page from its own
 *  section. `orient` is omitted — Word swaps w/h for landscape, so verbatim w/h
 *  already give the correct dims.
 *
 *  ⚠ Spread over the body-level {@link SectionProps} in `renderDocumentToCanvas`
 *  (`{ ...doc.section, ...pageGeom }`): only add per-section PAGE-BOX fields that
 *  exist on `SectionProps` with the same name and semantics — an optional field
 *  colliding with a non-geometry `SectionProps` name would silently override the
 *  body-level value the renderer promises to preserve. */
export declare interface SectionGeom {
    pageWidth: number;
    pageHeight: number;
    /** §17.6.11 — top/bottom MAY be negative (ST_SignedTwipsMeasure); keep the sign. */
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    headerDistance: number;
    footerDistance: number;
}

export declare interface SectionProps {
    pageWidth: number;
    pageHeight: number;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    headerDistance: number;
    footerDistance: number;
    titlePage: boolean;
    evenAndOddHeaders: boolean;
    /** ECMA-376 §17.6.22 ST_SectionMark — the body (final) section's `<w:type>`
     *  start type ("continuous" | "nextPage" | "oddPage" | "evenPage"). Governs
     *  how the last section begins relative to the previous one; consumed by the
     *  paginator at the boundary INTO the final section. Absent ⇒ "nextPage" (the
     *  spec default). Non-final sections carry their start type on their own
     *  SectionBreak marker. */
    sectionStart?: string | null;
    /** ECMA-376 §17.6.20 `<w:textDirection w:val>` — the section's flow direction,
     *  using the TRANSITIONAL ST_TextDirection enum Word writes (Part 4 §14.11.7:
     *  `lrTb`|`tbRl`|`btLr`|`lrTbV`|`tbLrV`|`tbRlV`), NOT the Part 1 §17.18.93
     *  Strict set. Absent / `null` ⇒ "lrTb" (horizontal, left→right / top→bottom,
     *  the default). `"tbRl"` = vertical Japanese (glyphs stack top→bottom, lines
     *  advance right→left); the renderer (see `isVerticalSection`) lays the page out
     *  horizontally and rotates it +90° at paint for the vertical values
     *  (`tbRl`/`tbRlV`/`tbLrV`), keeping CJK glyphs upright and Latin sideways. Only
     *  a non-default value is emitted by the parser, so horizontal documents keep
     *  byte-identical rendering. */
    textDirection?: string | null;
    /** ECMA-376 §17.6.5 w:docGrid/@w:type — "default" | "lines" | "linesAndChars" | "snapToChars". */
    docGridType?: string | null;
    /** ECMA-376 §17.6.5 w:docGrid/@w:linePitch in pt. When docGridType is "lines" or
     *  "linesAndChars", auto line spacing multiplies against this pitch instead of
     *  the font's natural line height. */
    docGridLinePitch?: number | null;
    /** ECMA-376 §17.6.5 w:docGrid/@w:charSpace (ST_DecimalNumber, signed). The
     *  raw character-grid spacing in 1/4096ths of an em (NOT twips). When
     *  docGridType is "linesAndChars" or "snapToChars", every full-width East-
     *  Asian glyph occupies a fixed cell of width `fontSizePt + charSpace/4096` pt
     *  (negative = tighter). Absent ⇒ East-Asian glyphs keep their natural em
     *  advance. */
    docGridCharSpace?: number | null;
    /** ECMA-376 §17.6.4 `<w:cols>` — newspaper-style multi-column layout. `null`
     *  (or absent) ⇒ single full-width column (unchanged behavior). When present,
     *  body text flows top-to-bottom through `count` columns (newspaper fill);
     *  see {@link computeColumns}. */
    columns?: ColumnsSpec | null;
    /** ECMA-376 §17.6.12 `<w:pgNumType>` — the body (final) section's page-numbering
     *  settings (start / fmt). `null`/absent ⇒ numbering continues; decimal. The
     *  renderer resolves the displayed page number per physical page from this plus
     *  the per-section `SectionBreak.pageNumType` markers. */
    pageNumType?: PageNumType | null;
    /** ECMA-376 §17.6.10 `<w:pgBorders>` — page borders for this section.
     *  `null`/absent ⇒ no page border (the common case). */
    pageBorders?: PageBorders | null;
    /** ECMA-376 §17.6.8 `<w:lnNumType>` — line numbering for this section.
     *  `null`/absent ⇒ line numbering off. */
    lineNumbering?: LineNumbering | null;
    /** ECMA-376 §17.6.23 `<w:vAlign w:val>` — body vertical alignment between the
     *  top/bottom margins ("top" | "center" | "both" | "bottom"). `null`/absent ⇒
     *  "top" (body flows from the top margin unchanged). "both" (vertical
     *  justification) is parsed but rendered as "top" until distribution is
     *  implemented (see renderer note). */
    vAlign?: string | null;
}

declare type ShapeFill = {
    fillType: 'solid';
    color: string;
} | {
    fillType: 'gradient';
    stops: GradientStop[];
    angle: number;
    gradType: string;
};

export declare interface ShapeRun {
    widthPt: number;
    heightPt: number;
    /** X offset in pt */
    anchorXPt: number;
    /** Y offset in pt */
    anchorYPt: number;
    anchorXFromMargin: boolean;
    anchorYFromPara: boolean;
    /** ECMA-376 §20.4.3.1 wp:align horizontal: "left" | "center" | "right" |
     *  "inside" | "outside". When set the renderer aligns the shape inside the
     *  container indicated by `anchorXFromMargin` and ignores `anchorXPt`. */
    anchorXAlign?: string | null;
    /** Vertical equivalent of anchorXAlign: "top" | "center" | "bottom". */
    anchorYAlign?: string | null;
    /** ECMA-376 §20.4.2.7 wp14:pctPosHOffset / pctPosVOffset normalised to a
     *  fraction in `[0, 1]`. When set the renderer multiplies it by the
     *  relativeFrom container's width / height and uses that as the
     *  shape's offset within the container, ignoring anchorXPt / anchorYPt. */
    pctPosH?: number | null;
    pctPosV?: number | null;
    /** Raw `relativeFrom` value from `<wp:positionH>` / `<wp:positionV>` —
     *  e.g. "page", "margin", "topMargin", "rightMargin",
     *  "insideMargin", "paragraph", "line". Drives container selection
     *  for both pctPos* and anchor*Align positioning. */
    anchorXRelativeFrom?: string | null;
    anchorYRelativeFrom?: string | null;
    /** ECMA-376 §20.4.2.18 wp14:sizeRelH/sizeRelV — width/height as a
     *  fraction of the relativeFrom container. When set, the renderer uses
     *  this in place of `widthPt` / `heightPt` for layout. `pct == 0` from
     *  the source is dropped at parse time (treated as "use extent"). */
    widthPct?: number | null;
    heightPct?: number | null;
    widthRelativeFrom?: string | null;
    heightRelativeFrom?: string | null;
    /** Parent wgp group dimensions (pt) — set only when this shape is a child
     *  of a `<wpg:wgp>`. Used by `resolveAnchor*` so align/pctPos resolve the
     *  GROUP's origin, then `anchor[XY]Pt` adds the within-group offset. */
    groupWidthPt?: number | null;
    groupHeightPt?: number | null;
    /** Draw behind text when true (wp:anchor behindDoc="1"). */
    behindDoc?: boolean;
    /** Document-order index within a group; lower values render first. */
    zOrder: number;
    /** Normalized [0,1] custom-geometry sub-paths. Empty when `presetGeometry`
     *  is set; the renderer chooses between buildCustomPath and buildShapePath. */
    subpaths: PathCmd[][];
    /** OOXML <a:prstGeom prst> name (e.g. "rect", "ellipse", "rtTriangle").
     *  When set the renderer calls core's buildShapePath with `adjValues`. */
    presetGeometry?: string | null;
    /** Up to four <a:gd name="adj{n}"> values from prstGeom/avLst (0–100000). */
    adjValues?: number[];
    fill: ShapeFill | null;
    stroke: string | null;
    strokeWidth?: number;
    /** `<a:ln><a:prstDash val>` — ECMA-376 §20.1.8.48. Absent = solid. */
    strokeDash?: string | null;
    /** `<a:ln><a:headEnd>` line-start decoration (ECMA-376 §20.1.8.3). */
    headEnd?: LineEnd | null;
    /** `<a:ln><a:tailEnd>` line-end decoration (ECMA-376 §20.1.8.3). */
    tailEnd?: LineEnd | null;
    rotation?: number;
    /** `<a:xfrm flipH>` (§20.1.7.6) — mirror about the vertical centre line. */
    flipH?: boolean;
    /** `<a:xfrm flipV>` (§20.1.7.6) — mirror about the horizontal centre line. */
    flipV?: boolean;
    wrapMode?: string | null;
    /** Padding top (pt). Anchor-only. Mirrors {@link ImageRun.distTop}; an anchored
     *  wrap-shape uses these to size its float-exclusion band (ECMA-376 §20.4.2.x). */
    distTop?: number;
    /** Padding bottom (pt). Anchor-only. */
    distBottom?: number;
    /** Padding left (pt). Anchor-only. */
    distLeft?: number;
    /** Padding right (pt). Anchor-only. */
    distRight?: number;
    /** wrapText attribute: "bothSides" | "left" | "right" | "largest". */
    wrapSide?: string | null;
    /** Text rendered INSIDE the shape's bounding box (`<wps:txbx><w:txbxContent>`). */
    textBlocks?: ShapeText[];
    /** ECMA-376 §20.1.4.1.17 `<wps:style><a:fontRef>` — the shape's DEFAULT text
     *  color (hex, no `#`). A text-box run ({@link ShapeTextRun}) with no explicit
     *  {@link ShapeTextRun.color} inherits this before falling back to the
     *  document/theme default (black); an explicit run color still wins. This is
     *  the color axis of the fontRef only — the `@idx` (major/minor/none) font-face
     *  selection is out of scope (fonts resolve via rFonts/docDefaults). Mirrors
     *  pptx's per-shape default text color from the placeholder fontRef. Absent ⇒
     *  no shape default (the run color or black applies). */
    defaultTextColor?: string | null;
    /** "t" | "ctr" | "b" — vertical anchor for the shape's text body (`<wps:bodyPr @anchor>`). */
    textAnchor?: string | null;
    /** ECMA-376 §21.1.2.1.1 auto-fit mode from `<wps:bodyPr>`, normalized to the
     *  shared core `autoFit` vocabulary (core `src/types/common.ts`): "none"
     *  (`<a:noAutofit/>`, fixed box — overflowing text is CLIPPED to the box),
     *  "sp" (`<a:spAutoFit/>`, box grows to text), or "norm" (`<a:normAutofit/>`,
     *  text shrinks). Absent ⇒ overflow visible. */
    textAutofit?: string | null;
    textInsetL?: number;
    textInsetT?: number;
    textInsetR?: number;
    textInsetB?: number;
    /** ECMA-376 Part 4 §19.1.2.23 `<v:textpath>` — WordArt text laid on the
     *  shape path (a text watermark). When set the renderer draws this string,
     *  scaled to fill the box (`fitshape`), rotated by {@link ShapeRun.rotation},
     *  filled with {@link ShapeRun.fill} at {@link ShapeRun.fillOpacity} alpha —
     *  INSTEAD of a fill/stroke panel + body text. */
    textPath?: TextPath | null;
    /** ECMA-376 Part 4 §19.1.2.5 `<v:fill opacity>` — fill alpha in `[0, 1]`
     *  (default 1 = opaque). Used with {@link ShapeRun.textPath} to draw the
     *  watermark semi-transparently. Absent ⇒ opaque. */
    fillOpacity?: number | null;
}

export declare interface ShapeText {
    text: string;
    fontSizePt: number;
    color?: string | null;
    fontFamily?: string | null;
    bold?: boolean;
    italic?: boolean;
    /** Per-run formatting for this paragraph (one entry per `<w:r>` with text).
     *  When non-empty the renderer draws the block as rich text (each run's
     *  font); otherwise it uses the single block-level format fields above
     *  (image blocks / legacy single-format paragraphs). Absent for image-only
     *  paragraphs. */
    runs?: ShapeTextRun[];
    alignment: string;
    /** ECMA-376 §17.3.1.33 `<w:spacing w:before>` of this text-box paragraph, in
     *  pt — reserved ABOVE the paragraph inside the box. Absent/0 ⇒ no offset. */
    spaceBefore?: number;
    /** ECMA-376 §17.3.1.33 `<w:spacing w:after>` of this text-box paragraph, in
     *  pt — reserved BELOW the paragraph. Absent/0 ⇒ no offset. */
    spaceAfter?: number;
    /** ECMA-376 §17.3.1.33 line spacing value (style-chain resolved). Encoded per
     *  {@link lineSpacingRule}: "auto" ⇒ a MULTIPLIER on the natural line box
     *  (1.15 = 276/240), "exact"/"atLeast" ⇒ pt. Absent ⇒ single (natural). */
    lineSpacingVal?: number;
    /** "auto" | "exact" | "atLeast" — see {@link lineSpacingVal}. */
    lineSpacingRule?: string;
    /** ECMA-376 §17.3.1.12 `<w:ind w:left/@start>` — paragraph left indent (pt).
     *  Absent/0 ⇒ flush to the box's inner left edge. */
    indentLeft?: number;
    /** ECMA-376 §17.3.1.12 `<w:ind w:right/@end>` — paragraph right indent (pt).
     *  Absent/0 ⇒ flush to the box's inner right edge. */
    indentRight?: number;
    /** `<w:ind>` first-line indent (pt, SIGNED: `w:firstLine` positive,
     *  `w:hanging` negative). A negative value hangs the first line further LEFT
     *  than the continuation lines (the body renderer honors the sign too — Word
     *  applies a signed hanging first-line list-independently). Absent/0 ⇒ the
     *  first line aligns with the continuation lines. */
    indentFirst?: number;
    /** ECMA-376 §17.3.1.37 `<w:tabs>` — explicit tab stops of this text-box
     *  paragraph, resolved through the style chain like {@link DocParagraph.tabStops}.
     *  Absent/empty ⇒ only the automatic default-tab grid applies. The renderer
     *  feeds these to the SAME line engine the body uses so a `\t` inside a text box
     *  advances to its stop (the old shape wrapper dropped tabs entirely). */
    tabStops?: TabStop[];
    /** ECMA-376 §17.3.1.6 `<w:bidi>` — right-to-left text-box paragraph, resolved
     *  through the style chain like {@link DocParagraph.bidi}. `true` = RTL,
     *  `false` = explicitly LTR, absent = unspecified. Consumed as the paragraph
     *  base direction for the UAX#9 reordering pass (the body renderer reads the
     *  identical field). */
    bidi?: boolean;
    /** Zip path of an inline image inside this text-box paragraph
     *  (`<w:drawing><wp:inline><a:blip r:embed>`), e.g. `word/media/image1.emf`.
     *  Absent for a text-only paragraph. */
    imagePath?: string;
    /** MIME type of the blip at {@link ShapeText.imagePath}. */
    mimeType?: string;
    /** Zip path of the vector original (`asvg:svgBlip` extension), preferred over
     *  `imagePath` when present. */
    svgImagePath?: string;
    /** Inline image natural width in pt (from `<wp:extent cx>`). */
    imageWidthPt?: number;
    /** Inline image natural height in pt (from `<wp:extent cy>`). */
    imageHeightPt?: number;
}

/** One formatting run (`<w:r>`) inside a shape-text paragraph. Mirrors the
 *  character-formatting fields of {@link ShapeText}; the renderer lays a
 *  paragraph's {@link ShapeText.runs} out as rich text so mixed bold/non-bold
 *  runs each keep their own font. */
export declare interface ShapeTextRun {
    text: string;
    fontSizePt: number;
    color?: string | null;
    /** ECMA-376 §17.3.2.26 ascii axis (`<w:rFonts w:ascii>`), resolved through
     *  docDefaults. Latin letters/digits in this run render with this family. */
    fontFamily?: string | null;
    /** ECMA-376 §17.3.2.26 eastAsia axis (`<w:rFonts w:eastAsia>`), resolved
     *  through docDefaults. CJK characters in this run render with this family;
     *  the renderer falls back to {@link ShapeTextRun.fontFamily} when absent. */
    fontFamilyEastAsia?: string | null;
    bold?: boolean;
    italic?: boolean;
}

export declare interface TableBorders {
    top: BorderSpec | null;
    bottom: BorderSpec | null;
    left: BorderSpec | null;
    right: BorderSpec | null;
    insideH: BorderSpec | null;
    insideV: BorderSpec | null;
}

export declare interface TabStop {
    /** tab stop position in pt (from the left of paragraph content area) */
    pos: number;
    alignment: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear';
    leader: 'none' | 'dot' | 'hyphen' | 'underscore' | 'heavy' | 'middleDot';
}

/**
 * ECMA-376 §17.4.57 `<w:tblpPr>` — floating-table positioning. Present in
 * `<w:tblPr>` ⇒ the table FLOATS (out of the main text flow, absolutely
 * positioned by its top-left corner). All fields are optional in the source.
 */
export declare interface TblpPr {
    /** §17.4.57 minimum distance to wrapping text (dist padding), pt. Default 0. */
    leftFromText: number;
    rightFromText: number;
    topFromText: number;
    bottomFromText: number;
    /** §17.4.57 ST_HAnchor {text,margin,page}. Default 'page'. */
    horzAnchor: 'text' | 'margin' | 'page' | string;
    /** True iff the source `<w:tblpPr>` carried ANY horizontal positioning hint
     *  (horzAnchor, tblpX, or tblpXSpec). When false, no horizontal position was
     *  given: ECMA-376's literal default is the page edge, but Word places such a
     *  table at the anchor paragraph's text/column left. computeFloatTableBox uses
     *  this flag to apply that Word-runtime placement. */
    horzSpecified: boolean;
    /** §17.4.57 ST_VAnchor {text,margin,page}. Default 'page'. */
    vertAnchor: 'text' | 'margin' | 'page' | string;
    /** §17.4.57 absolute signed offset from the horz/vert anchor edge, pt.
     *  Default 0. Ignored when the matching `*Spec` is present. */
    tblpX: number;
    tblpY: number;
    /** §17.4.57 ST_XAlign {left,center,right,inside,outside}. Supersedes tblpX. */
    tblpXSpec?: 'left' | 'center' | 'right' | 'inside' | 'outside' | string;
    /** §17.4.57 ST_YAlign {inline,top,center,bottom,inside,outside}. Supersedes
     *  tblpY, UNLESS vertAnchor='text' (relative vertical positioning is not
     *  allowed there ⇒ tblpYSpec is ignored, fall back to tblpY). */
    tblpYSpec?: 'inline' | 'top' | 'center' | 'bottom' | 'inside' | 'outside' | string;
}

/** ECMA-376 Part 4 §19.1.2.23 `<v:textpath>` — a WordArt vector text path,
 *  emitted by Word for text watermarks (the `PowerPlusWaterMarkObject` shape).
 *  The text is stretched to fit the shape box (`fitshape`, the WordArt
 *  `#_x0000_t136` shapetype default), so its drawn size derives from the shape
 *  geometry rather than the nominal `font-size` in the textpath style. */
export declare interface TextPath {
    /** The `string` attribute — the watermark text (e.g. "DRAFT"). */
    string: string;
    /** `font-family` from the textpath style (quotes stripped). */
    fontFamily?: string | null;
    bold?: boolean;
    italic?: boolean;
}

/** Serializable subset of RenderPageOptions (callbacks cannot cross the wire). */
export declare type WireRenderPageOptions = Omit<RenderPageOptions, 'onTextRun'>;

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
