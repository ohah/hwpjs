// Translate a premeasured caption only after the owning whole table is placed.
export function projectTablePageCaption(table, reservation, layout, { maxRows = 20000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (reservation?.state !== "reserved" || layout?.state !== "placed" || !Array.isArray(layout.boxes) || !Array.isArray(layout.rows) || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidTableCaptionPageProjection");
  const boxes = layout.boxes.filter(box => box.section === table.section && box.tableNode === table.tableNode);
  if (!boxes.length || new Set(boxes.map(box => box.pageOrdinal)).size !== 1) return unavailable("UnsupportedSplitTableCaption");
  const x = boxes.reduce((value, box) => Math.min(value, box.x), Infinity), y = boxes.reduce((value, box) => Math.min(value, box.y), Infinity);
  const caption = reservation.caption;
  const reference = boxes[0].referenceBoxes, column = reference?.column;
  if (!column) return unavailable("InvalidTableCaptionPageProjection");
  const origin = reservation.rectangle;
  if (!origin || ![origin.x, origin.y].every(Number.isFinite)) return unavailable("InvalidTableCaptionPageProjection");
  const dx = x - origin.x, dy = y - origin.y;
  const bounds = { x: dx + caption.bounds.x, y: dy + caption.bounds.y, width: caption.bounds.width, height: caption.bounds.height };
  const horizontal = table.sourceGeometry?.geometry?.treat_as_character === true || boxes.every(box => box.horizontalOverflowBoundary === "paper") ? reference.paper ?? column : column;
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.x < horizontal.x - 1e-8 || bounds.y < column.y - 1e-8 || bounds.x + bounds.width > horizontal.x + horizontal.width + 1e-8 || bounds.y + bounds.height > column.y + column.height + 1e-8) return unavailable("TableCaptionPageOverflow");
  if (layout.rows.length + caption.rows.length > maxRows) return unavailable("TableCaptionPageProjectionLimit");
  const rows = caption.rows.map(row => ({ ...row, x: row.x + dx, y: row.y + dy, pageOrdinal: boxes[0].pageOrdinal, referenceBoxes: reference }));
  if (rows.some(row => ![row.x, row.y, row.height].every(Number.isFinite))) return unavailable("InvalidTableCaptionPageProjection");
  const placed = { section: table.section, tableNode: table.tableNode, pageOrdinal: boxes[0].pageOrdinal,
    captionNode: table.sourceCaption.caption_node, listNode: table.sourceCaption.list_node,
    rectangle: { ...caption.captionRectangle, x: dx + caption.captionRectangle.x, y: dy + caption.captionRectangle.y }, bounds };
  return { ...layout, tableCaptionBounds: [...(layout.tableCaptionBounds ?? []), placed], rows: [...layout.rows, ...rows].toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x) };
}
