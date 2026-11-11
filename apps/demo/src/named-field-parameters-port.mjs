/** Inject the command and bound reader from the same Core instance as the editor. */
export function createNamedFieldParametersPort({ editor, command, readParameters }) {
  let disposed = false;
  let epoch = 0;
  let capture = null;
  let modal = null;
  let modalObserver = null;

  function reason() {
    const state = editor.getEditorState();
    if (disposed || typeof command?.id !== 'symbol' || typeof readParameters !== 'function')
      return '이 편집기에서 누름틀 속성을 사용할 수 없습니다.';
    if (state.status !== 'ready') return '문서를 먼저 여세요.';
    if (state.content?.format !== 'hwpx') return '누름틀 속성은 HWPX 문서에서 지원합니다.';
    if (state.historyRecoveryRequired) return '문서 상태를 복구한 뒤 속성을 다시 읽으세요.';
    return null;
  }

  function stateCurrent(value) {
    const state = editor.getEditorState();
    return Boolean(
      !disposed &&
      value &&
      value === capture &&
      state.status === 'ready' &&
      state.editorId === value.state.editorId &&
      state.documentId === value.state.documentId &&
      state.generation === value.state.generation &&
      state.stateVersion === value.selectionVersion &&
      state.operationRevision === value.token.operationRevision &&
      state.viewRevision === value.token.viewRevision,
    );
  }

  function ownsModal() {
    return Boolean(
      modal?.isConnected &&
      modal.open &&
      modal.matches(':modal') &&
      modal.contains(modal.ownerDocument.activeElement),
    );
  }

  function release(value) {
    if (value && value !== capture) return;
    epoch++;
    modalObserver?.disconnect();
    modalObserver = null;
    capture = modal = null;
  }

  function current(value) {
    const closed = modalObserver?.takeRecords().some((record) => record.oldValue !== null);
    if (closed) release(value);
    return stateCurrent(value) && ownsModal();
  }

  return {
    reason,
    current,
    release,
    async read(selector) {
      const unavailable = reason();
      if (unavailable) throw Error(unavailable);
      release();
      const ticket = epoch;
      const state = editor.getEditorState();
      const ownedSelector = Object.freeze({ name: selector.name, occurrence: selector.occurrence });
      const result = await readParameters(ownedSelector, { token: state.token });
      const latest = editor.getEditorState();
      if (disposed || epoch !== ticket || latest.stateVersion !== state.stateVersion)
        throw Error('현재 상태가 바뀌었습니다. 속성을 다시 읽으세요.');
      if (result.status !== 'found') return result;
      if (result.selectionVersion !== state.stateVersion)
        throw Error('현재 상태가 바뀌었습니다. 속성을 다시 읽으세요.');
      capture = Object.freeze({
        ...result,
        selector: ownedSelector,
        expected: Object.freeze({ ...result.parameters }),
        state,
      });
      return capture;
    },
    bind(value, dialog) {
      if (!stateCurrent(value) || modal) return false;
      modal = dialog;
      if (ownsModal()) {
        const Observer = dialog.ownerDocument.defaultView.MutationObserver;
        modalObserver = new Observer((records) => {
          if (records.some((record) => record.oldValue !== null)) release(value);
        });
        modalObserver.observe(dialog, {
          attributes: true,
          attributeFilter: ['open'],
          attributeOldValue: true,
        });
        return true;
      }
      modal = null;
      return false;
    },
    async apply(value, { direction, memo }) {
      const requireCurrent = () => {
        if (!current(value))
          throw Error('문서나 선택이 바뀌었습니다. 창을 닫고 속성을 다시 읽으세요.');
        if (!value.canEdit) throw Error('이 필드의 속성은 읽기 전용입니다.');
      };
      requireCurrent();
      const update = await editor.update((collector) => {
        requireCurrent();
        collector.dispatchCommand(command, {
          selector: value.selector,
          token: value.token,
          selectionVersion: value.selectionVersion,
          expected: value.expected,
          direction,
          memo,
        });
      });
      if (update.results.length !== 1) throw Error('UnexpectedNamedFieldParametersResult');
      return update.results[0];
    },
    dispose() {
      disposed = true;
      release();
    },
  };
}
