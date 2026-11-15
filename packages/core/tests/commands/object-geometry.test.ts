import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, SET_OBJECT_GEOMETRY_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
const selector = { kind: 'chart', section: 0, node: 17 } as const;
const observation = () => ({
  format: 'hwpx',
  selector,
  owner: {
    ownerNode: 23,
    componentNode: 19,
    paragraph: 0,
    anchorUnit: 0,
    sourceSha256: Array(32).fill(1),
    link: 'chart:4:path1:x',
  },
  frame: {
    width: 30000,
    height: 20000,
    horizontalOffset: 0,
    verticalOffset: 0,
    treatAsCharacter: true,
  },
  editable: { size: true, position: true },
  reason: null,
  historyRevision: 0,
  binding: { session: 's1', serial: '0' },
});
async function setup(options: any = {}) {
  const calls: any[] = [];
  let revision = 0,
    closed = false;
  const content = () => ({
    format: 'hwpx',
    readOnly: !!options.readOnly,
    totalParagraphs: 1,
    limited: false,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: '\ufffc',
        editable: true,
        selectionOwner: 'section:0:body',
      },
    ],
  });
  const runtime: any = {
    async request(message: any, context: any) {
      calls.push(message);
      const base = {
        kind: message.kind,
        historyRevision: revision,
        historyStats: { protocolVersion: 2 },
        meta: { context, application: 'unapplied', changed: false },
      };
      if (message.kind === 'object-geometry-query')
        return { ...base, geometry: options.observation ?? observation() };
      if (message.kind === 'object-geometry-set') {
        revision++;
        return {
          ...base,
          meta: { context, application: 'applied', changed: true },
          changed: true,
          applied: true,
          content: content(),
          historyRevision: revision,
          ...options.reply,
        };
      }
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  if (options.atomic !== false)
    bindRuntimeAdmission(
      runtime,
      async (m, c, admit) => {
        options.beforeAdmission?.(m);
        admit();
        return runtime.request(m, c);
      },
      () => !closed,
    );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: true });
  return { editor, calls };
}
async function target(editor: any) {
  const read = await editor.getObjectGeometry(selector);
  assert.equal(read.state, 'available');
  return read.target;
}
test('current Core-issued target dispatches one actual typed geometry transaction', async () => {
  const h = await setup();
  try {
    const owned = await target(h.editor);
    const result = await h.editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
      target: owned,
      patch: { width: 40000, treatAsCharacter: false },
    });
    assert.equal(result.status, 'committed-with-snapshot');
    assert.equal(result.state.nativeHistoryRevision, 1);
    const mutations = h.calls.filter((x) => x.kind === 'object-geometry-set');
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].request.expected.width, 30000);
    assert.deepEqual(mutations[0].request.patch, { width: 40000, treatAsCharacter: false });
  } finally {
    await h.editor.dispose();
  }
});
test('foreign/copy target cannot turn a Native observation into authority', async () => {
  const h = await setup(),
    other = await setup();
  try {
    const owned = await target(h.editor);
    for (const foreign of [{}, structuredClone(owned), await target(other.editor), observation()]) {
      const r = await h.editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
        target: foreign,
        patch: { width: 42 },
      });
      assert.equal(r.status, 'rejected-unapplied');
    }
    assert.equal(h.calls.filter((x) => x.kind === 'object-geometry-set').length, 0);
  } finally {
    await h.editor.dispose();
    await other.editor.dispose();
  }
});
test('selection-only state change rejects old geometry authority even with same Native revision', async () => {
  const h = await setup();
  try {
    const owned = await target(h.editor);
    await h.editor.setSelection(null);
    const r = await h.editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
      target: owned,
      patch: { width: 42 },
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(h.calls.filter((x) => x.kind === 'object-geometry-set').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('read-only document and non-atomic runtimes never issue a geometry target', async () => {
  for (const options of [{ readOnly: true }, { atomic: false }]) {
    const h = await setup(options);
    try {
      assert.equal((await h.editor.getObjectGeometry(selector)).state, 'unavailable');
      assert.equal(h.calls.filter((x) => x.kind === 'object-geometry-query').length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('Native revision/frame evidence malformed or wrong target fails before write', async () => {
  for (const update of [
    { historyRevision: 1 },
    { selector: { ...selector, node: 18 } },
    { frame: { ...observation().frame, width: 0 } },
  ]) {
    const h = await setup({ observation: { ...observation(), ...update } });
    try {
      await assert.rejects(h.editor.getObjectGeometry(selector));
      assert.equal(h.calls.filter((x) => x.kind === 'object-geometry-set').length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('unchanged patch is a known no-op without entering Native mutation or advancing revision', async () => {
  const h = await setup();
  try {
    const r = await h.editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
      target: await target(h.editor),
      patch: { width: 30000 },
    });
    assert.equal(r.status, 'known-no-op');
    assert.equal(r.state.nativeHistoryRevision, 0);
    assert.equal(h.calls.filter((x) => x.kind === 'object-geometry-set').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('experimental query and setter cannot bypass typed Core owner admission', async () => {
  const h = await setup();
  try {
    for (const kind of ['object-geometry-query', 'object-geometry-set'])
      assert.throws(
        () =>
          h.editor.requestExperimental(
            { kind },
            { mutation: true, token: h.editor.getEditorState().token },
          ),
        /UseTyped/,
      );
  } finally {
    await h.editor.dispose();
  }
});
test('post-commit projection error is refresh-required and never replays the geometry transaction', async () => {
  const h = await setup({ reply: { content: undefined, error: 'ProjectionFailed' } });
  try {
    const r = await h.editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
      target: await target(h.editor),
      patch: { width: 42 },
    });
    assert.equal(r.status, 'committed-refresh-required');
    assert.equal(h.calls.filter((x) => x.kind === 'object-geometry-set').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
