import { test, expect } from 'bun:test';
import * as core from '../../src/index.ts';
import { tableInsertMessage } from '../../src/commands/table-insert.ts';

const resources = { paragraph: [0], character: [0], style: [0], border_fill: [0] };
const options = {
  rows: 2,
  columns: 2,
  width: 36000,
  rowHeight: 1800,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 0 },
};
export async function tableTargetFixture(
  format = 'hwp5',
  generated = false,
  extra: Record<string, unknown> = {},
  rowExtra: Record<string, unknown> = {},
) {
  const messages: any[] = [],
    errors: any[] = [];
  const content = {
    format,
    tableCreationAvailable: true,
    tableCreationResources: resources,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'A😀B',
        editable: true,
        selectionOwner: 'section:0:body',
        ...(format === 'hwp5'
          ? {
              currentReference: {
                epoch: '3',
                scope: 'fixture',
                kind: generated ? 'generated' : 'original',
                section: 0,
                id: generated ? '3' : '0',
                row: 0,
                column: 0,
              },
            }
          : {}),
        ...rowExtra,
      },
    ],
    ...extra,
  };
  const editor = core.createEditor({
    onError: (error) => errors.push(error),
    runtimeFactory: () => ({
      async request(message: any, context: any) {
        messages.push(message);
        return {
          kind: message.kind,
          content,
          meta: { context, application: 'unapplied', changed: false },
        };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: format as 'hwp5' | 'hwpx', editable: true });
  const target = (startUnit = 0, endUnit = startUnit) =>
    core.createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit,
      endUnit,
    });
  await editor.setSelection(target());
  return { editor, target, messages, errors, content };
}
const query = (state: core.EditorState, target: core.SelectionTarget | null) =>
  core.getTableInsertAvailability(state, target);

for (const [format, generated, allowed, reason] of [
  ['hwp5', false, true, null],
  ['hwp5', true, false, 'UnsupportedTableInsertReference'],
  ['hwpx', false, true, null],
] as const)
  test(`${format}/${generated ? 'generated' : 'original'}: public target availability is pure and agrees with mutation target checks`, async () => {
    const f = await tableTargetFixture(format, generated);
    try {
      const before = f.editor.getEditorState(),
        count = f.messages.length;
      const availability = query(before, f.target());
      expect(availability).toEqual({
        allowed,
        reason,
        resources: allowed ? options.resources : null,
      });
      expect(Object.isFrozen(availability)).toBe(true);
      expect(f.editor.getEditorState()).toBe(before);
      expect(f.messages.length).toBe(count);
      expect(f.errors).toEqual([]);
      if (allowed)
        expect(tableInsertMessage({ target: f.target(), options }, before).kind).toBe(
          'insert-table',
        );
      else {
        expect(() => tableInsertMessage({ target: f.target(), options }, before)).toThrow(reason!);
        const result = await f.editor.dispatchCommand(core.INSERT_TABLE_COMMAND, {
          target: f.target(),
          options,
        });
        expect(result.error).toBe(reason!);
        expect(f.messages.filter((m) => m.kind === 'insert-table')).toEqual([]);
      }
    } finally {
      await f.editor.dispose();
    }
  });

test('null, stale, foreign editor, range and non-body owner use the shared target guard', async () => {
  const f = await tableTargetFixture(),
    other = await tableTargetFixture();
  try {
    const state = f.editor.getEditorState();
    for (const [target, reason] of [
      [null, 'MissingSelection'],
      [other.target(), 'StaleTarget'],
      [{ ...f.target(), operationRevision: state.operationRevision + 1 }, 'StaleTarget'],
      [f.target(0, 1), 'TableInsertionRequiresCaret'],
    ] as const)
      expect(query(state, target as any)).toEqual({ allowed: false, reason, resources: null });
    const note = await tableTargetFixture(
      'hwpx',
      false,
      {},
      { selectionOwner: 'section:0:note:1' },
    );
    try {
      expect(query(note.editor.getEditorState(), note.target()).reason).toBe(
        'UnsupportedTableInsertOwner',
      );
    } finally {
      await note.editor.dispose();
    }
    expect(f.messages.filter((m) => m.kind === 'insert-table')).toEqual([]);
  } finally {
    await f.editor.dispose();
    await other.editor.dispose();
  }
});

