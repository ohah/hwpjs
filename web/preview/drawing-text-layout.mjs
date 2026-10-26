import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { nextTextRow } from "./next-text-row.mjs";
import { paragraphSpacePixels, paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";
import { rowVisualHeight } from "./row-geometry.mjs";

// Fixed drawing text area; overflow is explicit, never a shortened success.
export function layoutDrawingText(
  drawing,
  paragraphs,
  declaration,
  rectangle,
  measure,
  { maxRows = 20000, compactLines = false, overflow = "reject" } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!["reject", "extend-last-column"].includes(overflow))
    return unavailable("InvalidDrawingTextLayout");
  const text = drawing?.source?.text;
  if (
    !text ||
    text.text_direction !== 0 ||
    text.line_wrap !== 0 ||
    ![0, 1, 2].includes(text.vertical_alignment)
  )
    return unavailable("UnsupportedDrawingTextLayout");
  if (
    !Array.isArray(paragraphs) ||
    !paragraphs.length ||
    typeof measure !== "function" ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !rectangle ||
    ![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite)
  )
    return unavailable("InvalidDrawingTextLayout");
  if (
    !text.margin_present ||
    !Array.isArray(text.margins) ||
    text.margins.length !== 4 ||
    !text.margins.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)
  )
    return unavailable("UnsupportedDrawingTextMargins");
  const [left, right, top, bottom] = text.margins.map(hwpUnitPixels);
  const body = {
    x: rectangle.x + left,
    y: rectangle.y + top,
    width: rectangle.width - left - right,
    height: rectangle.height - top - bottom,
  };
  const columns = columnReferenceBoxes(body, declaration);
  if (columns.state !== "placed") return columns;
  const rows = [],
    used = columns.boxes.map(() => 0);
  const cursor = columns.boxes.map(() => 0);
  let columnIndex = 0;
  const extendLast = () =>
    overflow === "extend-last-column" && columnIndex === columns.boxes.length - 1;
  const gap = (height) => {
    if (height === 0) return true;
    while (cursor[columnIndex] + height > body.height && !extendLast()) {
      if (++columnIndex === columns.boxes.length) return false;
    }
    cursor[columnIndex] += height;
    used[columnIndex] = Math.max(used[columnIndex], cursor[columnIndex]);
    return true;
  };
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    if (
      paragraph.section !== drawing.section ||
      paragraph.drawingText?.drawingNode !== drawing.drawingNode ||
      paragraph.drawingText?.listNode !== text.list_node ||
      paragraph.tableCell ||
      paragraph.tableCaption ||
      paragraph.drawingCaption ||
      paragraph.clipped ||
      typeof paragraph.text !== "string"
    )
      return unavailable("DrawingTextDisplayBindingMismatch");
    if (!gap(paragraphSpacePixels(paragraph.paragraphShape?.before)))
      return unavailable("DrawingTextOverflow");
    let unit = 0;
    const terminalBreak = isHardLineBreak(paragraph.text.slice(-1));
    do {
      const terminalRow = unit === paragraph.text.length;
      if (rows.length >= maxRows) return unavailable("DrawingTextLayoutLimit");
      let row = nextTextRow(paragraph, unit, columns.boxes[columnIndex].width, measure, {
        minimumTextHeight: 0,
      });
      const compact = (value) =>
        compactLines
          ? {
              ...value,
              textTop: 0,
              height:
                paragraphIndex === paragraphs.length - 1 &&
                value.endUnit === paragraph.text.length &&
                (!terminalBreak || terminalRow)
                  ? value.textHeight
                  : paragraphLineAdvance(
                      paragraph.paragraphShape,
                      value.textHeight,
                      value.textHeight,
                    ),
            }
          : value;
      row = compact(row);
      const occupiedHeight = (value) => (compactLines ? value.textHeight : rowVisualHeight(value));
      if (occupiedHeight(row) > body.height && overflow === "reject")
        return unavailable("DrawingTextOverflow");
      while (cursor[columnIndex] + occupiedHeight(row) > body.height && !extendLast()) {
        if (++columnIndex === columns.boxes.length) return unavailable("DrawingTextOverflow");
        row = nextTextRow(paragraph, unit, columns.boxes[columnIndex].width, measure, {
          minimumTextHeight: 0,
        });
        row = compact(row);
        if (occupiedHeight(row) > body.height && overflow === "reject")
          return unavailable("DrawingTextOverflow");
      }
      if (
        !Number.isFinite(row.height) ||
        row.height < 0 ||
        (unit < paragraph.text.length && row.endUnit <= unit)
      )
        return unavailable("InvalidDrawingTextLayout");
      rows.push({
        ...row,
        x: columns.boxes[columnIndex].x,
        y: body.y + cursor[columnIndex],
        columnOrdinal: columnIndex,
        drawingNode: drawing.drawingNode,
        listNode: text.list_node,
      });
      used[columnIndex] = Math.max(used[columnIndex], cursor[columnIndex] + occupiedHeight(row));
      cursor[columnIndex] += row.height;
      unit = row.endUnit;
      if (terminalRow) break;
    } while (unit < paragraph.text.length || terminalBreak);
    if (!gap(paragraphSpacePixels(paragraph.paragraphShape?.after)))
      return unavailable("DrawingTextOverflow");
  }
  if (compactLines) {
    const terminalRows = new Map(rows.map((row) => [row.columnOrdinal, row]));
    for (const row of terminalRows.values()) row.height = row.textHeight;
  }
  const factor = text.vertical_alignment / 2;
  const aligned = rows.map((row) => ({
    ...row,
    y: row.y + Math.max(0, body.height - used[row.columnOrdinal]) * factor,
  }));
  if (aligned.some((row) => !Number.isFinite(row.y) || !Number.isFinite(row.y + row.height)))
    return unavailable("InvalidDrawingTextLayout");
  const contentBottom = Math.max(body.y + body.height, ...aligned.map((row) => row.y + row.height));
  if (!Number.isFinite(contentBottom) || !Number.isFinite(contentBottom - body.y))
    return unavailable("InvalidDrawingTextLayout");
  return {
    state: "placed",
    rows: aligned,
    columns: columns.boxes,
    body,
    limited: false,
    ...(overflow === "extend-last-column"
      ? {
          overflowed: contentBottom > body.y + body.height,
          textBounds: { ...body, height: contentBottom - body.y },
        }
      : {}),
  };
}
