import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createEditor, resolveNamedField } from '../../src/index.ts';
import type {
  EditorRuntime,
  NamedFieldFormat,
  NamedFieldSource,
  SelectionTarget,
} from '../../src/index.ts';

function runtime(format: NamedFieldFormat, source?: () => Promise<NamedFieldSource>) {
  const calls: string[] = [];
  const paragraph = format === 'hwpx' ? 1 : 0;
  const owner = 'section:0:body';
  const content = {
    format,
    paragraphs: [{ section: 0, paragraph, text: 'A😀B', selectionOwner: owner, editable: false }],
  };
  const editor = createEditor({
    runtimeFactory: (): EditorRuntime => ({
      request: async ({ kind }) => {
        calls.push(kind);
        return { kind, content };
      },
      readNamedFields:
        source &&
        (async (context) => {
          assert.equal(context.documentId, editor.getEditorState().documentId);
          assert.equal(context.operationRevision, editor.getEditorState().operationRevision);
          return source();
        }),
      dispose() {},
    }),
  });
  const load = () => editor.load(Uint8Array.of(0), { format, editable: false });
  return { editor, calls, load, paragraph, owner };
}

function rows(format: NamedFieldFormat): NamedFieldSource {
  const paragraph = format === 'hwpx' ? 1 : 0;
  const location = { section: 0, paragraph, owner: 'section:0:body', startUnit: 1, endUnit: 3 };
  const row = { name: '금액', kind: 'click', protection: 'protected', location } as const;
  return {
    format,
    coverage: 'complete',
    rows: [
      { ...row, id: '0', value: { status: 'available', text: '😀' } },
      {
        ...row,
        id: '1',
        location: { ...location, startUnit: 3 },
        value: { status: 'available', text: '' },
      },
      { ...row, id: '2', name: '보호', location: null, value: { status: 'unavailable' } },
      { ...row, id: '3', name: '', location: null, value: { status: 'unavailable' } },
      { ...row, id: '4', name: null, location: null, value: { status: 'unavailable' } },
    ],
  };
}

for (const format of ['hwpx', 'hwp5'] as const) {
  test(`named fields ${format} DTO distinguishes duplicates, empty values and protected navigation`, async () => {
    const source = rows(format);
    const { editor, load, calls, paragraph } = runtime(format, async () => source);
    try {
      await load();
      const baselineCalls = calls.slice();
      const before = editor.getEditorState();
      const inventory = await editor.listNamedFields();
      assert.equal(inventory.format, format);
      assert.deepEqual(
        inventory.rows.map((r) => r.name),
        ['금액', '금액', '보호', '', null],
      );
      assert.notEqual(inventory.rows[0].value, source.rows[0].value);
      assert.ok(Object.isFrozen(inventory.rows[0].target));
      const duplicate = await editor.readNamedField({ name: '금액' });
      assert.equal(duplicate.status, 'ambiguous');
      if (duplicate.status === 'ambiguous')
        assert.deepEqual(
          duplicate.matches.map((r) => r.id),
          ['0', '1'],
        );
      const empty = resolveNamedField(inventory, { name: '금액', occurrence: 1 });
      assert.equal(empty.status, 'found');
      if (empty.status === 'found')
        assert.deepEqual(empty.field.value, { status: 'available', text: '' });
      assert.deepEqual(await editor.readNamedField({ name: '금액', occurrence: 2 }), {
        status: 'missing',
      });
      assert.deepEqual(await editor.readNamedField({ name: '금 액' }), { status: 'missing' });
      assert.throws(() => editor.readNamedField({ name: '' }), /InvalidNamedFieldSelector/);
      assert.throws(
        () => editor.readNamedField({ name: '금액', occurrence: -1 }),
        /InvalidNamedFieldSelector/,
      );
      const protectedField = await editor.moveToNamedField({ name: '보호' });
      assert.equal(protectedField.status, 'unavailable');
      assert.equal(editor.getEditorState(), before);
      const moved = await editor.moveToNamedField({ name: '금액', occurrence: 0 });
      assert.equal(moved.status, 'moved');
      const state = editor.getEditorState();
      const selection = state.selection as SelectionTarget;
      assert.equal(selection.paragraph, paragraph);
      assert.deepEqual([selection.startUnit, selection.endUnit], [1, 3]);
      assert.equal(state.operationRevision, before.operationRevision);
      assert.equal(state.viewRevision, before.viewRevision);
      assert.equal(state.nativeHistoryRevision, before.nativeHistoryRevision);
      const movedToEmpty = await editor.moveToNamedField({ name: '금액', occurrence: 1 });
      assert.equal(movedToEmpty.status, 'moved');
      const caret = editor.getEditorState().selection as SelectionTarget;
      assert.deepEqual([caret.startUnit, caret.endUnit], [3, 3]);
      assert.deepEqual(calls, baselineCalls);
    } finally {
      await editor.dispose();
    }
  });
}

