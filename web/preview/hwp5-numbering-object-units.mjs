import { hwp5NumberingNoteUnits } from "./hwp5-numbering-note-units.mjs";

// Known object markers are not page-number controls. Never exempt unknown markers.
export function hwp5NumberingObjectUnits(content, paragraph) {
  const units = new Set(), identities = new Set();
  const fail = () => { throw new Error("AmbiguousHwp5NumberingObjectAnchor"); };
  const add = (kind, node, unit) => {
    if (!Number.isInteger(node) || node < 0 || node > 0xffffffff || !Number.isInteger(unit) || unit < 0
      || paragraph.text[unit] !== "\ufffc" || units.has(unit) || identities.has(`${kind}:${node}`)) fail();
    units.add(unit); identities.add(`${kind}:${node}`);
  };
  for (const drawing of content.hwp5Drawings ?? []) {
    if (drawing.section !== paragraph.section || drawing.hostParagraph !== paragraph.paragraph) continue;
    if (drawing.source?.control_node !== drawing.controlNode || drawing.source?.component_node !== drawing.componentNode) fail();
    add("drawing", drawing.controlNode, drawing.anchorUnit);
  }
  for (const table of content.tables ?? []) {
    if (table.section !== paragraph.section || table.hostParagraph !== paragraph.paragraph) continue;
    add("table", table.tableNode, table.anchorUnit);
  }
  for (const [node, unit] of hwp5NumberingNoteUnits(content, paragraph)) add("note", node, unit);
  return units;
}
