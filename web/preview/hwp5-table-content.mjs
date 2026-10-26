import { attachTables } from './table-content.mjs';
import { attachTablePlacements } from './table-placements-content.mjs';
import { attachHwp5TableLayoutSources } from './hwp5-table-layout-content.mjs';
import { attachHwp5CellLayoutSources } from './hwp5-cell-layout-content.mjs';
import { attachHwp5TableAnchors } from './hwp5-table-anchor-content.mjs';
import { attachHwp5TableGeometry } from './hwp5-table-geometry-content.mjs';
import { hwp5WindowTableSourceEditor } from './hwp5-window-table-sources.mjs';
import { attachHwp5TableBorderSources } from './hwp5-table-border-content.mjs';

export function attachHwp5Tables(editor, preview, content) {
  attachTables(editor, preview, content);
  attachHwp5TableBorderSources(editor, content);
  if (!editor) {
    content.tablePlacementsErrors = [];
    return content;
  }
  attachTablePlacements(editor, preview.sections, content);
  const sources = content.window ? hwp5WindowTableSourceEditor(editor, content) : editor;
  return attachHwp5TableGeometry(
    attachHwp5TableAnchors(
      sources,
      attachHwp5CellLayoutSources(sources, attachHwp5TableLayoutSources(sources, content)),
    ),
  );
}
