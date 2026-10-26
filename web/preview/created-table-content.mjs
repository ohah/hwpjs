import { hwpxCreatedCellDisplay } from './hwpx-created-cell-display.mjs';
// Derived native snapshot only; commands keep generated identity addresses.
export function attachCreatedTables(editor, content, available, maxUnits, sectionCount) {
  const visible = new Set(content.paragraphs.map((p) => `${p.section}:${p.paragraph}`));
  const rows = [];
  const pending = new Set();
  let units = 0;
  let paragraphShapes;
  const softLineBreakAvailable = available && editor.supportsCreatedCellSoftLineBreaks?.() === true;
  const sections =
    sectionCount === undefined
      ? new Set(content.paragraphs.map((p) => p.section))
      : Array.from({ length: sectionCount }, (_, index) => index);
  if (available)
    for (const section of sections) {
      for (const table of editor.createdTables(section)) {
        pending.add(section);
        const hostParagraph = table.host_paragraph - 1;
        if (!visible.has(`${section}:${hostParagraph}`)) continue;
        if (paragraphShapes === undefined) {
          try {
            paragraphShapes =
              typeof editor.paragraphShapes === 'function' ? editor.paragraphShapes() : null;
          } catch (error) {
            paragraphShapes = null;
            content.createdTableParagraphDisplayError = error.message;
          }
        }
        for (const cell of table.cells) {
          units += cell.text.length;
          if (units > maxUnits) throw new Error('CreatedTableDisplayTextBudgetExceeded');
        }
        rows.push({
          ...table,
          ...hwpxCreatedCellDisplay(table, paragraphShapes),
          cells: table.cells.map((cell) => ({
            ...cell,
            ...(softLineBreakAvailable ? { softLineBreakAvailable: true } : {}),
          })),
          section,
          hostParagraph,
          anchorUnit: table.anchor_unit,
        });
      }
    }
  content.createdTables = rows;
  content.createdTableHostPending = pending.size !== 0;
  const modes = new Map();
  if (pending.size)
    for (const section of new Set(content.paragraphs.map((p) => p.section))) {
      const query = typeof editor.createdTableHostMode === 'function';
      modes.set(section, {
        plain: query && editor.createdTableHostMode(section),
        anchored: query && editor.createdTableHostMode(section, true),
        fields:
          typeof editor.createdTableFieldLabelMode === 'function' &&
          editor.createdTableFieldLabelMode(section),
      });
    }
  for (const paragraph of content.paragraphs)
    if (pending.size) {
      const mode = modes.get(paragraph.section);
      paragraph.plainEditable = !!paragraph.plainEditable && mode.plain === true;
      paragraph.anchorEditable = !!paragraph.anchorEditable && mode.anchored === true;
      paragraph.fieldLabels = mode.fields === true ? (paragraph.fieldLabels ?? []) : [];
      paragraph.editable =
        paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0;
      paragraph.anchoredSplitAvailable = false;
      paragraph.nextMergeParagraph = null;
      paragraph.previousMergeParagraph = null;
      if (!paragraph.editable) paragraph.readOnlyReason = 'UnsupportedCreatedTableHostEdit';
    }
  content.readOnly = !content.paragraphs.some((paragraph) => paragraph.editable);
  content.tableCreationAvailable = available;
  return content;
}
