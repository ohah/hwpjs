import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { measureCreatedBodyFlow, projectCreatedBodyFlow } from "./created-body-flow-measurement.mjs";

// Inline whole-object path. Oversized objects retain explicit fallback, not loss.
export function layoutCreatedTableInlinePages(content, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!["hwp5", "hwpx"].includes(content.format) || content.window || content.limited || content.pageSettings?.length !== 1
      || !content.createdTables?.length || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("UnsupportedCreatedTablePageScope");
  if (content.hwp5PageNumberSource?.page_controls?.length || content.hwp5PageNumberSource?.section_starts?.length) return unavailable("UnsupportedCreatedTablePageControls");
  const bodyIds = new Set(content.paragraphs.filter(p => !p.tableCell && !p.tableCaption).map(p => `${p.section}:${p.paragraph}`));
  const bodyFlows = content.paragraphFlows?.filter(flow => bodyIds.has(`${flow.section}:${flow.paragraph}`));
  if (["pictures", "drawings", "rectangles", "lines", "checkBoxes", "charts", "noteBodies"].some(key => content[key]?.length)
      || content.paragraphs.some(paragraph => paragraph.drawingText || paragraph.clipped || paragraph.textStartUnit)
      || !bodyFlows?.length || bodyFlows.some(flow => flow.top_level !== true || flow.single_column !== true || flow.host !== "body"
        || flow.column_declaration && flow.column_declaration.count !== 1 || flow.column_changes?.some(change => change.declaration?.count !== 1))) return unavailable("UnsupportedCreatedTablePageObjects");
  const setting = content.pageSettings[0], reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  if (content.paragraphs.some(paragraph => paragraph.section !== setting.section_ordinal)) return unavailable("UnsupportedCreatedTablePageScope");
  const measured = measureCreatedBodyFlow(content, reference.boxes.page.width, measure, maxRows);
  if (measured.state !== "measured") return measured;
  const paginated = paginateBodyRows(measured.rows, setting, bodyFlows, { maxRows });
  if (paginated.state !== "paginated") return paginated;
  if (paginated.limited) return unavailable("CreatedTablePageProjectionLimit");
  const projected = projectCreatedBodyFlow(measured, paginated.rows, maxRows);
  if (projected.state !== "projected") return projected;
  const { rows, boxes, hostNumberPrefixes, createdCellParagraphs } = projected;
  if (rows.some(row => ![row.x, row.y, row.height, row.x + (row.width ?? 0), row.y + row.height].every(Number.isFinite))) return unavailable("InvalidCreatedTablePageProjection");
  const sourceTexts = new Map(content.paragraphs.map(paragraph => [`${paragraph.section}:${paragraph.paragraph}`, paragraph.text]));
  const sourceRows = rows.filter(row => !row.createdCell && (row.kind !== "text" || row.startUnit < row.endUnit || sourceTexts.get(`${row.section}:${row.paragraph}`) === ""));
  const coverage = pageParagraphCoverage(content.paragraphs, sourceRows);
  if (coverage.state !== "complete") return coverage;
  return { ...paginated, rows: rows.sort((a, b) => a.y - b.y || a.x - b.x), boxes,
    pages: paginated.pages.map(page => ({ ...page, section: setting.section_ordinal })), spatialRows: true,
    createdTablesPaginated: true, hostNumberPrefixes, createdCellParagraphs, pageLayoutMode: "measured-created-inline" };
}
