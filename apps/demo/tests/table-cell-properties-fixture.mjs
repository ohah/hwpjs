// 순수 계약 대역이며 Native 선택/저장 성공을 흉내내는 증거가 아닙니다.
export function fixture(format = 'hwp5') {
  const calls = [],
    listeners = new Set();
  let state = {
    editorId: 'test-editor',
    documentId: 'test-doc',
    generation: 1,
    stateVersion: 1,
    operationRevision: 0,
    viewRevision: 0,
    status: 'ready',
    historyRecoveryRequired: false,
    token: Object.freeze({
      editorId: 'test-editor',
      documentId: 'test-doc',
      generation: 1,
      operationRevision: 0,
      viewRevision: 0,
    }),
    selection: { section: 0, paragraph: 15, startUnit: 0, endUnit: 0, owner: 'public-test-target' },
    capabilities: { cellSizeAvailable: true, cellSizeBatchAvailable: true },
    content: {
      format,
      limited: false,
      readOnly: false,
      paragraphs: [
        {
          section: 0,
          paragraph: 15,
          text: '셀',
          editable: true,
          currentReference: { kind: 'original' },
          tableCell: { tableNode: 81, listNode: 82 },
        },
      ],
      tables: [
        {
          section: 0,
          tableNode: 81,
          partial: false,
          rows: 1,
          columns: 1,
          cells: [
            {
              listNode: 82,
              row: 0,
              column: 0,
              rowSpan: 1,
              columnSpan: 1,
              width: 3779,
              height: 7086,
              paragraphs: [15],
            },
          ],
        },
      ],
    },
  };
  const api = {
    getSelectionFormatting(s) {
      calls.push({ type: 'observe' });
      return { target: s.selection };
    },
    createParagraphSelection(s, coordinates) {
      calls.push({ type: 'issue', s, coordinates });
      return { ...coordinates, owner: 'fresh-public-test-target' };
    },
  };
  const editor = {
    getEditorState: () => state,
    update: async () => {},
    requestExperimental: async (message, options) => {
      calls.push({ type: 'mutation', message, options });
      return { status: 'committed-with-snapshot', state };
    },
    setSelection: async (target, options) => {
      calls.push({ type: 'selection', target, options });
      state = { ...state, selection: target };
    },
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    api,
    editor,
    calls,
    listeners,
    get state() {
      return state;
    },
    replace(patch) {
      state = { ...state, ...patch, stateVersion: state.stateVersion + 1 };
      for (const fn of listeners) fn(state);
    },
    mutate(fn) {
      fn(state);
    },
    mutationCalls: () => calls.filter((c) => c.type === 'mutation'),
  };
}
export const changed = { widthPoints: '38.79', heightPoints: '70.86', mode: 'cell' };
