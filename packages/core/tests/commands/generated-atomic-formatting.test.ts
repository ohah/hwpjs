import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '../../src/index.ts';
import { EditorState } from '../../src/state/editor-state.ts';
import { atomicSelector } from '../../src/commands/atomic-formatting.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import { queryAtomicFormatting } from '../../../../web/preview/atomic-formatting-command.mjs';

const reference = {
  epoch: '7',
  scope: 'native-session',
  kind: 'generated',
  section: 0,
  id: '91',
  row: 0,
  column: 0,
};
const token = {
  editorId: 'unit',
  documentId: 'unit',
  generation: 1,
  operationRevision: 5,
  viewRevision: 6,
};
const target = {
  ...token,
  coordinateSpace: 'display' as const,
  format: 'hwp5' as const,
  section: 0,
  paragraph: 3,
  owner: 'section:0:body',
  startUnit: 1,
  endUnit: 3,
  affinity: 'forward' as const,
};
function content(row: any = {}, format = 'hwp5') {
  return {
    format,
    paragraphs: [
      {
        section: 0,
        paragraph: 3,
        text: 'A😀B',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: reference,
        ...row,
      },
    ],
  };
}
function state(row: any = {}, format = 'hwp5') {
  return new EditorState({
    ...token,
    status: 'ready',
    stateVersion: 1,
    content: content(row, format),
  });
}
test('Core generated atomic selector owns full reference and preserves source ordinal/range', () => {
  const s = state({
    sourceOffsets: [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
    ],
  });
  const value = atomicSelector(target, s, true, true);
  assert.deepEqual(value, {
    kind: 'original-paragraph',
    section: 0,
    paragraph: 3,
    reference,
    ranges: [{ startUnit: 8, endUnit: 10 }],
  });
  assert.notEqual(value.reference, reference);
  assert.notEqual(value.reference, (s.content as any).paragraphs[0].currentReference);
  assert(Object.isFrozen(value.reference));
  assert.notEqual(value.paragraph, Number(reference.id));
});
test('Core malformed generated bindings refuse without legacy ordinal fallback', () => {
  for (const change of [
    { epoch: '0' },
    { epoch: '01' },
    { epoch: '18446744073709551616' },
    { scope: '' },
    { section: 1 },
    { id: '0' },
    { id: '01' },
    { id: '4294967296' },
    { row: 1 },
    { column: 1 },
    { extra: true },
  ])
    assert.throws(
      () =>
        atomicSelector(
          target,
          state({ currentReference: { ...reference, ...change } }),
          false,
          false,
        ),
      /UnsupportedFormattingReference/,
    );
  for (const key of Object.keys(reference)) {
    const missing: any = { ...reference };
    delete missing[key];
    assert.throws(
      () => atomicSelector(target, state({ currentReference: missing }), false, false),
      /UnsupportedFormattingReference/,
    );
  }
  const accessor = { ...reference };
  Object.defineProperty(accessor, 'id', {
    get() {
      throw Error('AccessorExecuted');
    },
  });
  assert.throws(
    () =>
      atomicSelector(
        target,
        { ...token, content: content({ currentReference: accessor }) } as any,
        false,
        false,
      ),
    /UnsupportedFormattingReference/,
  );
});
test('Core retains created/nested, stale token, unknown range, UTF16 and readonly boundaries', () => {
  assert.throws(
    () => atomicSelector(target, state({ createdCell: {} }), true, true),
    /CreatedCellRequiresSurfacePort/,
  );
  for (const [key, value, owner] of [
    ['tableCell', { tableNode: 1, listNode: 2 }, 'section:0:table:1:list:2'],
    ['drawingText', { drawingNode: 1, listNode: 2 }, 'section:0:drawing:1:text:list:2'],
    ['drawingCaption', { drawingNode: 1, listNode: 2 }, 'section:0:drawing:1:caption:list:2'],
  ] as const)
    assert.throws(
      () => atomicSelector({ ...target, owner }, state({ [key]: value }), true, true),
      /UnsupportedFormattingOwner/,
    );
  for (const change of [
    { operationRevision: 4 },
    { viewRevision: 5 },
    { generation: 2 },
    { documentId: 'other' },
    { editorId: 'other' },
  ])
    assert.throws(
      () => atomicSelector({ ...target, ...change }, state(), false, true),
      /StaleTarget/,
    );
  assert.throws(
    () => atomicSelector({ ...target, owner: 'forged' }, state(), false, false),
    /InvalidSelectionOwner/,
  );
  assert.throws(
    () => atomicSelector(target, state({ clipped: true }), false, true),
    /InvalidSelectionOwner/,
  );
  assert.throws(
    () => atomicSelector({ ...target, endUnit: 99 }, state(), false, true),
    /InvalidTextPosition/,
  );
  assert.throws(
    () => atomicSelector({ ...target, startUnit: 2 }, state(), false, true),
    /InvalidScalarBoundary/,
  );
  assert.throws(
    () => atomicSelector({ ...target, endUnit: 1 }, state(), true, true),
    /EmptyCharacterSelection/,
  );
  assert.throws(
    () => atomicSelector(target, state({ editable: false }), true, true),
    /SelectionNotEditable/,
  );
  assert(atomicSelector(target, state({ editable: false }), false, true).reference);
  assert.throws(
    () =>
      atomicSelector(
        target,
        state({
          sourceOffsets: [
            { at: 0, source: 0 },
            { at: 2, source: 9 },
          ],
        }),
        true,
        true,
      ),
    /ProtectedAnchorRange/,
  );
});
test('Core legacy original and HWPX admission remain unchanged', () => {
  const original = atomicSelector(
    { ...target, owner: 'section:0:table:1:list:2' },
    state({
      currentReference: { kind: 'original', section: 0, id: '99' },
      tableCell: { tableNode: 1, listNode: 2 },
    }),
    true,
    true,
  );
  assert.equal(original.reference, undefined);
  assert.equal(original.paragraph, 3);
  assert.throws(
    () => atomicSelector(target, state({ currentReference: undefined }), true, true),
    /UnsupportedFormattingReference/,
  );
  const hx = atomicSelector(
    { ...target, format: 'hwpx' },
    state({ currentReference: undefined }, 'hwpx'),
    true,
    true,
  );
  assert.equal(hx.reference, undefined);
  assert.equal(hx.paragraph, 3);
});

