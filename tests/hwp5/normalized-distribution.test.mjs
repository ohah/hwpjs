import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { inspect, verifyRaw } from './style-preservation/text-record-oracle.mjs';
import { independentFieldSpans } from './field-span-oracle.mjs';

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');

test('explicit normalized distribution opens the actual repaired five-section fixture without changing streams', async (t) => {
  const path = 'reference/rhwp/samples/hwp-3.0-HWPML.hwp';
  if (!existsSync(path)) {
    t.skip('RHWP reference fixture is unavailable');
    return;
  }
  const input = readFileSync(path);
  await assert.rejects(
    createExperimentalHwp5Editor(wasm, input, { distribution: true }),
    /RepairedSourceUnsupported/,
  );
  await assert.rejects(
    createExperimentalHwp5Editor(wasm, input, { normalizeObservedCfb: true }),
    /UnsupportedDistribution/,
  );
  const editor = await createExperimentalHwp5Editor(wasm, input, {
    distribution: true,
    normalizeObservedCfb: true,
  });
  try {
    assert.equal(editor.normalizationInfo().normalized, true);
    assert.equal(editor.normalizationInfo().historyBaseline, 'normalized');
    assert.deepEqual(
      Array.from({ length: editor.sectionCount() }, (_, section) => editor.paragraphCount(section)),
      [197, 13, 3321, 5262, 16],
    );
    const baseline = editor.save().bytes;
    assert.deepEqual(inspect(baseline).streams, inspect(input).streams);
    editor.enableHistory();
    const protectedSpan = independentFieldSpans(inspect(baseline).sections[2].bytes).find(
      (row) => row.field_id === 0x25787266,
    );
    assert(protectedSpan);
    assert.throws(
      () =>
        editor.splice({
          section: 2,
          paragraph: protectedSpan.begin.paragraph,
          startUnit: protectedSpan.begin.unit,
          endUnit: protectedSpan.begin.unit,
          text: '보호😀',
        }),
      /ReadOnlyCrossReferenceResult/,
    );
    assert.deepEqual(editor.save().bytes, baseline);
    assert.equal(editor.undo(), false);
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: '배포😀' });
    const edited = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(baseline, edited, 0, 1, 0, 0, '배포😀');
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.save().bytes, baseline);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, edited);
    const reopened = await createExperimentalHwp5Editor(wasm, baseline, { distribution: true });
    try {
      assert.equal(reopened.normalizationInfo().normalized, false);
    } finally {
      reopened.close();
    }
  } finally {
    editor.close();
  }
  assert.deepEqual(readFileSync(path), input);
});

test('normalized distribution strict fast path preserves independent editing and original history', async () => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp');
  const editor = await createExperimentalHwp5Editor(wasm, input, {
    distribution: true,
    normalizeObservedCfb: true,
  });
  try {
    assert.equal(editor.normalizationInfo().normalized, false);
    editor.enableHistory();
    editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: '배포😀' });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(input, saved, 0, 0, 0, 0, '배포😀');
    assert.throws(() => verifyRaw(input, saved, 0, 0, 0, 0, '틀림'), /complete Section must match/);
    const reopened = await createExperimentalHwp5Editor(wasm, saved, { distribution: true });
    try {
      assert.equal(reopened.text(0, 0), editor.text(0, 0));
    } finally {
      reopened.close();
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
  } finally {
    editor.close();
  }
});
