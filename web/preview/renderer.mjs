import { FONT, displayRunText } from "./layout.mjs";
import { dutmalAt, dutmalPaintPlan, paintDutmal } from "./dutmal-paint.mjs";
import { hitPictureLayers } from "./picture-hit-test.mjs";
import { paintPictureSelection } from "./picture-selection-paint.mjs";
import { canvasViewportMetrics } from "./canvas-viewport-metrics.mjs";
import { canvasHorizontalExtent } from "./canvas-horizontal-extent.mjs";
import { pictureResizeHandles } from "./picture-resize-geometry.mjs";
import { characterShadeRangesState } from "./character-shade-selection.mjs";
import { characterEffectRangesState } from "./character-effect-selection.mjs";
import { characterOutlineRangesState, characterOutlineRangesKind } from "./character-outline-selection.mjs";
import { paintCharacterRelief } from "./character-relief-style.mjs";
import { paintCharacterOutline } from "./character-outline-paint.mjs";
import { selectedFontIds } from "./character-font-selection.mjs";
import { rowAtY, rowLeft, rowHeight, rowTop, rowTextTop, TEXT_LEFT } from "./row-geometry.mjs";
import { caretGeometry, selectionRects, selectionIntersectsText } from "./text-geometry.mjs";
import { createTextStyle, withDraftText } from "./text-style.mjs";
import { layoutTableContent } from "./table-flow.mjs";
import { attachCreatedTableFlow, createdCellParagraph } from "./created-table-flow.mjs";
import { projectCreatedCellDraft } from "./created-cell-draft.mjs";
import { adjacentCell } from "./table-navigation.mjs";
import { characterTogglePatch, characterSelectionState, characterRangesState } from "./character-property-selection.mjs";
import { characterSizeState, characterSizeRangesState } from "./character-size-selection.mjs";
import { paragraphSelectionRanges, paragraphSelectionText } from "./paragraph-selection.mjs";
import { paintUnderline } from "./underline-paint.mjs";
import { createPictureResources } from "./picture-resources.mjs";
import { inlinePictureIndex, picturePositionKey, paintInlinePicture } from "./picture-inline.mjs";
import { projectDraftPictures } from "./picture-draft.mjs";
import { previewPictureLayers } from "./picture-layers.mjs";
import { pictureLayoutCoverage } from "./picture-layout-coverage.mjs";
import { paintPictureQuad } from "./picture-quad-paint.mjs";
import { previewLineLayers } from "./line-layers.mjs";
import { paintLine } from "./line-paint.mjs";
import { previewDrawingOutlineLayers } from "./drawing-outline-layers.mjs";
import { paintDrawingOutline } from "./drawing-outline-paint.mjs";
import { layoutPageContent } from "./page-content-layout.mjs";
import { layoutHwp5PageContent } from "./hwp5-page-layout.mjs";
import { projectDraftAnchoredObjects } from "./anchored-object-draft.mjs";
import { projectDraftDrawings } from "./drawing-draft.mjs";
import { paintRowTransform } from "./row-transform-paint.mjs";
import { paintDrawingFill } from "./drawing-fill-paint.mjs";
import { previewRectangleLayers } from "./rectangle-layers.mjs";
import { groupedPaintOrder } from "./grouped-paint-order.mjs";
import { groupedLayoutCoverage } from "./grouped-layout-coverage.mjs";
import { paintPagePaper } from "./page-paper-paint.mjs";
import { paintPageNumberGlyphs } from "./page-number-glyphs.mjs";
import { checkBoxProxyBoxes, hitCheckBoxProxy } from "./checkbox-proxy-geometry.mjs";
import { paintCheckBoxProxy } from "./checkbox-proxy-paint.mjs";
import { inlineCheckBoxIndex, checkBoxPositionKey } from "./checkbox-inline-layout.mjs";
import { paintSourceCheckBox } from "./checkbox-source-paint.mjs";
export function createRenderer(canvas, viewportElement, spacer, onLayout = () => {}) {
  const viewport = viewportElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2DUnavailable");
  let content = { paragraphs: [], limited: false }, layout = { rows: [], limited: false };
  let draft = null, interaction = {}, onGeometry = () => {}, blink = 0, caretVisible = true;
  let resizeGuide = null;
  let viewScale = 1, closed = false;
  let selectedPicture = null;
  let pictureResizeSelection = null, pictureResizeGuide = null;
  let pictureReader = null, pictures = new Map();
  let pictureLayers = { behind: [], front: [] };
  let paintedPictures = { behind: [], front: [] };
  let picturePaintOrder = [];
  let lineLayers = { behind: [], front: [], unavailable: [] };
  let drawingOutlineLayers = { behind: [], front: [], unavailable: [] };
  let paintedLineAnchors = new Set();
  let paintedCheckBoxes = [], checkBoxPaintScrollTop = null;
  let checkBoxPaintScrollLeft = null;
  let inlineCheckBoxes = new Map();
  const pictureResources = createPictureResources({
    read: (section, node) => pictureReader ? pictureReader(section, node) : Promise.reject(new Error("PictureReaderUnavailable")),
    decode: bytes => createImageBitmap(new Blob([bytes])),
    onChange: () => schedule(),
  });
  let display = content, pictureDisplay = content, fontAt = createTextStyle(content, FONT);
  const stopBlink = () => { clearInterval(blink); blink = 0; };
  const paint = () => {
    if (closed) return;
    paintedCheckBoxes = []; checkBoxPaintScrollTop = null; checkBoxPaintScrollLeft = null;
    paintedPictures = { behind: [], front: [] };
    picturePaintOrder = [];
    const metrics = canvasViewportMetrics(viewportElement, viewScale, window.devicePixelRatio || 1);
    if (!metrics) return;
    // Every painter in this frame receives the same logical scroll origin.
    const viewport = { scrollTop: metrics.logicalScrollTop };
    checkBoxPaintScrollTop = viewportElement.scrollTop;
    checkBoxPaintScrollLeft = viewportElement.scrollLeft ?? 0;
    const { logicalWidth: width, logicalHeight: height, ratio, pixelWidth, pixelHeight } = metrics;
    canvas.style.width = `${metrics.width}px`; canvas.style.height = `${metrics.height}px`;
    canvas.width = pixelWidth; canvas.height = pixelHeight;
    ctx.setTransform(ratio * metrics.scale, 0, 0, ratio * metrics.scale, 0, 0);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.translate(-metrics.logicalScrollLeft, 0);
    paintPagePaper(ctx, layout.pages, viewport.scrollTop, width, height);
    paintPageNumberGlyphs(ctx, layout.pageNumberGlyphs, viewport.scrollTop, glyph => fontAt(display.paragraphs.find(p => p.section === glyph.section && p.paragraph === glyph.paragraph), glyph.unit));
    const rectangleLayers = previewRectangleLayers(pictureDisplay, layout);
    const groupCommands = groupedPaintOrder(pictureDisplay, layout, rectangleLayers, pictureLayers);
    const groupTextKeys = new Set(groupCommands.filter(c => c.kind === "text").map(c => `${c.section}:${c.node}`));
    const recordFill = item => picturePaintOrder.push({ kind: "occluder", item: { ...item.rectangle, paintPlan: { state: "plain" } } });
    const paintRectangles = list => {
      for (const item of list) {
        if (paintDrawingFill(ctx, item, viewport.scrollTop)) recordFill(item);
        paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
      }
    };
    paintRectangles(rectangleLayers.behind);
    const paintPictures = (list, behind = false) => {
      for (const item of list) {
        const bitmap = pictureResources.get(item.picture.section, item.picture.pictureNode)?.bitmap;
        if (!bitmap || item.y + item.height < viewport.scrollTop || item.y > viewport.scrollTop + height) continue;
        try {
          const painted = item.paintPlan.state === "quad"
            ? paintPictureQuad(ctx, bitmap, item.picture, item.paintPlan.corners, { x: item.paintOrigin?.x ?? item.x, y: (item.paintOrigin?.y ?? item.y) - viewport.scrollTop })
            : paintInlinePicture(ctx, bitmap, item, item.x, item.y - viewport.scrollTop);
          if (painted) {
            paintedPictures[behind ? "behind" : "front"].push(item);
            picturePaintOrder.push({ kind: "picture", item, behind });
          }
        } catch { /* 개별 그림 실패는 텍스트를 차단하지 않습니다. */ }
      }
    };
    paintPictures(pictureLayers.behind, true);
    for (const separator of layout.noteSeparators ?? []) {
      const top = separator.y - viewport.scrollTop;
      if (top + separator.height < 0 || top > height) continue;
      ctx.fillStyle = separator.color;
      ctx.fillRect(separator.x, top, separator.width, separator.height);
    }
    for (const item of lineLayers.behind) paintLine(ctx, item.line, item.origin, viewport.scrollTop);
    for (const item of drawingOutlineLayers.behind) paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
    for (const drawing of layout.placedDrawings ?? []) {
      if (groupTextKeys.has(`${drawing.section}:${drawing.drawingNode}`)) continue;
      paintDrawingFill(ctx, drawing, viewport.scrollTop);
    }
    ctx.font = FONT; ctx.textBaseline = "top";
    ctx.fillStyle = "#7c8c99";
    for (const box of layout.boxes ?? []) {
      const top = box.y - viewport.scrollTop;
      if (top + box.height < 0 || top > height) continue;
      paintRowTransform(ctx, box, viewport.scrollTop, () => {
      ctx.fillRect(box.x, top, box.width, 1);
      ctx.fillRect(box.x, top + box.height - 1, box.width, 1);
      ctx.fillRect(box.x, top, 1, box.height);
      ctx.fillRect(box.x + box.width - 1, top, 1, box.height);
      });
    }
    ctx.fillStyle = "#bad9f4";
    if (resizeGuide) {
      ctx.fillStyle = "#145b96";
      ctx.fillRect(resizeGuide.x + resizeGuide.width, resizeGuide.y - viewport.scrollTop, 2, resizeGuide.height);
      ctx.fillRect(resizeGuide.x, resizeGuide.y + resizeGuide.height - viewport.scrollTop, resizeGuide.width, 2);
      ctx.fillStyle = "#bad9f4";
    }
    const displayRanges = paragraphSelectionRanges(content.paragraphs, interaction.anchor, interaction.focus, undefined, { sourcePositions: false });
    for (const r of selectionRects(layout, interaction.anchor, interaction.focus, displayRanges)) paintRowTransform(ctx, r, viewport.scrollTop, () => ctx.fillRect(r.x, r.y - viewport.scrollTop, r.width, r.height));
    const first = layout.spatialRows ? 0 : Math.max(0, rowAtY(layout, viewport.scrollTop));
    const paintTextRow = (row, i) => {
      if (row.kind === "gap") return;
      if (row.transform === undefined && rowTop(row, i) >= viewport.scrollTop + height) return;
      if (row.transform === undefined && rowTop(row, i) + rowHeight(row) <= viewport.scrollTop) return;
      paintRowTransform(ctx, row, viewport.scrollTop, () => {
      ctx.font = FONT;
      ctx.fillStyle = row.kind === "label" ? "#526d80" : "#172b3b";
      if (row.kind === "text") {
        const paragraph = createdCellParagraph(layout, row) ?? display.paragraphs.find(p => p.section === row.section && p.paragraph === row.paragraph);
        if (row.numberPrefix) {
          ctx.font = fontAt(paragraph, 0, "number-prefix");
          ctx.fillText(row.numberPrefix.text, rowLeft(row), rowTop(row, i) - viewport.scrollTop + rowTextTop(row) + (fontAt.script(paragraph, 0, "number-prefix")?.offset ?? 0));
        }
        // Draw with the same grapheme advances used for hit-testing.
        for (let b = 0; b < row.boundaries.length - 1; b++) {
          const start = row.boundaries[b], end = row.boundaries[b + 1];
          if ([...rectangleLayers.behind, ...rectangleLayers.front].some(item => item.drawing.source.group_context === null && item.drawing.section === row.section && item.drawing.hostParagraph === row.paragraph && item.drawing.anchorUnit === start.unit) || row.inlineTables?.some(table => table.unit === start.unit) || layout.placedDrawings?.some(d => d.section === row.section && d.hostParagraph === row.paragraph && d.anchorUnit === start.unit) || layout.flowPictures?.some(p => p.section === row.section && p.paragraph === row.paragraph && p.anchorUnit === start.unit)) continue;
          ctx.font = fontAt(paragraph, start.unit);
          ctx.fillStyle = fontAt.color(paragraph, start.unit) ?? "#172b3b";
          const text = displayRunText(row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit), paragraph, start.unit, "text", row.pageNumber);
          const x = rowLeft(row) + start.x, y = rowTop(row, i) - viewport.scrollTop + rowTextTop(row);
          const glyphY = y + (fontAt.script(paragraph, start.unit)?.offset ?? 0);
          const dutmal = dutmalAt(paragraph, start.unit);
          if (dutmal && paintDutmal(ctx, dutmalPaintPlan(dutmal, ctx.font, fontAt.textHeight(paragraph, start.unit), (value, font) => { ctx.save(); try { ctx.font = font; return ctx.measureText(value).width; } finally { ctx.restore(); } }), x, y)) continue;
          const picture = pictures.get(picturePositionKey(row.section, row.paragraph, start.unit));
          if (picture) {
            const bitmap = pictureResources.get(picture.picture.section, picture.picture.pictureNode)?.bitmap;
            if (bitmap) {
              try {
                const painted = picture.paintPlan.state === "quad"
                  ? paintPictureQuad(ctx, bitmap, picture.picture, picture.paintPlan.corners, { x, y })
                  : paintInlinePicture(ctx, bitmap, picture, x, y);
                if (painted) {
                  const item = { ...picture, x, y: y + viewport.scrollTop, paintOrigin: { x, y: y + viewport.scrollTop }, transform: row.transform, pageClip: row.pageClip };
                  paintedPictures.front.push(item);
                  picturePaintOrder.push({ kind: "picture", item });
                  continue;
                }
              } catch { /* 표시 실패 시 보호 표식을 유지합니다. */ }
            }
          }
          const paintedLine = row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit) === "\ufffc" && paintedLineAnchors.has(picturePositionKey(row.section, row.paragraph, start.unit));
          if (inlineCheckBoxes.get(checkBoxPositionKey(row.section, row.paragraph, start.unit))) continue;
          if (!paintedLine) {
            const shade = fontAt.shade(paragraph, start.unit);
            const selected = selectionIntersectsText(row, start.unit, end.unit, interaction.anchor, interaction.focus, displayRanges);
            if (shade && !selected && text !== "\ufffc") {
              ctx.save();
              ctx.fillStyle = shade;
              ctx.fillRect(x, glyphY, end.x - start.x, fontAt.fontHeight(paragraph, start.unit));
              ctx.restore();
            }
            const relief = fontAt.relief(paragraph, start.unit);
            if (relief) paintCharacterRelief(ctx, relief, text, x, glyphY);
            else if (!paintCharacterOutline(ctx, fontAt.outlineStyle(paragraph, start.unit), text, x, glyphY)) ctx.fillText(text, x, glyphY);
          }
          const underline = fontAt.underline(paragraph, start.unit);
          if (underline) paintUnderline(ctx, underline, x, end.x - start.x, glyphY, ctx.measureText(text), fontAt.fontHeight(paragraph, start.unit), rowLeft(row));
          const strike = fontAt.strike(paragraph, start.unit);
          if (strike) paintUnderline(ctx, strike, x, end.x - start.x, glyphY, ctx.measureText(text), fontAt.fontHeight(paragraph, start.unit), rowLeft(row));
        }
      } else ctx.fillText(row.text, rowLeft(row), rowTop(row, i) - viewport.scrollTop + rowTextTop(row));
      });
    };
    for (let i = first; i < layout.rows.length; i++) {
      const row = layout.rows[i];
      if (groupTextKeys.has(`${row.section}:${row.drawingNode}`)) continue;
      paintTextRow(row, i);
    }
    paintPictures(pictureLayers.front.filter(item => !groupCommands.some(c => c.item === item)));
    paintRectangles(rectangleLayers.front.filter(item => !groupCommands.some(c => c.item === item)));
    for (const command of groupCommands) {
      if (command.kind === "rectangle") paintRectangles([command.item]);
      else if (command.kind === "picture") paintPictures([command.item]);
      else {
        if (paintDrawingFill(ctx, command.item, viewport.scrollTop)) recordFill(command.item);
        for (const [i, row] of layout.rows.entries()) if (row.section === command.section && row.drawingNode === command.node) paintTextRow(row, i);
        for (const item of drawingOutlineLayers.front) if (item.drawing.section === command.section && item.drawing.drawingNode === command.node) paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
      }
    }
    for (const item of lineLayers.front) paintLine(ctx, item.line, item.origin, viewport.scrollTop);
    for (const item of drawingOutlineLayers.front) if (!groupTextKeys.has(`${item.drawing.section}:${item.drawing.drawingNode}`)) paintDrawingOutline(ctx, item.drawing.source, item.origin, viewport.scrollTop);
    for (const box of checkBoxProxyBoxes(pictureDisplay, layout)) {
      if (paintRowTransform(ctx, box, viewport.scrollTop, () => box.sourceSized ? paintSourceCheckBox(ctx, box, viewport.scrollTop) : paintCheckBoxProxy(ctx, box, viewport.scrollTop))) paintedCheckBoxes.push(box);
    }
    if (interaction.active && (caretVisible || interaction.composition)) {
      const caret = caretGeometry(layout, interaction.composition?.focus ?? interaction.focus);
      if (caret) {
        ctx.fillStyle = "#145b96";
        const r = caret.paintGeometry ?? caret;
        paintRowTransform(ctx, r, viewport.scrollTop, () => ctx.fillRect(r.x, r.y - viewport.scrollTop, 2, r.height));
      }
    }
    if (interaction.composition) {
      ctx.fillStyle = "#145b96";
      for (const r of selectionRects(layout, interaction.composition.anchor, interaction.composition.focus)) paintRowTransform(ctx, r, viewport.scrollTop, () => ctx.fillRect(r.x, r.y + r.height + 1 - viewport.scrollTop, r.width, 1));
    }
    if (selectedPicture) {
      const item = [...paintedPictures.front, ...paintedPictures.behind].find(value => value.picture.section === selectedPicture.section && value.picture.pictureNode === selectedPicture.pictureNode);
      if (item) paintRowTransform(ctx, item, viewport.scrollTop, () => paintPictureSelection(ctx, item, viewport.scrollTop));
    }
    const resize = pictureResizeSelection?.();
    if (resize) {
      paintRowTransform(ctx, { pageClip: resize.pageClip }, viewport.scrollTop, () => {
        ctx.fillStyle = "#145b96";
        for (const handle of pictureResizeHandles(resize)) ctx.fillRect(handle.point[0] - 4, handle.point[1] - viewport.scrollTop - 4, 8, 8);
      });
    }
    if (pictureResizeGuide) {
      const { basis, size } = pictureResizeGuide;
      const x = basis.origin[0] + basis.x[0] * size.width / basis.width + basis.y[0] * size.height / basis.height;
      const y = basis.origin[1] + basis.x[1] * size.width / basis.width + basis.y[1] * size.height / basis.height;
      paintRowTransform(ctx, { pageClip: basis.pageClip }, viewport.scrollTop, () => { ctx.fillStyle = "#145b96"; ctx.fillRect(x - 3, y - viewport.scrollTop - 3, 6, 6); });
    }
    onGeometry();
    layout.rectangleCoverage = rectangleLayers;
    layout.groupCoverage = groupedLayoutCoverage(pictureDisplay, layout, rectangleLayers, pictureLayers);
    layout.checkBoxCoverage = { sourceSized: paintedCheckBoxes.filter(box => box.sourceSized).length, proxy: paintedCheckBoxes.filter(box => !box.sourceSized).length, unavailable: inlineCheckBoxes.unavailable };
    layout.pictureCoverage = pictureLayoutCoverage(pictureDisplay, pictures, pictureLayers, (section, node) => pictureResources.status(section, node));
    onLayout(layout);
  };
  let frame = 0;
  const schedule = () => { if (!closed && !frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
  const reflow = ({ scrollOrigin = null } = {}) => {
    paintedCheckBoxes = []; checkBoxPaintScrollTop = null;
    paintedPictures = { behind: [], front: [] };
    picturePaintOrder = [];
    ctx.font = FONT;
    display = draft?.createdCell ? projectCreatedCellDraft(content, draft) : draft ? { ...content, paragraphs: content.paragraphs.map(p => p.section === draft.section && p.paragraph === draft.paragraph ? withDraftText(p, draft.text) : p) } : content;
    fontAt = createTextStyle(display, FONT);
    pictureDisplay = { ...display, pictures: projectDraftPictures(content, draft), lines: projectDraftAnchoredObjects(content, content.lines, draft), drawings: projectDraftDrawings(content, draft), rectangles: projectDraftDrawings({ ...content, drawings: content.rectangles }, draft), checkBoxes: projectDraftAnchoredObjects(content, content.checkBoxes, draft, "siteState") };
    pictures = inlinePictureIndex(pictureDisplay);
    inlineCheckBoxes = inlineCheckBoxIndex(pictureDisplay);
    for (const item of pictures.values()) if (item) pictureResources.load(item.picture.section, item.picture.pictureNode).catch(() => {});
    const measure = (text, paragraph, unit, kind) => {
      ctx.font = fontAt(paragraph, unit, kind);
      const dutmal = kind === "text" ? dutmalAt(paragraph, unit) : null;
      if (dutmal) {
        const plan = dutmalPaintPlan(dutmal, ctx.font, fontAt.textHeight(paragraph, unit, kind), (value, font) => { ctx.save(); try { ctx.font = font; return ctx.measureText(value).width; } finally { ctx.restore(); } });
        if (plan) return { width: plan.width, height: plan.height };
      }
      const picture = kind === "text" ? pictures.get(picturePositionKey(paragraph.section, paragraph.paragraph, unit)) : null;
      if (picture) return { width: picture.width, height: picture.height };
      const checkBox = kind === "text" ? inlineCheckBoxes.get(checkBoxPositionKey(paragraph.section, paragraph.paragraph, unit)) : null;
      if (checkBox) return { width: checkBox.width, height: checkBox.affectLineSpacing ? checkBox.height : fontAt.textHeight(paragraph, unit, kind) };
      const metrics = ctx.measureText(text);
      const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      return { width: metrics.width, height: Math.max(fontAt.textHeight(paragraph, unit, kind), Number.isFinite(inkHeight) ? inkHeight : 0) };
    };
    const pageLayout = pictureDisplay.createdTables?.length ? { state: "unavailable", error: "UnsupportedCreatedTablePagination" } : pictureDisplay.format === "hwp5" ? layoutHwp5PageContent(pictureDisplay, measure) : layoutPageContent(pictureDisplay, measure);
    const logicalWidth = Math.max(1, viewport.clientWidth / viewScale - 2 * TEXT_LEFT);
    layout = pageLayout.state === "paginated" ? pageLayout : { ...layoutTableContent(pictureDisplay, logicalWidth, measure), pageLayoutError: pageLayout.error };
    layout = attachCreatedTableFlow(pictureDisplay, layout, measure);
    pictureLayers = previewPictureLayers(pictureDisplay, layout, logicalWidth);
    lineLayers = previewLineLayers(pictureDisplay, layout, logicalWidth);
    drawingOutlineLayers = previewDrawingOutlineLayers(pictureDisplay, layout);
    layout.drawingOutlineCoverage = { placed: drawingOutlineLayers.behind.length + drawingOutlineLayers.front.length, unavailable: drawingOutlineLayers.unavailable };
    paintedLineAnchors = new Set([...lineLayers.behind, ...lineLayers.front].map(({ line }) => picturePositionKey(line.section, line.paragraph, line.anchorUnit)));
    layout.lineCoverage = { placed: lineLayers.behind.length + lineLayers.front.length, unavailable: lineLayers.unavailable };
    layout.pictureCoverage = pictureLayoutCoverage(pictureDisplay, pictures, pictureLayers);
    for (const item of [...pictureLayers.behind, ...pictureLayers.front]) pictureResources.load(item.picture.section, item.picture.pictureNode).catch(() => {});
    // Canvas occupies the viewport itself; the spacer adds only extra scroll.
    spacer.style.height = `${Math.max(0, Math.max(pictureLayers.height, lineLayers.height, drawingOutlineLayers.height) * viewScale - viewport.clientHeight)}px`;
    const horizontalExtent = canvasHorizontalExtent(layout.pages, viewport.clientWidth, TEXT_LEFT, viewScale);
    spacer.style.width = `${horizontalExtent ?? viewport.clientWidth}px`;
    canvas.dataset.horizontalExtentError = horizontalExtent === null ? "InvalidPageScrollExtent" : "";
    canvas.dataset.rows = String(layout.rows.length);
    canvas.dataset.pageLayoutError = layout.pageLayoutError ?? "";
    canvas.dataset.pageLayoutMode = layout.pageLayoutMode ?? "logical-fallback";
    canvas.dataset.limited = String(layout.limited);
    if (scrollOrigin) { viewport.scrollTop = scrollOrigin.top; viewport.scrollLeft = scrollOrigin.left; }
    onLayout(layout);
    schedule();
  };
  viewport.addEventListener("scroll", schedule);
  const resize = new ResizeObserver(reflow); resize.observe(viewport);
  return {
    viewScale: () => viewScale,
    setViewScale(value) {
      if (closed || !isViewScale(value)) return false;
      if (value === viewScale) return true;
      const metrics = canvasViewportMetrics(viewport, viewScale);
      if (!metrics || !canvasViewportMetrics(viewport, value)) return false;
      const scrollOrigin = { top: metrics.logicalScrollTop * value, left: metrics.logicalScrollLeft * value };
      if (!Object.values(scrollOrigin).every(Number.isFinite)) return false;
      viewScale = value; resizeGuide = null; pictureResizeGuide = null;
      reflow({ scrollOrigin });
      return true;
    },
    checkBoxProxies: () => paintedCheckBoxes.slice(),
    checkBoxAtLogicalPoint: (x, y) => checkBoxPaintScrollTop === viewport.scrollTop && checkBoxPaintScrollLeft === (viewport.scrollLeft ?? 0) ? hitCheckBoxProxy(paintedCheckBoxes, x, y) : null,
    characterShadeAvailable: () => content.characterShadeAvailable === true,
    characterEffectAvailable: () => content.characterEffectAvailable === true,
    characterEffectExclusiveAvailable: () => content.characterEffectExclusiveAvailable === true,
    characterEffectRangesExclusiveAvailable: () => content.characterEffectRangesExclusiveAvailable === true,
    characterOutlineAvailable: () => content.characterOutlineAvailable === true,
    characterOutlineRangesAvailable: () => content.characterOutlineRangesAvailable === true,
    characterOutlineExtendedAvailable: () => content.characterOutlineExtendedAvailable === true,
    characterOutlineRangesExtendedAvailable: () => content.characterOutlineRangesExtendedAvailable === true,
    characterOutlineState: (anchor, focus) => characterOutlineRangesState(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false })),
    characterOutline: (point, startUnit, endUnit) => characterOutlineRangesState(content, [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }]),
    characterOutlineKindState: (anchor, focus) => characterOutlineRangesKind(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false })),
    characterOutlineKind: (point, startUnit, endUnit) => characterOutlineRangesKind(content, [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }]),
    characterEffectRangesAvailable: () => content.characterEffectRangesAvailable === true,
    characterEffectState: (anchor, focus, flag) => characterEffectRangesState(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false }), flag),
    characterEffect: (point, startUnit, endUnit, flag) => characterEffectRangesState(content, [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }], flag),
    characterFontIds: (point, startUnit, endUnit, language) => selectedFontIds(content, [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }], language),
    selectionFontIds: (anchor, focus, language) => selectedFontIds(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false }), language),
    characterShadeState: (anchor, focus) => characterShadeRangesState(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false })),
    characterShade: (point, startUnit, endUnit) => characterShadeRangesState(content, [{ section: point.section, paragraph: point.paragraph, startUnit, endUnit }]),
    characterShadeRangesAvailable: () => content.characterShadeRangesAvailable === true,
    pictureReader(read) { pictureReader = read; },
    selectPicture(picture) {
      selectedPicture = picture ? { section: picture.section, pictureNode: picture.pictureNode } : null;
      canvas.dataset.selectedPicture = selectedPicture ? `${selectedPicture.section}:${selectedPicture.pictureNode}` : "";
      schedule();
    },
    selectedPicture() {
      return selectedPicture ? content.pictures?.find(picture => picture.section === selectedPicture.section && picture.pictureNode === selectedPicture.pictureNode) ?? null : null;
    },
    selectedPicturePaint() { return selectedPicture ? [...paintedPictures.front, ...paintedPictures.behind].find(item => item.picture.section === selectedPicture.section && item.picture.pictureNode === selectedPicture.pictureNode) ?? null : null; },
    pictureResizeSelection(read) { pictureResizeSelection = read; schedule(); },
    pictureResizeGuide(value) { pictureResizeGuide = value; schedule(); },
    pictureAtLogicalPoint(x, y, options) {
      return hitPictureLayers(paintedPictures, x, y, () => true, { ...options, paintOrder: picturePaintOrder });
    },
    cellResizeGuide(value) { resizeGuide = value; schedule(); },
    show(value, { preserveScroll = false } = {}) { content = value; draft = null; resizeGuide = null; if (!preserveScroll) { selectedPicture = null; canvas.dataset.selectedPicture = ""; viewport.scrollTop = 0; viewport.scrollLeft = 0; } reflow(); return layout; },
    clear() { pictureResizeGuide = null; selectedPicture = null; canvas.dataset.selectedPicture = ""; pictureResources.clear(); content = { paragraphs: [], limited: false }; draft = null; resizeGuide = null; interaction = {}; stopBlink(); viewport.scrollTop = 0; viewport.scrollLeft = 0; reflow(); },
    layout: () => layout,
    tableCreationAvailable: () => content.tableCreationAvailable === true && content.tableCreationResources !== null && content.tableCreationResources !== undefined,
    tableCreationResources: () => content.tableCreationResources ? Object.fromEntries(Object.entries(content.tableCreationResources).map(([key, ids]) => [key, ids.slice()])) : null,
    findText: query => findText(content.paragraphs, query),
    adjacentCell: (point, backward) => adjacentCell(content, layout, point, backward),
    paragraph: point => createdCellParagraph(layout, point) ?? content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph),
    selectionRanges: (anchor, focus) => paragraphSelectionRanges(content.paragraphs, anchor, focus),
    textColorRangesAvailable: () => content.characterTextColorRangesAvailable === true,
    characterFontAvailable: () => content.characterFontAvailable === true,
    characterFontNameAvailable: () => content.characterFontNameAvailable === true,
    namedFontTextAvailable: () => content.namedFontTextAvailable === true,
    characterPropertyTextAvailable: () => content.characterPropertyTextAvailable === true,
    namedFontPropertyTextAvailable: () => content.namedFontPropertyTextAvailable === true,
    namedFontReplacementAvailable: () => content.namedFontReplacementAvailable === true,
    characterPropertyReplacementAvailable: () => content.characterPropertyReplacementAvailable === true,
    namedFontPropertyReplacementAvailable: () => content.namedFontPropertyReplacementAvailable === true,
    characterFontNameRangesAvailable: () => content.characterFontNameRangesAvailable === true,
    characterFontRangesAvailable: () => content.characterFontRangesAvailable === true,
    replacementRanges: (anchor, focus) => paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { includeEmpty: true }),
    paragraphReplacementAvailable: () => content.paragraphReplacementAvailable === true,
    selectionText: (anchor, focus) => paragraphSelectionText(content.paragraphs, anchor, focus),
    selectionCharacterState: (anchor, focus, property) => (property === "strike" ? content.characterStrikeRangesAvailable : property === "underline" ? content.characterUnderlineRangesAvailable : content.characterPropertiesRangesAvailable) === true ? characterRangesState(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false }), property) : null,
    characterToggle: (point, start, end, property) => characterTogglePatch(content, content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph), start, end, property),
    characterState: (point, start, end, property) => characterSelectionState(content, content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph), start, end, property),
    characterSize: (point, start, end) => characterSizeState(content, content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph), start, end),
    characterPropertyRangesAvailable: () => content.characterPropertiesRangesAvailable === true,
    characterUnderlineRangesAvailable: () => content.characterUnderlineRangesAvailable === true,
    characterStrikeRangesAvailable: () => content.characterStrikeRangesAvailable === true,
    selectionCharacterSize: (anchor, focus) => characterSizeRangesState(content, paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, { sourcePositions: false })),
    cell: point => {
      if (content.format !== "hwpx" && content.format !== "hwp5") return null;
      const p = content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph);
      const table = content.tables?.find(t => t.section === point.section && t.tableNode === p?.tableCell?.tableNode);
      if (!table || table.partial) return null;
      const cell = table.cells.find(c => c.listNode === p.tableCell.listNode);
      return cell && Number.isInteger(cell.width) && Number.isInteger(cell.height) ? { section: point.section, listNode: cell.listNode, width: cell.width, height: cell.height } : null;
    },
    formula: point => formulaAtParagraph(content, point),
    preview(value) { draft = value; reflow(); },
    select(value) {
      interaction = value; caretVisible = true;
      if (interaction.active && !blink) blink = setInterval(() => { caretVisible = !caretVisible; schedule(); }, 500);
      if (!interaction.active) stopBlink();
      schedule();
    },
    onGeometry(callback) { onGeometry = callback; },
    close() { if (closed) return; closed = true; pictureResources.close(); stopBlink(); resize.disconnect(); viewport.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); },
  };
}
import { formulaAtParagraph } from "./formula-selection.mjs";
import { isViewScale } from "./view-scale.mjs";
import { findText } from "./text-search.mjs";
