import { REPLACE_ALL_COMMAND, planReplaceAll, type HeadlessEditor } from '@ohah/hwpjs';

// ready editor와, 호스트가 대기 입력을 반영한 뒤 호출합니다.
export async function replaceLiteral(editor: HeadlessEditor, query: string, replacement: string) {
  const capabilities = await editor.getReplaceAllCapabilities();
  if (!capabilities.available) throw Error(capabilities.reason ?? 'ReplaceAllUnavailable');
  const state = editor.getEditorState();
  const request = {
    schemaVersion: 1 as const,
    query,
    replacement,
    layoutToken: state.token,
    stateVersion: state.stateVersion,
  };
  const plan = planReplaceAll(state, request);
  const result = await editor.dispatchCommand(REPLACE_ALL_COMMAND, request);
  // committed-refresh-required이면 재관측하며 같은 편집을 다시 보내지 않습니다.
  return { matchCount: plan.matchCount, result };
}
