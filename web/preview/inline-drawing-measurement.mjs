import { layoutDrawingText } from './drawing-text-layout.mjs';
import { inlineDrawingGeometry } from './inline-drawing-geometry.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { layoutDrawingCaption } from './drawing-caption-layout.mjs';

// 원본 내부 단 높이로 텍스트를 측정하고 본문이 예약할 높이를 분리합니다.
export function measureInlineDrawingContent(
  drawing,
  paragraphs,
  declaration,
  measure,
  { maxRows = 20000, inlineTables = [] } = {},
) {
  const source = drawing?.source;
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (!Array.isArray(paragraphs)) return unavailable('InvalidInlineDrawingMeasurement');
  const geometry = inlineDrawingGeometry(source);
  if (geometry.state !== 'selected') return unavailable('UnsupportedInlineDrawingMeasurement');
  const rectangle = geometry.rectangle;
  const members = paragraphs.filter(
    (paragraph) =>
      paragraph.section === drawing.section &&
      paragraph.drawingText?.drawingNode === drawing.drawingNode,
  );
  if (!Array.isArray(inlineTables)) return unavailable('InvalidInlineDrawingMeasurement');
  const objects = new Map();
  let tableRows = 0;
  for (const entry of inlineTables) {
    const table = entry?.table,
      key = `${table?.section}:${table?.hostParagraph}:${table?.anchorUnit}`;
    if (
      !table ||
      table.section !== drawing.section ||
      !members.some(
        (p) => p.paragraph === table.hostParagraph && p.text?.[table.anchorUnit] === '\ufffc',
      ) ||
      !Number.isSafeInteger(table.anchorUnit) ||
      table.anchorUnit < 0 ||
      objects.has(key) ||
      entry.object?.state !== 'object-measured' ||
      !Number.isSafeInteger(entry.object.rowCount) ||
      entry.object.rowCount < 0 ||
      ![entry.object.width, entry.object.height].every((v) => Number.isFinite(v) && v > 0)
    )
      return unavailable('InvalidInlineDrawingMeasurement');
    objects.set(key, entry.object);
    tableRows += entry.object.rowCount;
  }
  if (!Number.isSafeInteger(tableRows) || tableRows >= maxRows)
    return unavailable('DrawingTextLayoutLimit');
  const currentMeasure = (text, paragraph, unit, kind) => {
    const object =
      kind === 'text' &&
      text !== '' &&
      objects.get(`${paragraph.section}:${paragraph.paragraph}:${unit}`);
    return object
      ? { width: object.width, height: object.height }
      : measure(text, paragraph, unit, kind);
  };
  const options = {
    maxRows: maxRows - tableRows,
    compactLines: true,
    overflow: 'extend-last-column',
  };
  const text = layoutDrawingText(drawing, members, declaration, rectangle, currentMeasure, options);
  if (text.state !== 'placed') return text;
  const bounds = text.textBounds;
  if (!bounds) return unavailable('InvalidInlineDrawingMeasurement');
  const height = Math.max(
    rectangle.height,
    bounds.y + bounds.height + hwpUnitPixels(source.text.margins[3]),
  );
  if (!Number.isFinite(height) || height <= 0)
    return unavailable('InvalidInlineDrawingMeasurement');
  for (const row of text.rows) {
    const anchors = inlineTables.filter(
      (e) =>
        e.table.hostParagraph === row.paragraph &&
        row.startUnit <= e.table.anchorUnit &&
        e.table.anchorUnit < row.endUnit,
    );
    if (anchors.length)
      row.inlineTables = anchors.map((e) => ({
        tableNode: e.table.tableNode,
        unit: e.table.anchorUnit,
      }));
  }
  const result = {
    state: 'measured',
    section: drawing.section,
    drawingNode: drawing.drawingNode,
    width: rectangle.width,
    height,
    rowCount: text.rows.length + tableRows,
    sourceRectangle: rectangle,
    text,
    ...(inlineTables.length ? { inlineTables } : {}),
  };
  if (!source.caption) return result;
  if (![2, 3].includes(source.caption.side))
    return unavailable('UnsupportedInlineDrawingCaptionSide');
  const body = { ...rectangle, height };
  const caption = layoutDrawingCaption(drawing, paragraphs, body, measure, {
    maxRows: maxRows - result.rowCount,
  });
  if (caption.state !== 'positioned') return caption;
  const extent = caption.bounds;
  if (
    ![extent.x, extent.y, extent.width, extent.height].every(Number.isFinite) ||
    extent.width <= 0 ||
    extent.height <= 0
  )
    return unavailable('InvalidInlineDrawingCaptionBounds');
  const shift = (box) => ({ ...box, x: box.x - extent.x, y: box.y - extent.y });
  return {
    ...result,
    width: extent.width,
    height: extent.height,
    rowCount: result.rowCount + caption.rows.length,
    drawingRectangle: shift(body),
    caption: {
      ...caption,
      rows: caption.rows.map(shift),
      captionRectangle: shift(caption.captionRectangle),
      bounds: shift(extent),
    },
    text: {
      ...text,
      rows: text.rows.map(shift),
      body: shift(text.body),
      textBounds: shift(text.textBounds),
      columns: text.columns.map(shift),
    },
  };
}
