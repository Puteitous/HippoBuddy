declare interface ArrowEnd {
    /** OOXML type: "none" | "triangle" | "stealth" | "diamond" | "oval" | "arrow" */
    type: string;
    /** Width multiplier: "sm" | "med" | "lg" */
    w: string;
    /** Length multiplier: "sm" | "med" | "lg" */
    len: string;
}

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

/**
 * `<a:bevel>` — ECMA-376 §20.1.5.3 (`CT_Bevel`). Lengths in EMU; `w`/`h`
 * default to 76200 EMU and `prst` to "circle".
 */
export declare interface Bevel3d {
    /** Bevel width in EMU. */
    w: number;
    /** Bevel height in EMU. */
    h: number;
    /** Bevel preset name (`ST_BevelPresetType`). */
    prst: string;
}

/**
 * Picture bullet — ECMA-376 §21.1.2.4.2 `<a:buBlip><a:blip r:embed>`. The
 * embed is resolved to the blip's embedded zip path + mime at parse time
 * (mirrors {@link ImageFill}); the renderer fetches the bytes lazily by path
 * via the same `getCachedBitmap(imagePath, mimeType, fetchImage)` path used for
 * `pic`/blipFill. PPTX-only: the shared core `Bullet` union (used by docx/xlsx,
 * which have no picture bullets) does not carry this variant, so it lives on
 * the PPTX side, exactly like {@link Paragraph} extends the core paragraph.
 */
export declare interface BlipBullet {
    type: 'blip';
    /** Embedded zip path of the bullet image (e.g. "ppt/media/image1.png"). */
    imagePath: string;
    /** MIME type of the blip at {@link BlipBullet.imagePath} (e.g. `image/png`). */
    mimeType: string;
    /**
     * `<a:buSzPct val>` (ECMA-376 §21.1.2.4.3) as a percentage of the text size
     * (100 = same size). `null` when no explicit `<a:buSzPct>` is present, in
     * which case the renderer uses the spec default of 100%.
     */
    sizePct: number | null;
}

/**
 * Populate a highlight overlay layer with a box per matched run-slice, grouped
 * by shape frame (with the shape's rotation) so each box lands on the drawn
 * glyphs.
 *
 * @param layer     the overlay div (cleared + re-sized here).
 * @param runs      the slide's runs (same array the slide was rendered from).
 * @param matches   the slide's matches (run-slices + active flag).
 * @param cssWidth  rendered canvas CSS width (px, number).
 * @param cssHeight rendered canvas CSS height (px, number).
 * @param measureForFont returns a width-measurer primed with a run's font.
 * @param colors    optional colour overrides.
 */
export declare function buildPptxHighlightLayer(layer: HTMLDivElement, runs: PptxTextRunInfo[], matches: PptxHighlightMatch[], cssWidth: number, cssHeight: number, measureForFont: (font: string) => (s: string) => number, colors?: PptxHighlightColors): void;

/**
 * Build the transparent text-selection overlay for a rendered pptx slide. Unlike
 * docx (flat spans), pptx groups runs into one positioned `<div>` per shape frame
 * (keyed by the shape's geometry + total rotation) and applies a CSS `rotate()` to
 * the group when the shape is rotated, so the browser selection tracks the drawn,
 * rotated text as a unit. Each run's `<span>` is absolutely positioned INSIDE its
 * shape div (`inShapeX`/`inShapeY`). Extracted verbatim from
 * `PptxViewer._buildTextLayer` so the pager (PptxViewer) and the continuous-scroll
 * viewer (PptxScrollViewer, WS4) share one implementation; public API for
 * integrators (design §10). IX6 — usable in BOTH render modes: worker mode
 * collects the same `PptxTextRunInfo[]` off-thread and ships it back beside the
 * bitmap, so the overlay is built from identical geometry regardless of thread.
 *
 * IX1 — when a run carries a resolved `hyperlink` (from `<a:hlinkClick>`) and an
 * `onHyperlinkClick` callback is supplied, its span becomes a click target
 * (`cursor:pointer`, a `title` tooltip, and a `click` handler). A plain span
 * (no hyperlink) is byte-identical to before. A JS click handler is used rather
 * than an `<a href>` so the URL never bypasses the viewer's sanitisation.
 *
 * @param layer     the overlay div.
 * @param runs      per-run + per-shape geometry from `renderSlide({ onTextRun })`.
 * @param cssWidth  the rendered canvas's CSS width (px, number).
 * @param cssHeight the rendered canvas's CSS height (px, number).
 * @param onHyperlinkClick called with the run's resolved {@link HyperlinkTarget}
 *                         when a hyperlink span is clicked. Omit to leave links
 *                         non-interactive (spans stay plain, selectable text).
 */
export declare function buildPptxTextLayer(layer: HTMLDivElement, runs: PptxTextRunInfo[], cssWidth: number, cssHeight: number, onHyperlinkClick?: (target: HyperlinkTarget) => void): void;

/**
 * PPTX bullet marker. The shared core {@link CoreBullet} union
 * (none/inherit/char/autoNum) plus the PPTX-only picture bullet
 * ({@link BlipBullet}, §21.1.2.4.2). The parser emits the `blip` variant with
 * `type: "blip"`, so this is a discriminated union just like the core one.
 */
export declare type Bullet = Bullet_2 | BlipBullet;

declare type Bullet_2 = {
    type: 'none';
} | {
    type: 'inherit';
} | {
    type: 'char';
    char: string;
    color: string | null;
    sizePct: number | null;
    fontFamily: string | null;
} | {
    type: 'autoNum';
    numType: string;
    startAt: number | null;
};

/**
 * `<a:camera>` — ECMA-376 §20.1.5.5 (`CT_Camera`). `prst` selects one of the
 * 62 preset cameras (§20.1.10.47); `fov`/`zoom`/`rot` optionally override it.
 */
export declare interface Camera3d {
    /** Preset camera name (`ST_PresetCameraType`), e.g. "perspectiveRelaxed". */
    prst: string;
    /** Field-of-view override in degrees. Omitted = preset default. */
    fov?: number;
    /** Zoom factor as a unit ratio (1.0 = 100%). Omitted = 1.0. */
    zoom?: number;
    /** Camera rotation override. Omitted = preset base orientation. */
    rot?: Rot3d;
}

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

/**
 * PPTX chart element. The Rust parser emits ChartModel fields flat at the
 * top level, alongside the element position (x/y/width/height in EMU).
 * Pass this straight to `renderChart` from `@silurus/ooxml-core`.
 */
