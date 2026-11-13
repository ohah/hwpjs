import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './chart-data-fixture.mjs';
const target = { section: 0, wrapper: 7 };
test('capability/format/history/target evidence gates availability without any mutation', () => {
  for (const delta of [
    { status: 'loading' },
    { historyRecoveryRequired: true },
    { nativeHistoryRevision: undefined },
    { content: { format: 'hwp5' } },
    { capabilities: { readOnly: true } },
    { content: { ...fixture().content, chartPointBatchEditAvailable: false } },
    { content: { ...fixture().content, chartTargets: [] } },
  ]) {
    const f = fixture();
    f.replace(delta);
    assert.equal(f.port.presentation().enabled, false);
    assert.equal(f.calls.length, 0);
  }
  assert.equal(fixture().port.presentation().enabled, true);
});
test('query captures source values; one batch carries token/revision/pair/before values', async () => {
  const f = fixture(),
    state = f.editor.getEditorState(),
    c = await f.port.capture(target);
  const values = c.points.map((p) => p.value);
  values[0] = '2';
  values[1] = '새 범주';
  assert.equal((await f.port.apply(c, values)).status, 'committed-with-snapshot');
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0], [
    'read',
    { kind: 'chart-points', ...target },
    { token: state.token },
  ]);
  assert.deepEqual(f.calls[1], [
    'write',
    {
      kind: 'chart-points-set',
      ...target,
      expectedRevision: 4,
      expectedPair: f.reply.chart.pair,
      changes: [
        { point: 0, before: '1', value: '2' },
        { point: 1, before: '범주', value: '새 범주' },
      ],
    },
    { mutation: true, token: state.token },
  ]);
  assert.equal(c.points[0].value, '1');
  assert.equal(state.nativeHistoryRevision, 4);
});
test('stale document, operation, view and state observations reject before dispatch', async () => {
  for (const token of [
    { documentId: 'new' },
    { generation: 2 },
    { operationRevision: 1 },
    { viewRevision: 1 },
    {},
  ]) {
    const f = fixture(),
      c = await f.port.capture(target);
    f.replace({ token });
    assert.equal((await f.port.apply(c, ['2', '범주', '?'])).status, 'rejected-unapplied');
    assert.equal(f.calls.filter((c) => c[0] === 'write').length, 0);
  }
});
test('no-op, invalid text, unsupported value, malformed drafts and size overflow preserve history without writes', async () => {
  const f = fixture(),
    c = await f.port.capture(target),
    before = f.editor.getEditorState();
  assert.equal((await f.port.apply(c, ['1', '범주', '?'])).status, 'known-no-op');
  for (const values of [
    [],
    ['2', '\ud800', '?'],
    ['2', '범주', 'unsupported'],
    ['x'.repeat(17), '범주', '?'],
  ])
    assert.equal((await f.port.apply(c, values)).status, 'rejected-unapplied');
  assert.equal(f.editor.getEditorState(), before);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.port.apply({ ...c }, ['2', '범주', '?'])).status, 'rejected-unapplied');
});
test('query reply identity, revision, pair and point validation reject without edits', async () => {
  for (const mutate of [
    (r) => r.historyRevision++,
    (r) => r.wrapper++,
    (r) => r.chart.pair.wrapper_node++,
    (r) => r.chart.pair.section_sha256.pop(),
    (r) => (r.chart.values.points[0].value = 2),
  ]) {
    const f = fixture();
    mutate(f.reply);
    await assert.rejects(f.port.capture(target));
    assert.equal(f.calls.length, 1);
  }
});
test('late queries and overlapping query/apply cannot authorize writes', async () => {
  const f = fixture();
  let resolve;
  f.onRead(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = f.port.capture(target);
  assert.equal(f.port.presentation().enabled, false);
  await assert.rejects(f.port.capture(target), /처리/);
  f.replace({ token: { documentId: 'new' } });
  resolve(f.reply);
  await assert.rejects(pending);
  assert.equal(f.calls.length, 1);
});
test('single in-flight edit rejects duplicates and propagates uncertain dispatch failure', async () => {
  const f = fixture(),
    c = await f.port.capture(target);
  let reject;
  f.onWrite(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  const pending = f.port.apply(c, ['2', '범주', '?']);
  assert.equal((await f.port.apply(c, ['3', '범주', '?'])).status, 'rejected-unapplied');
  reject(Error('transport lost'));
  await assert.rejects(pending, /transport lost/);
  assert.equal(f.calls.filter((c) => c[0] === 'write').length, 1);
});
