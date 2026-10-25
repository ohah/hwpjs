import {
  createEditor, detectDocumentFormat, findTextMatch, SPLICE_TEXT_COMMAND,
  type RuntimeFactory,
} from '@hwpjs/core';

// runtimeFactory는 호출마다 새 문서 runtime을 만들어야 합니다.
export async function replaceFirst(
  bytes: Uint8Array,
  runtimeFactory: RuntimeFactory,
  query: string,
  replacement: string,
) {
  const editor = createEditor({ runtimeFactory });
  try {
    await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
    const state = editor.getEditorState();
    const target = findTextMatch(state, query, { origin: 'document', wrap: false });
    if (!target) throw Error('현재 관측 범위에서 찾지 못했습니다.');
    const selected = await editor.setSelection(target, { stateVersion: state.stateVersion });
    const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target,
      text: replacement,
      selectionVersion: selected.stateVersion,
    });
    if (result.status === 'committed-refresh-required') {
      // 이미 반영된 명령을 다시 보내지 않고 관측만 갱신합니다.
      await editor.refresh();
    } else if (result.error) {
      throw Error(result.error);
    } else if (result.status !== 'committed-with-snapshot') {
      throw Error(`교체를 완료하지 못했습니다: ${result.status}`);
    }
    return await editor.save();
  } finally {
    await editor.dispose();
  }
}
