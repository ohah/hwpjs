import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellBorderPort } from '../src/table-cell-border-port.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
const chosen = { style: true, width: true, color: true };
const draft = { edges: 15, style: 'SOLID', width: '10', color: '#1234ab', dirty: chosen };
const setup = (format = 'hwp5') => {
  const f = fixture(format);
  f.state.capabilities.cellBorderAvailable = true;
  delete f.state.capabilities.cellSizeAvailable;
  delete f.state.capabilities.cellSizeBatchAvailable;
  return { f, p: createTableCellBorderPort(f.editor, f.api) };
};
for (const format of ['hwp5', 'hwpx'])
  test(format + ' border-only one mutation without size capability', async () => {
    const { f, p } = setup(format),
      c = p.capture();
    assert.equal(c.writeReason, null);
    assert.equal(c.currentBorder, null);
    const reply = await p.apply(c, draft);
    assert.equal(reply.status, 'committed-with-snapshot');
    assert.deepEqual(f.mutationCalls(), [
      {
        type: 'mutation',
        message: {
          kind: 'cell-border',
          section: 0,
          tableNode: 81,
          listNode: 82,
          edges: 15,
          style: 'SOLID',
          width: 10,
          color: 0x1234ab,
        },
        options: { mutation: true, token: f.state.token },
      },
    ]);
    assert.equal(Object.isFrozen(f.mutationCalls()[0].message), true);
  });
