import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
export const border = {
  mode: 'cell',
  region: 'outer',
  startRow: '1',
  endRow: '1',
  startColumn: '1',
  endColumn: '1',
  edges: 15,
  style: 'SOLID',
  width: '12',
  color: '#123456',
  dirty: { style: true, width: true, color: true },
};
export const draft = { border, background: { color: '#ffffff', dirty: true } };
export function setup(format = 'hwp5') {
  const f = fixture(format);
  f.state.capabilities.cellAppearanceAvailable = true;
  delete f.state.capabilities.cellSizeAvailable;
  delete f.state.capabilities.cellSizeBatchAvailable;
  return { f, p: createTableCellAppearancePort(f.editor, f.api) };
}
for (const format of ['hwp5', 'hwpx'])
  test(
    format + ' combined draft emits one immutable atomic request with original token',
    async () => {
      const { f, p } = setup(format),
        c = p.capture();
      assert.equal(c.writeReason, null);
      assert.equal(c.currentBorder, null);
      assert.equal(c.currentColor, null);
      const result = await p.apply(c, draft);
      assert.equal(result.status, 'committed-with-snapshot');
      const call = f.mutationCalls()[0];
      assert.equal(f.mutationCalls().length, 1);
      assert.deepEqual(call.message, {
        kind: 'cell-appearance',
        cells: [
          {
            section: 0,
            tableNode: 81,
            listNode: 82,
            edges: 15,
            style: 'SOLID',
            width: 12,
            color: 0x123456,
          },
        ],
        background: { section: 0, tableNode: 81, listNode: 82, color: 0xffffff },
      });
      assert.deepEqual(call.options, { mutation: true, token: c.state.token });
      assert.ok(Object.isFrozen(call.message.cells));
      assert.ok(Object.isFrozen(call.message.cells[0]));
      assert.ok(Object.isFrozen(call.message.background));
    },
  );
