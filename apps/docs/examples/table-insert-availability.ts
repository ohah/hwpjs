import {
  getSelectionFormatting,
  getTableInsertAvailability,
  type HeadlessEditor,
} from '@ohah/hwpjs';

export function getTableInsertionState(editor: HeadlessEditor) {
  return editor.read((state) =>
    getTableInsertAvailability(state, getSelectionFormatting(state).target),
  );
}
