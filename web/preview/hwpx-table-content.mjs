import { attachTables } from "./table-content.mjs";
import { attachTablePlacements } from "./table-placements-content.mjs";
import { attachTableCaptions } from "./table-caption-content.mjs";

export function attachHwpxTables(editor, content) {
  const sections = [...new Set(content.paragraphs.map(p => p.section))].map(index => ({ index }));
  const displayed = { tableBindings(section) { return editor.tableBindings(section).map(row => ({ ...row, paragraph: row.paragraph - 1 })); } };
  attachTables(displayed, { sections }, content);
  attachTablePlacements(editor, sections, content, -1);
  attachTableCaptions(editor, sections, content);
  content.tablePaginationErrors = [];
  content.tableGeometryErrors = [];
  content.tableCellMarginErrors = [];
  content.tableCaptionErrors = [];
  for (const table of content.tables) {
    for (const cell of table.cells) {
      try { cell.sourceMargin = editor.tableCellMargin(table.section, cell.listNode); }
      catch (error) { content.tableCellMarginErrors.push({ section: table.section, listNode: cell.listNode, error: error.message }); }
    }
    try { table.sourceGeometry = editor.tableGeometry(table.section, table.tableNode); }
    catch (error) { content.tableGeometryErrors.push({ section: table.section, tableNode: table.tableNode, error: error.message }); }
    try { table.sourceCaption = editor.tableCaption(table.section, table.tableNode); }
    catch (error) { content.tableCaptionErrors.push({ section: table.section, tableNode: table.tableNode, error: error.message }); }
  }
  for (const section of sections) {
    try {
      const rows = editor.tablePagination(section.index);
      const tables = new Map(content.tables.filter(table => table.section === section.index).map(table => [table.tableNode, table]));
      for (const row of rows) {
        const table = tables.get(row.table_node);
        if (table) table.pagination = row.values;
      }
    } catch (error) { content.tablePaginationErrors.push({ section: section.index, error: error.message }); }
  }
  return content;
}
