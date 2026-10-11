// Derived native snapshot only; commands keep generated identity addresses.
export function attachCreatedTables(editor, content, available, maxUnits, sectionCount) {
  const visible = new Set(content.paragraphs.map(p => `${p.section}:${p.paragraph}`));
  const rows = [];
  const pending = new Set();
  let units = 0;
  const sections = sectionCount === undefined ? new Set(content.paragraphs.map(p => p.section)) : Array.from({ length: sectionCount }, (_, index) => index);
  if (available) for (const section of sections) {
    for (const table of editor.createdTables(section)) {
      pending.add(section);
      const hostParagraph = table.host_paragraph - 1;
      if (!visible.has(`${section}:${hostParagraph}`)) continue;
      for (const cell of table.cells) {
        units += cell.text.length;
        if (units > maxUnits) throw new Error("CreatedTableDisplayTextBudgetExceeded");
      }
      rows.push({ ...table, section, hostParagraph, anchorUnit: table.anchor_unit });
    }
  }
  content.createdTables = rows;
  const modes = new Map();
  if (pending.size) for (const section of new Set(content.paragraphs.map(p => p.section))) {
    modes.set(section, typeof editor.createdTableHostMode === "function" && editor.createdTableHostMode(section));
  }
  for (const paragraph of content.paragraphs) if (pending.size) {
    paragraph.plainEditable = !!paragraph.plainEditable && modes.get(paragraph.section) === true;
    paragraph.editable = paragraph.plainEditable;
    paragraph.anchorEditable = false;
    paragraph.anchoredSplitAvailable = false;
    paragraph.nextMergeParagraph = null;
    paragraph.previousMergeParagraph = null;
    paragraph.fieldLabels = [];
    if (!paragraph.editable) paragraph.readOnlyReason = "UnsupportedCreatedTableHostEdit";
  }
  content.readOnly = !content.paragraphs.some(paragraph => paragraph.editable);
  content.tableCreationAvailable = available;
  return content;
}