test('readiness, readonly, history recovery, capability and resource observations fail closed', async () => {
  const f = await tableTargetFixture();
  try {
    const state = f.editor.getEditorState();
    for (const [patch, reason] of [
      [{ status: 'loading' }, 'EditorNotReady'],
      [{ content: { ...f.content, readOnly: true } }, 'ReadOnlyDocument'],
      [{ capabilities: { readOnly: true } }, 'ReadOnlyDocument'],
      [{ historyRecoveryRequired: true }, 'HistoryRecoveryRequired'],
      [{ content: { ...f.content, tableCreationAvailable: false } }, 'TableCreationUnavailable'],
      [
        { content: { ...f.content, tableCreationResources: { ...resources, style: [] } } },
        'InvalidTableCreationResources',
      ],
    ] as const) {
      const observed = new core.EditorState({
        ...state.token,
        status: 'ready',
        stateVersion: state.stateVersion,
        content: state.content,
        capabilities: state.capabilities,
        ...patch,
      } as any);
      expect(query(observed, f.target())).toEqual({ allowed: false, reason, resources: null });
    }
  } finally {
    await f.editor.dispose();
  }
});

test('HWP5 display-to-source caret mapping is checked by the same helper', async () => {
  const f = await tableTargetFixture(
    'hwp5',
    false,
    {},
    {
      text: 'A￼B',
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 2, source: 9 },
      ],
    },
  );
  try {
    expect(query(f.editor.getEditorState(), f.target(2)).allowed).toBe(true);
    expect(
      tableInsertMessage({ target: f.target(2), options }, f.editor.getEditorState()).unit,
    ).toBe(9);
  } finally {
    await f.editor.dispose();
  }
});

test('missing/malformed HWP5 references and masked or cell rows never gain admission', async () => {
  for (const [patch, reason] of [
    [{ currentReference: undefined }, 'UnsupportedTableInsertReference'],
    [
      { currentReference: { kind: 'original', section: 0, id: '01' } },
      'UnsupportedTableInsertReference',
    ],
    [
      { currentReference: { kind: 'original', section: 1, id: '0' } },
      'UnsupportedTableInsertReference',
    ],
    [{ editable: false }, 'SelectionNotEditable'],
    [{ tableCell: { tableNode: 1, listNode: 2 } }, 'UnsupportedTableInsertOwner'],
  ] as const) {
    const f = await tableTargetFixture('hwp5', false, {}, patch);
    try {
      const state = f.editor.getEditorState(),
        target = f.target();
      expect(query(state, target)).toEqual({ allowed: false, reason, resources: null });
      expect(() => tableInsertMessage({ target, options }, state)).toThrow(reason);
      expect(f.messages.filter((m) => m.kind === 'insert-table')).toEqual([]);
    } finally {
      await f.editor.dispose();
    }
  }
});

test('defaults are copied and frozen from validated advertised resources', async () => {
  const ids = { paragraph: [3, 8], character: [4], style: [5], border_fill: [6, 9] };
  const f = await tableTargetFixture('hwpx', false, { tableCreationResources: ids });
  try {
    const state = f.editor.getEditorState();
    const result = query(state, f.target());
    expect(result.allowed).toBe(true);
    if (!result.allowed) throw Error(result.reason);
    expect(result.resources).toEqual({ paragraph: 3, character: 4, style: 5, border_fill: 6 });
    expect(Object.isFrozen(result.resources)).toBe(true);
    expect(query(state, f.target()).resources).not.toBe(result.resources);
    ids.paragraph[0] = 77;
    expect(result.resources.paragraph).toBe(3);
    expect(() => {
      (result.resources as any).paragraph = 77;
    }).toThrow();
    expect(
      tableInsertMessage(
        { target: f.target(), options: { ...options, resources: result.resources } },
        state,
      ).options.resources,
    ).toEqual(result.resources);
  } finally {
    await f.editor.dispose();
  }
});
