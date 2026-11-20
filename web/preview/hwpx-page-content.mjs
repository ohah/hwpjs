import { bindSourceNoteBodies } from './note-body-bindings.mjs';
import { selectNoteSourceTables } from './note-source-table-owners.mjs';
import { attachGroupedShapeSources } from './grouped-shape-content.mjs';
import { attachContainerCaptions } from './container-caption-content.mjs';
import { attachFillBrushSources } from './fill-brush-content.mjs';
import { attachRectangleSources } from './rectangle-content.mjs';
/** Source page declarations and note ownership; no physical page count. */
export function attachHwpxPageSettings(editor, content) {
  const sections = new Set(content.paragraphs.map((row) => row.section));
  const displayed = content.window
    ? new Set(content.paragraphs.map((row) => `${row.section}:${row.paragraph}`))
    : null;
  attachRectangleSources(editor, content);
  attachGroupedShapeSources(editor, content);
  attachContainerCaptions(editor, content);
  attachFillBrushSources(editor, content);
  content.pageSettings = [];
  content.noteShapes = null;
  content.noteShapesError = null;
  try {
    content.noteShapes = editor.noteShapes();
  } catch (error) {
    content.noteShapesError = error.message;
  }
  content.pageSettingsError = null;
  try {
    if (typeof editor.pageSettings !== 'function')
      throw new Error('HwpxPageSettingsAbiUnavailable');
    content.pageSettings = editor.pageSettings();
    if (displayed)
      content.pageSettings = content.pageSettings.filter((row) =>
        sections.has(row.section_ordinal),
      );
  } catch (error) {
    content.pageSettingsError = error.message;
  }
  content.paragraphFlows = [];
  content.paragraphFlowErrors = [];
  for (const section of sections) {
    try {
      if (typeof editor.paragraphFlow !== 'function')
        throw new Error('HwpxParagraphFlowAbiUnavailable');
      for (const row of editor.paragraphFlow(section)) {
        if (displayed && !displayed.has(`${section}:${row.paragraph - 1}`)) continue;
        content.paragraphFlows.push({ ...row, section, paragraph: row.paragraph - 1 });
      }
    } catch (error) {
      content.paragraphFlowErrors.push({ section, error: error.message });
    }
  }
  attachDirectNoteSelectionOwners(content);
  if (!content.window && !content.limited) {
    try {
      content.hwpxPageNumberSource = editor.pageNumberDisplaySource?.() ?? null;
    } catch (error) {
      content.hwpxPageNumberSource = { error: error.message };
    }
  }
  const sourceTables = content.tables?.length ? selectNoteSourceTables(content) : null;
  const notes = bindSourceNoteBodies(
    content,
    sourceTables?.state === 'selected' ? sourceTables : null,
  );
  content.noteBodies = notes.state === 'bound' ? notes.notes : [];
  content.noteBodyBindingError = notes.state === 'bound' ? null : notes.error;
  return content;
}

function attachDirectNoteSelectionOwners(content) {
  if (content.paragraphFlowErrors.length) return;
  const coordinates = (row) => `${row.section}:${row.paragraph}`;
  const flows = new Map();
  for (const flow of content.paragraphFlows) {
    const key = coordinates(flow);
    if (flows.has(key)) return;
    flows.set(key, flow);
  }
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  for (const row of content.paragraphs) {
    const flow = flows.get(coordinates(row));
    const context = flow?.note_context;
    if (
      !context ||
      flow.top_level !== false ||
      !['footnote', 'endnote'].includes(flow.host) ||
      context.kind !== flow.host ||
      ![context.note_node, context.list_node, flow.source_node].every(uint) ||
      !(context.note_node < context.list_node && context.list_node < flow.source_node) ||
      row.clipped ||
      row.selectionOwner != null ||
      row.tableCell ||
      row.tableCaption ||
      row.drawingText ||
      row.drawingCaption ||
      row.createdCell ||
      row.pageArea
    )
      continue;
    row.selectionOwner = `section:${row.section}:${context.kind}:${context.note_node}:list:${context.list_node}`;
  }
}
