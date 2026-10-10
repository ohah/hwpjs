import { sourceDisplayPosition } from "./text-offsets.mjs";
/** Current protected placeholder boundaries, not raw source offsets. */
export function attachHwp5TableAnchors(editor, content) {
  content.tableAnchorErrors = [];
  for (const table of content.tables) { delete table.anchorUnit; delete table.anchorSource; }
  if (!editor) return content;
  const paragraphs = new Map(content.paragraphs.map(row => [`${row.section}:${row.paragraph}`, row]));
  for (const section of new Set(content.tables.map(row => row.section))) {
    try {
      const anchors = editor.tableAnchors(section), tables = content.tables.filter(row => row.section === section), byNode = new Map();
      for (const row of anchors) {
        if (byNode.has(row.table_record_node)) throw new Error("AmbiguousTableDisplayAnchor");
        byNode.set(row.table_record_node, row);
      }
      if (anchors.length !== tables.length) throw new Error("IncompleteTableDisplayAnchors");
      const prepared = [];
      for (const table of tables) {
        const row = byNode.get(table.tableNode), paragraph = paragraphs.get(`${section}:${table.hostParagraph}`);
        if (!row || row.paragraph !== table.hostParagraph || row.control_node !== table.layoutSource?.table_node || !paragraph || paragraph.clipped) throw new Error("TableDisplayAnchorBindingMismatch");
        const unit = sourceDisplayPosition(row.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(row.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "\ufffc") throw new Error("TableDisplayAnchorMismatch");
        prepared.push({ table, row, unit });
      }
      for (const { table, row, unit } of prepared) { table.anchorUnit = unit; table.anchorSource = row; }
    } catch (error) { content.tableAnchorErrors.push({ section, error: error.message }); }
  }
  return content;
}
