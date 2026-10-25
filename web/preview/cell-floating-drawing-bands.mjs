// Whole floating drawings and their complete anchor paragraphs travel together.
export function cellFloatingDrawingBands(table, cell, flow) {
  const fail = () => ({ state: "unavailable", error: "InvalidCellFloatingDrawingReservation" });
  if (flow.floatingDrawings === undefined) return { state: "prepared", bands: [] };
  if (!Array.isArray(flow.floatingDrawings) || !Array.isArray(flow.rows)) return fail();
  const nodes = new Set(), bands = [];
  for (const item of flow.floatingDrawings) {
    if (!item || item.section !== table.section || item.tableNode !== table.tableNode || item.listNode !== cell.listNode
      || !Number.isSafeInteger(item.drawingNode) || item.drawingNode < 0 || nodes.has(item.drawingNode)
      || !cell.paragraphs.includes(item.paragraph) || ![item.start, item.end].every(Number.isFinite)
      || item.start < 0 || item.end <= item.start || item.end > flow.height + 1e-8) return fail();
    const box = item.rectangle;
    if (!box || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
      || box.x < 0 || box.width <= 0 || box.height <= 0 || box.y < item.start || box.y + box.height > item.end + 1e-8) return fail();
    const rows = flow.rows.filter(r => r.kind === "text" && r.section === item.section && r.paragraph === item.paragraph);
    if (!rows.length || rows.some(r => r.y < item.start || r.y + r.height > item.end + 1e-8)) return fail();
    nodes.add(item.drawingNode); bands.push({ start: item.start, end: item.end, drawingNode: item.drawingNode });
  }
  return { state: "prepared", bands };
}