// The Native facade below is synthetic. It captures the actual runtime wire;
// it does not assert that the currently shipped 72 Native accepts generated owners.
async function harness(editable = true, code = 2) {
  const messages: any[] = [],
    wires: any[] = [],
    patches: any[] = [];
  let bindingRevision = 5,
    epoch = '7',
    nested = false,
    closed = false;
  const binding = () => ({ session: 'native-binding', revision: bindingRevision });
  const native = {
    supportsAtomicFormatting: () => true,
    atomicFormattingCapabilities: () => ({
      schemaVersion: 1,
      atomic: true,
      format: 'hwp5',
      coordinateSpace: 'native-source-utf16',
      requiresHistoryProtocol: 2,
      binding: binding(),
      fields: {},
      limits: {
        requestBytes: 65536,
        replyBytes: 2097152,
        targets: 4096,
        ranges: 4096,
        commands: 4096,
        fontNameBytes: 4096,
        projectionBytes: 33554432,
      },
    }),
    supportsCurrentSourceReferences: () => true,
    currentSourceReferences: (_section: number, { first, count }: any) => ({
      version: 1,
      total: 4,
      first,
      references: Array.from({ length: Math.min(count, 4 - first) }, () => ({
        ...reference,
        epoch,
      })),
    }),
    paragraphFlow: () =>
      Array.from({ length: 4 }, (_, paragraph) => ({
        paragraph,
        host: nested ? 'cell' : 'body',
        top_level: !nested,
      })),
    queryFormatting(wire: any) {
      wires.push(wire);
      return {
        schemaVersion: 1,
        binding: binding(),
        targets: [{ ref: 'native-issued-owner' }],
        observations: {
          aggregate: {},
          perTarget: [{ ref: 'native-issued-owner', fields: {} }],
        },
      };
    },
  };
  const runtime: any = {
    async request(message: any, context: any) {
      messages.push(message);
      const base = {
        kind: message.kind,
        historyRevision: 0,
        meta: { context, application: 'unapplied', changed: false },
      };
      if (message.kind === 'formatting-capabilities')
        return { ...base, formattingCapabilities: native.atomicFormattingCapabilities() };
      if (message.kind === 'query-formatting')
        return { ...base, formatting: queryAtomicFormatting(native, 'hwp5', message) };
      if (message.kind === 'formatting-patch') {
        patches.push(message.request);
        return {
          ...base,
          formattingNativeCode: code,
          ...(code === 0 ? { error: 'StaleFormattingBinding' } : {}),
        };
      }
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (m, c, admit) => {
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwp5', editable });
  return {
    editor,
    messages,
    wires,
    patches,
    advance: () => {
      epoch = '8';
      bindingRevision++;
    },
    nested: () => {
      nested = true;
    },
    target: () =>
      createParagraphSelection(editor.getEditorState(), {
        section: 0,
        paragraph: 3,
        startUnit: 1,
        endUnit: 3,
      }),
  };
}
for (const patch of [
  { paragraph: { alignment: 'RIGHT' } },
  { character: { bold: true } },
  { reset: { basis: 'paragraph-style', scope: 'paragraph' } },
  { reset: { basis: 'paragraph-style', scope: 'character' } },
  { reset: { basis: 'paragraph-style', scope: 'all' } },
])
  test(
    'createEditor generated patch/reset uses existing Native binding/targets and preserves code2 no-op: ' +
      JSON.stringify(patch),
    async () => {
      const h = await harness();
      try {
        const before = h.editor.getEditorState();
        const q = await h.editor.queryFormatting(h.target());
        assert.equal(h.editor.getEditorState(), before);
        assert.deepEqual({ ...q.binding }, { session: 'native-binding', revision: 5 });
        const answer = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: h.target(),
          patch,
        } as any);
        assert.equal(answer.status, 'known-no-op', answer.error);
        assert.equal(answer.changed, false);
        assert.equal(h.patches.length, 1);
        assert.deepEqual({ ...h.patches[0].binding }, { session: 'native-binding', revision: 5 });
        assert.deepEqual(JSON.parse(JSON.stringify(h.patches[0].targets)), [
          { ref: 'native-issued-owner' },
        ]);
        assert.deepEqual(JSON.parse(JSON.stringify(h.patches[0].patch)), patch);
        for (const wire of h.wires) {
          assert.equal(Object.hasOwn(wire.selectors[0], 'reference'), false);
          assert.equal(wire.selectors[0].kind, 'original-paragraph');
          assert.equal(wire.selectors[0].paragraph, 3);
        }
        assert.deepEqual(
          { ...h.messages.filter((m) => m.kind === 'query-formatting')[0].selector.reference },
          reference,
        );
        assert.equal(
          h.messages.some((m) =>
            ['save', 'splice', 'paragraph-alignment', 'character-properties'].includes(m.kind),
          ),
          false,
        );
      } finally {
        await h.editor.dispose();
      }
    },
  );
test('readonly generated query allowed, write rejected before query/patch', async () => {
  const h = await harness(false);
  try {
    await h.editor.queryFormatting(h.target());
    const count = h.messages.length;
    const answer = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: h.target(),
      patch: { paragraph: { alignment: 'RIGHT' } },
    });
    assert.equal(answer.error, 'ReadOnlyDocument');
    assert.equal(h.messages.length, count);
    assert.equal(h.patches.length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const failure of ['stale', 'nested'])
  test(
    'runtime current reference/owner preflight refuses createEditor ' +
      failure +
      ' before Native query or patch',
    async () => {
      const h = await harness();
      try {
        if (failure === 'stale') h.advance();
        else h.nested();
        const answer = await h.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: h.target(),
          patch: { paragraph: { alignment: 'RIGHT' } },
        });
        assert.equal(answer.status, 'rejected-unapplied');
        assert.match(
          answer.error!,
          failure === 'stale' ? /InvalidCurrentFormattingReference/ : /UnsupportedFormattingOwner/,
        );
        assert.equal(h.wires.length, 0);
        assert.equal(h.patches.length, 0);
      } finally {
        await h.editor.dispose();
      }
    },
  );
