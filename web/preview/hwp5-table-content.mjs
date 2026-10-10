import { attachTables } from "./table-content.mjs";
import { attachTablePlacements } from "./table-placements-content.mjs";
import { attachHwp5TableLayoutSources } from "./hwp5-table-layout-content.mjs";
import { attachHwp5CellLayoutSources } from "./hwp5-cell-layout-content.mjs";
import { attachHwp5TableAnchors } from "./hwp5-table-anchor-content.mjs";
import { attachHwp5TableGeometry } from "./hwp5-table-geometry-content.mjs";

export function attachHwp5Tables(editor, preview, content) {
  attachTables(editor, preview, content);
  if (!editor) { content.tablePlacementsErrors = []; return content; }
  return attachHwp5TableGeometry(attachHwp5TableAnchors(editor, attachHwp5CellLayoutSources(editor, attachHwp5TableLayoutSources(editor, attachTablePlacements(editor, preview.sections, content)))));
}
