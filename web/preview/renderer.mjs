import { historySelectionStamp, sameHistoryPaintStamp } from './history-paint-authority.mjs';
import {
  createOwnedBodyDraftProjection,
  createStatePaintParagraphLookup,
} from './owned-body-draft-paragraph-index.mjs';
import { createDecodedResourceGeometryEpoch } from './decoded-resource-geometry-epoch.mjs';
import { createCanvasMeasurementPolicy } from './canvas-measurement-policy.mjs';
import { createNativeGeometryDeps } from './native-geometry-deps.mjs';
import { currentTextBoundaryIdentity } from './text-boundary-platform.mjs';
import { createParagraphFlowReuse } from './paragraph-flow-reuse.mjs';
import { createParagraphLookup } from './projection-paragraph-index.mjs';
import { watchProjectionFonts } from './projection-measure-memo.mjs';
import { DEFAULT_CANVAS_DISPLAY_OPTIONS, canvasDisplayOptions } from './canvas-display-options.mjs';
import { paragraphMarkPlan, paintParagraphMark } from './paragraph-mark-paint.mjs';
import { decodeTableImageTone } from './table-image-tone.mjs';
import {
  tableBackgroundTargets,
  tableBackgroundCoverage,
  tableBoxPaintBounds,
} from './table-background-targets.mjs';
import { paintTableBackground } from './table-background-paint.mjs';
import { FONT, displayRunText } from './layout.mjs';
import { createPreviewTextMeasure } from './preview-text-measure.mjs';
import { inlineHwp5FormIndex, formPositionKey } from './hwp5-form-inline.mjs';
import { paintHwp5Form } from './hwp5-form-paint.mjs';
import { visiblePictureTargets } from './visible-picture-targets.mjs';
import {
  tableBorderPaintIndex,
  tableBorderPlanForBox,
  tableBackgroundFillForSource,
} from './table-border-plan.mjs';
import { paintTableBorder } from './table-border-paint.mjs';
import { createdTableWidthHint } from './created-table-width-hint.mjs';
import { dutmalAt, dutmalPaintPlan, paintDutmal } from './dutmal-paint.mjs';
import { dutmalAnchorAtPoint } from './dutmal-anchor-geometry.mjs';
import { equationAnchorAtPoint } from './equation-anchor-geometry.mjs';
import { equationPaintAt } from './equation-render-content.mjs';
import { paintEquation } from './equation-paint.mjs';
import { paintNoteSeparator } from './note-separator-paint.mjs';
import { tablePaintScene } from './table-text-paint-order.mjs';
import { hitPictureLayers } from './picture-hit-test.mjs';
import { chartAnchorAtPoint } from './chart-anchor-geometry.mjs';
import { paintPictureSelection } from './picture-selection-paint.mjs';
import { canvasViewportMetrics } from './canvas-viewport-metrics.mjs';
import { canvasHorizontalExtent } from './canvas-horizontal-extent.mjs';
import { pictureResizeHandles } from './picture-resize-geometry.mjs';
import { characterShadeRangesState } from './character-shade-selection.mjs';
import { characterEffectRangesState } from './character-effect-selection.mjs';
import {
  characterOutlineRangesState,
  characterOutlineRangesKind,
} from './character-outline-selection.mjs';
import { paintCharacterRelief } from './character-relief-style.mjs';
import { paintCharacterOutline } from './character-outline-paint.mjs';
import { selectedFontIds } from './character-font-selection.mjs';
import {
  rowAtY,
  rowLeft,
  rowVisualHeight,
  rowTop,
  rowTextTop,
  TEXT_LEFT,
} from './row-geometry.mjs';
import {
  caretGeometry,
  selectionRects,
  rowSelectionRects,
  selectionIntersectsText,
} from './text-geometry.mjs';
import { createTextStyle, withDraftText } from './text-style.mjs';
import { canvasGlyphGeometry, paintCanvasGlyph } from './canvas-glyph-geometry.mjs';
import { layoutTableContent } from './table-flow.mjs';
import { attachCreatedTableFlow, createdCellParagraph } from './created-table-flow.mjs';
import { projectCreatedCellDraft } from './created-cell-draft.mjs';
import { adjacentCell } from './table-navigation.mjs';
import {
  characterTogglePatch,
  characterSelectionState,
  characterRangesState,
} from './character-property-selection.mjs';
import { characterSizeState, characterSizeRangesState } from './character-size-selection.mjs';
import { paragraphSelectionRanges, paragraphSelectionText } from './paragraph-selection.mjs';
import { adjacentOwnedParagraph } from './paragraph-navigation.mjs';
import { paintUnderline } from './underline-paint.mjs';
import { paintNumberPrefix } from './number-prefix-paint.mjs';
import { createPictureResources } from './picture-resources.mjs';
import { createChartDisplayResources } from './chart-display-resources.mjs';
import { projectChartSeries } from './chart-series-data.mjs';
import { chartBarPrimitives } from './chart-bar-primitives.mjs';
import { previewChartLayers } from './chart-preview-layers.mjs';
import { paintChartPreview } from './chart-preview-paint.mjs';
import { inlinePictureIndex, picturePositionKey, paintInlinePicture } from './picture-inline.mjs';
import { inlinePictureRowPlacement } from './inline-picture-row-placement.mjs';
import { layoutHwp5MemoFallback } from './hwp5-memo-fallback-layout.mjs';
import { paintMemoPane } from './memo-pane-paint.mjs';
import { inlineChartIndex } from './chart-inline.mjs';
import { pageLayoutFailureSummary } from './page-layout-failure-summary.mjs';
import { projectDraftPictures } from './picture-draft.mjs';
import { previewPictureLayers } from './picture-layers.mjs';
import { pictureLayoutCoverage } from './picture-layout-coverage.mjs';
import { paintPictureQuad } from './picture-quad-paint.mjs';
import { previewLineLayers } from './line-layers.mjs';
import { paintLine } from './line-paint.mjs';
import { previewDrawingOutlineLayers } from './drawing-outline-layers.mjs';
import { paintDrawingOutline } from './drawing-outline-paint.mjs';
import { layoutPageContent } from './page-content-layout.mjs';
import { layoutHwp5PageContent } from './hwp5-page-layout.mjs';
import { HWP5_WINDOW_LAYOUT_SCOPE, layoutHwp5WindowContent } from './hwp5-window-page-layout.mjs';
import { projectDraftAnchoredObjects } from './anchored-object-draft.mjs';
import { projectDraftDrawings } from './drawing-draft.mjs';
import { paintRowTransform } from './row-transform-paint.mjs';
import { paintTabLeader } from './tab-leader-paint.mjs';
import { paintDrawingFill } from './drawing-fill-paint.mjs';
import { drawingFillOccluder } from './drawing-fill-occluder.mjs';
import { previewRectangleLayers } from './rectangle-layers.mjs';
import { paintEllipse } from './ellipse-paint.mjs';
import { paintCurve } from './curve-paint.mjs';
import { groupedPaintOrder } from './grouped-paint-order.mjs';
import { groupedLayoutCoverage } from './grouped-layout-coverage.mjs';
import { paintPagePaper } from './page-paper-paint.mjs';
import { paintPageNumberGlyphs } from './page-number-glyphs.mjs';
import { checkBoxProxyBoxes, hitCheckBoxProxy } from './checkbox-proxy-geometry.mjs';
import { paintCheckBoxProxy } from './checkbox-proxy-paint.mjs';
import { rowPageClipContains } from './row-page-clip.mjs';
import { inlineCheckBoxIndex, checkBoxPositionKey } from './checkbox-inline-layout.mjs';
import { paintSourceCheckBox } from './checkbox-source-paint.mjs';
export function createRenderer(
  canvas,
  viewportElement,
  spacer,
  onLayout = () => {},
  environment = {},
) {
  const realm = canvas.ownerDocument?.defaultView ?? globalThis;
  const requestAnimationFrame =
    environment.requestFrame ?? realm.requestAnimationFrame?.bind(realm);
  const cancelAnimationFrame = environment.cancelFrame ?? realm.cancelAnimationFrame?.bind(realm);
  const ResizeObserver = environment.ResizeObserver ?? realm.ResizeObserver;
  const setInterval = environment.setInterval ?? realm.setInterval.bind(realm);
  const clearInterval = environment.clearInterval ?? realm.clearInterval.bind(realm);
  const setTimeout = environment.setTimeout ?? realm.setTimeout.bind(realm);
  const clearTimeout = environment.clearTimeout ?? realm.clearTimeout.bind(realm);
  const createImageBitmap = environment.createImageBitmap ?? realm.createImageBitmap?.bind(realm);
  const Blob = environment.Blob ?? realm.Blob;
  const OffscreenCanvas = environment.OffscreenCanvas ?? realm.OffscreenCanvas;
  const viewport = viewportElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2DUnavailable');
  let content = { paragraphs: [], limited: false },
    layout = { rows: [], limited: false };
  let projectionDeferred = false;
  const paragraphLookup = createParagraphLookup();
  const evidenceDescriptor = Object.getOwnPropertyDescriptor(
    environment,
    'nativeGeometryEvidenceReader',
  );
  const evidenceReader = evidenceDescriptor?.value;
  const readGeometryEvidence = (evidence, value) => {
    const current = Object.getOwnPropertyDescriptor(environment, 'nativeGeometryEvidenceReader');
    if (
      typeof evidenceReader !== 'function' ||
      !current ||
      current.value !== evidenceReader ||
      current.writable !== evidenceDescriptor.writable ||
      current.configurable !== evidenceDescriptor.configurable ||
      current.enumerable !== evidenceDescriptor.enumerable
    )
      return undefined;
    return evidenceReader(evidence, value);
  };
  const nativeGeometry = createNativeGeometryDeps({
    readEvidence: readGeometryEvidence,
  });
  const canvasMeasurementPolicy = createCanvasMeasurementPolicy(ctx, realm);
  const measurementEpochDescriptor = Object.getOwnPropertyDescriptor(
    environment,
    'geometryMeasurementEpoch',
  );
  const measurementEpochReader = measurementEpochDescriptor?.value;
  const readMeasurementPolicy = () => {
    let explicitEpoch;
    if (measurementEpochReader !== undefined) {
      const current = Object.getOwnPropertyDescriptor(environment, 'geometryMeasurementEpoch');
      if (
        typeof measurementEpochReader !== 'function' ||
        !current ||
        current.value !== measurementEpochReader ||
        current.get ||
        current.set ||
        current.writable !== measurementEpochDescriptor.writable ||
        current.configurable !== measurementEpochDescriptor.configurable ||
        current.enumerable !== measurementEpochDescriptor.enumerable
      )
        return null;
      try {
        explicitEpoch = measurementEpochReader();
      } catch {
        return null;
      }
    }
    return canvasMeasurementPolicy.current(explicitEpoch);
  };
  let interactionRevision = 0,
    paintedInteractionStamp = null;
  const interactionStamp = () => [
    ...historySelectionStamp(interaction),
    interaction.historyPending === true,
    interaction.active === true,
    ...historySelectionStamp(interaction.composition),
  ];
  let geometryEvidence,
    measurementEpoch = 0;
  let draft = null,
    interaction = {},
    onGeometry = () => {},
    blink = 0,
    caretVisible = true;
  let resizeGuide = null;
  let displayOptions = DEFAULT_CANVAS_DISPLAY_OPTIONS;
  let viewScale = 1,
    closed = false;
  let selectedPicture = null;
  let pictureResizeSelection = null,
    pictureResizeGuide = null;
  let tableBackgroundReader = null;
  let resourceEpoch;
  let resourceDocument;
  let layoutGeneration = 0,
    resourceGeneration = 0,
    paintedStamp = null,
    holdingFrame = false;
  let paintedFrame = null,
    pictureWaitTimer = 0,
    pictureWaitExpired = false;
  const pictureWaitMs = environment.pictureWaitMs ?? 250;
  if (!Number.isFinite(pictureWaitMs) || pictureWaitMs < 0)
    throw new Error('InvalidPictureWaitTimeout');
  const stopPictureWait = () => {
    clearTimeout(pictureWaitTimer);
    pictureWaitTimer = 0;
  };
  let pictureReader = null,
    pictures = new Map();
  let chartReader = null;
  let chartLayers = {
      items: [],
      unavailable: [],
      pending: 0,
      total: 0,
      height: 0,
      exact: false,
      mode: 'preview-overlay',
    },
    paintedCharts = [];
  const paragraphFlowReuse = createParagraphFlowReuse();
  const chartResources = createChartDisplayResources({
    read: (section, wrapper) =>
      chartReader
        ? chartReader(section, wrapper)
        : Promise.reject(new Error('ChartDisplayReaderUnavailable')),
    onChange: () => {
      measurementEpoch++;
      paragraphFlowReuse.clear();
      reflow();
    },
  });
  let pictureLayers = { behind: [], front: [] };
  let paintedPictures = { behind: [], front: [] };
  let picturePaintOrder = [];
  let lineLayers = { behind: [], front: [], unavailable: [] };
  let drawingOutlineLayers = { behind: [], front: [], unavailable: [] };
  let paintedLineAnchors = new Set();
  let paintedCheckBoxes = [],
    checkBoxPaintScrollTop = null;
  let checkBoxPaintScrollLeft = null;
  let inlineCheckBoxes = new Map();
  let inlineForms = new Map();
  let paintedFormTargets = [];
  let pictureDecoder = (bytes) => createImageBitmap(new Blob([bytes]));
  const decodedResourceGeometry = createDecodedResourceGeometryEpoch(realm);
  const pictureResources = createPictureResources({
    read: (section, node) =>
      pictureReader
        ? pictureReader(section, node)
        : Promise.reject(new Error('PictureReaderUnavailable')),
    readBackground: (section, node) =>
      tableBackgroundReader
        ? tableBackgroundReader(section, node)
        : Promise.reject(new Error('TableBackgroundReaderUnavailable')),
    decodeIdentity: (source) =>
      source.kind === 'table-background'
        ? (tableBackgroundFillForSource(tableBorders, source.section, source.node).tone ?? null)
        : null,
    decode: (bytes, source) => {
      if (source.kind === 'table-background') {
        const tone = source.identity;
        if (tone)
          return decodeTableImageTone(bytes, tone, {
            decode: (value) => pictureDecoder(value),
            createSurface: (width, height) => new OffscreenCanvas(width, height),
          });
      }
      return pictureDecoder(bytes);
    },
    onChange: (section, node, kind) => {
      decodedResourceGeometry.observe(pictureResources.status(section, node, kind));
      resourceGeneration++;
      schedule();
    },
  });
  const pictureStatus = (section, node, kind = 'picture') => {
    const entry = pictureResources.status(section, node, kind);
    return entry?.refreshing ? { ...entry, bitmap: null } : entry;
  };
  let sourceObservationState = null;
  let ownedBodyDraftProjection = null;
  let display = content,
    pictureDisplay = content,
    fontAt = createTextStyle(content, FONT);
  let tableBorders = tableBorderPaintIndex(content);
  // Geometry is owned by reflow. A generation, rather than the mutable layout
  // object's identity or a deep copy, separates its model and painted versions.
  const frameStamp = (
    metrics = canvasViewportMetrics(
      viewportElement,
      viewScale,
      environment.devicePixelRatio?.() ?? realm.devicePixelRatio ?? 1,
    ),
  ) => {
    if (!metrics) return null;
    const bounds = canvas.getBoundingClientRect?.();
    return [
      layoutGeneration,
      resourceGeneration,
      content,
      display,
      layout,
      resourceEpoch,
      resourceDocument,
      metrics.scrollTop,
      metrics.scrollLeft,
      metrics.scale,
      metrics.width,
      metrics.height,
      metrics.ratio,
      metrics.pixelWidth,
      metrics.pixelHeight,
      canvas.width,
      canvas.height,
      canvas.style.width,
      canvas.style.height,
      bounds?.width,
      bounds?.height,
    ];
  };
  const isPaintedFrameCurrent = () => {
    if (closed || projectionDeferred || holdingFrame || !paintedStamp) return false;
    const current = frameStamp();
    return (
      current !== null && paintedStamp.every((value, index) => Object.is(value, current[index]))
    );
  };
  const stopBlink = () => {
    clearInterval(blink);
    blink = 0;
  };
  const publishLayoutDataset = () => {
    const windowFragment = pictureDisplay.format === 'hwp5' && Boolean(pictureDisplay.window);
    canvas.dataset.horizontalExtentError =
      canvasHorizontalExtent(layout.pages, viewport.clientWidth, TEXT_LEFT, viewScale) === null
        ? 'InvalidPageScrollExtent'
        : '';
    canvas.dataset.rows = String(layout.rows.length);
    canvas.dataset.pageLayoutError = layout.pageLayoutError ?? '';
    canvas.dataset.memoPaneCount = String(layout.memoPaneBoxes?.length ?? 0);
    canvas.dataset.memoPaneMode = layout.memoPaneMode ?? '';
    canvas.dataset.memoPaneError = layout.memoPaneError ?? '';
    canvas.dataset.pageLayoutFailure = layout.pageLayoutFailure
      ? JSON.stringify(layout.pageLayoutFailure)
      : '';
    canvas.dataset.pageLayoutTableNode =
      layout.pageLayoutTableNode === undefined ? '' : String(layout.pageLayoutTableNode);
    canvas.dataset.pageLayoutAnchorReason = layout.pageLayoutAnchorReason ?? '';
    canvas.dataset.pageLayoutPolicyReason = layout.pageLayoutPolicyReason ?? '';
    canvas.dataset.pageLayoutSourceCoverage = layout.sourceCoverage ?? '';
    canvas.dataset.pageLayoutUnverifiedDrawings = JSON.stringify(
      layout.unverifiedDrawingSources ?? [],
    );
    canvas.dataset.pageLayoutUnverifiedTables = JSON.stringify(layout.unverifiedTableSources ?? []);
    canvas.dataset.pageLayoutUnverifiedSections = JSON.stringify(
      layout.unverifiedSectionSources ?? [],
    );
    canvas.dataset.pageLayoutMode = layout.pageLayoutMode ?? 'logical-fallback';
    canvas.dataset.pageLayoutScope =
      layout.layoutScope ?? (windowFragment ? HWP5_WINDOW_LAYOUT_SCOPE : 'document-preview');
    canvas.dataset.documentPageNumbersExact =
      windowFragment || layout.documentPageNumbersExact === false ? 'false' : 'unverified';
    canvas.dataset.limited = String(layout.limited);
  };
  const prepareVisibleResources = (
    metrics = canvasViewportMetrics(
      viewportElement,
      viewScale,
      environment.devicePixelRatio?.() ?? realm.devicePixelRatio ?? 1,
    ),
  ) => {
    if (closed || !metrics) return { pendingPictures: [], resourcesPending: false };
    const wantedPictures = visiblePictureTargets(pictures, pictureLayers, layout.rows, {
      x: metrics.logicalScrollLeft,
      y: metrics.logicalScrollTop,
      width: metrics.logicalWidth,
      height: metrics.logicalHeight,
    });
    const backgrounds = tableBackgroundTargets(layout.boxes, tableBorders, {
      x: metrics.logicalScrollLeft,
      y: metrics.logicalScrollTop,
      width: metrics.logicalWidth,
      height: metrics.logicalHeight,
    });
    pictureResources.retain(wantedPictures, backgrounds.visible);
    const pendingPictures = [];
    for (const target of backgrounds.visible)
      pendingPictures.push(
        pictureResources.backgrounds.load(target.section, target.listNode).catch(() => {}),
      );
    layout.tableBackgroundCoverage = tableBackgroundCoverage(backgrounds, {
      status: (section, node) => pictureStatus(section, node, 'table-background'),
    });
    for (const picture of wantedPictures)
      pendingPictures.push(
        pictureResources.load(picture.section, picture.pictureNode).catch(() => {}),
      );
    layout.pictureCache = pictureResources.stats();
    const waiting = (entry) => entry && (entry.refreshing || (!entry.bitmap && !entry.error));
    const resourcesPending =
      wantedPictures.some((p) => waiting(pictureResources.get(p.section, p.pictureNode))) ||
      backgrounds.visible.some((p) =>
        waiting(pictureResources.backgrounds.get(p.section, p.listNode)),
      );
    return { pendingPictures, resourcesPending };
  };
  const paint = () => {
    if (closed) return;
    flushProjection(false);
    const paintInteractionRevision = interactionRevision;
    const paintInteractionStamp = interactionStamp();
    const paintSelection = interaction.historyPending ? {} : interaction;
    const metrics = canvasViewportMetrics(
      viewportElement,
      viewScale,
      environment.devicePixelRatio?.() ?? realm.devicePixelRatio ?? 1,
    );
    if (!metrics) return;
    // Every painter in this frame receives the same logical scroll origin.
    const viewport = { scrollTop: metrics.logicalScrollTop };
    checkBoxPaintScrollTop = viewportElement.scrollTop;
    checkBoxPaintScrollLeft = viewportElement.scrollLeft ?? 0;
    const { logicalWidth: width, logicalHeight: height, ratio, pixelWidth, pixelHeight } = metrics;
    const { pendingPictures, resourcesPending } = prepareVisibleResources(metrics);
    // Keep the last complete frame until the visible sources have been checked.
    // In particular, never erase a picture while an unchanged payload is read
    // again after a text operation. Failed sources settle and paint diagnostics.
    canvas.dataset.picturePending = String(Boolean(resourcesPending));
    if (resourcesPending && !pictureWaitExpired) {
      holdingFrame = true;
      canvas.dataset.paintPending = 'true';
      if (!pictureWaitTimer)
        pictureWaitTimer = setTimeout(() => {
          pictureWaitTimer = 0;
          // This is a frame latency budget, never a resource failure deadline.
          // Valid slow reads/decodes keep their slots and publish normally later.
          pictureWaitExpired = true;
          schedule();
        }, pictureWaitMs);
      Promise.all(pendingPictures).then(schedule);
      return;
    }
    stopPictureWait();
    holdingFrame = false;
    if (!resourcesPending) pictureWaitExpired = false;
    canvas.dataset.paintPending = 'false';
    paintedStamp = null;
    paintedInteractionStamp = null;
    paintedCharts = [];
    let paintedParagraphMarks = 0;
    const paintedForms = new Set();
    paintedFormTargets = [];
    paintedCheckBoxes = [];
    checkBoxPaintScrollTop = null;
    checkBoxPaintScrollLeft = null;
    paintedPictures = { behind: [], front: [] };
    picturePaintOrder = [];
    canvas.style.width = `${metrics.width}px`;
    canvas.style.height = `${metrics.height}px`;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(ratio * metrics.scale, 0, 0, ratio * metrics.scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(-metrics.logicalScrollLeft, 0);
    paintPagePaper(ctx, layout.pages, viewport.scrollTop, width, height);
    const paintPendingPicture = (item, x, y, pending) => {
      if (!pending) return;
      ctx.save();
      try {
        ctx.fillStyle = '#eef2f5';
        ctx.fillRect(x, y, item.width, item.height);
        ctx.strokeStyle = '#9aa9b5';
        ctx.strokeRect(x, y, item.width, item.height);
        ctx.beginPath();
        ctx.rect(x, y, item.width, item.height);
        ctx.clip();
        ctx.fillStyle = '#536574';
        ctx.font = '12px sans-serif';
        ctx.fillText('그림 불러오는 중', x + 4, y + Math.min(16, item.height));
      } finally {
        ctx.restore();
      }
    };
    paintMemoPane(ctx, layout.memoPaneBoxes, viewport.scrollTop, height);
    paintPageNumberGlyphs(ctx, layout.pageNumberGlyphs, viewport.scrollTop, (glyph) =>
      fontAt(
        display.paragraphs.find(
          (p) => p.section === glyph.section && p.paragraph === glyph.paragraph,
        ),
        glyph.unit,
      ),
    );
    const rectangleLayers = previewRectangleLayers(pictureDisplay, layout);
    const groupCommands = groupedPaintOrder(pictureDisplay, layout, rectangleLayers, pictureLayers);
    const groupTextKeys = new Set(
      groupCommands
        .filter((c) => c.kind === 'text' || c.kind === 'curve')
        .map((c) => `${c.section}:${c.node}`),
    );
    const recordFill = (item) => {
      const occluder = drawingFillOccluder(item);
      if (occluder) picturePaintOrder.push({ kind: 'occluder', item: occluder });
    };
    const paintRectangles = (list) => {
      for (const item of list) {
        if (paintDrawingFill(ctx, item, viewport.scrollTop)) recordFill(item);
        paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
      }
    };
    paintRectangles(rectangleLayers.behind);
    for (const item of (layout.placedEllipses ?? [])
      .filter((p) => p.layer === 'behind')
      .toSorted((a, b) => a.zOrder - b.zOrder))
      paintEllipse(ctx, item, viewport.scrollTop);
    for (const item of (layout.placedCurves ?? [])
      .filter((p) => p.layer === 'behind')
      .toSorted((a, b) => a.zOrder - b.zOrder || a.childOrder - b.childOrder))
      paintCurve(ctx, item, viewport.scrollTop);
    const paintPictures = (list, behind = false) => {
      for (const item of list) {
        const resource = pictureStatus(item.picture.section, item.picture.pictureNode),
          bitmap = resource?.bitmap;
        const visual = item.visualBounds ?? item;
        if (visual.y + visual.height < viewport.scrollTop || visual.y > viewport.scrollTop + height)
          continue;
        if (!bitmap) {
          paintRowTransform(ctx, item, viewport.scrollTop, () =>
            paintPendingPicture(item, item.x, item.y - viewport.scrollTop, resource?.refreshing),
          );
          continue;
        }
        try {
          let painted = false;
          paintRowTransform(ctx, item, viewport.scrollTop, () => {
            painted =
              item.paintPlan.state === 'quad'
                ? paintPictureQuad(ctx, bitmap, item.picture, item.paintPlan.corners, {
                    x: item.paintOrigin?.x ?? item.x,
                    y: (item.paintOrigin?.y ?? item.y) - viewport.scrollTop,
                  })
                : paintInlinePicture(ctx, bitmap, item, item.x, item.y - viewport.scrollTop);
          });
          if (painted) {
            paintedPictures[behind ? 'behind' : 'front'].push(item);
            picturePaintOrder.push({ kind: 'picture', item, behind });
          }
        } catch {
          /* 개별 그림 실패는 텍스트를 차단하지 않습니다. */
        }
      }
    };
    paintPictures(pictureLayers.behind, true);
    for (const separator of layout.noteSeparators ?? []) {
      const top = separator.y - viewport.scrollTop;
      if (top + separator.height < 0 || top > height) continue;
      paintNoteSeparator(ctx, separator, viewport.scrollTop);
    }
    for (const item of lineLayers.behind)
      paintLine(ctx, item.line, item.origin, viewport.scrollTop);
    for (const item of drawingOutlineLayers.behind)
      paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
    for (const drawing of layout.placedDrawings ?? []) {
      if (groupTextKeys.has(`${drawing.section}:${drawing.drawingNode}`)) continue;
      paintDrawingFill(ctx, drawing, viewport.scrollTop);
    }
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#7c8c99';
    layout.tableBorderCoverage = {
      none: 0,
      source: 0,
      proxy: 0,
      unavailableCount: 0,
      unavailable: [],
    };
    const paintTableBox = (box) => {
      const top = box.y - viewport.scrollTop;
      const visual = tableBoxPaintBounds(box);
      if (
        !visual ||
        visual.y + visual.height < viewport.scrollTop ||
        visual.y > viewport.scrollTop + height
      )
        return;
      ctx.save();
      try {
        ctx.fillStyle = '#7c8c99';
        const border = tableBorderPlanForBox(tableBorders, box);
        const backgroundResource =
          border.fill?.state === 'image'
            ? pictureStatus(box.section, box.listNode, 'table-background')
            : null;
        const bitmap = backgroundResource?.bitmap;
        if (backgroundResource?.refreshing)
          paintRowTransform(ctx, box, viewport.scrollTop, () =>
            paintPendingPicture(box, box.x, top, true),
          );
        if (border.state !== 'proxy') {
          if (border.state === 'unavailable') {
            // A known cell background is independent of an unsupported edge type.
            if (border.fill)
              paintRowTransform(ctx, box, viewport.scrollTop, () =>
                paintTableBackground(ctx, box, border.fill, viewport.scrollTop, bitmap),
              );
            layout.tableBorderCoverage.unavailableCount++;
            if (layout.tableBorderCoverage.unavailable.length < 100)
              layout.tableBorderCoverage.unavailable.push({
                section: box.section,
                tableNode: box.tableNode,
                listNode: box.listNode,
                error: border.error,
              });
          } else if (
            paintRowTransform(ctx, box, viewport.scrollTop, () =>
              paintTableBorder(ctx, box, border, viewport.scrollTop, { bitmap }),
            )
          ) {
            layout.tableBorderCoverage[border.state === 'none' ? 'none' : 'source']++;
          }
          return;
        }
        layout.tableBorderCoverage.proxy++;
        paintRowTransform(ctx, box, viewport.scrollTop, () => {
          ctx.fillRect(box.x, top, box.width, 1);
          ctx.fillRect(box.x, top + box.height - 1, box.width, 1);
          ctx.fillRect(box.x, top, 1, box.height);
          ctx.fillRect(box.x + box.width - 1, top, 1, box.height);
        });
      } finally {
        ctx.restore();
      }
    };
    ctx.fillStyle = '#bad9f4';
    if (resizeGuide) {
      ctx.fillStyle = '#145b96';
      ctx.fillRect(
        resizeGuide.x + resizeGuide.width,
        resizeGuide.y - viewport.scrollTop,
        2,
        resizeGuide.height,
      );
      ctx.fillRect(
        resizeGuide.x,
        resizeGuide.y + resizeGuide.height - viewport.scrollTop,
        resizeGuide.width,
        2,
      );
      ctx.fillStyle = '#bad9f4';
    }
    const displayRanges = paragraphSelectionRanges(
      content.paragraphs,
      paintSelection.anchor,
      paintSelection.focus,
      undefined,
      { sourcePositions: false },
    );
    const chartPaintFailures = [],
      chartAnnotations = [];
    if (!draft)
      for (const item of chartLayers.items) {
        if (item.y + item.height <= viewport.scrollTop || item.y >= viewport.scrollTop + height)
          continue;
        try {
          if (
            paintChartPreview(ctx, item, viewport.scrollTop, (summary) =>
              chartAnnotations.push({
                section: item.target.section,
                wrapper: item.target.wrapper,
                ...summary,
              }),
            )
          )
            paintedCharts.push(item);
          else
            chartPaintFailures.push({
              section: item.target.section,
              wrapper: item.target.wrapper,
              reason: 'ChartPreviewPaintUnavailable',
            });
        } catch (error) {
          chartPaintFailures.push({
            section: item.target.section,
            wrapper: item.target.wrapper,
            reason: error?.message || 'ChartPreviewPaintFailed',
          });
        }
      }
    const sourceSpacing = paintedCharts.filter(
      (item) =>
        item.primitives.spacing?.gap_width_defaulted === false &&
        item.primitives.spacing?.overlap_defaulted === false,
    ).length;
    const sourcePagePlacement =
      layout.pageLayoutMode === 'measured-chart-body' &&
      layout.chartWrapReservations?.length > 0 &&
      layout.chartWrapReservations.length === paintedCharts.length &&
      chartLayers.pending === 0 &&
      !chartLayers.unavailable.length &&
      !chartPaintFailures.length;
    layout.chartCoverage = {
      total: chartLayers.total,
      pending: chartLayers.pending,
      drawn: paintedCharts.length,
      sourceSpacing,
      sourcePagePlacement,
      warnings: paintedCharts.map((item) => ({
        section: item.target.section,
        wrapper: item.target.wrapper,
        codes: [...new Set(item.primitives.warnings ?? [])],
      })),
      unavailable: [...chartLayers.unavailable, ...chartPaintFailures],
      annotations: chartAnnotations,
      exact: false,
      mode: 'preview-overlay',
    };
    canvas.dataset.chartPreviewCount = String(paintedCharts.length);
    canvas.dataset.chartPreviewMode = 'preview-overlay';
    canvas.dataset.chartPagePlacement = sourcePagePlacement ? 'source' : 'preview';
    const paintedChartAnchors = new Set(
      paintedCharts.map((item) =>
        picturePositionKey(item.target.section, item.target.paragraph, item.target.anchorUnit),
      ),
    );
    const shadowInsets = pictureLayers.inlineShadowInsets ?? { top: 0, bottom: 0 };
    const first = layout.spatialRows
      ? 0
      : Math.max(0, rowAtY(layout, viewport.scrollTop - shadowInsets.bottom));
    const paintParagraphLookup =
      ownedBodyDraftProjection?.beginFrame() ??
      createStatePaintParagraphLookup(display.paragraphs, sourceObservationState, display);
    const paintTextRow = (row, i) => {
      if (row.kind === 'gap') return;
      if (
        row.transform === undefined &&
        rowTop(row, i) - shadowInsets.top >= viewport.scrollTop + height
      )
        return;
      if (
        row.transform === undefined &&
        rowTop(row, i) + rowVisualHeight(row) + shadowInsets.bottom <= viewport.scrollTop
      )
        return;
      paintRowTransform(ctx, row, viewport.scrollTop, () => {
        ctx.fillStyle = '#bad9f4';
        for (const r of rowSelectionRects(
          row,
          i,
          paintSelection.anchor,
          paintSelection.focus,
          displayRanges,
        ))
          ctx.fillRect(r.x, r.y - viewport.scrollTop, r.width, r.height);
        ctx.font = FONT;
        ctx.fillStyle = row.kind === 'label' ? '#526d80' : '#172b3b';
        if (row.kind === 'text') {
          const paragraph =
            createdCellParagraph(layout, row) ?? paintParagraphLookup.find(display.paragraphs, row);
          paintNumberPrefix(ctx, row, i, paragraph, fontAt, viewport.scrollTop);
          // Draw with the same grapheme advances used for hit-testing.
          for (let b = 0; b < row.boundaries.length - 1; b++) {
            const start = row.boundaries[b],
              end = row.boundaries[b + 1];
            if (
              row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit) === '\ufffc' &&
              paintedChartAnchors.has(picturePositionKey(row.section, row.paragraph, start.unit))
            )
              continue;
            if (
              layout.groupReservations?.some(
                (group) =>
                  group.section === row.section &&
                  group.paragraph === row.paragraph &&
                  group.anchorUnit === start.unit,
              )
            )
              continue;
            if (
              layout.placedEllipses?.some(
                (p) =>
                  p.paintPlan.state === 'planned' &&
                  p.section === row.section &&
                  p.paragraph === row.paragraph &&
                  p.anchorUnit === start.unit,
              )
            )
              continue;
            if (
              layout.placedCurves?.some(
                (p) =>
                  p.paintPlan.state === 'planned' &&
                  p.section === row.section &&
                  p.hostParagraph === row.paragraph &&
                  p.anchorUnit === start.unit,
              )
            )
              continue;
            if (
              [...rectangleLayers.behind, ...rectangleLayers.front].some(
                (item) =>
                  item.drawing.source.group_context === null &&
                  item.drawing.section === row.section &&
                  item.drawing.hostParagraph === row.paragraph &&
                  item.drawing.anchorUnit === start.unit,
              ) ||
              row.inlineTables?.some((table) => table.unit === start.unit) ||
              layout.placedDrawings?.some(
                (d) =>
                  d.section === row.section &&
                  d.hostParagraph === row.paragraph &&
                  d.anchorUnit === start.unit,
              ) ||
              layout.flowPictures?.some(
                (p) =>
                  p.section === row.section &&
                  p.paragraph === row.paragraph &&
                  p.anchorUnit === start.unit,
              )
            )
              continue;
            ctx.font = fontAt(paragraph, start.unit);
            ctx.fillStyle = fontAt.color(paragraph, start.unit) ?? '#172b3b';
            const text = displayRunText(
              row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit),
              paragraph,
              start.unit,
              'text',
              row.pageNumber,
            );
            const x = rowLeft(row) + start.x,
              y = rowTop(row, i) - viewport.scrollTop + rowTextTop(row);
            let glyphMetrics;
            const glyphY = y + (fontAt.script(paragraph, start.unit)?.offset ?? 0);
            const form = inlineForms.get(formPositionKey(row.section, row.paragraph, start.unit));
            if (
              form &&
              row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit) === '\ufffc' &&
              paintHwp5Form(ctx, form, x, y)
            ) {
              paintedForms.add(formPositionKey(row.section, row.paragraph, start.unit));
              // Transformed rows need transformed hit geometry before editing.
              if (row.transform === undefined) {
                const target = {
                  form,
                  row,
                  x,
                  y: y + viewport.scrollTop,
                  width: form.width,
                  height: form.height,
                };
                paintedFormTargets.push(target);
                if (form.checkBox)
                  paintedCheckBoxes.push({
                    ...target,
                    pageClip: row.pageClip,
                    checkBox: form.checkBox,
                    sourceSized: true,
                  });
              }
              continue;
            }
            const equation = equationPaintAt(paragraph, start.unit);
            if (equation) {
              ctx.save();
              try {
                if (equation.color) ctx.fillStyle = equation.color;
                paintEquation(
                  ctx,
                  equation.plan,
                  equation.layout,
                  equation.family,
                  x,
                  y + equation.layout.box.ascent,
                );
              } finally {
                ctx.restore();
              }
              continue;
            }
            const dutmal = dutmalAt(paragraph, start.unit);
            if (
              dutmal &&
              paintDutmal(
                ctx,
                dutmalPaintPlan(
                  dutmal,
                  ctx.font,
                  fontAt.textHeight(paragraph, start.unit),
                  (value, font) => {
                    ctx.save();
                    try {
                      ctx.font = font;
                      return ctx.measureText(value).width;
                    } finally {
                      ctx.restore();
                    }
                  },
                ),
                x,
                y,
              )
            )
              continue;
            const picture = pictures.get(
              picturePositionKey(row.section, row.paragraph, start.unit),
            );
            const inlinePlacement = picture && inlinePictureRowPlacement(picture, row, i);
            if (picture && inlinePlacement.state === 'placed') {
              const x = inlinePlacement.origin.x,
                y = inlinePlacement.origin.y - viewport.scrollTop;
              const resource = pictureStatus(picture.picture.section, picture.picture.pictureNode),
                bitmap = resource?.bitmap;
              if (resource?.refreshing) {
                paintPendingPicture(picture, x, y, true);
                continue;
              }
              if (bitmap) {
                try {
                  const painted =
                    picture.paintPlan.state === 'quad'
                      ? paintPictureQuad(ctx, bitmap, picture.picture, picture.paintPlan.corners, {
                          x,
                          y,
                        })
                      : paintInlinePicture(ctx, bitmap, picture, x, y);
                  if (painted) {
                    const item = {
                      ...picture,
                      x,
                      y: y + viewport.scrollTop,
                      paintOrigin: { x, y: y + viewport.scrollTop },
                      transform: row.transform,
                      pageClip: row.pageClip,
                    };
                    paintedPictures.front.push(item);
                    picturePaintOrder.push({ kind: 'picture', item });
                    continue;
                  }
                } catch {
                  /* 표시 실패 시 보호 표식을 유지합니다. */
                }
              }
            }
            if (
              text === '\ufffc' &&
              paintedCharts.some(
                (item) =>
                  item.target.section === row.section &&
                  item.target.paragraph === row.paragraph &&
                  item.target.anchorUnit === start.unit,
              )
            )
              continue;
            const paintedLine =
              row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit) === '\ufffc' &&
              paintedLineAnchors.has(picturePositionKey(row.section, row.paragraph, start.unit));
            if (inlineCheckBoxes.get(checkBoxPositionKey(row.section, row.paragraph, start.unit)))
              continue;
            if (!paintedLine) {
              const shade = fontAt.shade(paragraph, start.unit);
              const selected = selectionIntersectsText(
                row,
                start.unit,
                end.unit,
                paintSelection.anchor,
                paintSelection.focus,
                displayRanges,
              );
              if (shade && !selected && text !== '\ufffc') {
                ctx.save();
                ctx.fillStyle = shade;
                ctx.fillRect(x, glyphY, end.x - start.x, fontAt.fontHeight(paragraph, start.unit));
                ctx.restore();
              }
              const relief = fontAt.relief(paragraph, start.unit);
              if (row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit) === '\t') {
                const tab = row.tabPlacements?.find(
                  (tab) => tab.unit === start.unit && tab.state === 'placed',
                );
                if (tab)
                  paintTabLeader(
                    ctx,
                    tab.leader,
                    x,
                    end.x - start.x,
                    glyphY,
                    fontAt.fontHeight(paragraph, start.unit),
                    ctx.fillStyle,
                  );
              }
              const geometry = canvasGlyphGeometry(
                ctx,
                fontAt,
                paragraph,
                start.unit,
                'text',
                text,
              );
              glyphMetrics = geometry.metrics;
              paintCanvasGlyph(ctx, geometry, x, glyphY, (paintX, paintY, glyphText = text) => {
                if (relief) paintCharacterRelief(ctx, relief, glyphText, paintX, paintY);
                else if (
                  !paintCharacterOutline(
                    ctx,
                    fontAt.outlineStyle(paragraph, start.unit),
                    glyphText,
                    paintX,
                    paintY,
                  )
                )
                  ctx.fillText(glyphText, paintX, paintY);
              });
            }
            const underline = fontAt.underline(paragraph, start.unit);
            if (underline)
              paintUnderline(
                ctx,
                underline,
                x,
                end.x - start.x,
                glyphY,
                glyphMetrics ?? ctx.measureText(text),
                fontAt.fontHeight(paragraph, start.unit),
                rowLeft(row),
              );
            const strike = fontAt.strike(paragraph, start.unit);
            if (strike)
              paintUnderline(
                ctx,
                strike,
                x,
                end.x - start.x,
                glyphY,
                glyphMetrics ?? ctx.measureText(text),
                fontAt.fontHeight(paragraph, start.unit),
                rowLeft(row),
              );
          }
          if (
            displayOptions.paragraphMarks &&
            paintParagraphMark(ctx, paragraphMarkPlan(row, i, paragraph), viewport.scrollTop)
          )
            paintedParagraphMarks++;
        } else
          ctx.fillText(
            row.text,
            rowLeft(row),
            rowTop(row, i) - viewport.scrollTop + rowTextTop(row),
          );
      });
    };
    const sceneRows = [...layout.rows, ...(layout.repeatedTableHeaderRows ?? [])];
    for (const command of tablePaintScene(
      [...(layout.boxes ?? []), ...(layout.repeatedTableHeaderBoxes ?? [])],
      sceneRows,
      first,
    )) {
      if (command.kind === 'box') {
        paintTableBox(command.item);
        continue;
      }
      const row = command.item,
        i = command.index;
      if (groupTextKeys.has(`${row.section}:${row.drawingNode}`)) continue;
      paintTextRow(row, i);
    }
    for (const prefix of layout.hostNumberPrefixes ?? []) {
      if (prefix.y >= viewport.scrollTop + height || prefix.y + prefix.height <= viewport.scrollTop)
        continue;
      const paragraph = display.paragraphs.find(
        (p) => p.section === prefix.section && p.paragraph === prefix.paragraph,
      );
      ctx.fillStyle = '#172b3b';
      paintRowTransform(ctx, prefix, viewport.scrollTop, () =>
        paintNumberPrefix(ctx, prefix, 0, paragraph, fontAt, viewport.scrollTop),
      );
    }
    paintPictures(
      pictureLayers.front.filter((item) => !groupCommands.some((c) => c.item === item)),
    );
    paintRectangles(
      rectangleLayers.front.filter((item) => !groupCommands.some((c) => c.item === item)),
    );
    for (const item of (layout.placedEllipses ?? [])
      .filter((p) => p.layer === 'front')
      .toSorted((a, b) => a.zOrder - b.zOrder))
      paintEllipse(ctx, item, viewport.scrollTop);
    for (const command of groupCommands) {
      if (command.kind === 'rectangle') paintRectangles([command.item]);
      else if (command.kind === 'picture') paintPictures([command.item]);
      else if (command.kind === 'curve') {
        paintCurve(ctx, command.item, viewport.scrollTop);
        for (const [i, row] of layout.rows.entries())
          if (row.section === command.section && row.drawingNode === command.node)
            paintTextRow(row, i);
      } else {
        if (paintDrawingFill(ctx, command.item, viewport.scrollTop)) recordFill(command.item);
        for (const [i, row] of layout.rows.entries())
          if (row.section === command.section && row.drawingNode === command.node)
            paintTextRow(row, i);
        for (const item of drawingOutlineLayers.front)
          if (item.drawing.section === command.section && item.drawing.drawingNode === command.node)
            paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
      }
    }
    for (const item of lineLayers.front) paintLine(ctx, item.line, item.origin, viewport.scrollTop);
    for (const item of drawingOutlineLayers.front)
      if (!groupTextKeys.has(`${item.drawing.section}:${item.drawing.drawingNode}`))
        paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
    for (const box of checkBoxProxyBoxes(pictureDisplay, layout)) {
      if (
        paintRowTransform(ctx, box, viewport.scrollTop, () =>
          box.sourceSized
            ? paintSourceCheckBox(ctx, box, viewport.scrollTop)
            : paintCheckBoxProxy(ctx, box, viewport.scrollTop),
        )
      )
        paintedCheckBoxes.push(box);
    }
    let paintedCaret = '';
    if (
      !interaction.historyPending &&
      interaction.active &&
      (caretVisible || interaction.composition)
    ) {
      const caret = caretGeometry(layout, interaction.composition?.focus ?? paintSelection.focus);
      if (caret) {
        ctx.fillStyle = '#145b96';
        const r = caret.paintGeometry ?? caret;
        paintRowTransform(ctx, r, viewport.scrollTop, () =>
          ctx.fillRect(r.x, r.y - viewport.scrollTop, 2, r.height),
        );
        const point = interaction.composition?.focus ?? paintSelection.focus;
        paintedCaret = `${point.section}:${point.paragraph}:${point.unit}`;
      }
    }
    if (!interaction.historyPending && interaction.composition) {
      ctx.fillStyle = '#145b96';
      for (const r of selectionRects(
        layout,
        interaction.composition.anchor,
        interaction.composition.focus,
      ))
        paintRowTransform(ctx, r, viewport.scrollTop, () =>
          ctx.fillRect(r.x, r.y + r.height + 1 - viewport.scrollTop, r.width, 1),
        );
    }
    if (selectedPicture) {
      const item = [...paintedPictures.front, ...paintedPictures.behind].find(
        (value) =>
          value.picture.section === selectedPicture.section &&
          value.picture.pictureNode === selectedPicture.pictureNode,
      );
      if (item)
        paintRowTransform(ctx, item, viewport.scrollTop, () =>
          paintPictureSelection(ctx, item, viewport.scrollTop),
        );
    }
    const resize = pictureResizeSelection?.();
    if (resize) {
      paintRowTransform(ctx, { pageClip: resize.pageClip }, viewport.scrollTop, () => {
        ctx.fillStyle = '#145b96';
        for (const handle of pictureResizeHandles(resize))
          ctx.fillRect(handle.point[0] - 4, handle.point[1] - viewport.scrollTop - 4, 8, 8);
      });
    }
    if (pictureResizeGuide) {
      const { basis, size } = pictureResizeGuide;
      const x =
        basis.origin[0] +
        (basis.x[0] * size.width) / basis.width +
        (basis.y[0] * size.height) / basis.height;
      const y =
        basis.origin[1] +
        (basis.x[1] * size.width) / basis.width +
        (basis.y[1] * size.height) / basis.height;
      paintRowTransform(ctx, { pageClip: basis.pageClip }, viewport.scrollTop, () => {
        ctx.fillStyle = '#145b96';
        ctx.fillRect(x - 3, y - viewport.scrollTop - 3, 6, 6);
      });
    }
    canvas.dataset.paintedCaret = paintedCaret;
    canvas.dataset.paragraphMarks = String(displayOptions.paragraphMarks);
    canvas.dataset.paragraphMarkCount = String(paintedParagraphMarks);
    paintedFrame = {
      layout,
      content: display,
      resourceDocument,
      resourceEpoch,
      scrollTop: viewport.scrollTop,
      displayOptions,
      paragraphMarkCount: paintedParagraphMarks,
      caret: paintedCaret,
      selection:
        paintSelection.anchor && paintSelection.focus
          ? { anchor: { ...paintSelection.anchor }, focus: { ...paintSelection.focus } }
          : null,
    };
    publishLayoutDataset();
    paintedStamp = frameStamp(metrics);
    onGeometry();
    layout.rectangleCoverage = rectangleLayers;
    layout.groupCoverage = groupedLayoutCoverage(
      pictureDisplay,
      layout,
      rectangleLayers,
      pictureLayers,
      lineLayers,
    );
    layout.checkBoxCoverage = {
      sourceSized: paintedCheckBoxes.filter((box) => box.sourceSized).length,
      proxy: paintedCheckBoxes.filter((box) => !box.sourceSized).length,
      unavailable: inlineCheckBoxes.unavailable,
    };
    const formTextInputCandidates = new Set(
      paintedFormTargets
        .filter(
          (target) =>
            (content.hwp5FormTextEditAvailable === true &&
              ['edit', 'combo_box'].includes(target.form.form.source.kind)) ||
            target.form.checkBox?.editable === true,
        )
        .map((target) => `${target.form.form.section}:${target.form.form.formNode}`),
    ).size;
    layout.hwp5FormCoverage = {
      painted: paintedForms.size,
      available: [...inlineForms.values()].filter(Boolean).length,
      unavailable: inlineForms.unavailable ?? [],
      readOnly: formTextInputCandidates === 0,
      inputCandidates: formTextInputCandidates,
      frozenAutoSize: [...inlineForms.values()].filter((form) => form?.sourceAutoSize).length,
    };
    layout.pictureCoverage = pictureLayoutCoverage(
      pictureDisplay,
      pictures,
      pictureLayers,
      pictureStatus,
    );
    onLayout(layout, content);
    // 알림·후처리까지 성공한 프레임만 다음 입력의 근거로 게시합니다.
    paintedInteractionStamp =
      interactionRevision === paintInteractionRevision ? paintInteractionStamp : null;
  };
  let frame = 0;
  const schedule = () => {
    if (!closed && !frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
  };
  const reflow = ({ scrollOrigin = null, scheduleFrame = true } = {}) => {
    layoutGeneration++;
    paintedCharts = [];
    paintedCheckBoxes = [];
    checkBoxPaintScrollTop = null;
    paintedPictures = { behind: [], front: [] };
    picturePaintOrder = [];
    ctx.font = FONT;
    ownedBodyDraftProjection = null;
    display = draft?.createdCell
      ? projectCreatedCellDraft(content, draft)
      : draft
        ? {
            ...content,
            paragraphs: (ownedBodyDraftProjection = createOwnedBodyDraftProjection(
              content.paragraphs,
              (p) =>
                p.section === draft.section && p.paragraph === draft.paragraph
                  ? {
                      ...withDraftText(p, draft.text),
                      ...(Array.isArray(draft.characterRanges)
                        ? { characterRanges: draft.characterRanges }
                        : {}),
                    }
                  : p,
              sourceObservationState,
              content,
            )).paragraphs,
          }
        : content;
    fontAt = createTextStyle(display, FONT, { projectionMemo: true });
    tableBorders = tableBorderPaintIndex(display);
    pictureDisplay = {
      ...display,
      pictures: projectDraftPictures(content, draft),
      lines: projectDraftAnchoredObjects(content, content.lines, draft),
      drawings: projectDraftDrawings(content, draft),
      rectangles: projectDraftDrawings({ ...content, drawings: content.rectangles }, draft),
      checkBoxes: projectDraftAnchoredObjects(content, content.checkBoxes, draft, 'siteState'),
    };
    pictures = inlinePictureIndex(pictureDisplay);
    const inlineCharts = inlineChartIndex(pictureDisplay, (section, wrapper) =>
      chartResources.status(section, wrapper),
    );
    inlineCheckBoxes = inlineCheckBoxIndex(pictureDisplay);
    inlineForms = inlineHwp5FormIndex(pictureDisplay, { draft });
    const measure = createPreviewTextMeasure(ctx, fontAt, {
      pictures,
      charts: inlineCharts,
      checkBoxes: inlineCheckBoxes,
      forms: inlineForms,
      projectionMemo: true,
      stableContext: true,
    });
    const nativeScope = nativeGeometry.prepare(content, geometryEvidence, {
      width: viewport.clientWidth,
      scale: viewScale,
      dpr: environment.devicePixelRatio?.() ?? realm.devicePixelRatio ?? 1,
      fontEpoch: measurementEpoch,
      decodedResourceEpoch: decodedResourceGeometry.value,
      fontKey: FONT,
      textBoundaryIdentity: currentTextBoundaryIdentity(),
      measurementPolicy: readMeasurementPolicy(),
    });
    if (nativeScope) {
      paragraphFlowReuse.beginNative(nativeScope);
      measure.paragraphFlowReuse = paragraphFlowReuse;
    } else paragraphFlowReuse.clear();
    const windowFragment = pictureDisplay.format === 'hwp5' && Boolean(pictureDisplay.window);
    const pageLayout =
      pictureDisplay.format === 'hwp5'
        ? (windowFragment ? layoutHwp5WindowContent : layoutHwp5PageContent)(
            pictureDisplay,
            measure,
          )
        : layoutPageContent(pictureDisplay, measure, undefined, {
            chartDisplay: (section, wrapper) => chartResources.status(section, wrapper),
          });
    const logicalWidth = Math.max(1, viewport.clientWidth / viewScale - 2 * TEXT_LEFT);
    const fallbackLayout =
      pictureDisplay.format === 'hwp5' && pictureDisplay.hwp5Memos?.length
        ? layoutHwp5MemoFallback
        : layoutTableContent;
    layout =
      pageLayout.state === 'paginated'
        ? pageLayout
        : {
            ...fallbackLayout(pictureDisplay, logicalWidth, measure),
            pageLayoutFailure: pageLayoutFailureSummary(pageLayout),
            pageLayoutError: pageLayout.error,
            pageLayoutTableNode: pageLayout.tableNode,
            pageLayoutAnchorReason: pageLayout.anchorReason,
            pageLayoutPolicyReason: pageLayout.policyReason,
          };
    layout = attachCreatedTableFlow(pictureDisplay, layout, measure);
    pictureLayers = previewPictureLayers(pictureDisplay, layout, logicalWidth);
    chartLayers = previewChartLayers(content, layout, logicalWidth, (section, wrapper) =>
      chartResources.status(section, wrapper),
    );
    lineLayers = previewLineLayers(pictureDisplay, layout, logicalWidth);
    drawingOutlineLayers = previewDrawingOutlineLayers(pictureDisplay, layout);
    layout.drawingOutlineCoverage = {
      placed: drawingOutlineLayers.behind.length + drawingOutlineLayers.front.length,
      unavailable: drawingOutlineLayers.unavailable,
    };
    paintedLineAnchors = new Set(
      [...lineLayers.behind, ...lineLayers.front].map(({ line }) =>
        picturePositionKey(line.section, line.paragraph, line.anchorUnit),
      ),
    );
    layout.lineCoverage = {
      placed: lineLayers.behind.length + lineLayers.front.length,
      unavailable: lineLayers.unavailable,
    };
    layout.pictureCoverage = pictureLayoutCoverage(pictureDisplay, pictures, pictureLayers);
    // Canvas occupies the viewport itself; the spacer adds only extra scroll.
    spacer.style.height = `${Math.max(0, Math.max(pictureLayers.height, lineLayers.height, drawingOutlineLayers.height, chartLayers.height) * viewScale - viewport.clientHeight)}px`;
    const horizontalExtent = canvasHorizontalExtent(
      layout.pages,
      viewport.clientWidth,
      TEXT_LEFT,
      viewScale,
    );
    let chartRight = viewport.clientWidth;
    for (const item of chartLayers.items)
      chartRight = Math.max(chartRight, (item.x + item.width + TEXT_LEFT) * viewScale);
    const memoRight =
      layout.memoPaneRight === undefined ? 0 : (layout.memoPaneRight + TEXT_LEFT) * viewScale;
    spacer.style.width = `${Math.max(horizontalExtent ?? viewport.clientWidth, chartRight, memoRight)}px`;
    if (scrollOrigin) {
      viewport.scrollTop = scrollOrigin.top;
      viewport.scrollLeft = scrollOrigin.left;
    }
    // Reserve source reads in this synchronous ACK turn, before the input
    // controller can enqueue its next edit. Paint uses the same visibility policy.
    prepareVisibleResources();
    projectionDeferred = false;
    onLayout(layout, content);
    if (scheduleFrame) schedule();
  };
  const flushProjection = (scheduleFrame = true) => {
    if (!closed && projectionDeferred) reflow({ scheduleFrame });
    return layout;
  };
  viewport.addEventListener('scroll', schedule);
  const stopFontWatch = watchProjectionFonts(canvas, () => {
    measurementEpoch++;
    paragraphFlowReuse.clear();
    if (!closed) reflow();
  });
  const resize = new ResizeObserver(reflow);
  resize.observe(viewport);
  return {
    setGeometryEvidence(value, evidence) {
      geometryEvidence =
        value === content && readGeometryEvidence(evidence, value) ? evidence : undefined;
      if (geometryEvidence === undefined) {
        nativeGeometry.clear();
        paragraphFlowReuse.clear();
      }
    },
    suspendGeometryEvidence() {
      geometryEvidence = undefined;
      nativeGeometry.clear();
      paragraphFlowReuse.clear();
    },
    getDisplayOptions: () => displayOptions,
    setDisplayOptions(options) {
      if (closed) return false;
      const next = canvasDisplayOptions(options);
      if (next.paragraphMarks === displayOptions.paragraphMarks) return true;
      displayOptions = next;
      schedule();
      return true;
    },
    viewScale: () => viewScale,
    revealChart(section, wrapper) {
      if (closed || draft) return false;
      flushProjection();
      const matches = chartLayers.items.filter(
        (item) => item.target.section === section && item.target.wrapper === wrapper,
      );
      if (matches.length !== 1) return false;
      const item = matches[0];
      viewport.scrollTop = Math.max(0, (item.y - 8) * viewScale);
      viewport.scrollLeft = Math.max(0, (item.x - TEXT_LEFT) * viewScale);
      schedule();
      return true;
    },
    setViewScale(value) {
      if (closed || !isViewScale(value)) return false;
      if (value === viewScale) return true;
      const metrics = canvasViewportMetrics(viewport, viewScale);
      if (!metrics || !canvasViewportMetrics(viewport, value)) return false;
      const scrollOrigin = {
        top: metrics.logicalScrollTop * value,
        left: metrics.logicalScrollLeft * value,
      };
      if (!Object.values(scrollOrigin).every(Number.isFinite)) return false;
      viewScale = value;
      resizeGuide = null;
      pictureResizeGuide = null;
      reflow({ scrollOrigin });
      return true;
    },
    checkBoxProxies: () => paintedCheckBoxes.slice(),
    currentHwp5Choice(section, formNode) {
      flushProjection();
      const matches = [...inlineForms.values()].filter(
        (form) => form?.checkBox?.section === section && form.checkBox.formNode === formNode,
      );
      return matches.length === 1 ? matches[0].checkBox : null;
    },
    formTextAtLogicalPoint(x, y) {
      if (
        checkBoxPaintScrollTop !== viewport.scrollTop ||
        checkBoxPaintScrollLeft !== (viewport.scrollLeft ?? 0)
      )
        return null;
      const matches = paintedFormTargets.filter(
        (box) =>
          rowPageClipContains(box.row, x, y) &&
          x >= box.x &&
          x < box.x + box.width &&
          y >= box.y &&
          y < box.y + box.height,
      );
      return matches.length === 1 ? matches[0] : null;
    },
    checkBoxAtLogicalPoint: (x, y) =>
      checkBoxPaintScrollTop === viewport.scrollTop &&
      checkBoxPaintScrollLeft === (viewport.scrollLeft ?? 0)
        ? hitCheckBoxProxy(paintedCheckBoxes, x, y)
        : null,
    characterShadeAvailable: () => content.characterShadeAvailable === true,
    characterEffectAvailable: () => content.characterEffectAvailable === true,
    characterEffectExclusiveAvailable: () => content.characterEffectExclusiveAvailable === true,
    characterEffectRangesExclusiveAvailable: () =>
      content.characterEffectRangesExclusiveAvailable === true,
    characterOutlineAvailable: () => content.characterOutlineAvailable === true,
    characterOutlineRangesAvailable: () => content.characterOutlineRangesAvailable === true,
    characterOutlineExtendedAvailable: () => content.characterOutlineExtendedAvailable === true,
    characterOutlineRangesExtendedAvailable: () =>
      content.characterOutlineRangesExtendedAvailable === true,
    characterOutlineState: (anchor, focus) =>
      characterOutlineRangesState(
        content,
        paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
          sourcePositions: false,
        }),
      ),
    characterOutline: (point, startUnit, endUnit) =>
      characterOutlineRangesState(content, [
        { section: point.section, paragraph: point.paragraph, startUnit, endUnit },
      ]),
    characterOutlineKindState: (anchor, focus) =>
      characterOutlineRangesKind(
        content,
        paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
          sourcePositions: false,
        }),
      ),
    characterOutlineKind: (point, startUnit, endUnit) =>
      characterOutlineRangesKind(content, [
        { section: point.section, paragraph: point.paragraph, startUnit, endUnit },
      ]),
    characterEffectRangesAvailable: () => content.characterEffectRangesAvailable === true,
    characterEffectState: (anchor, focus, flag) =>
      characterEffectRangesState(
        content,
        paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
          sourcePositions: false,
        }),
        flag,
      ),
    characterEffect: (point, startUnit, endUnit, flag) =>
      characterEffectRangesState(
        content,
        [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }],
        flag,
      ),
    characterFontIds: (point, startUnit, endUnit, language) =>
      selectedFontIds(
        content,
        [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }],
        language,
      ),
    selectionFontIds: (anchor, focus, language) =>
      selectedFontIds(
        content,
        paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
          sourcePositions: false,
        }),
        language,
      ),
    characterShadeState: (anchor, focus) =>
      characterShadeRangesState(
        content,
        paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
          sourcePositions: false,
        }),
      ),
    characterShade: (point, startUnit, endUnit) =>
      characterShadeRangesState(content, [
        { section: point.section, paragraph: point.paragraph, startUnit, endUnit },
      ]),
    characterShadeRangesAvailable: () => content.characterShadeRangesAvailable === true,
    pictureReader(read) {
      pictureReader = read;
    },
    tableBackgroundReader(read) {
      tableBackgroundReader = read;
    },
    pictureDecoder(decode) {
      if (typeof decode !== 'function') throw new Error('InvalidPictureDecoder');
      pictureDecoder = decode;
      resourceGeneration++;
      pictureResources.clear();
      decodedResourceGeometry.clear();
    },
    chartReader(read) {
      chartReader = read;
    },
    chartDisplay(section, wrapper) {
      return chartResources.get(section, wrapper);
    },
    chartSeries(section, wrapper) {
      const value = chartResources.get(section, wrapper)?.value;
      return value ? projectChartSeries(value) : null;
    },
    chartBars(section, wrapper, plotNode) {
      const value = chartResources.get(section, wrapper)?.value;
      return value ? chartBarPrimitives(value, plotNode) : null;
    },
    selectPicture(picture) {
      selectedPicture = picture
        ? { section: picture.section, pictureNode: picture.pictureNode }
        : null;
      canvas.dataset.selectedPicture = selectedPicture
        ? `${selectedPicture.section}:${selectedPicture.pictureNode}`
        : '';
      schedule();
    },
    selectedPicture() {
      return selectedPicture
        ? (content.pictures?.find(
            (picture) =>
              picture.section === selectedPicture.section &&
              picture.pictureNode === selectedPicture.pictureNode,
          ) ?? null)
        : null;
    },
    selectedPicturePaint() {
      return selectedPicture
        ? ([...paintedPictures.front, ...paintedPictures.behind].find(
            (item) =>
              item.picture.section === selectedPicture.section &&
              item.picture.pictureNode === selectedPicture.pictureNode,
          ) ?? null)
        : null;
    },
    pictureResizeSelection(read) {
      pictureResizeSelection = read;
      schedule();
    },
    pictureResizeGuide(value) {
      pictureResizeGuide = value;
      schedule();
    },
    pictureAtLogicalPoint(x, y, options) {
      return hitPictureLayers(paintedPictures, x, y, () => true, {
        ...options,
        paintOrder: picturePaintOrder,
      });
    },
    cellResizeGuide(value) {
      resizeGuide = value;
      schedule();
    },
    show(value, options = {}) {
      const {
        preserveScroll = false,
        resourceEpoch: nextResourceEpoch = resourceEpoch,
        resourceDocument: nextResourceDocument,
        deferLayout = false,
        geometryEvidence: nextGeometryEvidence,
      } = options;
      sourceObservationState = null;
      try {
        const sourceStateDescriptor = Object.getOwnPropertyDescriptor(options, 'sourceState');
        if (sourceStateDescriptor && Object.hasOwn(sourceStateDescriptor, 'value'))
          sourceObservationState = sourceStateDescriptor.value;
      } catch {
        /* 읽기 전용 witness 확인 실패는 일반 경로로 남긴다. */
      }
      // Callers without a separate document identity retain the conservative
      // epoch boundary. A node number alone never identifies a source document.
      const changedResourceDocument =
        nextResourceDocument === undefined
          ? nextResourceEpoch !== resourceEpoch
          : nextResourceDocument !== resourceDocument;
      if (changedResourceDocument) {
        nativeGeometry.clear();
        paragraphFlowReuse.clear();
        stopPictureWait();
        pictureWaitExpired = false;
        paintedFrame = null;
        canvas.dataset.paintedCaret = '';
        stopBlink();
        interaction = {};
        caretVisible = true;
        pictureResources.clear();
        decodedResourceGeometry.clear();
        const resetWidth = canvas.width;
        canvas.width = resetWidth;
      } else if (nextResourceEpoch !== resourceEpoch) pictureResources.refresh();
      resourceEpoch = nextResourceEpoch;
      resourceDocument = nextResourceDocument;
      chartResources.clear();
      ownedBodyDraftProjection = null;
      content = value;
      geometryEvidence = nextGeometryEvidence;
      paragraphLookup.clear();
      draft = null;
      resizeGuide = null;
      if (content.chartDisplayAvailable === true && chartReader)
        for (const target of content.chartTargets ?? []) {
          if (
            !target.error_name &&
            Number.isInteger(target.paragraph) &&
            Number.isInteger(target.anchorUnit)
          )
            chartResources.load(target.section, target.wrapper).catch(() => {});
        }
      if (!preserveScroll) {
        selectedPicture = null;
        canvas.dataset.selectedPicture = '';
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      }
      if (deferLayout === true && !changedResourceDocument) {
        // ACK 모델과 자원 세대는 이미 갱신했지만 중간 geometry는 게시하지 않습니다.
        projectionDeferred = true;
        layoutGeneration++;
        canvas.dataset.paintPending = 'true';
        schedule();
        return undefined;
      }
      reflow();
      return layout;
    },
    flushProjection,
    clear() {
      nativeGeometry.clear();
      paragraphFlowReuse.clear();
      geometryEvidence = undefined;
      stopPictureWait();
      pictureWaitExpired = false;
      paintedFrame = null;
      canvas.dataset.paintedCaret = '';
      chartResources.clear();
      pictureResizeGuide = null;
      selectedPicture = null;
      canvas.dataset.selectedPicture = '';
      pictureResources.clear();
      decodedResourceGeometry.clear();
      const resetWidth = canvas.width;
      canvas.width = resetWidth;
      ownedBodyDraftProjection = null;
      sourceObservationState = null;
      content = { paragraphs: [], limited: false };
      paragraphLookup.clear();
      draft = null;
      resizeGuide = null;
      interaction = {};
      stopBlink();
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
      reflow();
    },
    dutmalAtLogicalPoint: (x, y) => {
      flushProjection();
      return dutmalAnchorAtPoint(display, layout, x, y);
    },
    equationAtLogicalPoint: (x, y) => {
      flushProjection();
      return equationAnchorAtPoint(display, layout, x, y);
    },
    layout: () => flushProjection(),
    paintedFrame: () => paintedFrame,
    isPaintedFrameCurrent,
    isSelectionPainted(selection) {
      return (
        isPaintedFrameCurrent() &&
        !interaction.historyPending &&
        !interaction.composition &&
        sameHistoryPaintStamp(paintedInteractionStamp, interactionStamp()) &&
        sameHistoryPaintStamp(historySelectionStamp(selection), historySelectionStamp(interaction))
      );
    },
    chartPreviews: () => paintedCharts.slice(),
    chartAtLogicalPoint: (x, y) => {
      flushProjection();
      return (
        [...paintedCharts]
          .reverse()
          .find(
            (item) =>
              x >= item.x && y >= item.y && x < item.x + item.width && y < item.y + item.height,
          )?.target ?? chartAnchorAtPoint(content, layout, x, y)
      );
    },
    tableCreationAvailable: () =>
      content.tableCreationAvailable === true &&
      content.tableCreationResources !== null &&
      content.tableCreationResources !== undefined,
    tableCreationResources: () =>
      content.tableCreationResources
        ? Object.fromEntries(
            Object.entries(content.tableCreationResources).map(([key, ids]) => [key, ids.slice()]),
          )
        : null,
    findText: (query) => findText(content.paragraphs, query),
    adjacentCell: (point, backward) => adjacentCell(content, flushProjection(), point, backward),
    adjacentParagraph: (point, forward) => {
      const next = adjacentOwnedParagraph(content.paragraphs, point, forward);
      return next && caretGeometry(flushProjection(), next) ? next : null;
    },
    paragraph: (point) => {
      if (projectionDeferred && point?.createdCell) flushProjection();
      return createdCellParagraph(layout, point) ?? paragraphLookup.find(content.paragraphs, point);
    },
    selectionRanges: (anchor, focus) => paragraphSelectionRanges(content.paragraphs, anchor, focus),
    textColorRangesAvailable: () => content.characterTextColorRangesAvailable === true,
    characterStrikeColorAvailable: () => content.characterStrikeColorAvailable === true,
    characterFontAvailable: () => content.characterFontAvailable === true,
    characterFontNameAvailable: () => content.characterFontNameAvailable === true,
    namedFontTextAvailable: () => content.namedFontTextAvailable === true,
    characterPropertyTextAvailable: () => content.characterPropertyTextAvailable === true,
    namedFontPropertyTextAvailable: () => content.namedFontPropertyTextAvailable === true,
    namedFontReplacementAvailable: () => content.namedFontReplacementAvailable === true,
    characterPropertyReplacementAvailable: () =>
      content.characterPropertyReplacementAvailable === true,
    namedFontPropertyReplacementAvailable: () =>
      content.namedFontPropertyReplacementAvailable === true,
    characterFontNameRangesAvailable: () => content.characterFontNameRangesAvailable === true,
    characterFontRangesAvailable: () => content.characterFontRangesAvailable === true,
    replacementRanges: (anchor, focus) =>
      paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
        includeEmpty: true,
      }),
    paragraphReplacementAvailable: () => content.paragraphReplacementAvailable === true,
    selectionText: (anchor, focus) => paragraphSelectionText(content.paragraphs, anchor, focus),
    selectionCharacterState: (anchor, focus, property) =>
      (property === 'strike'
        ? content.characterStrikeRangesAvailable
        : property === 'underline'
          ? content.characterUnderlineRangesAvailable
          : content.characterPropertiesRangesAvailable) === true
        ? characterRangesState(
            content,
            paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
              sourcePositions: false,
            }),
            property,
          )
        : null,
    characterToggle: (point, start, end, property) =>
      characterTogglePatch(
        content,
        paragraphLookup.find(content.paragraphs, point),
        start,
        end,
        property,
      ),
    characterState: (point, start, end, property) =>
      characterSelectionState(
        content,
        paragraphLookup.find(content.paragraphs, point),
        start,
        end,
        property,
      ),
    characterSize: (point, start, end) =>
      characterSizeState(content, paragraphLookup.find(content.paragraphs, point), start, end),
    characterPropertyRangesAvailable: () => content.characterPropertiesRangesAvailable === true,
    characterUnderlineRangesAvailable: () => content.characterUnderlineRangesAvailable === true,
    characterStrikeRangesAvailable: () => content.characterStrikeRangesAvailable === true,
    selectionCharacterSize: (anchor, focus) =>
      characterSizeRangesState(
        content,
        paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
          sourcePositions: false,
        }),
      ),
    tableCreationWidthHint: (point) => createdTableWidthHint(content, point),
    cell: (point, { includeTableNode = false } = {}) => {
      if (content.format !== 'hwpx' && content.format !== 'hwp5') return null;
      const p = paragraphLookup.find(content.paragraphs, point);
      const table = content.tables?.find(
        (t) => t.section === point.section && t.tableNode === p?.tableCell?.tableNode,
      );
      if (!table || table.partial) return null;
      const cell = table.cells.find((c) => c.listNode === p.tableCell.listNode);
      return cell && Number.isInteger(cell.width) && Number.isInteger(cell.height)
        ? {
            section: point.section,
            listNode: cell.listNode,
            width: cell.width,
            height: cell.height,
            ...(includeTableNode ? { tableNode: table.tableNode } : {}),
          }
        : null;
    },
    formula: (point) => formulaAtParagraph(content, point),
    preview(value) {
      draft = value;
      reflow();
    },
    clearDraft() {
      if (closed) return;
      // 새 모델의 투영이 이미 확정됐으면 초안 제거만으로 다시 계산하지 않습니다.
      // 외부 mutable 입력을 다시 읽는 preview(null)의 기존 계약은 유지합니다.
      if (draft === null && !projectionDeferred) return;
      draft = null;
      reflow();
    },
    select(value) {
      if (closed) return;
      interaction = value;
      interactionRevision++;
      caretVisible = true;
      // A new input/selection starts a full visible phase. Reusing the previous
      // interval can hide the caret immediately before this frame is painted.
      stopBlink();
      if (interaction.active && !interaction.composition && !interaction.historyPending)
        blink = setInterval(() => {
          caretVisible = !caretVisible;
          schedule();
        }, 500);
      schedule();
    },
    onGeometry(callback) {
      onGeometry = callback;
    },
    close() {
      nativeGeometry.clear();
      paragraphFlowReuse.clear();
      geometryEvidence = undefined;
      if (closed) return;
      ownedBodyDraftProjection = null;
      sourceObservationState = null;
      closed = true;
      projectionDeferred = false;
      paragraphLookup.clear();
      stopPictureWait();
      chartResources.close();
      pictureResources.close();
      decodedResourceGeometry.clear();
      stopBlink();
      resize.disconnect();
      stopFontWatch();
      viewport.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    },
  };
}
import { formulaAtParagraph } from './formula-selection.mjs';
import { isViewScale } from './view-scale.mjs';
import { findText } from './text-search.mjs';
