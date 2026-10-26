import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";
import { plainDocumentTextInkHeight } from "./document-text-page-fit.mjs";

// A floating table keeps its paragraph anchor. Only complete text lines above
// its top are consumed before the existing CELL planner reserves the table.
export function belowHostFloatingTableFlow(paragraph, entries, flow, { columns = false } = {}) {
  if (
    columns ||
    flow?.state !== "measured" ||
    !Array.isArray(flow.sequence) ||
    entries?.length !== 1 ||
    !entries[0] ||
    typeof entries[0] !== "object" ||
    paragraph?.paragraphShape?.spacingFormat !== "hwpx" ||
    (paragraph.paragraphShape.before ?? 0) !== 0 ||
    (paragraph.paragraphShape.after ?? 0) !== 0 ||
    typeof paragraph.text !== "string" ||
    !paragraph.text.startsWith("\ufffc") ||
    paragraph.text.lastIndexOf("\ufffc") !== 0
  )
    return flow;
  const { table, tableIndex } = entries[0],
    source = table?.sourceGeometry;
  const top = paragraphCellOffset(table);
  if (
    top === null ||
    top <= 0 ||
    table?.parentTableNode !== null ||
    table.section !== paragraph.section ||
    table.hostParagraph !== paragraph.paragraph ||
    table.anchorUnit !== 0 ||
    table.sourceCaption ||
    table.pagination.cell_spacing !== 0 ||
    source.text_wrap !== 1 ||
    source.text_flow !== 0 ||
    source.hold_anchor !== false ||
    !Number.isSafeInteger(tableIndex) ||
    tableIndex < 0 ||
    flow.sequence[0]?.tableIndex !== tableIndex
  )
    return flow;
  const rows = flow.sequence.slice(1);
  if (!rows.length || flow.rowCount !== rows.length) return flow;
  let unit = 1,
    previousY = -Infinity,
    prefix = 0;
  for (const [index, row] of rows.entries()) {
    const ink = plainDocumentTextInkHeight(row);
    if (
      ink === null ||
      row.section !== paragraph.section ||
      row.paragraph !== paragraph.paragraph ||
      !Number.isFinite(row.y) ||
      row.y < 0 ||
      row.y < previousY ||
      !Number.isFinite(row.y + ink) ||
      row.startUnit !== unit ||
      !Number.isSafeInteger(row.endUnit) ||
      row.endUnit < unit ||
      row.text !== paragraph.text.slice(unit, row.endUnit)
    )
      return flow;
    if (prefix === index && row.y + ink <= top) prefix++;
    previousY = row.y;
    unit = row.endUnit;
  }
  if (!prefix || unit !== paragraph.text.length) return flow;
  return { ...flow, sequence: [...rows.slice(0, prefix), flow.sequence[0], ...rows.slice(prefix)] };
}
