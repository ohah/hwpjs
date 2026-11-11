/** The caller supplies the same Core command and selection reader as its editor. */
export function createNamedFieldInsertionPort({ editor, command, getSelectionClipboard }) {
  let disposed = false;
  function capture() {
    const state = editor.getEditorState();
    if (disposed) return { state, reason: '누름틀 패널이 닫혔습니다.' };
    if (typeof command?.id !== 'symbol' || typeof getSelectionClipboard !== 'function')
      return { state, reason: '이 편집기에서 누름틀 생성을 사용할 수 없습니다.' };
    if (state.status !== 'ready') return { state, reason: '편집할 HWPX 문서를 여세요.' };
    if (state.content?.format !== 'hwpx')
      return { state, reason: '누름틀 생성은 HWPX 문서에서 지원합니다.' };
    if (state.content?.readOnly || state.capabilities?.readOnly || state.historyRecoveryRequired)
      return { state, reason: '편집 가능한 문서 상태가 필요합니다.' };
    const selected = getSelectionClipboard(state);
    const { target, text } = selected;
    if (!target) return { state, reason: '문서 본문에서 넣을 위치나 텍스트를 선택하세요.' };
    if (target.owner !== `section:${target.section}:body`)
      return { state, reason: '문서 본문에서 넣을 위치나 텍스트를 선택하세요.' };
    if (selected.editReason || text === null)
      return { state, reason: '선택한 위치에서는 누름틀을 만들 수 없습니다.' };
    return { state, target, expectedText: text, reason: null };
  }

  function current(captured) {
    const state = editor.getEditorState();
    return Boolean(
      !disposed &&
      captured?.target &&
      !captured.reason &&
      state.editorId === captured.state.editorId &&
      state.documentId === captured.state.documentId &&
      state.generation === captured.state.generation &&
      state.stateVersion === captured.state.stateVersion,
    );
  }

  return {
    capture,
    current,
    dispose() {
      disposed = true;
    },
    async insert(captured, { name, direction, memo }) {
      if (!current(captured)) throw Error('선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.');
      const update = await editor.update((collector) => {
        if (!current(captured)) throw Error('선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.');
        collector.dispatchCommand(command, {
          target: captured.target,
          selectionVersion: captured.state.stateVersion,
          expectedText: captured.expectedText,
          name,
          direction,
          memo,
        });
      });
      if (update.results.length !== 1) throw Error('UnexpectedNamedFieldCreationResult');
      return update.results[0];
    },
  };
}
