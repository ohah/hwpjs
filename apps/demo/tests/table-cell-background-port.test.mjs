import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellBackgroundPort } from '../src/table-cell-background-port.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
const draft = { color: '#1234ab', dirty: true };
const setup = (format = 'hwp5') => {
  const f = fixture(format);
  f.state.capabilities.cellBackgroundAvailable = true;
  delete f.state.capabilities.cellSizeAvailable;
  delete f.state.capabilities.cellSizeBatchAvailable;
  return { f, p: createTableCellBackgroundPort(f.editor, f.api) };
};
for (const format of ['hwp5', 'hwpx'])
  test(format + ' background-only one mutation without size capability', async () => {
    const { f, p } = setup(format),
      c = p.capture();
    assert.equal(c.writeReason, null);
    assert.equal(c.currentColor, null);
    const reply = await p.apply(c, draft);
    assert.equal(reply.status, 'committed-with-snapshot');
    assert.deepEqual(f.mutationCalls(), [
      {
        type: 'mutation',
        message: {
          kind: 'cell-background',
          section: 0,
          tableNode: 81,
          listNode: 82,
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
    f.state.capabilities.cellBackgroundAvailable = value;
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
    'background cap missing',
    (s) => {
      delete s.capabilities.cellBackgroundAvailable;
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
  test(label + ' denies background with zero mutation', async () => {
    const { f, p } = setup();
    f.mutate(mutate);
    assert.equal((await p.apply(p.capture(), draft)).status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  });
test('no explicit choice and malformed RGB never dispatch', async () => {
  const { f, p } = setup();
  for (const d of [
    { ...draft, dirty: false },
    ...['#fff', '#12345678', 'white', '', ' #123456'].map((color) => ({ color, dirty: true })),
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
    assert.equal(c.currentColor, null);
    await p.apply(c, { color, dirty: true });
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
    s.capabilities.cellBackgroundAvailable = false;
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
      message: { kind: 'cell-background', section: 0, tableNode: 81, listNode: 82, color: 0 },
    }));
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(f.mutationCalls().length, 0);
  }
});
test('request getter reentrancy and same-state late capability change both deny', async () => {
  for (const change of [
    (f) => f.replace({ selection: null }),
    (f) => {
      f.state.capabilities.cellBackgroundAvailable = false;
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
  const other = createTableCellBackgroundPort(f.editor, f.api);
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
