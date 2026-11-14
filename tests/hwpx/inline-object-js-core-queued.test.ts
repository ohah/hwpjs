import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  INSERT_EQUATION_COMMAND,
  CREATE_CHART_COMMAND,
} from '../../packages/core/src/index.ts';
import { bindRuntimeAdmission } from '../../packages/core/src/internal/runtime-admission.ts';
import { surfaceOperation } from '../../packages/core/src/commands/surface-protocol.ts';
import { createParagraphSelection } from '../../packages/core/src/state/paragraph-selection.ts';
const equation = () => ({
  script: 'a+b',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
});
const chart = () => ({
  width: 20000,
  height: 12000,
  categories: ['A'],
  series: [{ name: 'S', values: [3] }],
});
function deferred() {
  let resolve: any;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve: () => resolve() };
}
function harness({ version = 2, available = true, mode = 'applied', delay = false } = {}) {
  const calls: any[] = [];
  let cursor = 0,
    clock = 0,
    rows: any[] = [{ revision: 0, object: null }],
    closed = false;
  const entered = deferred(),
    release = deferred();
  const runtime = {
    async request(m: any, c?: any) {
      calls.push(structuredClone(m));
      if (['insert-equation', 'create-chart'].includes(m.kind) && mode === 'applied') {
        rows = rows.slice(0, cursor + 1);
        rows.push({ revision: ++clock, object: structuredClone(m.request) });
        cursor++;
      }
      if (m.kind === 'undo') cursor = Math.max(0, cursor - 1);
      if (m.kind === 'redo') cursor = Math.min(rows.length - 1, cursor + 1);
      const revision = rows[cursor].revision;
      const base = {
        kind: m.kind,
        historyRevision: revision,
        historyRevisions: [
          revision,
          ...rows.filter((r) => r.revision !== revision).map((r) => r.revision),
        ],
        historyStats: { protocolVersion: version },
        meta: { context: c, application: 'applied', changed: true },
      };
      if (m.kind === 'save')
        return { ...base, bytes: new TextEncoder().encode(JSON.stringify(rows[cursor])) };
      if (['insert-equation', 'create-chart'].includes(m.kind) && mode !== 'applied') {
        if (mode === 'mismatch') return { ...base, kind: 'wrong' };
        if (mode === 'unknown')
          return { ...base, error: 'lost reply', meta: { ...base.meta, application: 'unknown' } };
        return {
          ...base,
          ...(mode === 'reject' ? { error: 'NativeRejected' } : {}),
          formattingNativeCode: mode === 'noop' ? 2 : 0,
          meta: { ...base.meta, application: 'unapplied', changed: false },
        };
      }
      return {
        ...base,
        content: {
          format: 'hwpx',
          equationInsertionAvailable: available,
          chartCreationAvailable: available,
          paragraphs: [
            {
              section: 0,
              paragraph: 0,
              text: 'a😀b',
              editable: true,
              plainEditable: true,
              selectionOwner: 'section:0:body',
            },
          ],
        },
      };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime as any,
    async (m, c, admit) => {
      if (delay && ['insert-equation', 'create-chart'].includes(m.kind)) {
        entered.resolve();
        await release.promise;
      }
      admit();
      return runtime.request(m, c);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime as any });
  return {
    editor,
    calls,
    entered,
    release,
    setMode(value: string) {
      mode = value;
    },
    invalidateAdmission() {
      closed = true;
    },
    async open() {
      await editor.load(new Uint8Array([1]), { format: 'hwpx' });
      await editor.setSelection(
        createParagraphSelection(editor.getEditorState(), {
          section: 0,
          paragraph: 0,
          startUnit: 1,
        }),
      );
    },
    payload(options: any) {
      const s = editor.getEditorState();
      return { target: s.selection as any, selectionVersion: s.stateVersion, options };
    },
  };
}
for (const [command, options] of [
  [INSERT_EQUATION_COMMAND, equation],
  [CREATE_CHART_COMMAND, chart],
] as const)
  test(`${command.name}: Core single commit undo redo save byte ownership`, async () => {
    const h = harness();
    try {
      await h.open();
      const before = h.editor.getEditorState();
      assert.equal(
        (await h.editor.dispatchCommand(command as any, h.payload(options()))).status,
        'committed-with-snapshot',
      );
      const writes = h.calls.filter((m) => m.kind === command.name);
      assert.equal(writes.length, 1);
      const wire = writes[0].request;
      assert.equal(wire.target?.paragraph ?? wire.paragraph, 1);
      assert.equal(wire.target?.expected_text ?? wire.expectedText, 'a😀b');
      assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
      assert.equal(h.editor.getEditorState().operationRevision, before.operationRevision + 1);
      const saved = await h.editor.save(),
        bytes = saved.bytes.slice();
      saved.bytes.fill(0);
      await h.editor.undo();
      assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
      assert.equal(
        JSON.parse(new TextDecoder().decode((await h.editor.save()).bytes)).object,
        null,
      );
      await h.editor.redo();
      assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
      assert.deepEqual((await h.editor.save()).bytes, bytes);
      assert.equal(h.calls.filter((m) => m.kind === command.name).length, 1);
    } finally {
      await h.editor.dispose();
    }
  });
test('queued arrays owned before admission yields', async () => {
  const h = harness({ delay: true });
  try {
    await h.open();
    const options = chart(),
      pending = h.editor.dispatchCommand(CREATE_CHART_COMMAND, h.payload(options));
    await h.entered.promise;
    options.categories[0] = 'changed';
    options.series[0].values[0] = 99;
    h.release.resolve();
    assert.equal((await pending).status, 'committed-with-snapshot');
    const r = h.calls.find((m) => m.kind === 'create-chart').request;
    assert.deepEqual(r.data.categories, ['A']);
    assert.deepEqual(r.data.series[0].values, ['3']);
  } finally {
    h.release.resolve();
    await h.editor.dispose();
  }
});
test('two queued captures: second stale with one runtime call', async () => {
  const h = harness();
  try {
    await h.open();
    const p = h.payload(equation());
    const a = h.editor.dispatchCommand(INSERT_EQUATION_COMMAND, p),
      b = h.editor.dispatchCommand(INSERT_EQUATION_COMMAND, p);
    assert.equal((await a).status, 'committed-with-snapshot');
    assert.equal((await b).status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'insert-equation').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
for (const mode of ['noop', 'reject', 'unknown', 'mismatch'])
  test(`existing mutation outcome ${mode}`, async () => {
    const h = harness({ mode });
    try {
      await h.open();
      const before = h.editor.getEditorState();
      const r = await h.editor.dispatchCommand(INSERT_EQUATION_COMMAND, h.payload(equation()));
      assert.equal(
        r.status,
        mode === 'noop'
          ? 'known-no-op'
          : mode === 'reject'
            ? 'rejected-unapplied'
            : 'committed-refresh-required',
      );
      assert.equal(h.calls.filter((m) => m.kind === 'insert-equation').length, 1);
      assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
      if (mode === 'noop' || mode === 'reject')
        assert.equal(h.editor.getEditorState().operationRevision, before.operationRevision);
      else assert.equal(h.editor.getEditorState().status, 'refresh-required');
    } finally {
      await h.editor.dispose();
    }
  });
for (const options of [{ version: 1 }, { available: false }])
  test(`legacy V1 or absent ABI synthetic refusal ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    try {
      await h.open();
      assert.equal(
        (await h.editor.dispatchCommand(CREATE_CHART_COMMAND, h.payload(chart()))).status,
        'rejected-unapplied',
      );
      assert.equal(h.calls.filter((m) => m.kind === 'create-chart').length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('mutation inventory and experimental bypass refusal', async () => {
  const h = harness();
  try {
    await h.open();
    for (const kind of ['insert-equation', 'create-chart']) {
      assert.equal(surfaceOperation(kind), 'mutation');
      for (const mutation of [true, false])
        assert.throws(
          () => h.editor.requestExperimental({ kind }, { mutation }),
          /UseTypedEditorOperation/,
        );
    }
  } finally {
    await h.editor.dispose();
  }
});
test('update collected commands preserve exact selection fences and stop at stale second command', async () => {
  const h = harness();
  try {
    await h.open();
    const p = h.payload(equation());
    const result = await h.editor.update((q) => {
      q.dispatchCommand(INSERT_EQUATION_COMMAND, p);
      q.dispatchCommand(INSERT_EQUATION_COMMAND, p);
    });
    assert.deepEqual(
      result.results.map((r) => r.status),
      ['committed-with-snapshot', 'rejected-unapplied'],
    );
    assert.equal(result.stoppedIndex, 1);
    assert.equal(h.calls.filter((m) => m.kind === 'insert-equation').length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('known rejected creation preserves pre-existing redo and Unicode witness', async () => {
  const h = harness();
  try {
    await h.open();
    await h.editor.dispatchCommand(INSERT_EQUATION_COMMAND, h.payload(equation()));
    await h.editor.undo();
    await h.editor.setSelection(
      createParagraphSelection(h.editor.getEditorState(), {
        section: 0,
        paragraph: 0,
        startUnit: 1,
      }),
    );
    h.setMode('reject');
    assert.equal(
      (await h.editor.dispatchCommand(CREATE_CHART_COMMAND, h.payload(chart()))).status,
      'rejected-unapplied',
    );
    assert.deepEqual(h.editor.getEditorState().nativeHistoryRevisions, [0, 1]);
    await h.editor.redo();
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 1);
    const saved = JSON.parse(new TextDecoder().decode((await h.editor.save()).bytes));
    assert.equal(saved.object.expectedText, 'a😀b');
  } finally {
    await h.editor.dispose();
  }
});
test('Runtime admission rechecks immediately before Native boundary and rejects without write', async () => {
  const h = harness({ delay: true });
  try {
    await h.open();
    const pending = h.editor.dispatchCommand(CREATE_CHART_COMMAND, h.payload(chart()));
    await h.entered.promise;
    h.invalidateAdmission();
    h.release.resolve();
    assert.equal((await pending).status, 'rejected-unapplied');
    assert.equal(h.calls.filter((m) => m.kind === 'create-chart').length, 0);
    assert.equal(h.editor.getEditorState().nativeHistoryRevision, 0);
  } finally {
    h.release.resolve();
    await h.editor.dispose();
  }
});
