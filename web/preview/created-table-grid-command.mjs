import { captureCreatedTableGridRequest } from '../../js/created-table-grid.mjs';

/** Transport fields stay at the boundary; Native owns target, bounds and rollback checks. */
export function applyCreatedTableGridCommand(editor, format, historyEnabled, message) {
  if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
  if (format !== 'hwp5' && format !== 'hwpx') throw new Error('UnsupportedCreatedTableGridFormat');
  const request = captureCreatedTableGridRequest({
    section: message.section,
    identity: message.identity,
    action: message.action,
    index: message.index,
  });
  if (editor.supportsCreatedTableGrid?.() !== true) throw new Error('CreatedTableGridUnavailable');
  editor.editCreatedTableGrid(request);
}
