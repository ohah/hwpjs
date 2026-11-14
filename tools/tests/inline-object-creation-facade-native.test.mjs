import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { compileInlineObjectCreationInputs } from './helpers/inline-object-creation-inputs.mjs';
const { module, old, seed, evidence } = await compileInlineObjectCreationInputs();
const eq = (patch = {}) => ({
  section: 0,
  paragraph: 1,
  start: 1,
  expectedText: 'a😀b',
  script: 'a < b & c',
  width: 6000,
  height: 2000,
  baseLine: 85,
  baseUnit: 1000,
  version: 'Equation Version 60',
  font: 'HYhwpEQ',
  ...patch,
});
const chart = (patch = {}) => ({
  target: { section: 0, paragraph: 1, unit: 1, expected_text: 'a😀b' },
  size: { width: 20000, height: 12000 },
  data: {
    categories: ['한<&', '😀'],
    series: [
      { name: 'S<&', values: ['1.50', '-2e2'] },
      { name: '둘', values: ['0', '30'] },
    ],
  },
  ...patch,
});
async function opened(mod = module) {
  const api = await createHwpxEditor(mod);
  const input = new Uint8Array(seed);
  api.open(input);
  input.fill(0);
  api.enableHistoryV2({});
  assert.equal(api.historyStats().protocolVersion, 2);
  return api;
}
async function save(name, bytes) {
  await writeFile(new URL(name, evidence), bytes, { flag: 'wx' });
}
for (const kind of ['equation', 'chart'])
  test(`actual facade ${kind}: single v2 commit, save, reopen, undo, redo and owned bytes`, async () => {
    const api = await opened();
    let reopened;
    try {
      const before = api.save(),
        stats = api.historyStats();
      await save(`${kind}-before.hwpx`, before);
      const request = kind === 'equation' ? eq() : chart();
      const outcome = kind === 'equation' ? api.insertEquation(request) : api.createChart(request);
      assert.deepEqual(outcome, { nativeCode: 1, application: 'applied', changed: true });
      const after = api.historyStats();
      assert.equal(after.revision, stats.revision + 1);
      assert.equal(after.undoCount, stats.undoCount + 1);
      assert.equal(after.redoCount, 0);
      assert.equal(after.poisoned, false);
      assert.deepEqual(api.historyRevisions(), [1, 0]);
      const bytes = api.save();
      await save(`${kind}-after.hwpx`, bytes);
      const copy = bytes.slice();
      bytes.fill(0);
      assert.deepEqual(api.save(), copy);
      reopened = await createHwpxEditor(module);
      reopened.open(copy);
      await save(`${kind}-reopened.hwpx`, reopened.save());
      assert.equal(api.undo(), true);
      assert.equal(api.historyRevision(), 0);
      assert.equal(api.historyStats().redoCount, 1);
      await save(`${kind}-undo.hwpx`, api.save());
      assert.equal(api.redo(), true);
      assert.equal(api.historyRevision(), 1);
      assert.equal(api.historyStats().undoCount, 1);
      await save(`${kind}-redo.hwpx`, api.save());
      assert.equal(api.redo(), false);
      assert.equal(api.historyRevision(), 1);
      await save(
        `${kind}-stats.json`,
        new TextEncoder().encode(
          JSON.stringify({ before: stats, after, outcome, request }, null, 2),
        ),
      );
    } finally {
      reopened?.close();
      api.close();
    }
  });
for (const kind of ['equation', 'chart'])
  test(`actual ${kind}: Native rejection preserves existing redo, full bytes and history`, async () => {
    const api = await opened();
    try {
      assert.equal(api.insertEquation(eq()).application, 'applied');
      assert.equal(api.undo(), true);
      const before = api.save(),
        stats = api.historyStats(),
        revisions = api.historyRevisions();
      const request =
        kind === 'equation'
          ? eq({ start: 2 })
          : chart({ target: { section: 0, paragraph: 1, unit: 1, expected_text: 'stale text' } });
      const outcome = kind === 'equation' ? api.insertEquation(request) : api.createChart(request);
      console.log(JSON.stringify({ kind, cohort: 'actual-native-rejection', outcome }));
      assert.equal(outcome.application, 'unapplied');
      assert.equal(outcome.nativeCode, 0);
      assert.ok(outcome.error);
      assert.deepEqual(api.save(), before);
      assert.deepEqual(api.historyStats(), stats);
      assert.deepEqual(api.historyRevisions(), revisions);
      await save(`${kind}-rejected.hwpx`, api.save());
      assert.equal(api.redo(), true);
      assert.equal(api.historyRevision(), 1);
      await save(`${kind}-preserved-redo.hwpx`, api.save());
      await save(
        `${kind}-rejection.json`,
        new TextEncoder().encode(JSON.stringify({ request, outcome, stats, revisions }, null, 2)),
      );
    } finally {
      api.close();
    }
  });
test('actual old879 has v2 but refuses both missing insertion APIs and preserves source/history', async () => {
  const api = await opened(old);
  try {
    assert.equal(api.supportsEquationInsertionAbi(), false);
    assert.equal(api.supportsChartCreationAbi(), false);
    const before = api.save(),
      stats = api.historyStats();
    assert.throws(() => api.insertEquation(eq()), /InlineObjectInsertionUnavailable/);
    assert.throws(() => api.createChart(chart()), /InlineObjectInsertionUnavailable/);
    assert.deepEqual(api.save(), before);
    assert.deepEqual(api.historyStats(), stats);
    assert.equal(api.undo(), false);
    assert.equal(api.redo(), false);
    await save('old879-unchanged.hwpx', api.save());
    await save('old879-stats.json', new TextEncoder().encode(JSON.stringify(stats, null, 2)));
  } finally {
    api.close();
  }
});
test('actual Native rejects equation stale witness and chart surrogate split without a history edge', async () => {
  const api = await opened();
  try {
    const before = api.save(),
      stats = api.historyStats();
    for (const [kind, request] of [
      ['equation', eq({ expectedText: 'wrong' })],
      ['chart', chart({ target: { section: 0, paragraph: 1, unit: 2, expected_text: 'a😀b' } })],
    ]) {
      const outcome = kind === 'equation' ? api.insertEquation(request) : api.createChart(request);
      console.log(JSON.stringify({ kind, cohort: 'actual-utf16-witness-rejection', outcome }));
      assert.equal(outcome.application, 'unapplied');
      assert.equal(outcome.nativeCode, 0);
      assert.deepEqual(api.save(), before);
      assert.deepEqual(api.historyStats(), stats);
    }
  } finally {
    api.close();
  }
});
