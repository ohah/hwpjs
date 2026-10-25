import { measureInlineObjectParagraph } from "./inline-object-paragraph-measurement.mjs";
import { layoutContent } from "./layout.mjs";
import { inlinePictureIndex } from "./picture-inline.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { hasPictureSourceErrors } from "./picture-source-validation.mjs";

// Only host rows enter the cell flow. Drawing text remains a measured owned
// descriptor and is projected after the real cell page is selected.
export function measureInlineDrawingCellFlow(input, entries, content) {
  const selected = entries.filter(e => e.owner.tableCell?.tableNode === input.table.tableNode
    && e.owner.tableCell.listNode === input.cell.listNode && e.drawing.section === input.table.section);
  if (!selected.length) return null;
  const fail = error => ({ state: "unavailable", error, section: input.table.section, tableNode: input.table.tableNode, listNode: input.cell.listNode });
  if (input.table.parentTableNode != null || input.columnContext?.declaration?.count > 1
    || content.tables.some(t => t.section === input.table.section && t.parentTableNode === input.table.tableNode && t.parentListNode === input.cell.listNode))
    return fail("UnsupportedCellInlineDrawingCombination");
  if (!Array.isArray(input.pictures) || Array.from(input.pictures).some(p => !p || !p.owner
    || !Number.isInteger(p.pictureNode) || p.pictureNode < 0 || p.pictureNode > 0xffffffff
    || p.section !== input.table.section || p.geometry?.treatAsCharacter !== true || p.caption != null
    || hasPictureSourceErrors(p) || p.owner?.anchorNode !== p.pictureNode || p.owner.paragraph !== p.paragraph || p.owner.anchorUnit !== p.anchorUnit))
    return fail("UnsupportedCellInlineDrawingPictures");
  const pictures = inlinePictureIndex({ paragraphs: input.paragraphs, pictures: input.pictures });
  if (pictures.size !== input.pictures.length || new Set(input.pictures.map(p => p.pictureNode)).size !== input.pictures.length
    || [...pictures.values()].some(item => !item)) return fail("InvalidCellInlineDrawingPictures");
  const measure = pictureTextMeasure(pictures, [], input.measure);
  const rows = [], descriptors = [];
  let height = 0, internalRows = 0;
  for (const paragraph of input.paragraphs) {
    const local = selected.filter(e => e.drawing.hostParagraph === paragraph.paragraph);
    internalRows += local.reduce((sum, entry) => sum + (entry.measured.rowCount ?? entry.measured.text.rows.length), 0);
    const budget = input.maxRows - rows.length - internalRows;
    if (budget < 1) return fail("TableCellMeasurementLimit");
    const measured = local.length ? measureInlineObjectParagraph(paragraph, local.map(({ drawing, measured }) => ({
      objectNode: drawing.drawingNode, unit: drawing.anchorUnit, width: measured.width, height: measured.height })), input.width, measure,
      { maxRows: budget, compactLines: true, allowLineOverflow: true, includeTerminalAfter: paragraph !== input.paragraphs.at(-1),
        textAnchorUnits: input.pictures.filter(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).map(p => p.anchorUnit) })
      : layoutContent({ paragraphs: [paragraph], pictures: input.pictures.filter(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph), limited: false }, input.width, measure, budget, { documentBody: true, compactLines: true, includeTerminalAfter: paragraph !== input.paragraphs.at(-1) });
    if (measured.state === "unavailable") return measured;
    if (measured.limited || !Number.isFinite(height + measured.height)) return fail("TableCellMeasurementLimit");
    rows.push(...measured.rows.map(row => ({ ...row, y: row.y + height })));
    descriptors.push(...local);
    height += measured.height;
  }
  if (descriptors.length !== selected.length) return fail("AmbiguousCellInlineDrawingOwner");
  return { rows, height, width: input.width, limited: false, inlineDrawings: descriptors };
}
