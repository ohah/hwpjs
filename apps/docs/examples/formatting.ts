import {
  getSelectionFormatting,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  type HeadlessEditor,
  type CharacterUnderlineKind,
  type CommandResult,
} from '@ohah/hwpjs';

export async function makeBold(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.characterAvailableReason !== null) {
    throw Error(selection.characterAvailableReason ?? '선택이 없습니다.');
  }
  // size 단위는 1/100pt입니다. 1200은 12pt입니다.
  return editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
    target: selection.target,
    properties: { bold: true, size: 1200 },
  });
}

export async function alignCenter(editor: HeadlessEditor) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.paragraphAvailableReason !== null) {
    throw Error(selection.paragraphAvailableReason ?? '선택이 없습니다.');
  }
  return editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
    target: selection.target,
    alignment: 'CENTER',
  });
}

// typed kind라도 형식/대상에 따라 거부될 수 있습니다. status/error를 확인하세요.
export async function setUnderline(editor: HeadlessEditor, kind: CharacterUnderlineKind) {
  const selection = getSelectionFormatting(editor.getEditorState());
  if (!selection.target || selection.underlineAvailableReason !== null) {
    throw Error(selection.underlineAvailableReason ?? '선택이 없습니다.');
  }
  return editor.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND, {
    target: selection.target,
    kind,
  });
}

// 호스트가 표시할 결과이며, 거부를 성공으로 바꾸거나 편집을 재전송하지 않습니다.
export function underlineResultMessage(result: CommandResult): string {
  if (result.status === 'rejected-unapplied') {
    if (result.error === 'UnsupportedCharacterUnderlineKind') {
      return '이 형식에서는 요청한 밑줄 종류를 지원하지 않습니다.';
    }
    if (result.error === 'StaleTarget') return '현재 선택을 다시 확인하세요.';
    return result.error ?? '현재 대상에 적용할 수 없습니다.';
  }
  if (result.error) return result.error;
  if (result.status === 'committed-with-snapshot') return '반영됐습니다.';
  if (result.status === 'committed-refresh-required')
    return '이미 반영됐습니다. refresh 후 상태를 확인하세요.';
  return `상태를 확인하세요: ${result.status}`;
}