test('border-only and background-only use the same atomic boundary', async () => {
  for (const value of [
    { border, background: null },
    { border: null, background: draft.background },
  ]) {
    const { f, p } = setup();
    assert.equal((await p.apply(p.capture(), value)).status, 'committed-with-snapshot');
    assert.equal(f.mutationCalls()[0].message.kind, 'cell-appearance');
    assert.equal(f.mutationCalls()[0].message.cells.length, value.border ? 1 : 0);
  }
});
function fourCells(f) {
  const t = f.state.content.tables[0];
  t.rows = t.columns = 2;
  t.cells = Array.from({ length: 4 }, (_, i) => ({
    ...t.cells[0],
    listNode: 82 + i,
    row: i >> 1,
    column: i % 2,
    paragraphs: i === 0 ? [15] : [16 + i],
  }));
}
test('one-based inclusive range converts exactly to planner half-open bounds', async () => {
  const { f, p } = setup();
  fourCells(f);
  const result = await p.apply(p.capture(), {
    border: { ...border, mode: 'range', region: 'outer', endRow: '2', endColumn: '2' },
    background: null,
  });
  assert.equal(result.status, 'committed-with-snapshot');
  assert.deepEqual(
    f.mutationCalls()[0].message.cells.map((v) => [v.listNode, v.edges]),
    [
      [82, 5],
      [83, 6],
      [84, 9],
      [85, 10],
    ],
  );
});
test('whole table inner edges are planned once per original cell', async () => {
  const { f, p } = setup();
  fourCells(f);
  await p.apply(p.capture(), {
    border: { ...border, mode: 'table', region: 'inner' },
    background: null,
  });
  assert.deepEqual(
    f.mutationCalls()[0].message.cells.map((v) => v.edges),
    [10, 9, 6, 5],
  );
});
for (const value of [
  { border: null, background: null },
  { border: { ...border, dirty: { ...border.dirty, color: false } }, background: null },
  { border: { ...border, mode: 'range', startRow: '0' }, background: null },
  { border: { ...border, mode: 'range', startRow: '2', endRow: '1' }, background: null },
  { border: { ...border, mode: 'range', startRow: '1e0' }, background: null },
  { border: { ...border, mode: 'table' }, background: draft.background },
  { border: null, background: { color: '#fff', dirty: true } },
  { border: null, background: { color: '#ffffff', dirty: false } },
  { border: { ...border, mode: 'cell', region: 'inner' }, background: null },
])
  test('invalid/unsupported draft dispatches nothing: ' + JSON.stringify(value), async () => {
    const { f, p } = setup();
    assert.equal((await p.apply(p.capture(), value)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  });
for (const mutate of [
  (s) => {
    s.content.readOnly = true;
  },
  (s) => {
    s.capabilities.cellAppearanceAvailable = false;
  },
  (s) => {
    s.historyRecoveryRequired = true;
  },
  (s) => {
    s.selection.startUnit = 1;
  },
  (s) => {
    s.token = { ...s.token, operationRevision: 10 };
  },
  (s) => {
    s.content.tables[0].cells[0].protected = true;
  },
])
  test('shared queue barrier rechecks authority and plan after reentry', async () => {
    const { f, p } = setup(),
      c = p.capture();
    f.editor.update = async () => f.mutate(mutate);
    assert.equal((await p.apply(c, draft)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  });
test('cloned and foreign captures cannot acquire mutation or restoration authority', async () => {
  const { f, p } = setup(),
    c = p.capture(),
    q = createTableCellAppearancePort(f.editor, f.api);
  assert.equal((await p.apply({ ...c }, draft)).status, 'rejected-unapplied');
  assert.equal((await q.apply(c, draft)).status, 'rejected-unapplied');
  assert.equal(
    await p.restoreSelection(c, { status: 'committed-with-snapshot', state: f.state }),
    false,
  );
  assert.equal(f.mutationCalls().length, 0);
});
test('transport failure consumes the lease and cannot retry the atomic edit', async () => {
  const { f, p } = setup(),
    c = p.capture();
  let requests = 0;
  f.editor.requestExperimental = async () => {
    requests++;
    throw Error('transport');
  };
  await assert.rejects(p.apply(c, draft));
  assert.equal((await p.apply(c, draft)).status, 'rejected-unapplied');
  assert.equal(requests, 1);
});
test('pending duplicate and disposal before queue release cannot send', async () => {
  const { f, p } = setup(),
    c = p.capture();
  let release;
  f.editor.update = () =>
    new Promise((r) => {
      release = r;
    });
  const first = p.apply(c, draft);
  assert.equal((await p.apply(c, draft)).status, 'rejected-unapplied');
  p.dispose();
  release();
  assert.equal((await first).status, 'rejected-unapplied');
  assert.equal(f.mutationCalls().length, 0);
});
test('closed presentation is cheap and capability must be exactly true', () => {
  const { f, p } = setup();
  for (const cap of [false, undefined, 1, 'true']) {
    f.state.capabilities.cellAppearanceAvailable = cap;
    assert.equal(p.presentation().enabled, false);
  }
  assert.equal(f.calls.length, 0);
});
test('queued user draft changes never alter admitted combined request', async () => {
  const { f, p } = setup(),
    d = structuredClone(draft);
  f.editor.update = async () => {
    d.border.style = 'NONE';
    d.background.color = '#000000';
  };
  await p.apply(p.capture(), d);
  assert.equal(f.mutationCalls()[0].message.cells[0].style, 'SOLID');
  assert.equal(f.mutationCalls()[0].message.background.color, 0xffffff);
});
test('reentrant request getter changing capability rejects before dispatch', async () => {
  const { f, p } = setup(),
    send = f.editor.requestExperimental;
  Object.defineProperty(f.editor, 'requestExperimental', {
    get() {
      f.state.capabilities.cellAppearanceAvailable = false;
      return send;
    },
  });
  const result = await p.apply(p.capture(), draft);
  assert.equal(result.status, 'rejected-unapplied');
  assert.equal(f.mutationCalls().length, 0);
});
test('whole table background is rejected even with just one observed cell', async () => {
  const { f, p } = setup();
  const result = await p.apply(p.capture(), { ...draft, border: { ...border, mode: 'table' } });
  assert.equal(result.error, 'BulkCellBackgroundUnsupported');
  assert.equal(f.mutationCalls().length, 0);
});
