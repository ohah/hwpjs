// Derived native snapshot only; commands keep generated identity addresses.
export function attachCreatedTables(editor, content, available, maxUnits) {
  const visible = new Set(content.paragraphs.map(p => `${p.section}:${p.paragraph}`));
  const rows = [];
  const pending = new Set();
  let units = 0;
  if (available) for (const section of new Set(content.paragraphs.map(p => p.section))) {
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
  for (const paragraph of content.paragraphs) if (pending.has(paragraph.section)) {
    paragraph.editable = false;
    paragraph.plainEditable = false;
    paragraph.anchorEditable = false;
    paragraph.fieldLabels = [];
    paragraph.readOnlyReason = "UnsupportedCreatedTableHostEdit";
  }
  content.tableCreationAvailable = available;
  return content;
}
