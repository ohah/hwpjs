// Port fixture only: Native eligibility and mutation are deliberately not simulated as proof.
import { createSourceTableGridPort } from '../src/source-table-grid-port.ts';
export function sourceGridFixture(format = 'hwp5', rows = 2, columns = 3) {
  let state = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    stateVersion: 1,
    status: 'ready',
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 1, viewRevision: 1 },
    capabilities: { sourceTableGridAvailable: true, createdTableGridAvailable: true },
    content: {
      format,
      limited: false,
      readOnly: false,
      sourceTableGridAvailable: true,
      createdTables: [
        {
          section: 0,
          identity: '123',
          rows,
          columns,
          cells: Array.from({ length: rows * columns }, (_, i) => ({
            row: Math.floor(i / columns),
            column: i % columns,
          })),
        },
      ],
    },
  };
  let epoch = 0,
    present = true,
    kind = 'source';
  const address = {
    section: 0,
    tableNode: 10,
    listNode: 25,
    row: rows - 1,
    column: columns - 1,
    rows,
    columns,
  };
  const calls = [];
  const core = {
    EDIT_SOURCE_TABLE_GRID_COMMAND: { name: 'source-table-grid', id: Symbol('source') },
    EDIT_CREATED_TABLE_GRID_COMMAND: { name: 'created-table-grid', id: Symbol('generated') },
  };
  const editor = {
    getEditorState: () => state,
    update: async () => {},
    dispatchCommand: async (command, payload) => {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot', state };
    },
  };
  const capture = (expected) => {
    if (!present || expected !== kind) return null;
    const saved = state,
      revision = epoch;
    return {
      state: saved,
      ...address,
      createdCell: { identity: '123', row: address.row, column: address.column },
      current: () => present && kind === expected && epoch === revision && state === saved,
    };
  };
  const host = {
    captureSourceTableGridSelection: () => capture('source'),
    captureGeneratedTableGridSelection: () => capture('generated'),
  };
  return {
    core,
    editor,
    host,
    calls,
    address,
    port: createSourceTableGridPort(editor, core, () => host),
    get state() {
      return state;
    },
    replace(patch = {}) {
      state = { ...state, ...patch, stateVersion: state.stateVersion + 1 };
    },
    move() {
      epoch++;
    },
    hide() {
      present = false;
    },
    select(value) {
      kind = value;
      epoch++;
    },
  };
}