test('closed presentation never scans cells or calls Native; absent/false capability denies', () => {
  const { f, p } = setup();
  for (const value of [undefined, false, 1, 'true']) {
    f.state.capabilities.cellBorderAvailable = value;
    for (let i = 0; i < 5; i++) assert.equal(p.presentation().enabled, false);
  }
  assert.equal(f.calls.length, 0);
});
for (const [label, mutate] of [
  [
    'readonly',
    (s) => {
      s.content.readOnly = true;
    },
  ],
  [
    'history recovery',
    (s) => {
      s.historyRecoveryRequired = true;
    },
  ],
  [
    'border cap missing',
    (s) => {
      delete s.capabilities.cellBorderAvailable;
    },
  ],
  [
    'partial',
    (s) => {
      s.content.limited = true;
    },
  ],
  [
    'body',
    (s) => {
      delete s.content.paragraphs[0].tableCell;
    },
  ],
  [
    'foreign membership',
    (s) => {
      s.content.tables[0].cells[0].paragraphs = [16];
    },
  ],
])
  test(label + ' denies border with zero mutation', async () => {
    const { f, p } = setup();
    f.mutate(mutate);
    assert.equal((await p.apply(p.capture(), draft)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  });
test('no explicit choice and malformed RGB never dispatch', async () => {
  const { f, p } = setup();
  for (const d of [
    { ...draft, dirty: { ...chosen, color: false } },
    ...['#fff', '#12345678', 'white', '', ' #123456'].map((color) => ({
      ...draft,
      color,
      dirty: chosen,
    })),
  ])
    assert.equal((await p.apply(p.capture(), d)).status, 'rejected-unapplied');
  assert.equal(f.mutationCalls().length, 0);
});
test('black and white are explicit valid RGB24 bounds, never a default observation', async () => {
  for (const [color, expected] of [
    ['#000000', 0],
    ['#FFFFFF', 0xffffff],
  ]) {
    const { f, p } = setup();
    const c = p.capture();
    assert.equal(c.currentBorder, null);
    await p.apply(c, { ...draft, color, dirty: chosen });
    assert.equal(f.mutationCalls()[0].message.color, expected);
  }
});
test('cloned/foreign capture cannot dispatch or restore; real consumed capture restores', async () => {
  const { f, p } = setup(),
    c = p.capture();
  assert.equal((await p.apply({ ...c }, draft)).status, 'rejected-unapplied');
  assert.equal(
    await p.restoreSelection(c, { status: 'committed-with-snapshot', state: f.state }),
    false,
  );
  f.editor.requestExperimental = async (message, options) => {
    f.calls.push({ type: 'mutation', message, options });
    f.replace({ selection: undefined, operationRevision: 1 });
    return { status: 'committed-with-snapshot', state: f.state };
  };
  const result = await p.apply(c, draft);
  assert.equal(await p.restoreSelection(c, result), true);
  assert.equal(
    f.calls.find((x) => x.type === 'selection').options.stateVersion,
    result.state.stateVersion,
  );
  assert.equal((await p.apply(c, draft)).status, 'rejected-unapplied');
});
for (const mutation of [
  (s) => {
    s.capabilities.cellBorderAvailable = false;
  },
  (s) => {
    s.content.readOnly = true;
  },
  (s) => {
    s.historyRecoveryRequired = true;
  },
  (s) => {
    s.selection.startUnit = 1;
  },
  (s) => {
    s.token = { ...s.token, operationRevision: 9 };
  },
])
  test('queue barrier rechecks capability/readonly/history/scalar fences', async () => {
    const { f, p } = setup(),
      c = p.capture();
    f.editor.update = async () => f.mutate(mutation);
    assert.equal((await p.apply(c, draft)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  });
test('shared admission itself enforces readiness/readonly/history even when builder permits', async () => {
  for (const mode of ['readOnly', 'historyRecoveryRequired', 'status']) {
    const f = fixture(),
      p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    if (mode === 'readOnly') f.state.content.readOnly = true;
    else if (mode === 'status') f.state.status = 'refresh-required';
    else f.state.historyRecoveryRequired = true;
    const result = await p.applyCapturedMutation(c, () => ({
      message: { kind: 'cell-border', section: 0, tableNode: 81, listNode: 82, color: 0 },
    }));
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  }
});
test('request getter reentrancy and same-state late capability change both deny', async () => {
  for (const change of [
    (f) => f.replace({ selection: null }),
    (f) => {
      f.state.capabilities.cellBorderAvailable = false;
    },
  ]) {
    const { f, p } = setup(),
      c = p.capture(),
      send = f.editor.requestExperimental;
    Object.defineProperty(f.editor, 'requestExperimental', {
      get() {
        change(f);
        return send;
      },
    });
    assert.equal((await p.apply(c, draft)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  }
});
test('foreign port captures and selection change at cancel cannot recover old authority', async () => {
  const { f, p } = setup();
  const other = createTableCellBorderPort(f.editor, f.api);
  const capture = p.capture();
  assert.equal((await other.apply(capture, draft)).status, 'rejected-unapplied');
  f.state.selection.startUnit = 1;
  assert.equal(p.isCurrent(capture), false);
  assert.equal(f.mutationCalls().length, 0);
});
test('pending duplicate/dispose before queue prevents request; transport failure consumes', async () => {
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
  const q = setup(),
    lease = q.p.capture();
  let requests = 0;
  q.f.editor.requestExperimental = async () => {
    requests++;
    throw Error('transport');
  };
  await assert.rejects(q.p.apply(lease, draft));
  assert.equal((await q.p.apply(lease, draft)).status, 'rejected-unapplied');
  assert.equal(requests, 1);
});
for (const field of ['style', 'width', 'color'])
  test('explicit ' + field + ' choice required independently', async () => {
    const { f, p } = setup();
    const result = await p.apply(p.capture(), { ...draft, dirty: { ...chosen, [field]: false } });
    assert.equal(result.error, 'CellBorderChoiceRequired');
    assert.equal(f.calls.length, 1, 'capture observation only; no queue barrier or mutation');
    assert.equal(f.mutationCalls().length, 0);
  });
for (const invalid of [
  { edges: 0 },
  { edges: 16 },
  { edges: 1.5 },
  { style: 'DASH' },
  { style: 1 },
  { width: '11' },
  { width: '1' },
  { width: '010' },
  { width: '1e2' },
  { width: '0.10' },
  { width: ' 10' },
])
  test('invalid sparse border draft rejects ' + JSON.stringify(invalid), async () => {
    const { f, p } = setup();
    assert.equal((await p.apply(p.capture(), { ...draft, ...invalid })).error, 'InvalidCellBorder');
    assert.equal(f.mutationCalls().length, 0);
  });
test('single edges, mixed edges, NONE and DOUBLE_SLIM preserve exact wire units', async () => {
  for (const edges of [1, 2, 4, 8, 5, 10, 15])
    for (const style of ['NONE', 'SOLID', 'DOUBLE_SLIM']) {
      const { f, p } = setup();
      await p.apply(p.capture(), { ...draft, edges, style, width: '500' });
      const message = f.mutationCalls()[0].message;
      assert.deepEqual(message, {
        kind: 'cell-border',
        section: 0,
        tableNode: 81,
        listNode: 82,
        edges,
        style,
        width: 500,
        color: 0x1234ab,
      });
    }
});
test('rejected-unapplied and known-no-op remain retryable; changed draft cannot drift in queue', async () => {
  for (const status of ['known-no-op', 'rejected-unapplied']) {
    const { f, p } = setup(),
      capture = p.capture();
    f.editor.requestExperimental = async (message, options) => {
      f.calls.push({ type: 'mutation', message, options });
      return { status, state: f.state };
    };
    const changing = { ...draft, dirty: { ...chosen } };
    f.editor.update = async () => {
      changing.edges = 2;
      changing.style = 'NONE';
      changing.width = '500';
      changing.color = '#ffffff';
    };
    assert.equal((await p.apply(capture, changing)).status, status);
    assert.equal(p.isCurrent(capture), true);
    assert.equal(f.mutationCalls()[0].message.edges, 15);
    assert.equal(f.mutationCalls()[0].message.style, 'SOLID');
    assert.equal((await p.apply(capture, draft)).status, status);
    assert.equal(f.mutationCalls().length, 2);
  }
});
