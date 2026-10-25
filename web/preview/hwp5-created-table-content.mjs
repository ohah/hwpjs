import { sourceDisplayPosition } from "./text-offsets.mjs";
import { hwp5CreatedCellDisplay } from "./hwp5-created-cell-display.mjs";

// Read-only native values; ordinary paragraph addresses never include these cells.
export function attachHwp5CreatedTables(editor, content, available, sectionCount, maxUnits = 200000) {
  content.tableCreationAvailable = available;
  content.tableCreationResources = available ? editor.tableCreationResources() : null;
  const tables = [];
  let units = 0;
  let paragraphShapes;
  const visible = new Map(content.paragraphs.map(row => [`${row.section}:${row.paragraph}`, row]));
  if (available) for (let section = 0; section < sectionCount; section++) {
    const snapshots = editor.createdTables(section);
    if (!snapshots.length) continue;
    if(paragraphShapes===undefined){
      try{paragraphShapes=typeof editor.paragraphShapes==="function"?editor.paragraphShapes():null;}
      catch(error){paragraphShapes=null;content.createdTableParagraphDisplayError=error.message;}
    }
    const first = editor.currentSourceReferences(section, { first: 0, count: 1 }).references[0];
    if (!first) throw new Error("MissingCreatedTableHost");
    for (const { table, options } of snapshots) {
      const host = visible.get(`${section}:${table.host_paragraph}`);
      if (!host) continue;
      const cells = table.cells.map(cell => {
        units += cell.text.length;
        if (units > maxUnits) throw new Error("CreatedTableDisplayTextBudgetExceeded");
        const currentReference = Object.freeze({ epoch: first.epoch, scope: first.scope, kind: "cell", section, id: table.identity, row: cell.row, column: cell.column });
        return { ...cell, currentReference, softLineBreakAvailable: true };
      });
      const anchorUnit = sourceDisplayPosition(table.anchor_unit, host.sourceOffsets ?? [{ at: 0, source: 0 }], host.text.length);
      tables.push({ ...table, ...hwp5CreatedCellDisplay(table,options,paragraphShapes),cells, hwp5Policy: options, section, hostParagraph: table.host_paragraph, anchorUnit });
    }
  }
  content.createdTables = tables;
  return content;
}
