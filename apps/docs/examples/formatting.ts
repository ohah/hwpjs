import {
  getSelectionFormatting, SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND, type HeadlessEditor,
} from '@hwpjs/core';

export async function makeBold(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.characterAvailableReason !== null) {
    throw Error(selection.characterAvailableReason ?? '선택이 없습니다.');
  }
  // size 단위는 1/100pt입니다. 1200은 12pt입니다.
  return editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
    target: selection.target, properties: { bold: true, size: 1200 },
  });
}

export async function alignCenter(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.paragraphAvailableReason !== null) {
    throw Error(selection.paragraphAvailableReason ?? '선택이 없습니다.');
  }
  return editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
    target: selection.target, alignment: 'CENTER',
  });
}
