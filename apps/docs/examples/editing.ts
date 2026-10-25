import {
  createEditor, detectDocumentFormat, findTextMatch, SPLICE_TEXT_COMMAND,
  type HeadlessEditor, type RuntimeFactory, type SaveResult,
} from '@ohah/hwpjs';

export type ConfirmLayoutSave = (notice: {
  reason: 'LayoutReflowRequired';
}) => Promise<boolean>;
export type SaveOutcome =
  | { status: 'saved'; result: SaveResult }
  | { status: 'cancelled' };

export async function saveWithLayoutConsent(
  editor: HeadlessEditor,
  confirm: ConfirmLayoutSave,
): Promise<SaveOutcome> {
  const token = editor.getEditorState().token;
  try {
    // 첫 저장에는 손실 허용 옵션을 지정하지 않습니다.
    return { status: 'saved', result: await editor.save({ token }) };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'LayoutReflowRequired') throw error;
  }
  // dialog/CLI 등 UI는 호스트가 소유합니다. true만 명시적 동의입니다.
  if (await confirm({ reason: 'LayoutReflowRequired' }) !== true) {
    return { status: 'cancelled' }; // 편집값과 editor를 유지합니다.
  }
  // 동의 대기 중 문서/편집이 바뀌면 token 검증으로 거부합니다. 편집은 재전송하지 않습니다.
  // 재저장 실패도 호출자에게 전달하며 자동 재시도/종료하지 않습니다.
  return { status: 'saved', result: await editor.save({ token, allowStaleLayout: true }) };
}

export async function replaceFirst(
  editor: HeadlessEditor,
  bytes: Uint8Array,
  query: string,
  replacement: string,
  confirm: ConfirmLayoutSave,
): Promise<SaveOutcome> {
  await editor.load(bytes, { format: detectDocumentFormat(bytes), editable: true });
  const state = editor.getEditorState();
  const target = findTextMatch(state, query, { origin: 'document', wrap: false });
  if (!target) throw Error('현재 관측 범위에서 찾지 못했습니다.');
  const selected = await editor.setSelection(target, { stateVersion: state.stateVersion });
  const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
    target, text: replacement, selectionVersion: selected.stateVersion,
  });
  if (result.status === 'committed-refresh-required') {
    await editor.refresh(); // 이미 반영된 편집을 재전송하지 않습니다.
  } else if (result.error) {
    throw Error(result.error);
  } else if (result.status !== 'committed-with-snapshot') {
    throw Error(`교체를 완료하지 못했습니다: ${result.status}`);
  }
  return saveWithLayoutConsent(editor, confirm);
}

// 호스트는 work 안에서 취소/오류 후 재시도·계속 편집을 결정합니다.
// work를 끝내면 저장 여부와 무관하게 finally에서 editor를 종료합니다.
export async function withEditor<T>(
  runtimeFactory: RuntimeFactory,
  work: (editor: HeadlessEditor) => Promise<T>,
): Promise<T> {
  const editor = createEditor({ runtimeFactory });
  try { return await work(editor); }
  finally { await editor.dispose(); }
}