export declare interface ChartElement {
    type: 'chart';
    /** Frame geometry on the slide, in EMU. */
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * The chart payload, already in the canonical {@link ChartModel} shape emitted
     * by the Rust parser (`ooxml_common::chart::ChartModel`). Passed straight to
     * `@silurus/ooxml-core`'s `renderChart` — no per-field adapter. The former
     * 60-field flat copy on this interface is gone; all chart properties now live
     * on `chart`.
     */
    chart: ChartModel;
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

/**
 * Translucent overlay drawn over a finished slide so it reads faintly
 * (PowerPoint's hidden-slide thumbnail look). A pure render mechanism: the
 * renderer never decides *when* to dim — the caller ({@link PptxViewer}'s
 * `'dim'` mode) does. Both fields are required at the engine boundary; the
 * viewer-facing override (`PptxViewerOptions.hiddenSlideDim`) is partial.
 */
export declare interface DimOptions {
    /** CSS color of the overlay (e.g. `'#ffffff'`). */
    color: string;
    /** Overlay opacity 0..1 (e.g. `0.6` ⇒ underlying content shows at 40%). */
    opacity: number;
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

/**
 * An OMML equation embedded in a paragraph (ECMA-376 §22.1). Parsed into the
 * shared math AST and rendered by `@silurus/ooxml-core`'s math engine.
 * PowerPoint stores these as `a14:m` inside `mc:AlternateContent`.
 */
declare interface EquationRun {
    type: 'math';
    /** Parsed OMML node list. */
    nodes: MathNode[];
    /** True for block (`m:oMathPara`) math, false for inline (`m:oMath`). */
    display: boolean;
    /** Paragraph default run size in pt, if declared; absent → renderer inherits. */
    fontSize?: number | null;
    /** Equation colour (hex, no '#') from the math run's rPr; absent → inherit. */
    color?: string | null;
}

export declare type Fill = SolidFill | NoFill | GradientFill | PatternFill | ImageFill;

/**
 * ECMA-376 §20.1.8.30 (CT_RelativeRect) — the destination rectangle a stretched
 * blip is mapped into, as edge insets relative to the fill region. Values are
 * fractions (ST_Percentage / 100000); **negative values let the image bleed
 * past the box (overscan)**. Absent edges default to 0.
 */
export declare interface FillRect {
    l?: number;
    t?: number;
    r?: number;
    b?: number;
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

/** ECMA-376 §20.1.8.17 (CT_GlowEffect) — coloured halo with blur radius. */
export declare interface Glow {
    color: string;
    alpha: number;
    /** Blur radius in EMU. */
    radius: number;
}

export declare interface GradientFill {
    fillType: 'gradient';
    stops: GradientStop[];
    /** degrees: 0 = left→right, 90 = top→bottom */
    angle: number;
    /** 'linear' | 'radial' */
    gradType: string;
}

export declare interface GradientStop {
    position: number;
    color: string;
}

/** How {@link PptxViewer} presents hidden slides (`<p:sld show="0">`). */
export declare type HiddenSlideMode = 'show' | 'skip' | 'dim';

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
 * Image fill — ECMA-376 §20.1.8.14 (CT_BlipFillProperties). The embedded blip
 * is carried as a zip path + MIME; the renderer fetches the bytes on demand via
 * {@link RenderOptions.fetchImage} (no base64 inlined at parse time). Both
 * fill-modes are modelled and mutually exclusive: `stretch` (§20.1.8.56) carries
 * {@link ImageFill.fillRect}; `tile` (§20.1.8.58) carries {@link ImageFill.tile}.
 */
export declare interface ImageFill {
    fillType: 'image';
    /**
     * Embedded zip path of the blip (e.g. "word/media/image1.png"), for the lazy
     * byte-on-demand pipeline. The renderer fetches the bytes via a path-keyed
     * loader ({@link RenderOptions.fetchImage}) instead of inlining base64.
     */
    imagePath: string;
    /** MIME type of the blip at {@link ImageFill.imagePath} (e.g. `image/png`). */
    mimeType: string;
    /**
     * `<a:stretch><a:fillRect>` insets. Absent → fills the whole box (or the
     * fill is tiled — see {@link ImageFill.tile}).
     */
    fillRect?: FillRect;
    /**
     * `<a:tile>` descriptor. Present only when the blipFill is tiled; mutually
     * exclusive with {@link ImageFill.fillRect}.
     */
    tile?: TileInfo;
    /** `a:blip > a:alphaModFix@amt` as a fraction (0.0–1.0). Absent = opaque. */
    alpha?: number;
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

/**
 * `<a:lightRig>` — ECMA-376 §20.1.5.9 (`CT_LightRig`). Drives the bevel-lip
 * lighting (Phase B): `dir` selects the key-light octant.
 */
export declare interface LightRig {
    /** Light-rig preset (`ST_LightRigType`), e.g. "threePt". */
    rig: string;
    /** Light direction (`ST_LightRigDirection`): tl/t/tr/l/r/bl/b/br. */
    dir: string;
    /** Optional rotation override of the rig. */
    rot?: Rot3d;
}

export declare interface LineBreak {
    type: 'break';
}

/** Options for {@link PptxPresentation.load}. */
export declare type LoadOptions = LoadOptions_2 & {
    /**
     * 'main' (default): parse in a worker, render on the main thread (current
     * behaviour). 'worker': parse AND render inside the worker; use
     * {@link PptxPresentation.renderSlideToBitmap} and paint the returned
     * ImageBitmap via an `ImageBitmapRenderingContext`. Requires OffscreenCanvas.
     */
    mode?: 'main' | 'worker';
};

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

export declare interface MediaElement {
    type: 'media';
    x: number;
    y: number;
    width: number;
    height: number;
    /** "audio" or "video" */
    mediaKind: 'audio' | 'video';
    /** Poster image zip path (e.g. "ppt/media/image2.png"). Empty when no poster. */
    posterPath: string;
    /** Poster image MIME type (empty when no poster). */
    posterMimeType: string;
    /** Path inside the pptx zip (e.g. "ppt/media/media2.mp4"). Used by getMedia. */
    mediaPath: string;
    /** MIME type of the underlying media (e.g. "audio/mpeg", "video/mp4"). */
    mimeType: string;
}

export declare interface NoFill {
    fillType: 'none';
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

/**
 * PPTX paragraph. Extends the shared core `Paragraph` with the PPTX-only
 * `eaLnBrk` flag that the pptx parser emits but the shared core model does not
 * carry (docx/xlsx paragraphs don't surface it). Mirrors the Rust
 * `Paragraph` struct's `ea_ln_brk` field 1:1.
 *
 * Note on `bullet`: the parser also emits the picture-bullet variant
 * ({@link BlipBullet}, `type: "blip"`) at runtime, but `bullet` keeps the
 * narrower core type here because a TS interface can only *narrow* an inherited
 * property, not widen its union (the core `Paragraph.bullet` is used by
 * docx/xlsx, which have no picture bullets). Consumers that need the picture
 * variant narrow `bullet` with {@link asBullet} / a `type === 'blip'` check.
 */
export declare interface Paragraph extends Paragraph_2 {
    /**
     * `<a:pPr eaLnBrk>` (ECMA-376 §21.1.2.2.7, xsd:boolean, default true). When
     * true, East Asian text may break at character boundaries (kinsoku rules);
     * when false, an East Asian word must not be split mid-character. The parser
     * resolves the paragraph → body/list-style → layout/master cascade and always
     * emits an effective boolean.
     */
    eaLnBrk: boolean;
}

declare interface Paragraph_2 {
    /** Alignment: "l" | "ctr" | "r" | "just" */
    alignment: string;
    /** Left margin in EMU */
    marL: number;
    /** Right margin in EMU */
    marR: number;
    /** First-line indent in EMU (negative = hanging indent) */
    indent: number;
    spaceBefore: number | null;
    spaceAfter: number | null;
    spaceLine: SpaceLine | null;
    /** List nesting level (0–8) */
    lvl: number;
    bullet: Bullet_2;
    defFontSize: number | null;
    defColor: string | null;
    defBold: boolean | null;
    defItalic: boolean | null;
    defFontFamily: string | null;
    /** Tab stops from pPr > tabLst */
    tabStops: TabStop[];
    /**
     * `<a:pPr rtl="1">` — right-to-left paragraph (ECMA-376 §21.1.2.2.7).
     * When true and no explicit `algn`, the parser-side default flips from
     * "l" to "r"; renderers can also use this flag to flow runs RTL.
     */
    rtl?: boolean;
    runs: TextRun[];
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

/**
 * Preset pattern fill — ECMA-376 §20.1.8.40 (CT_PatternFillProperties)
 * with `preset` drawn from §20.1.10.59 (ST_PresetPatternVal).
 */
declare interface PatternFill {
    fillType: 'pattern';
    /** Foreground hex colour — used for the "1" pixels of the preset bitmap. */
    fg: string;
    /** Background hex colour — used for the "0" pixels. */
    bg: string;
    /** Preset name, e.g. "pct25", "horz", "diagCross", "lgGrid". */
    preset: string;
}

export declare interface PictureElement {
    type: 'picture';
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    /**
     * Embedded zip path of the raster blip (e.g. "ppt/media/image1.png"). The
     * renderer fetches the bytes lazily by path (see {@link
     * PptxPresentation.getImage}) instead of inlining base64. When the picture is
     * a pure SVG with no raster blip this falls back to the SVG part's path and
     * {@link PictureElement.mimeType} is `image/svg+xml`.
     */
    imagePath: string;
    /** MIME type of the blip at {@link PictureElement.imagePath} (e.g. `image/png`). */
    mimeType: string;
    /**
     * Microsoft 2016 SVG extension (`<a:blip><a:extLst><a:ext
     * uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed>`). When
     * PowerPoint embeds an SVG image, `imagePath` above is only the PNG fallback
     * it rasterizes for compatibility; this is the zip path of the original
     * vector `.svg` part. The renderer prefers this and falls back to the raster
     * if the SVG fails to decode. Omitted when the picture has no svgBlip
     * extension (the common case). Its MIME is always `image/svg+xml` and is
     * owned by the SVG decoder.
     */
    svgImagePath?: string;
    /**
     * Intrinsic pixel width of the raster blip, read from the PNG IHDR at parse
     * time. Omitted for non-PNG payloads. Used internally for the ink-fallback
     * (empty-stroke PNG centering).
     */
    intrinsicWidthPx?: number;
    /** Intrinsic pixel height of the raster blip (PNG IHDR). Omitted for non-PNG. */
    intrinsicHeightPx?: number;
    /**
     * Border line from `<p:pic><p:spPr><a:ln>` (ECMA-376 §20.1.2.2.24). A
     * `p:pic`'s spPr is `CT_ShapeProperties` (§19.3.1.37), so a picture carries
     * the same line model as a shape. `null` when there is no `<a:ln>` or it
     * resolves to `<a:noFill/>` (border explicitly suppressed). The border is
     * stroked along the picture's clip silhouette (roundRect / custGeom / rect).
     */
    stroke: Stroke | null;
    /**
     * `<p:spPr><a:prstGeom prst="…">` preset name (e.g. `"roundRect"`,
     * `"ellipse"`). ECMA-376 §20.1.9.18: a picture's preset geometry is its clip
     * silhouette and the path its border / contour hug. Undefined / omitted = a
     * plain rectangle (`prst="rect"` or no prstGeom). When set, the renderer
     * builds the silhouette via the shared preset-geometry engine (any of the 186
     * presets). `custGeom` takes priority when both are present.
     */
    prstGeom?: string;
    /**
     * Adjust guides from the prstGeom `<a:avLst>` (1/1000-of-a-percent OOXML
     * units), in `gd@name` declaration order (index 0 = adj/adj1, 1 = adj2, …).
     * Omitted when avLst is empty — the preset's own declared defaults then apply.
     */
    prstAdjust?: number[];
    /**
     * ECMA-376 §20.1.8.55 a:srcRect — source image crop as fractions (0..1) of the
     * source width/height, measured inward from each edge. Omitted when the image
     * is not cropped; when present the parser emits all four edges (absent edges
     * default to 0), so the renderer reads them without a fallback.
     */
    srcRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    /** a:blip > a:alphaModFix@amt as 0..1. Undefined = fully opaque. */
    alpha?: number;
    /**
     * ECMA-376 §20.1.8.23 `<a:duotone>` recolour, resolved to its two endpoint
     * colours (through the slide theme). Undefined ⇒ no duotone. When present the
     * renderer decodes the raster once, remaps it along the `clr1`→`clr2`
     * luminance ramp, and caches the recoloured bitmap under a colour-suffixed key.
     */
    duotone?: Duotone;
    /**
     * `<p:spPr><a:custGeom>` clipping path. Same `PathCmd` model as
     * `ShapeElement.custGeom` (one entry per `<a:path>`; coords normalized
     * into [0,1] of the picture's bounding box). The renderer builds a
     * Path2D and `ctx.clip()` before drawing the bitmap so the image is
     * trimmed to the laptop / device silhouette declared in the file.
     */
    custGeom?: PathCmd[][] | null;
    /**
     * Drop shadow from `spPr > effectLst > outerShdw`. A `p:pic`'s `spPr` is
     * `CT_ShapeProperties` (ECMA-376 §19.3.1.37), so the same effects shapes
     * carry apply to images. ECMA-376 §20.1.8.45 (CT_OuterShadowEffect).
     */
    shadow?: Shadow;
    /** Inner (inset) shadow from effectLst > innerShdw. ECMA-376 §20.1.8.40. */
    innerShadow?: Shadow;
    /** Coloured glow halo from effectLst > glow. ECMA-376 §20.1.8.32. */
    glow?: Glow;
    /** Soft (feathered) edge from effectLst > softEdge. ECMA-376 §20.1.8.53. */
    softEdge?: SoftEdge;
    /** Mirrored reflection from effectLst > reflection. ECMA-376 §20.1.8.50. */
    reflection?: Reflection;
    /** `<a:scene3d>` 3D camera scene (ECMA-376 §20.1.5.5). A `p:pic`'s spPr is
     *  `CT_ShapeProperties`, so 3D scenes apply to images. When non-identity the
     *  renderer projects the picture through the camera homography (Phase A). */
    scene3d?: Scene3d;
    /** `<a:sp3d>` 3D shape properties (ECMA-376 §20.1.5.12). Parsed but not
     *  rendered in Phase A. */
    sp3d?: Sp3d;
}

/** A single legacy slide comment (`<p:cm>` in `ppt/comments/commentN.xml`). */
export declare interface PptxComment {
    /** Resolved author name from `ppt/commentAuthors.xml`. Absent when the
     *  authors file is missing or the `authorId` is out of range. */
    author?: string;
    /** `<p:cm @dt>` — ISO-8601 timestamp the comment was authored. */
    date?: string;
    /** Plain-text comment body (`<p:text>`). */
    text: string;
}

export declare interface PptxHighlightColors {
    match?: string;
    active?: string;
}

export declare interface PptxHighlightMatch {
    slices: MatchRunSlice[];
    active: boolean;
}

/** Where a pptx match lives: its 0-based slide index. */
export declare interface PptxMatchLocation {
    slide: number;
}

/**
 * Headless PPTX rendering engine.
 *
 * Parses `.pptx` archives in a background worker (WASM) but renders slides
 * synchronously on the main thread, so the canvas shares the document's
 * `FontFaceSet` — avoiding subtle wrap differences between system fallback
 * fonts and theme-declared webfonts (e.g. Nunito Sans).
 *
 * Construct via the static `load` factory. A single instance can drive any
 * number of canvases (scroll view, thumbnail grid, master-detail, etc.).
 *
 * @example
 * const pres = await PptxPresentation.load(buffer);
 * await pres.renderSlide(canvas, 0, { width: 960 });
 */
export declare class PptxPresentation {
    private readonly _worker;
    private readonly _bridge;
    private _mode;
    private _presentation;
    private _meta;
    /** Lazily-built `partName → slide index` map for internal hyperlink slide
     *  jumps (IX-nav). Cleared on {@link destroy}; built on first
     *  {@link getSlideIndexByPartName}/{@link resolveInternalTarget} from either
     *  the parsed slides (main) or the worker meta's `partNames` (worker). */
    private _slidePartIndex;
    private _mediaCache;
    private _imageCache;
    /** Google-Fonts `FontFace` objects this deck preloaded into `document.fonts`
     *  (main mode only — in worker mode the worker owns them and terminates with
     *  its own FontFaceSet). Released in {@link destroy} so they do not leak into
     *  the shared FontFaceSet for the lifetime of the SPA (deduped + refcounted in
     *  core, so a web font shared with another open deck survives until both go). */
    private _googleFontFaces;
    /** One stable closure per instance: the decoded-bitmap and SVG caches key on
     *  this identity to scope decodes per deck (so two open decks never swap
     *  images for a shared zip path like ppt/media/image1.png). Reusing the same
     *  reference across every render also lets those caches hit across slides. */
    private readonly _fetchImage;
    /** Opt-in OMML equation engine, injected once at {@link load}. Every
     *  `renderSlide` / `presentSlide` reuses it — equations render when present,
     *  and are skipped (engine tree-shaken) when omitted. */
    private _math;
    private constructor();
    /** Parse a PPTX from URL or ArrayBuffer. */
    static load(source: string | ArrayBuffer, opts?: LoadOptions): Promise<PptxPresentation>;
    private _parse;
    /** Total number of slides in the loaded presentation. */
    get slideCount(): number;
    /** Slide width in EMU. */
    get slideWidth(): number;
    /** Slide height in EMU. */
    get slideHeight(): number;
    /** The render mode this engine was loaded with ('main' | 'worker'). A fact for
     *  integrators and the scroll viewer: an injected engine's mode decides whether
     *  slides render via renderSlide (main) or renderSlideToBitmap (worker) — no
     *  probing (design §11: no silent mis-pathing). */
    get mode(): 'main' | 'worker';
    /**
     * Speaker-notes text for a slide (`ppt/notesSlides/notesSlideN.xml`,
     * ECMA-376 §13.3.5 — Notes Slide). Returns the notes-body text as a single
     * string (paragraphs joined with `\n`), or `null` when the slide has no
     * notes part. The notes are parsed at {@link load} time, so this is a
     * synchronous lookup.
     *
     * `slideIndex` is 0-based. Unlike navigation methods it is *not* clamped:
     * an out-of-range or non-integer index returns `null` rather than the notes
     * of the nearest slide (so a tool iterating by index gets an honest "no
     * notes" instead of a duplicated neighbour).
     *
     * @example
     * const pres = await PptxPresentation.load(buffer);
     * for (let i = 0; i < pres.slideCount; i++) {
     *   const notes = pres.getNotes(i);
     *   if (notes) console.log(`Slide ${i + 1} notes:`, notes);
     * }
     */
    getNotes(slideIndex: number): string | null;
    /**
     * Whether the slide at `slideIndex` (0-based, absolute) is marked hidden
     * (`<p:sld show="0">`, ECMA-376 §19.3.1.38). Like {@link getNotes} the index
     * is NOT clamped — out-of-range / non-integer ⇒ `false`. This is a *fact*
     * about the model; deciding what to do with a hidden slide (skip / dim) is the
     * caller's policy (see {@link PptxViewer}'s `hiddenSlideMode` modes).
     */
    isHidden(slideIndex: number): boolean;
    /** The per-slide `partName` array (`sldIdLst` order) from either the parsed
     *  model (main) or the worker meta (worker). Backs the lazy part-index map. */
    private _partNames;
    /** Lazily build (and cache) the `partName → index` map. Nulled by
     *  {@link destroy} so a reused reference never serves a stale deck's indices. */
    private _partIndex;
    /**
     * Resolve a slide's OPC part name (e.g. `ppt/slides/slide3.xml`) to its
     * 0-based index in `sldIdLst` order, or `undefined` when no slide has that
     * part name. This is the map an internal hyperlink slide jump
     * (`<a:hlinkClick action="ppaction://hlinksldjump" r:id>`, ECMA-376
     * §21.1.2.3.5) resolves against: the click's rel Target names a slide part, and
     * this turns it into the index a viewer can navigate to. Works in both `main`
     * and `worker` mode (the part names ride along in the worker meta).
     */
    getSlideIndexByPartName(partName: string): number | undefined;
    /**
     * Resolve an internal hyperlink target string to a 0-based slide index, or
     * `undefined` when it names no reachable slide. Handles both
     * `<a:hlinkClick @action>` classes (§21.1.2.3.5):
     *
     *   - a **relative** show jump — `ppaction://hlinkshowjump?jump=firstslide |
     *     lastslide | nextslide | previousslide` — resolved arithmetically from
     *     `currentIndex` (clamped at the deck ends);
     *   - a **specific** slide-part jump — `ppaction://hlinksldjump`, whose
     *     resolved target is a slide-rel part name like `../slides/slide3.xml` —
     *     resolved through {@link getSlideIndexByPartName}.
     *
     * `ref` is the internal reference a `HyperlinkTarget` of kind `'internal'`
     * carries: the raw `ppaction://…` action string for a relative jump, or the
     * resolved slide-part target string for a specific jump. A viewer's
     * `onHyperlinkClick` default calls this with `ref` and the current slide, then
     * navigates to the returned index.
     *
     * @param ref          the internal action/target string.
     * @param currentIndex the 0-based slide the jump is relative to (default 0).
     */
    resolveInternalTarget(ref: string, currentIndex?: number): number | undefined;
    /** Render a slide onto the given canvas. */
    renderSlide(canvas: HTMLCanvasElement | OffscreenCanvas, slideIndex: number, opts?: RenderSlideOptions): Promise<void>;
    /**
     * Render a slide and return it as an ImageBitmap. Works in both modes; in
     * worker mode the entire render runs off the main thread. Paint with:
     * `canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap)`.
     *
     * The returned ImageBitmap is owned by the caller: pass it to
     * `transferFromImageBitmap` (which consumes it) or call `bitmap.close()`
     * when done, or its backing memory is held until GC.
     */
    renderSlideToBitmap(slideIndex: number, opts?: RenderSlideToBitmapOptions): Promise<ImageBitmap>;
    /**
     * IX6 — collect a slide's text-run geometry (`PptxTextRunInfo[]`) without
     * painting a visible canvas. Works in BOTH modes: worker mode renders the
     * slide off-thread and ships only the runs (no bitmap transfer); main mode
     * renders to a throwaway offscreen canvas. Used by the find controller to scan
     * every slide for matches. Run geometry is in CSS px (independent of dpr) and
     * dimming does not move glyphs, so only `width` is threaded — matching the
     * historical main-mode `_collectSlideRuns`.
     */
    collectSlideRuns(slideIndex: number, width?: number): Promise<PptxTextRunInfo[]>;
    /**
     * Extract raw media bytes for a zip path referenced by {@link MediaElement}.
     * Results are cached by path for the lifetime of this instance.
     */
    getMedia(mediaPath: string): Promise<Blob>;
    private _findMimeTypeForPath;
    /**
     * Extract raw bytes for an embedded image by zip path (e.g.
     * "ppt/media/image1.png"), wrapped in a Blob of the given MIME type. Mirrors
     * {@link getMedia}; results are cached by path for the lifetime of this
     * instance. The renderer routes its `fetchImage` option here so images are
     * decoded lazily rather than inlined as base64 at parse time.
     */
    getImage(imagePath: string, mimeType: string): Promise<Blob>;
    /**
     * Project the presentation to GitHub-flavoured markdown: title slides become
     * `#` headings, body shapes become nested bullets at each paragraph's `lvl`,
     * tables become pipe tables, charts become summarised bullets, and speaker
     * notes and comments are collated. Positioning, animations, images, and
     * drawing detail are discarded — the projection is meant for AI ingestion and
     * full-text search, not layout.
     *
     * Runs entirely in the worker off the archive opened at {@link load} (no
     * re-copy of the file, no re-parse of the model on the main thread), so it
     * works in BOTH `mode: 'main'` and `mode: 'worker'`.
     *
     * @example
     * const pres = await PptxPresentation.load(buffer);
     * const md = await pres.toMarkdown();
     */
    toMarkdown(): Promise<string>;
    /**
     * Render a slide and attach canvas-native playback controls for any
     * embedded audio/video. Returns a {@link PresentationHandle} that owns the
     * RAF loop, media elements, and object URLs. Unlike {@link renderSlide}, this
     * method is stateful — always call `handle.destroy()` when leaving the slide.
     */
    presentSlide(canvas: HTMLCanvasElement, slideIndex: number, opts?: RenderSlideOptions): Promise<PresentationHandle>;
    /** Terminate the worker and release all resources. */
    destroy(): void;
}

export declare class PptxScrollViewer implements ZoomableViewer {
    private _pres;
    private readonly _injected;
    private readonly _opts;
    private readonly _container;
    private readonly _wrapper;
    private readonly _scrollHost;
    private readonly _spacer;
    /** Resolved render mode. When an engine is injected the engine's own `mode`
     *  is authoritative (design §11 — no silent mis-pathing / no probing); an
     *  explicitly conflicting `opts.mode` is rejected at construction. When self-
     *  loading, `opts.mode` decides and `load()` passes it to `PptxPresentation.load`. */
    private _mode;
    /** Dimensionless zoom multiplier over the 96-dpi natural slide size (mirrors
     *  `DocxScrollViewer`, whose `_scale` multiplies `widthPt × PT_TO_PX`). The
     *  natural (1×) slide width in CSS px is `slideEmu / EMU_PER_PX`; the base fit
     *  sets `_scale` so that natural width maps to the container width, and zoom
     *  multiplies it further (design §7). */
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
    /** Live slots keyed by slide index. */
    private readonly _slots;
    /** Recyclable detached slots (canvas + textLayer reused across slides). */
    private readonly _free;
    /** Cached per-slide heights in px at the current scale (index-aligned). All
     *  slides are the same size, so every entry equals the uniform slide height. */
    private _heights;
    private _lastRange;
    private _lastTopIndex;
    private _scrollListener;
    /** Set by `destroy()`. Async render callbacks (main + worker) check it before
     *  reporting an error so a rejection that lands after teardown is swallowed
     *  rather than surfaced to a `onError` on a dead viewer. */
    private _destroyed;
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
     * work, so a superseded load never touches `this._pres` nor frees the current
     * (newer) engine. Only the self-loading path uses it — the injected path throws
     * up-front and never reaches here. `destroy()` also bumps it so a load in flight
     * at teardown is treated as superseded and its engine cleaned up.
     */
    private _loadGen;
    /** Worker mode: slide indices whose bitmap render is currently dispatched to the
     *  engine. Coalesces a scroll storm — we never dispatch a second render for a
     *  slide whose first is still in flight — and lets us drop slides that scrolled
     *  out of the window before dispatch (design §11 worker coalescing).
     *
     *  T4 ZOOM HAZARD (RESOLVED by the render epoch below): coalescing keys on slide
     *  INDEX only, with no notion of the scale a dispatch was made at. Once
     *  `setScale` can change the zoom mid-flight, an in-flight bitmap dispatched at
     *  the OLD scale can still pass the on-resolution identity check if the SAME
     *  slot object is re-mounted for slide `i` (the pool reuses slot objects, so
     *  `_slots.get(i) === slot && slot.renderedSlide === i` can hold for an old
     *  dispatch), and get painted at the WRONG resolution. We fix this with a render
     *  epoch (`_renderEpoch`): each dispatch captures the epoch, and on resolution a
     *  moved epoch ⇒ STALE (close + re-dispatch the live slot). See
     *  `_renderSlotBitmap`. */
    private readonly _slideInFlight;
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
    /** Resolved slide-canvas `box-shadow` (design: the recipe drop shadow by
     *  default). Resolved ONCE with `??` — NOT `||` — so `pageShadow: false`
     *  survives as the "no shadow" sentinel (a `||` would treat `false` as absent
     *  and wrongly re-apply the default). Applied by `_applyPageShadow` at EVERY
     *  canvas-creation site (`_acquireSlot` and the double-buffer spare in
     *  `_settleSlot`) so a recycled/re-mounted slot and a settle-swapped spare all
     *  carry it. */
    private readonly _pageShadow;
    constructor(container: HTMLElement, opts?: PptxScrollViewerOptions);
    /**
     * Load a PPTX from URL or ArrayBuffer and render the first window.
     * UNSUPPORTED when an engine was injected via `opts.presentation` (throws) — the
     * caller already owns the parsed engine.
     */
    load(source: string | ArrayBuffer): Promise<void>;
    get slideCount(): number;
    /** Uniform slide width in CSS px at the current scale. `_scale` is a
     *  dimensionless multiplier over the natural 96-dpi width (`slideEmu /
     *  EMU_PER_PX`), mirroring docx's `widthPt × PT_TO_PX × _scale`. */
    private _slideWidthPx;
    /** Uniform slide height in CSS px at the current scale. */
    private _slideHeightPx;
    /** The fit width (px), deferring when the container is unlaid-out. An EXPLICIT
     *  `opts.width` is the slide's CSS-width contract and is returned UNCHANGED (the
     *  gutters still apply around placement, not to the width). The container-derived
     *  default instead targets `containerWidth − padL − padR` so a slide sits INSIDE
     *  the horizontal gutters at 100%. A non-positive result (gutters wider than the
     *  container) is treated as unlaid-out — the same deferral as a zero-width box. */
    private _fitWidthPx;
    /** Base scale: the DIMENSIONLESS multiplier that fits the (uniform) slide
     *  width to the fit-width. `natural = slideWidthEmu / EMU_PER_PX` is the 96-dpi
     *  CSS-px width; `base = fitWidth / natural` (mirrors docx's `w / (widthPt ×
     *  PT_TO_PX)`). Returns 0 when the container has no width yet (deferral). */
    private _baseScale;
    /**
     * Recompute per-slide heights + the spacer and re-mount the visible window.
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
    /** All slides are the same size, so heights = n × uniform. We still feed this
     *  full array to computeVisibleRange (never special-case uniform) so offsets /
     *  topIndex live in one tested place (design §5.1). */
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
     *  `_positionSlot` (the flush-left floor), and by `_syncSpacerWidth` (the spacer
     *  width). Resolved here (not stored) to mirror `_gap()`/`_pad()`. */
    private _padH;
    /** Index of the slide whose slot spans content-offset `y` (largest `i` with
     *  `offsets[i] <= y`), for the pointer-anchored zoom re-anchor. Mirrors the
     *  `topIndex` search `computeVisibleRange` runs for the scrollTop, but for an
     *  ARBITRARY content-y (the pointer, not the viewport top). Clamped into
     *  `[0, n-1]`; a `y` below the first slide (inside the leading pad) yields 0. */
    private _slideIndexAtOffset;
    private _range;
    private _syncSpacer;
    /** Horizontal scroll extent: the (uniform deck-wide) slide width plus both
     *  gutters. A spacer NARROWER than the container never creates a scrollbar
     *  (scrollWidth = max(clientWidth, content)), so it is always safe to set — it
     *  only matters when a zoomed-in slide grows past the viewport, where it gives
     *  the gutters something to scroll to on either side. Called from `_syncSpacer`
     *  and after every scale change (zoom / resize re-fit) so the extent tracks the
     *  current slide px width. */
    private _syncSpacerWidth;
    private _onScroll;
    /** Mount/recycle slots for the current visible window. */
    private _mountVisible;
    /** Apply the resolved slide-canvas shadow (design: recipe drop shadow by
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
     * Render slide `i` into `slot`. Routes strictly on the constructor-resolved
     * `_mode` (design §11 — no probing, no silent mis-pathing): `main` ⇒ paint the
     * slot's canvas directly via `renderSlide`; `worker` ⇒ transfer an ImageBitmap
     * from `renderSlideToBitmap`.
     *
     * Slot-identity guard: a slot recycled to a DIFFERENT slide while a previous
     * render is in flight must not repaint the stale slide. `slot.renderedSlide`
     * tracks the slide this slot is committed to; we stamp it up-front and bail on
     * resolution if it changed (the engine's own token guard is per-canvas; this is
     * the viewer's per-slot slide-identity check).
     *
     * Render epoch (main path): pixel staleness after a mid-flight `setScale` is
     * already handled by the engine's per-canvas token (the newer renderSlide on the
     * same canvas wins) — `setScale` recycles + re-mounts, and the re-mount always
     * re-dispatches `renderSlide` (renderedSlide reset to -1), so a fresh render is
     * always issued. But the viewer-side side effects of a STALE resolution — the
     * text-layer build (its run geometry is at the OLD scale) and the renderedSlide
     * bookkeeping — must NOT run, or a superseded render would rebuild the overlay
     * with stale x/y/w/h (the pool reuses slot objects, so the identity check alone
     * can pass for an old-epoch resolution). We gate them on the captured epoch.
     */
    private _renderSlot;
    /** Route an async render failure to `onError`, or `console.error` when none is
     *  set (so failures are never fully silent), and never after teardown. */
    private _reportRenderError;
    /**
     * Worker-mode slot render: dispatch `renderSlideToBitmap`, transfer the result
     * via a per-slot `bitmaprenderer` context, and manage the ImageBitmap lifecycle.
     *
     * Coalescing / drop-stale (design §11):
     *  - Skip if slide `i` is already in flight (a scroll storm won't double-dispatch).
     *  - Skip if slide `i` already left the mounted window before dispatch.
     *  - On resolution, if `slot` is no longer THIS slide's live slot (it recycled to
     *    another slide, or slide `i` re-mounted onto a DIFFERENT slot while this render
     *    was in flight), close the orphan bitmap and skip the paint. In that
     *    re-mount case a live slot for `i` still awaits a render, so once we clear
     *    the in-flight guard we re-dispatch it — a slide that recycled and re-mounted
     *    mid-flight must never stay blank.
     *  - RENDER EPOCH: the dispatch captures `this._renderEpoch`. `setScale` bumps
     *    the epoch, so a resolution whose captured epoch ≠ the live epoch is STALE
     *    even when the SAME slot object is still mounted for slide `i` (the pool
     *    reuses slot objects, so the identity check alone can't catch a zoom that
     *    happened mid-flight). A moved epoch ⇒ close the orphan + re-dispatch the
     *    live slot at the new scale, never paint the old-scale bitmap.
     *
     * Do NOT pass `dim` or `skipMediaControls` to `renderSlideToBitmap`. The scroll
     * viewer never dims slides (design §8.2 / Delta 6); passing neither means the
     * static play-badge renders on media slides (matching `PptxViewer`'s
     * non-media-playback path) — acceptable for v1.
     */
    private _renderSlotBitmap;
    /**
     * Set the absolute (dimensionless) zoom scale — a multiplier over the 96-dpi
     * natural slide size, matching `DocxScrollViewer` — clamped inline to
     * `[zoomMin ?? 0.1, zoomMax ?? 4]` (absolute bounds, XlsxViewer convention — NOT
     * multiples of the base fit; design §3 keeps the clamp in the viewer, not core),
     * then re-anchor VERTICALLY so the slide currently under the viewport top stays
     * fixed. A no-op when the clamped scale is unchanged. Called BEFORE the deck is
     * loaded / the base fit is established, the clamped factor is LATCHED (IX9 F1,
     * family-unified with the single-canvas viewers) and applied by `relayout()`
     * once the layout establishes — `onScaleChange` fires then.
     *
     * FLICKER-FREE (design §7): this does NOT re-render the visible slides inline.
     * It shows an immediate CSS preview (stretch the existing bitmaps, scale the
     * overlays) and DEBOUNCES a full-resolution settle re-render for ZOOM_SETTLE_MS,
     * so a wheel/pinch burst never blanks a slide and coalesces into one crisp render.
     *
     * Re-anchor (written from scratch — XlsxViewer only re-anchors horizontally):
     * capture `top = topIndex` and the intra-slide fraction `intraFrac` from the
     * CURRENT range BEFORE rescale; after recomputing heights at the new scale,
     * `newScrollTop = offsets'[top] + intraFrac × heights'[top]`, clamped to
     * `[0, totalHeight' − viewportHeight]`. Because a slide's height scales linearly
     * with `_scale`, the same fractional position maps exactly to the new geometry.
     *
     * CAVEAT — base fit below the floor: `relayout()` sets `_scale = base` WITHOUT
     * clamping to `[zoomMin, zoomMax]`. If the base fit is below `zoomMin` (a wide
     * slide in a narrow container), the initial scale sits under the floor, but once
     * the user zooms via `setScale` the clamp pins the minimum to `zoomMin`, so they
     * can no longer return below the floor to the original base fit through this API.
     */
    setScale(scale: number): void;
    /** IX9 {@link ZoomableViewer} — the current zoom factor, where `1` = 100% (a
     *  slide at its natural EMU→px size). This is the viewer's absolute `_scale`
     *  (`slideWidth/EMU_PER_PX × _scale` is the drawn width), so it reads `1` at
     *  true 100% and, after the initial fit-to-width, the base fit factor. Before
     *  the fit is established it reports a latched pre-load `setScale` (IX9 F1) if
     *  one is pending — matching what a single-canvas viewer would show — else `1`. */
    getScale(): number;
    /** IX9 {@link ZoomableViewer} — step up to the next rung of the shared zoom
     *  ladder above the current factor (clamped to `zoomMax` by {@link setScale}). */
    zoomIn(): void;
    /** IX9 {@link ZoomableViewer} — step down to the next lower ladder rung. */
    zoomOut(): void;
    /**
     * IX9 {@link ZoomableViewer} — fit a slide's WIDTH to the container (the classic
     * continuous-scroll "fit width"). Sets the scale to the width-fit base for the
     * current container, then re-anchors + re-renders via {@link setScale}. Defers
     * (no-op) while the container is unlaid-out. The `zoomMin`/`zoomMax` clamp still
     * applies, so a fit below `zoomMin` pins to `zoomMin`.
     */
    fitWidth(): void;
    /**
     * IX9 {@link ZoomableViewer} — fit a WHOLE slide (width and height) inside the
     * container so one slide is visible without scrolling; takes the tighter of the
     * width/height fit. Uses the deck-wide (uniform) slide size. Defers while
     * unlaid-out.
     */
    fitPage(): void;
    /** Shared fit for {@link fitWidth}/{@link fitPage}: the width-fit factor is the
     *  established base (`_baseScale`); the page-fit additionally bounds by the
     *  container height against the (uniform) slide height. Applies via
     *  {@link setScale} so the flicker-free re-anchor / settle path and
     *  `onScaleChange` all run. */
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
     * slide. `renderedScale <= 0` means the slot's first render hasn't resolved yet
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
     * MAIN: `renderSlide` synchronously sets `canvas.width = …` (which CLEARS the
     * backing store to blank) BEFORE its first await and paints AFTER — so rendering
     * into the on-screen canvas would flash it white. Render into a SPARE off-DOM
     * canvas instead; only once it resolves at the current epoch do we swap it into
     * the wrapper (replacing the old canvas). The old canvas keeps showing the
     * stretched preview until the instant of the swap — blank-free.
     */
    private _settleSlot;
    /**
     * Scroll so slide `index`'s top edge sits at the viewport top. Clamps `index` to
     * `[0, slideCount-1]` (the pager convention) and the resulting scrollTop to
     * `[0, totalHeight − viewportHeight]` so the last slides don't scroll past the
     * end. A no-op when nothing is loaded or the deck is empty.
     *
     * `opts.behavior` ('auto' | 'smooth', default 'auto') is honoured via
     * `scrollHost.scrollTo({ top, behavior })` when the host supports it (a real
     * browser); the stub-DOM has no `scrollTo`, so the fallback sets `scrollTop`
     * directly (which is what the tests assert). We then call `_mountVisible` once.
     *
     * MOUNTING CAVEAT: synchronous mounting of the target slide is guaranteed only on
     * the DEFAULT/'auto' path — there `scrollTop` has already jumped to `top`, so the
     * `_mountVisible` call reads the final scroll position and the target slide's slots
     * exist immediately. With `behavior: 'smooth'` the scroll animates ASYNCHRONOUSLY:
     * `scrollTop` is still near the old position when `_mountVisible` runs, so the
     * target slide mounts lazily via the animation's subsequent `scroll` events, not
     * from this call.
     */
    scrollToSlide(index: number, opts?: {
        behavior?: 'auto' | 'smooth';
    }): void;
    /**
     * IX1 hyperlink click dispatch (mirrors {@link PptxViewer._onHyperlinkClick}).
     * When the integrator supplies `opts.onHyperlinkClick` it OWNS the click (no
     * default). Otherwise: an external link opens in a new tab via the shared,
     * scheme-sanitised {@link openExternalHyperlink}; an internal slide jump scrolls
     * to the target slide via {@link scrollToSlide} once the action resolves to a
     * slide index (a jump resolving to no reachable slide is a safe no-op).
     */
    private _onHyperlinkClick;
    /** Populate an internal {@link HyperlinkTarget}'s `slideIndex` from its `ref`
     *  via the engine's stamped part names. Relative `hlinkshowjump` verbs are
     *  resolved against the slide currently at the viewport top
     *  (`_range().topIndex`); a `../slides/slideN.xml` part target resolves through
     *  the part-name map. An already-set index, an external target, and an
     *  unresolvable ref all pass through unchanged (safe no-op). */
    private _resolveInternalSlideIndex;
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
    get topVisibleSlide(): number;
    /* Excluded from this release type: mountedSlideIndicesForTest */
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
 * Options for {@link PptxScrollViewer}. Extends `RenderSlideOptions` (per-slide
 * render knobs, minus `onTextRun`) and `LoadOptions` (parse/worker knobs). See
 * design §8.2.
 *
 * `onTextRun` is omitted deliberately: the viewer drives it internally per
 * mounted slot to build the optional per-slide selection overlay (gated by
 * `enableTextSelection`), so exposing it here would let a caller's callback be
 * silently overridden.
 *
 * NOTE: `RenderSlideOptions` also carries `dim` and `skipMediaControls`. The v1
 * scroll viewer never sets `dim` or `skipMediaControls` (hidden-slide dimming is
 * a PAGER policy, not a scroll-viewer feature — design §8.2 / Delta 6). These
 * inherited fields are accepted for type-compatibility but are not part of the
 * scroll-viewer's supported API.
 */
export declare interface PptxScrollViewerOptions extends Omit<RenderSlideOptions, 'onTextRun'>, LoadOptions {
    /** Base fit width in CSS px → base zoom scale. Default: the container's width
     *  at first non-zero layout (design §7/§11 zero-width deferral). */
    width?: number;
    /** Vertical gap (px) between consecutive slides. Default 16. */
    gap?: number;
    /** Desk padding (px) ABOVE the FIRST slide — the margin a presentation viewer
     *  leaves between the top of the scroll surface and the first slide. Default:
     *  `gap` (uniform desk rhythm — the first slide sits the same distance from the
     *  top as slides sit from each other). Pass `0` for a flush-top layout. */
    paddingTop?: number;
    /** Desk padding (px) BELOW the LAST slide — the margin below the final slide.
     *  Default: `gap`. Pass `0` for a flush-bottom layout. */
    paddingBottom?: number;
    /** Desk gutter (px) to the LEFT of the slides — the horizontal margin between
     *  the left edge of the scroll surface and a slide sitting flush-left (i.e. once
     *  zoomed wide enough that centering no longer applies). Default: `gap` (uniform
     *  desk rhythm — the horizontal gutters match the vertical ones). It also shrinks
     *  the container-derived FIT width so a slide sits inside the gutters at 100%
     *  (an EXPLICIT `opts.width` is the slide's CSS-width contract and is NOT reduced;
     *  the gutters still apply around placement). Pass `0` for a flush-left layout. */
    paddingLeft?: number;
    /** Desk gutter (px) to the RIGHT of the slides. Default: `gap`. Shrinks the
     *  container-derived fit width symmetrically with `paddingLeft`. Pass `0` for a
     *  flush-right layout. */
    paddingRight?: number;
    /** Slides kept mounted beyond the viewport on each side. Default 1. */
    overscan?: number;
    /** Per-slide transparent text-selection overlay. IX6 — works in BOTH render
     *  modes: in worker mode the per-run geometry is collected off-thread and
     *  shipped back beside the slide bitmap, so the overlay is populated identically
     *  to main mode (no more empty overlay / one-time warning). */
    enableTextSelection?: boolean;
    /** Minimum zoom scale — a DIMENSIONLESS multiplier over the 96-dpi natural
     *  slide size (10% = 0.1), matching `DocxScrollViewer`. Default 0.1. */
    zoomMin?: number;
    /** Maximum zoom scale (dimensionless multiplier, 400% = 4). Default 4. */
    zoomMax?: number;
    /** Enable `Ctrl`/`Cmd`+wheel zoom. Default true. */
    enableZoom?: boolean;
    /**
     * CSS `background` shorthand for the scroll surface (the "desk") visible
     * behind and between slides — the gray a presentation viewer paints around the
     * slide. Applied to the viewer-owned scroll host. The slides themselves are
     * always drawn on their own white canvas and are unaffected. Default
     * `undefined`: the scroll surface stays transparent so the host container's
     * background shows through (non-breaking).
     */
    background?: string;
    /**
     * CSS `box-shadow` painted on every slide CANVAS (not the wrapper — the
     * text-selection overlay must not cast its own shadow). The soft drop shadow a
     * presentation viewer leaves under each slide.
     *
     * - Default (`undefined`): `'0 1px 3px rgba(0,0,0,0.2)'` — the recipe look, so
     *   the scroll viewer reproduces the Examples appearance with zero config.
     * - `false`: NO shadow (flat slides).
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
    presentation?: PptxPresentation;
    /** Fires when the top-most visible slide changes. `topIndex` from
     *  `computeVisibleRange` (the first slide intersecting the viewport top,
     *  EXCLUDING overscan). */
    onVisibleSlideChange?: (topIndex: number, total: number) => void;
    /** IX9 — fires whenever the zoom factor actually changes (`1` = 100% = a slide
     *  at its natural EMU→px size): from {@link PptxScrollViewer.setScale},
     *  `zoomIn`/`zoomOut`, `fitWidth`/`fitPage`, a Ctrl/⌘+wheel gesture, or a
     *  container-resize re-fit. Named `onScaleChange` to match the single-canvas
     *  viewers so all five share one notification shape. */
    onScaleChange?: (scale: number) => void;
    /** Error callback. When set, `load()` invokes it and resolves (otherwise the
     *  error is rethrown — shared viewer error contract). It ALSO fires for async
     *  per-slot render failures (both main `renderSlide` and worker
     *  `renderSlideToBitmap` rejections); a failed slide is left blank rather than
     *  crashing the loop. Without an `onError`, render failures are logged via
     *  `console.error` so they are never fully silent. */
    onError?: (err: Error) => void;
    /**
     * IX1 (design decision — NOT user-confirmed, integrator may veto). Fires on a
     * hyperlink click in any mounted slide's text overlay (requires
     * {@link enableTextSelection}). Default when omitted: external →
     * {@link openExternalHyperlink} (new tab, sanitised, noopener); internal
     * slide-jump → {@link scrollToSlide} once the action resolves to a slide index
     * via {@link PptxPresentation.resolveInternalTarget} (a jump that resolves to
     * no reachable slide is a safe no-op). When provided, the viewer calls this
     * instead and takes NO default action.
     */
    onHyperlinkClick?: (target: HyperlinkTarget) => void;
}

/** Information about a rendered text segment for building a transparent selection overlay. */
export declare interface PptxTextRunInfo {
    text: string;
    /** X position in CSS px, relative to the shape's top-left corner. */
    inShapeX: number;
    /** Y position (top of line box) in CSS px, relative to the shape's top-left corner. */
    inShapeY: number;
    /** Measured text width in CSS px. */
    w: number;
    /** Line height in CSS px. */
    h: number;
    /** Font size in CSS px. */
    fontSize: number;
    /** CSS `font` shorthand used for canvas drawing (e.g. `"bold 16px Arial"`). */
    font: string;
    /** Shape's left edge in canvas CSS px. */
    shapeX: number;
    /** Shape's top edge in canvas CSS px. */
    shapeY: number;
    /** Shape's width in canvas CSS px. */
    shapeW: number;
    /** Shape's height in canvas CSS px. */
    shapeH: number;
    /** Shape rotation in degrees (clockwise). */
    rotation: number;
    /**
     * Additional rotation from a vertical text body (`vert="vert"` → 90,
     * `vert="vert270"` → -90). The CSS overlay must add this to `rotation`.
     */
    textBodyRotation?: number;
    /**
     * Resolved hyperlink target for this run (IX1), classified into the shared
     * {@link HyperlinkTarget} shape. Present only for runs whose `<a:rPr>` carried
     * an `<a:hlinkClick>`; the overlay makes such spans clickable. The glyph
     * drawing (colour + underline) is unaffected — this is metadata for the
     * transparent overlay only.
     */
    hyperlink?: HyperlinkTarget;
}

/**
 * Opinionated single-canvas PPTX viewer.
 *
 * Accepts a caller-supplied `<canvas>` element and wraps it in a positioned
 * container for the optional text-selection overlay.  The wrapper is inserted
 * into the canvas's existing parent (reparent), so the canvas stays at its
 * original position in the DOM.
 *
 * For custom layouts (multi-canvas, thumbnails, scroll view) use PptxPresentation directly.
 */
export declare class PptxViewer implements ZoomableViewer {
    private readonly canvas;
    private readonly wrapper;
    /**
     * IX9 explicit zoom factor (`1` = 100% = the slide at its natural EMU→px
     * width), or `null` when the caller has never invoked a zoom method. `null`
     * preserves the pre-IX9 render path EXACTLY: the slide renders at `opts.width`
     * (or `canvas.offsetWidth || 960` when unset), so default rendering is
     * byte-identical. The first zoom call latches a number here, after which
     * {@link _targetWidth} derives the render width from it.
     */
    private _scale;
    /** The canvas's DOM position BEFORE the constructor reparented it into
     *  {@link wrapper}, captured so {@link destroy} can return the caller-owned
     *  canvas to exactly where it was. `null` parent = canvas was passed
     *  detached. */
    private readonly _originalParent;
    private readonly _originalNextSibling;
    /** The canvas's inline `display` before the constructor forced `block`
     *  (empty string if it was unset), restored on {@link destroy}. */
    private readonly _originalDisplay;
    private textLayer;
    /** IX2 — the find-highlight overlay layer (always created, above the text
     *  layer, `pointer-events:none`). */
    private highlightLayer;
    /** IX2 — find state (per-slide runs, matches, active cursor). */
    private _find;
    /** Private 2d context for measuring highlight text (own 1×1 canvas). */
    private _measureCtx;
    private engine;
    private readonly opts;
    private currentSlide;
    private _hiddenMode;
    private handle;
    private readonly _mode;
    /** The canvas's bitmaprenderer context, used only by the static worker-mode
     *  render path. The media-playback path keeps a 2d context (via presentSlide),
     *  so this is obtained only when worker mode renders without media playback. */
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
     * `previous?.destroy()`, so a superseded load never touches `this.engine` nor
     * frees the current (newer) engine. {@link destroy} also bumps it so a load in
     * flight at teardown is treated as superseded and its engine cleaned up.
     */
    private _loadGen;
    constructor(canvas: HTMLCanvasElement, opts?: PptxViewerOptions);
    /**
     * Load a PPTX from URL or ArrayBuffer and render the first slide.
     *
     * Error contract (shared by all three viewers):
     * - Parse/load failure (the underlying `PptxPresentation.load()` call itself
     *   rejects): if an `onError` callback was provided it is invoked and `load`
     *   resolves normally; if not, the error is rethrown so it is never silently
     *   swallowed.
     * - Render failure (the first slide fails to draw AFTER a successful
     *   parse/load): routed to the shared `_reportRenderError` contract (`onError`
     *   if provided, else `console.error` — never silent) and `load` still
     *   RESOLVES, matching every subsequent navigation call.
     */
    load(source: string | ArrayBuffer): Promise<void>;
    /** Navigate to a specific slide (0-indexed). */
    goToSlide(index: number): Promise<void>;
    nextSlide(): Promise<void>;
    prevSlide(): Promise<void>;
    /** Next index for sequential nav: skip mode jumps over hidden slides. */
    private _step;
    /** Initial slide for load() / mode switch: skip mode lands on a visible one. */
    private _initialSlide;
    /** Resolved `'dim'` overlay (defaults merged with the `hiddenSlideDim` option). */
    private _dim;
    /**
     * Switch the hidden-slide mode at runtime and re-render. Entering `'skip'`
     * while on a hidden slide advances to the nearest visible slide.
     */
    setHiddenSlideMode(mode: HiddenSlideMode): Promise<void>;
    /** The current hidden-slide mode. */
    get hiddenSlideMode(): HiddenSlideMode;
    /** Number of non-hidden slides (absolute `slideCount` is unchanged). */
    get visibleSlideCount(): number;
    get slideIndex(): number;
    get slideCount(): number;
    /**
     * Speaker-notes text for a slide (`ppt/notesSlides/notesSlideN.xml`,
     * ECMA-376 §13.3.5). Passthrough to {@link PptxPresentation.getNotes}:
     * 0-based index, returns `null` when the slide has no notes part, the index
     * is out of range, or nothing is loaded yet.
     */
    getNotes(slideIndex: number): string | null;
    /** The underlying <canvas> element. */
    get canvasElement(): HTMLCanvasElement;
    /** Natural (100%) CSS-px width of a slide — `slideWidth(EMU) / EMU_PER_PX`.
     *  0 when nothing is loaded. The scale-1 reference every zoom factor
     *  multiplies. */
    private _naturalWidthPx;
    /**
     * The width (CSS px) the render paths draw the slide at, honouring the zoom
     * state. `_scale === null` (no zoom method ever called) ⇒ the pre-IX9 value
     * `opts.width ?? (canvas.offsetWidth || 960)` verbatim (byte-identical
     * default). Once a factor latched ⇒ `naturalWidth × scale` (rounded), so the
     * slide is exactly `scale ×` its natural size regardless of `opts.width`.
     */
    private _targetWidth;
    /** IX9 {@link ZoomableViewer} — the current zoom factor (`1` = 100%). Before
     *  any zoom method is called this is the EFFECTIVE scale implied by the render
     *  width: `targetWidth / naturalWidth`, or `1` when nothing is loaded. */
    getScale(): number;
    private _zoomMin;
    private _zoomMax;
    /**
     * IX9 {@link ZoomableViewer} — set the absolute zoom factor (`1` = 100% = the
     * slide at its natural EMU→px width), clamped to `[zoomMin, zoomMax]`, and
     * re-render the current slide at the new size. Fires `onScaleChange` when the
     * clamped factor actually changes. Resolves once the re-render settles.
     */
    setScale(scale: number): Promise<void>;
    /** IX9 {@link ZoomableViewer} — step up to the next rung of the shared zoom
     *  ladder (clamped to `zoomMax`). */
    zoomIn(): Promise<void>;
    /** IX9 {@link ZoomableViewer} — step down to the next lower ladder rung. */
    zoomOut(): Promise<void>;
    /**
     * IX9 {@link ZoomableViewer} — fit the current slide's WIDTH to the host
     * container (the element the canvas lives in), then re-render. Defers (no-op)
     * when nothing is loaded or the container is unlaid-out. Routes through
     * {@link setScale}.
     */
    fitWidth(): Promise<void>;
    /**
     * IX9 {@link ZoomableViewer} — fit the WHOLE current slide (width and height)
     * inside the container so it is fully visible; takes the tighter of the
     * width/height fit. Defers when unloaded / unlaid-out.
     */
    fitPage(): Promise<void>;
    /** Shared fit for {@link fitWidth}/{@link fitPage}: measure the natural slide
     *  size + the container box, ask core's pure `fitScale`, apply via setScale. */
    private _fit;
    private renderCurrentSlide;
    /** Draw the find-highlight boxes for the current slide from its runs. */
    private _buildHighlightLayer;
    /** A width-measurer primed with `font`, backed by a private 1×1 canvas. */
    private _measureForFont;
    /** IX6 — collect a slide's runs for search without touching the visible
     *  canvas. Delegates to `collectSlideRuns`, which works in BOTH modes (worker:
     *  off-thread, ships only the runs; main: throwaway offscreen canvas). Used for
     *  slides other than the one on screen. */
    private _collectSlideRuns;
    /**
     * IX2 — find every occurrence of `query` across all slides and highlight them
     * (a soft box per match on the highlight overlay). Returns every match in
     * document order, each tagged with its `{ slide }` (0-based). Case-insensitive
     * by default; pass `{ caseSensitive: true }` for an exact match.
     *
     * Scans all slides (each rendered once offscreen to read its text; the visible
     * slide reuses its on-screen render). IX6 — works in BOTH `mode: 'main'` and
     * `mode: 'worker'`: in worker mode each slide's run geometry is collected
     * off-thread and shipped back, so find returns the same matches on the same
     * code path. An empty query clears the find.
     */
    findText(query: string, opts?: FindMatchesOptions): Promise<FindMatch<PptxMatchLocation>[]>;
    /**
     * IX2 — move to the next match (wrap-around), navigating to its slide if
     * needed, and draw it in the active-match colour. Returns the now-active
     * match, or `null` when there are none. Call {@link findText} first.
     */
    findNext(): Promise<FindMatch<PptxMatchLocation> | null>;
    /** IX2 — move to the previous match (wrap-around). */
    findPrev(): Promise<FindMatch<PptxMatchLocation> | null>;
    /** IX2 — clear all highlights and reset the find state. */
    clearFind(): void;
    private _activateMatch;
    /** Rebuild the highlight overlay for the current slide from cached runs. */
    private _redrawHighlights;
    private _buildTextLayer;
    /**
     * IX1/IX-nav hyperlink click dispatch. An internal target is first *enriched*
     * with its resolved 0-based `slideIndex` (via
     * {@link PptxPresentation.resolveInternalTarget}, relative to the current
     * slide) so a jump verb / slide-part ref arrives already mapped — this is the
     * field that was previously always `undefined`. When the integrator supplies
     * `opts.onHyperlinkClick` it OWNS the (enriched) click and takes NO default
     * action. Otherwise the viewer's default policy applies: an external link
     * opens in a new tab via the shared, scheme-sanitised
     * {@link openExternalHyperlink}; an internal slide jump navigates via
     * {@link goToSlide} to the resolved index (a target that resolves to no
     * reachable slide is a safe no-op).
     */
    private _onHyperlinkClick;
    /** Populate an internal {@link HyperlinkTarget}'s `slideIndex` from its `ref`
     *  (a `ppaction://hlinkshowjump?jump=…` verb resolved relative to the current
     *  slide, or a `../slides/slideN.xml` part target resolved through the stamped
     *  part-name map — no filename-suffix heuristic). Any already-set `slideIndex`
     *  is kept; an external target and an unresolvable ref pass through unchanged so
     *  the caller no-ops safely. */
    private _resolveInternalSlideIndex;
    /** PD14 render-error contract: route a render failure to `onError`, or
     *  `console.error` when none is given (never fully silent), and never after
     *  teardown. Mirrors the scroll viewers' `_reportRenderError` so all three
     *  single-canvas viewers agree. */
    private _reportRenderError;
    /**
     * Clean up the viewer and terminate the background worker.
     *
     * The caller-owned `<canvas>` is returned to the DOM position it held before
     * the constructor was called (same parent, same next-sibling) and its inline
     * `display` is restored, so the canvas can be reused — e.g. to construct a new
     * viewer on the same element. If the canvas was passed detached (no parent) it
     * is simply removed from the internal wrapper. Safe to call more than once.
     */
    destroy(): void;
}

export declare interface PptxViewerOptions extends RenderOptions, LoadOptions {
    /** Called when a slide finishes rendering */
    onSlideChange?: (index: number, total: number) => void;
    /** Called on parse or render errors */
    onError?: (err: Error) => void;
    /** IX9 zoom contract ({@link ZoomableViewer}) — the clamp range for
     *  {@link PptxViewer.setScale} / `zoomIn` / `zoomOut` / `fitWidth` / `fitPage`,
     *  as user-facing zoom factors (`1` = 100% = the slide at its natural
     *  EMU→px size). Defaults 0.1–4 (10%–400%), matching the other viewers. */
    zoomMin?: number;
    zoomMax?: number;
    /** IX9 — fires whenever the zoom factor actually changes (`1` = 100%): from
     *  {@link PptxViewer.setScale}, `zoomIn`/`zoomOut`, or `fitWidth`/`fitPage`.
     *  Named `onScaleChange` to match the docx/xlsx viewers so all five share one
     *  notification shape. */
    onScaleChange?: (scale: number) => void;
    /**
     * Enable interactive audio/video playback. When true, slides are rendered
     * via {@link PptxPresentation.presentSlide} so media elements become
     * clickable and the viewer draws its own play/pause chrome. When false
     * (default) the viewer renders a static slide with a non-interactive play
     * badge over media posters.
     */
    enableMediaPlayback?: boolean;
    /**
     * When true, adds a transparent text overlay div over the canvas so the
     * browser's native text selection works on slide content.
     */
    enableTextSelection?: boolean;
    /**
     * How hidden slides (`<p:sld show="0">`, §19.3.1.38) are presented:
     * - `'show'` (default): drawn like any other slide.
     * - `'skip'`: sequential navigation (`nextSlide`/`prevSlide`, initial load)
     *   jumps over them; absolute indices are unchanged, and an explicit
     *   `goToSlide(i)` to a hidden slide is still honored.
     * - `'dim'`: drawn under a translucent overlay (PowerPoint thumbnail look).
     *
     * Named to match the {@link PptxViewer.hiddenSlideMode} getter and
     * {@link PptxViewer.setHiddenSlideMode} setter.
     */
    hiddenSlideMode?: HiddenSlideMode;
    /**
     * Overrides for the `'dim'` overlay. Merged over the default
     * `{ color: '#ffffff', opacity: 0.6 }`. A `Partial<DimOptions>` so it stays
     * in sync if {@link DimOptions} gains a field.
     */
    hiddenSlideDim?: Partial<DimOptions>;
    /**
     * IX1 (design decision — NOT user-confirmed, integrator may veto). Fires on a
     * hyperlink click (a text run whose `<a:rPr>` carried an `<a:hlinkClick>`;
     * requires {@link enableTextSelection} so the overlay spans exist). Default
     * when omitted: external → {@link openExternalHyperlink} (new tab, sanitised,
     * noopener); internal slide-jump → {@link goToSlide} once the action resolves
     * to a slide index via {@link PptxPresentation.resolveInternalTarget} (a jump
     * that resolves to no reachable slide is a safe no-op). When provided, the
     * viewer calls this instead and takes NO default action.
     */
    onHyperlinkClick?: (target: HyperlinkTarget) => void;
}

export declare interface Presentation {
    slideWidth: number;
    slideHeight: number;
    slides: Slide[];
    /** Theme dk1 color (e.g. "383838"). Used as fallback text color when no explicit color is set. */
    defaultTextColor: string | null;
    /** Theme major (heading) font family name (e.g. "Aptos Display", "Nunito Sans"). Null if not set. */
    majorFont: string | null;
    /** Theme minor (body) font family name (e.g. "Aptos", "Nunito Sans"). Null if not set. */
    minorFont: string | null;
    /** Theme hyperlink colour (hex 6 chars). Used to colour hyperlink runs that have no explicit colour. */
    hlinkColor?: string;
    /** Theme followed-hyperlink colour. Reserved for future visited-link styling. */
    folHlinkColor?: string;
}

export declare interface PresentationHandle {
    play(mediaPath?: string): void;
    pause(mediaPath?: string): void;
    /**
     * Stop the playback RAF loop, detach pointer listeners and release every
     * media blob URL. Named `destroy()` to match the teardown method on the
     * viewers/documents (`PptxViewer.destroy()`, `XlsxWorkbook.destroy()`, …)
     * so the public API uses one consistent teardown verb.
     */
    destroy(): void;
}

/** ECMA-376 §20.1.8.27 (CT_ReflectionEffect) — mirrored copy below the
 *  shape with a linear alpha gradient. Carries the spec attributes whose
 *  defaults the renderer needs to interpret correctly. */
export declare interface Reflection {
    blur: number;
    dist: number;
    /** Direction in degrees, clockwise from East. */
    dir: number;
    /** Start alpha (0–1). Default 1.0. */
    stA: number;
    /** Start position along the gradient (0–1). Default 0. */
    stPos: number;
    /** End alpha. Default 0. */
    endA: number;
    /** End position. Default 1.0. */
    endPos: number;
    /** Horizontal scale (1.0 = same width). */
    sx: number;
    /** Vertical scale (-1.0 = full mirror). */
    sy: number;
}

export declare interface RenderOptions {
    width?: number;
    defaultTextColor?: string | null;
    dpr?: number;
    majorFont?: string | null;
    minorFont?: string | null;
    /** Theme hyperlink colour (hex 6 chars). Used to colour hyperlink runs without an explicit colour. */
    hlinkColor?: string | null;
    /**
     * Lazily resolve an archive-internal asset (by zip path) to a Blob. The
     * renderer uses this to fetch posters and other large embedded assets on
     * demand, keeping the parse output free of inlined base64.
     */
    fetchMedia?: (path: string) => Promise<Blob>;
    /**
     * Lazily resolve an embedded image (by zip path + MIME) to a Blob. Twin of
     * {@link RenderOptions.fetchMedia} for pictures and blip fills: the renderer
     * fetches raster/SVG bytes on demand and decodes them (`createImageBitmap` /
     * path-keyed `<img>`), so the parse output carries only paths, never base64.
     */
    fetchImage?: (path: string, mimeType: string) => Promise<Blob>;
    /**
     * When true, renderMedia draws only the poster frame — play/pause badges
     * and progress bars are left to the caller. Set by the pptx presentSlide
     * API so its interactive handle can own all control chrome without
     * the static renderer drawing a duplicate play badge.
     */
    skipMediaControls?: boolean;
}

/**
 * Render a single slide onto a <canvas> element.
 * Returns the canvas for convenience.
 */
export declare function renderSlide(canvas: HTMLCanvasElement | OffscreenCanvas, slide: Slide, slideWidth: number, slideHeight: number, opts?: SlideRenderOptions, onTextRun?: TextRunCallback): Promise<HTMLCanvasElement | OffscreenCanvas>;

/** Options for rendering a single slide onto a canvas. */
export declare interface RenderSlideOptions {
    /** Display width in CSS pixels. Defaults to canvas.offsetWidth or 960. */
    width?: number;
    /** Device pixel ratio. Defaults to window.devicePixelRatio or 1. */
    dpr?: number;
    /** Called for each rendered text segment. Used to build a transparent text selection overlay. */
    onTextRun?: TextRunCallback;
    /**
     * Skip drawing the play badge overlay on media elements. Used internally by
     * {@link PptxPresentation.presentSlide} so its interactive handle can draw
     * its own play/pause chrome without duplication.
     */
    skipMediaControls?: boolean;
    /** Translucent overlay drawn over the finished slide (hidden-slide dimming). */
    dim?: DimOptions;
}

/** Options for {@link PptxPresentation.renderSlideToBitmap}. */
export declare interface RenderSlideToBitmapOptions {
    /** Slide width in CSS pixels. Defaults to 960. */
    width?: number;
    /** Device pixel ratio. Defaults to window.devicePixelRatio (workers have none). */
    dpr?: number;
    /* Excluded from this release type: skipMediaControls */
    /** Translucent overlay drawn over the finished slide (hidden-slide dimming). */
    dim?: DimOptions;
    /**
     * IX6 — receives the slide's text-run geometry (the same stream `renderSlide`
     * emits in main mode). Stays main-thread (never crosses the wire); in worker
     * mode the proxy invokes it with the runs the worker shipped back beside the
     * bitmap, so a caller builds the selection / find overlay on the SAME code
     * path in both modes.
     */
    onTextRun?: TextRunCallback;
}

/**
 * 3D rotation in sphere coordinates — ECMA-376 §20.1.5.11 (`CT_SphereCoords`).
 * Angles are in **degrees** (the XML carries 60000ths of a degree; the parser
 * divides once). Per the spec, `lat`/`lon` are latitude/longitude and `rev` is
 * the revolution about the resulting view axis.
 */
export declare interface Rot3d {
    /** Latitude — rotation about the horizontal (X) axis, degrees. */
    lat: number;
    /** Longitude — rotation about the vertical (Y) axis, degrees. */
    lon: number;
    /** Revolution — in-plane rotation about the view (Z) axis, degrees. */
    rev: number;
}

/**
 * `<a:scene3d>` — ECMA-376 §20.1.4.1.41 (`CT_Scene3D`). Camera + light rig for
 * a shape's 3D scene.
 */
export declare interface Scene3d {
    camera: Camera3d;
    lightRig?: LightRig;
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

export declare interface Shadow {
    color: string;
    alpha: number;
    blur: number;
    dist: number;
    /** degrees clockwise from East */
    dir: number;
}

export declare interface ShapeElement {
    type: 'shape';
    x: number;
    y: number;
    width: number;
    height: number;
    /** Rotation in degrees, clockwise */
    rotation: number;
    /** Horizontal mirror (a:xfrm flipH) */
    flipH: boolean;
    /** Vertical mirror (a:xfrm flipV) */
    flipV: boolean;
    /** OOXML preset name or "custGeom" when custom paths are used */
    geometry: string;
    fill: Fill | null;
    stroke: Stroke | null;
    textBody: TextBody | null;
    /** Default text color from p:style > fontRef (hex). Used when run/para has no explicit color. */
    defaultTextColor: string | null;
    /** Custom geometry sub-paths (set only when geometry === "custGeom").
     *  Outer array: one entry per <a:path>; inner: path commands with coords in [0,1]. */
    custGeom: PathCmd[][] | null;
    /** First adjustment value from prstGeom avLst (e.g. trapezoid inset). Range 0–100000. */
    adj: number | null;
    /** Second adjustment value from prstGeom avLst (e.g. arrow head width). Range 0–100000. */
    adj2: number | null;
    /** Third adjustment value from prstGeom avLst (e.g. callout tip x). Range 0–100000. */
    adj3: number | null;
    /** Fourth adjustment value from prstGeom avLst (e.g. callout tip y). Range 0–100000. */
    adj4: number | null;
    /** adj5-adj8: extra polyline vertices for callouts like accentBorderCallout3. */
    adj5: number | null;
    adj6: number | null;
    adj7: number | null;
    adj8: number | null;
    /** Drop shadow from effectLst > outerShdw (null if not present). */
    shadow: Shadow | null;
    /** Inner (inset) shadow from effectLst > innerShdw. ECMA-376 §20.1.8.21. */
    innerShadow?: Shadow;
    /** Coloured glow halo from effectLst > glow. ECMA-376 §20.1.8.17. */
    glow?: Glow;
    /** Soft (feathered) edge — ECMA-376 §20.1.8.31. */
    softEdge?: SoftEdge;
    /** Mirrored reflection — ECMA-376 §20.1.8.27. */
    reflection?: Reflection;
    /** Explicit text frame from a SmartArt drawing's `<dsp:txXfrm>` (absolute EMU,
     *  same space as x/y/width/height). When present the renderer lays text out in
     *  this rectangle instead of the preset/ellipse-derived text rectangle. */
    textRect?: TextRect;
    /** `<a:scene3d>` 3D camera scene (ECMA-376 §20.1.5.5). When the camera is
     *  non-identity the renderer projects the shape through the camera
     *  homography (Phase A). */
    scene3d?: Scene3d;
    /** `<a:sp3d>` 3D shape properties (ECMA-376 §20.1.5.12). Parsed but not
     *  rendered in Phase A. */
    sp3d?: Sp3d;
    /** Shape-level hyperlink target resolved from `<p:cNvPr><a:hlinkClick @r:id>`
     *  via slide _rels (ECMA-376 §21.1.2.3.5). For an external link this is the
     *  URL; for an internal slide jump it is the resolved internal part name.
     *  Undefined when the shape carries no hlinkClick. */
    hyperlink?: string;
    /** Raw `<a:hlinkClick @action>` (e.g. `"ppaction://hlinksldjump"`) when the
     *  shape link is an internal PowerPoint action rather than an external URL.
     *  Undefined when absent. */
    hyperlinkAction?: string;
}

export declare interface Slide {
    index: number;
    /** 1-based slide number (index + 1); used to render slidenum fields */
    slideNumber: number;
    /**
     * The slide's normalized OPC part name (e.g. `ppt/slides/slide3.xml`),
     * resolved through `presentation.xml.rels` in `sldIdLst` order (ECMA-376
     * §19.3.1.42). An internal hyperlink slide jump
     * (`<a:hlinkClick action="ppaction://hlinksldjump" r:id>`, §21.1.2.3.5)
     * carries a rel Target that resolves to this same part name — so
     * {@link PptxPresentation.getSlideIndexByPartName} can turn a click into a
     * slide index. Absent (`undefined`) only for a slide whose part path was not
     * recorded; healthy and broken slides both carry it.
     */
    partName?: string;
    background: Fill | null;
    elements: SlideElement[];
    /**
     * Speaker-notes pane text from `ppt/notesSlides/notesSlideN.xml`
     * (ECMA-376 §13.3.5 — Notes Slide). The full notes-body text as a single
     * string, paragraphs joined with `\n`. Absent (`undefined`) when the slide
     * has no notes part. The renderer ignores this — it is surfaced for tools;
     * read it via {@link PptxPresentation.getNotes}.
     */
    notes?: string;
    /**
     * Legacy slide comments (`ppt/comments/commentN.xml`, ECMA-376 §13.3.4).
     * Modern Office 365 threaded comments are not parsed. Omitted from the JSON
     * when the slide has no comments.
     */
    comments?: PptxComment[];
    /**
     * `<p:sld show="0">` — the slide is marked hidden in the slide show
     * (ECMA-376 §19.3.1.38). Absent (`undefined`) ⇒ shown. The renderer ignores
     * this; it is a fact surfaced for tools and for {@link PptxViewer}'s hidden-
     * slide modes (read it via `PptxPresentation.isHidden`).
     */
    hidden?: boolean;
    /**
     * RB7 partial degradation: set when this slide's part could not be parsed. The
     * deck still opens with the OTHER slides intact; this one is a placeholder
     * (`elements` empty) whose `parseError` names the offending part (e.g.
     * `"ppt/slides/slide3.xml: <detail>"`). Absent (`undefined`) for every healthy
     * slide. The renderer paints a visible error box instead of slide content.
     */
    parseError?: string;
}

export declare type SlideElement = ShapeElement | PictureElement | TableElement | ChartElement | MediaElement;

/**
 * Internal render options: the shared {@link RenderOptions} plus the opt-in
 * `math` engine. `math` is internal plumbing — the headless {@link
 * PptxPresentation} injects it once at load and threads it here on each draw,
 * so the public `RenderSlideOptions` deliberately does not expose it.
 */
declare type SlideRenderOptions = RenderOptions & {
    math?: MathRenderer;
    dim?: DimOptions;
};

/** ECMA-376 §20.1.8.31 (CT_SoftEdgesEffect) — feather radius in EMU. */
export declare interface SoftEdge {
    radius: number;
}

export declare interface SolidFill {
    fillType: 'solid';
    color: string;
}

/**
 * `<a:sp3d>` — ECMA-376 §20.1.5.12 (`CT_Shape3D`). Rendered in Phase B: bevelT/
 * bevelB are shaded as a lit lip (distance-field + lightRig), extrusionH as a
 * swept side wall, and contour as a flat outline approximation. Numeric fields
 * are omitted from JSON when zero.
 */
export declare interface Sp3d {
    /** Z position of the front face in EMU (default 0). */
    z?: number;
    /** Extrusion (depth) height in EMU (default 0). */
    extrusionH?: number;
    /** Contour (outline) width in EMU (default 0). */
    contourW?: number;
    /** Contour colour (`<a:contourClr>`, ECMA-376 §20.1.5.12) as a hex string
     *  (e.g. "969696"). Omitted when absent. The renderer draws a flat
     *  approximation of the 3D contour edge (uniform-width outline, no bevel
     *  shading) when both `contourW` and `contourClr` are present. */
    contourClr?: string;
    /** Preset surface material (`ST_PresetMaterialType`), default "warmMatte". */
    prstMaterial: string;
    /** Top bevel. */
    bevelT?: Bevel3d;
    /** Bottom bevel. */
    bevelB?: Bevel3d;
}

export declare type SpaceLine = {
    type: 'pct';
    val: number;
} | {
    type: 'pts';
    val: number;
};

export declare interface Stroke {
    color: string;
    /** Width in EMU */
    width: number;
    /** OOXML prstDash value: "dash", "dot", "dashDot", "lgDash", "lgDashDot", etc. */
    dashStyle?: string;
    /** Arrow head at the start of the line */
    headEnd?: ArrowEnd;
    /** Arrow head at the end of the line */
    tailEnd?: ArrowEnd;
    /**
     * ECMA-376 §20.1.8.42 ST_CompoundLine. "sng" (default) | "dbl" |
     * "thinThick" | "thickThin" | "tri". Absent means single line.
     */
    cmpd?: string;
}

export declare interface TableCell {
    textBody: TextBody | null;
    fill: Fill | null;
    /** Default run text colour inherited from the table style (`<a:tcTxStyle>`); hex, no `#`. */
    textColor?: string;
    borderL: Stroke | null;
    borderR: Stroke | null;
    borderT: Stroke | null;
    borderB: Stroke | null;
    /** Diagonal from top-left to bottom-right */
    diagonalTL?: Stroke | null;
    /** Diagonal from top-right to bottom-left */
    diagonalTR?: Stroke | null;
    /** Column span */
    gridSpan: number;
    /** Row span */
    rowSpan: number;
    /** Horizontal merge continuation */
    hMerge: boolean;
    /** Vertical merge continuation */
    vMerge: boolean;
}

export declare interface TableElement {
    type: 'table';
    x: number;
    y: number;
    width: number;
    height: number;
    /** Column widths in EMU */
    cols: number[];
    rows: TableRow[];
    /** `<a:tblPr rtl="1">` (ECMA-376 §21.1.3.13): right-to-left table — column 0 at the right edge. */
    rtl?: boolean;
}

export declare interface TableRow {
    /** Row height in EMU */
    height: number;
    cells: TableCell[];
}

export declare interface TabStop {
    /** Position in EMU from the left edge of the text area (after lIns) */
    pos: number;
    /** Alignment: "l" | "r" | "ctr" | "dec" */
    algn: string;
}

/**
 * PPTX text body. Extends the shared core `TextBody` with PPTX-only bodyPr
 * fields that the pptx parser surfaces but the shared core model does not yet
 * carry.
 */
export declare interface TextBody extends TextBody_2 {
    /**
     * `<a:bodyPr rtlCol>` (ECMA-376 §21.1.2.1.1) — when true the columns of a
     * multi-column text body are laid out right-to-left. Defaults to false;
     * omitted from JSON when false. Only meaningful when `numCol > 1`.
     */
    rtlCol?: boolean;
    /**
     * `<a:bodyPr><a:prstTxWarp>` (ECMA-376 §20.1.9.19) — WordArt text warp. When
     * present the renderer maps each glyph through the named envelope
     * (presetTextWarpDefinitions) instead of laying text out flat. Omitted from
     * JSON when the body has no warp, so unwarped bodies are byte-identical.
     */
    textWarp?: {
        /** The `prst` name, e.g. `"textArchUp"`, `"textWave1"`. */
        preset: string;
        /** `<a:avLst>` adjust values (adj1, adj2, …) in thousandths of a percent.
         *  Omitted when the author supplied none (preset defaults apply). */
        adj?: number[];
    };
    /**
     * Narrow the inherited `paragraphs` to the PPTX `Paragraph` so consumers see
     * the PPTX-only `eaLnBrk` flag. PPTX `Paragraph extends CoreParagraph`, so
     * this is a covariant refinement of `CoreTextBody.paragraphs`.
     */
    paragraphs: Paragraph[];
}

declare interface TextBody_2 {
    /** Vertical anchor: "t" | "ctr" | "b" */
    verticalAnchor: string;
    paragraphs: Paragraph_2[];
    /** Default pt size from lstStyle (overrides renderer default when present) */
    defaultFontSize: number | null;
    /** Inherited bold from layout/master defRPr (null = not set, use false as final default) */
    defaultBold: boolean | null;
    /** Inherited italic from layout/master defRPr (null = not set, use false as final default) */
    defaultItalic: boolean | null;
    /** Text insets in EMU (defaults: lIns=rIns=91440, tIns=bIns=45720) */
    lIns: number;
    rIns: number;
    tIns: number;
    bIns: number;
    /** "square" = wrap, "none" = no wrap */
    wrap: string;
    /** Text direction: "horz" | "vert" | "vert270" | "eaVert" etc. */
    vert: string;
    /** Auto-fit: "sp" = shape grows to fit text, "norm" = font shrinks, "none" = no fit */
    autoFit: string;
    /**
     * `<a:normAutofit fontScale>` (ECMA-376 §21.1.2.1.3) — PowerPoint's stored,
     * pre-computed font-shrink ratio for `autoFit === "norm"`, as a fraction
     * (e.g. 0.625 for `fontScale="62500"`). Null/absent when PowerPoint stored no
     * scale; the renderer then re-derives one. Applying the stored value matches
     * PowerPoint exactly instead of guessing from our own text metrics.
     */
    fontScale?: number | null;
    /** `<a:normAutofit lnSpcReduction>` — stored line-spacing reduction fraction
     *  (e.g. 0.20 for `lnSpcReduction="20000"`). Null/absent when not stored. */
    lnSpcReduction?: number | null;
    /**
     * `<a:bodyPr numCol>` (ECMA-376 §20.1.10.34) — number of text columns inside
     * the shape. Defaults to 1; values > 1 cause the renderer to flow paragraphs
     * across N columns left-to-right, top-to-bottom.
     */
    numCol?: number;
    /** `<a:bodyPr spcCol>` — gap between columns in EMU. Default 0. */
    spcCol?: number;
}

/** Run-level glyph outline. Width is in OOXML EMU (12700 EMU = 1 pt). */
declare interface TextOutline {
    width: number;
    /** Hex without '#'. Absent = inherit from text fill colour. */
    color?: string;
}

/** Absolute text-frame rectangle in EMU (from SmartArt `<dsp:txXfrm>`). */
export declare interface TextRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export declare type TextRun = TextRunData | LineBreak | EquationRun;

export declare type TextRunCallback = (run: PptxTextRunInfo) => void;

export declare interface TextRunData {
    type: 'text';
    text: string;
    /** null = not set, inherit from paragraph/body defaults */
    bold: boolean | null;
    /** null = not set, inherit from paragraph/body defaults */
    italic: boolean | null;
    underline: boolean;
    /**
     * Specific underline style when not the default single line. Values come
     * from ECMA-376 §21.1.2.3.16 (ST_TextUnderlineType): "dbl", "heavy",
     * "dotted", "dottedHeavy", "dash", "dashHeavy", "dashLong",
     * "dashLongHeavy", "dotDash", "dotDashHeavy", "dotDotDash",
     * "dotDotDashHeavy", "wavy", "wavyHeavy", "wavyDbl". Absent means either
     * no underline (when `underline` is false) or the default single line.
     */
    underlineStyle?: string;
    /**
     * Underline-only colour from rPr > uFill (ECMA-376 §21.1.2.3.20). Absent
     * means the underline follows the text colour (uFillTx default).
     */
    underlineColor?: string;
    /** True when rPr strike is sngStrike or dblStrike. */
    strikethrough: boolean;
    /**
     * True only when rPr strike = "dblStrike". Lets the renderer draw two parallel
     * lines instead of one. ECMA-376 §21.1.2.3.10 (ST_TextStrikeType).
     */
    strikeDouble?: boolean;
    /** Font size in points */
    fontSize: number | null;
    color: string | null;
    fontFamily: string | null;
    /**
     * East Asian font family from rPr > a:ea (ECMA-376 §21.1.2.3.7),
     * resolved through the theme. Renderer uses this for CJK glyphs when
     * present; absent means CJK falls back to fontFamily.
     */
    fontFamilyEa?: string;
    /**
     * Symbol font family from rPr > a:sym (ECMA-376 §21.1.2.3.10), resolved
     * through the theme. PowerPoint stores symbol-font glyphs as Private-Use
     * codepoints U+F020–U+F0FF; the renderer uses this font to resolve them.
     * Absent means no symbol font was declared.
     */
    fontFamilySym?: string;
    /** Baseline shift in thousandths of a point. Positive = superscript, negative = subscript. */
    baseline?: number;
    /**
     * Capitalisation transform — ECMA-376 §21.1.2.3.13 (ST_TextCapsType).
     * 'all' renders text in upper case; 'small' uses small caps (rendered as
     * upper case at ~80% size when no smcp font feature is available).
     * 'none' or omitted leaves the text unchanged.
     */
    caps?: 'none' | 'small' | 'all';
    /**
     * Inter-character spacing in 100ths of a point — ECMA-376 §21.1.2.3.5
     * (rPr @spc). Positive values add space, negative values tighten.
     */
    letterSpacing?: number;
    /** Set for OOXML field runs (e.g. "slidenum"). When set, renderer replaces text with field value. */
    fieldType?: string;
    /**
     * Hyperlink target resolved from rPr > a:hlinkClick @r:id via the slide's _rels.
     * For an external link this is the URL; for an internal slide jump it is the
     * resolved internal part name (e.g. "../slides/slide3.xml"). Undefined for runs
     * without a hyperlink. ECMA-376 §21.1.2.3.5 (CT_Hyperlink).
     */
    hyperlink?: string;
    /**
     * Raw `<a:hlinkClick @action>` string (e.g. "ppaction://hlinksldjump") when
     * present — its presence marks {@link hyperlink} as an INTERNAL PowerPoint
     * action (slide jump / first / last …) rather than an external URL. Undefined
     * when the hlinkClick has no @action. ECMA-376 §21.1.2.3.5. (IX1)
     */
    hyperlinkAction?: string;
    /**
     * Run-level drop shadow on glyphs (`<a:rPr><a:effectLst><a:outerShdw>`),
     * ECMA-376 §20.1.8.45. Independent of the shape-level shadow on `spPr`.
     * Absent means no run-level shadow.
     */
    shadow?: Shadow;
    /**
     * Run-level glyph outline (`<a:rPr><a:ln w="..">`), ECMA-376 §20.1.2.2.24
     * (CT_TextOutlineEffect). Renderer strokes each glyph with the given
     * width / colour in addition to the normal fill. Absent means glyphs are
     * fill-only.
     */
    outline?: TextOutline;
    /**
     * Run-level text highlight / marker colour (`<a:rPr><a:highlight>`),
     * ECMA-376 §21.1.2.3.4. In DrawingML this is a full CT_Color (any
     * srgbClr / schemeClr / sysClr / prstClr + transforms), unlike
     * WordprocessingML's fixed 16-name highlight enum — so the parser already
     * resolves it through the theme/clrMap. The value is a hex string without
     * `#` (6-char opaque, or 8-char RRGGBBAA when an alpha transform applies);
     * the renderer paints a background rectangle behind the run's glyphs.
     * Absent means no highlight.
     */
    highlight?: string;
}

/**
 * ECMA-376 §20.1.8.58 (CT_TileInfoProperties) — tiled blip-fill placement.
 * The blip repeats at its native size (scaled by sx/sy) across the fill box.
 * Mutually exclusive with {@link ImageFill.fillRect} (the `stretch` mode).
 */
export declare interface TileInfo {
    /** Horizontal offset of the first tile, in EMU (`tx`). Default 0. */
    tx: number;
    /** Vertical offset of the first tile, in EMU (`ty`). Default 0. */
    ty: number;
    /** Horizontal tile scale as a fraction (`sx` / 100000). Default 1.0. */
    sx: number;
    /** Vertical tile scale as a fraction (`sy` / 100000). Default 1.0. */
    sy: number;
    /** Mirror mode: `'none' | 'x' | 'y' | 'xy'` (`flip`). Default `'none'`. */
    flip: string;
    /**
     * Anchor corner the tile grid registers against:
     * `tl|t|tr|l|ctr|r|bl|b|br` (`algn`). Default `'tl'`.
     */
    algn: string;
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
