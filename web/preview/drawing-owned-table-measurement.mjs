import { measureNestedTable } from "./nested-table-measurement.mjs";
import { measureNestedInlineTableObject } from "./nested-inline-table-object-measurement.mjs";

// A drawing text list is an ownership boundary, not an absent body paragraph.
export function measureDrawingOwnedTables(content, drawing, measure, maxRows) {
  const tables = [], paragraphIds = new Set();
  const members = new Set(content.paragraphs.filter(p => p.section === drawing.section
    && p.drawingText?.drawingNode === drawing.drawingNode).map(p => p.paragraph));
  let used = 0;
  for (const table of content.tables ?? []) {
    if (table.section !== drawing.section || !members.has(table.hostParagraph)) continue;
    const host = content.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
    const ids = new Set(table.cells.flatMap(cell => cell.paragraphs));
    if (table.parentTableNode != null || table.sourceCaption || table.sourceGeometry?.geometry?.treat_as_character !== true
      || table.sourceGeometry.geometry.width_relative !== 4 || table.sourceGeometry.geometry.height_relative !== 2
      || table.pagination?.cell_spacing !== 0
      || !Number.isSafeInteger(table.anchorUnit) || host?.text?.[table.anchorUnit] !== "\ufffc"
      || content.tables.some(t => t.section === table.section && t.parentTableNode === table.tableNode)
      || content.drawings.some(d => d.section === table.section && ids.has(d.hostParagraph)))
      return { state: "unavailable", error: "UnsupportedDrawingOwnedTable", section: table.section, tableNode: table.tableNode, drawingNode: drawing.drawingNode };
    if (used >= maxRows) return { state: "unavailable", error: "DrawingTextLayoutLimit" };
    const measured = measureNestedTable(content, table, measure, { maxRows: maxRows - used, overflow: "visible" });
    if (measured.state !== "measured") return measured;
    if ([...measured.flows.values()].some(f => f.floatingTables?.length || f.flowPictures?.length || f.inlineDrawings?.length))
      return { state: "unavailable", error: "UnsupportedDrawingOwnedTableObjects" };
    const object = measureNestedInlineTableObject(table, measured, content.paragraphs, measure, maxRows - used);
    if (object.state !== "object-measured") return object;
    used += object.rowCount;
    tables.push({ table, measured, object });
    for (const id of ids) paragraphIds.add(`${table.section}:${id}`);
  }
  return { state: "prepared", tables, paragraphIds };
}
