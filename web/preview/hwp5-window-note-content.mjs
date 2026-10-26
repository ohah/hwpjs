import { validateHwp5NoteSources } from '../../js/hwp5-note-sources.mjs';
import { attachHwp5Notes } from './hwp5-note-content.mjs';
import { hwp5WindowFlows } from './hwp5-window-flows.mjs';

// Explicit window adapter; full-document attachment keeps its strict inventory.
export function attachHwp5WindowNotes(editor, content) {
  const { displayed, completeFlows, selectedFlows } = hwp5WindowFlows(editor, content);
  content.currentParagraphFlows = selectedFlows;
  const scoped = Object.create(editor);
  scoped.noteSources = (section) => {
    const rows = validateHwp5NoteSources(editor.noteSources(section)).filter((row) =>
      displayed.has(`${section}:${row.paragraph}`),
    );
    for (const source of rows) {
      const members = completeFlows
        .get(section)
        .filter(
          (row) =>
            row.host === source.kind &&
            row.parent_node === source.control_node &&
            row.list_node === source.list_node,
        );
      if (members.some((row) => !displayed.has(`${section}:${row.paragraph}`)))
        throw new Error('MissingHwp5NoteBody');
    }
    return rows;
  };
  for (const section of completeFlows.keys()) scoped.noteSources(section);
  return attachHwp5Notes(scoped, content);
}