test('named fields partial source refuses absence, uniqueness and ordinal claims', async () => {
  const { editor, load } = runtime('hwpx', async () => ({ ...rows('hwpx'), coverage: 'partial' }));
  try {
    await load();
    const state = editor.getEditorState();
    for (const selector of [
      { name: '금액' },
      { name: '금액', occurrence: 0 },
      { name: 'absent' },
    ]) {
      assert.deepEqual(await editor.readNamedField(selector), { status: 'incomplete' });
      assert.deepEqual(await editor.moveToNamedField(selector), { status: 'incomplete' });
    }
    assert.equal(editor.getEditorState(), state);
  } finally {
    await editor.dispose();
  }
});

test('named fields reject invalid runtime bindings before moving', async () => {
  const baseline = rows('hwpx');
  let source = baseline;
  const { editor, load } = runtime('hwpx', async () => source);
  try {
    await load();
    const state = editor.getEditorState();
    const first = baseline.rows[0];
    for (const [bad, error] of [
      [{ ...baseline, format: 'hwp5' }, /InvalidNamedFieldInventory/],
      [{ ...baseline, rows: [first, first] }, /InvalidNamedFieldInventory/],
      [
        { ...baseline, rows: [{ ...first, location: { ...first.location!, owner: 'foreign' } }] },
        /InvalidSelectionOwner/,
      ],
      [
        { ...baseline, rows: [{ ...first, location: { ...first.location!, startUnit: 2 } }] },
        /InvalidScalarBoundary/,
      ],
      [
        { ...baseline, rows: [{ ...first, value: { status: 'available', text: '\ud800' } }] },
        /InvalidNamedFieldInventory/,
      ],
    ] as const) {
      source = bad;
      await assert.rejects(editor.moveToNamedField({ name: '금액', occurrence: 0 }), error);
      assert.equal(editor.getEditorState(), state);
    }
  } finally {
    await editor.dispose();
  }
});

test('named fields unavailable port and stale document token are explicit', async () => {
  const noPort = runtime('hwp5');
  const withPort = runtime('hwpx', async () => rows('hwpx'));
  try {
    await noPort.load();
    await assert.rejects(noPort.editor.listNamedFields(), /NamedFieldsUnavailable/);
    await withPort.load();
    const old = await withPort.editor.listNamedFields();
    await withPort.load();
    await assert.rejects(withPort.editor.listNamedFields({ token: old.token }), /StaleTarget/);
    await assert.rejects(
      withPort.editor.moveToNamedField({ name: '금액' }, { token: old.token }),
      /StaleTarget/,
    );
  } finally {
    await noPort.editor.dispose();
    await withPort.editor.dispose();
  }
});

test('named fields discards an in-flight inventory when its editor is disposed', async () => {
  let entered!: () => void;
  let deliver!: (source: NamedFieldSource) => void;
  const start = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const response = new Promise<NamedFieldSource>((resolve) => {
    deliver = resolve;
  });
  const { editor, load } = runtime('hwpx', async () => {
    entered();
    return response;
  });
  await load();
  const move = editor.moveToNamedField({ name: '금액', occurrence: 0 });
  await start;
  const disposed = editor.dispose();
  deliver(rows('hwpx'));
  await assert.rejects(move, /EditorDisposed/);
  await disposed;
  assert.equal(editor.getEditorState().status, 'disposed');
  assert.equal(editor.getEditorState().selection, undefined);
});
