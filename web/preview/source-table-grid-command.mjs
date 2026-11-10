import { captureSourceTableGridRequest } from '../../js/source-table-grid.mjs';

/** Transport fields are separate from the strict SDK payload. Native owns source identity. */
export function applySourceTableGridCommand(editor, format, historyEnabled, message) {
  if (!editor || !historyEnabled) throw new Error('EditorNotOpen');
  if (format !== 'hwp5' && format !== 'hwpx') throw new Error('UnsupportedSourceTableGridFormat');
  const input = Object.create(null);
  for (const key of [
    'section',
    'tableNode',
    'expectedRows',
    'expectedColumns',
    'action',
    'index',
    'layout',
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(message, key);
    if (descriptor) Object.defineProperty(input, key, descriptor);
  }
  const request = captureSourceTableGridRequest(input, format);
  if (editor.supportsSourceTableGrid?.() !== true) throw new Error('SourceTableGridUnavailable');
  editor.editSourceTableGrid(request);
}
