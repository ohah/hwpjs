import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  verifyChartFormulas,
  chartNumericTargets,
} from './style-preservation/formula-record-oracle.mjs';
import { generalNumber } from './style-preservation/general-number-oracle.mjs';

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(readFileSync('legacy/cfb.js', 'utf8'), context);
function streams(bytes) {
  const cfb = context.module.exports.parse(Buffer.from(bytes)),
    out = new Map();
  cfb.FileIndex.forEach((entry, i) => {
    if (entry.type === 2)
      out.set(cfb.FullPaths[i].slice(cfb.FullPaths[0].length), Buffer.from(entry.content));
  });
  return out;
}

for (const base of [500, 1000000])
  test(`all 48 chart numeric dependencies recalculate 13 formulas with base ${base}`, async () => {
    const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp');
    const editor = await createExperimentalHwp5Editor(wasm, input);
    const targets = [];
    try {
      editor.enableHistory();
      for (let paragraph = 0; paragraph < editor.paragraphCount(0); paragraph++) {
        const source = editor.text(0, paragraph);
        const before = editor.save({ allowStaleLayout: true });
        try {
          editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: '검증😀' });
        } catch (error) {
          if (error.message !== 'InvalidFormulaNumber') throw error;
          assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
          targets.push(paragraph);
          const number = String(base + targets.length);
          assert.notEqual(
            source.replace(/\r$/, '').replaceAll(',', ''),
            number,
            'probe must actually change the numeric value',
          );
          editor.splice({
            section: 0,
            paragraph,
            startUnit: 0,
            endUnit: source.length - 1,
            text: number,
          });
          assert.equal(editor.text(0, paragraph), number + '\r');
          const saved = editor.save({ allowStaleLayout: true });
          const inventory = streams(saved.bytes);
          assert.equal(verifyChartFormulas(inflateRawSync(inventory.get('BodyText/Section0'))), 13);
          assert.equal(editor.undo(), true);
          assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.save({ allowStaleLayout: true }), saved);
          const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
          try {
            assert.equal(reopened.text(0, paragraph), number + '\r');
          } finally {
            reopened.close();
          }
          continue;
        }
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
      }
      assert.equal(targets.length, 48);
      const final = streams(editor.save({ allowStaleLayout: true }).bytes);
      const original = streams(input);
      assert.deepEqual(
        targets,
        chartNumericTargets(inflateRawSync(original.get('BodyText/Section0'))),
        'native refusal selection must match independent record dependency inventory',
      );
      assert.deepEqual([...final.keys()].sort(), [...original.keys()].sort());
      for (const [path, bytes] of original)
        if (path !== 'BodyText/Section0') assert.deepEqual(final.get(path), bytes);
    } finally {
      editor.close();
    }
  });

test('independent general-number oracle has fixed exponent and rounding boundary expectations', () => {
  for (const [value, expected] of [
    [0, '0'],
    [-0, '-0'],
    [1, '1'],
    [1.25, '1.25'],
    [1000060, '1.00006e+06'],
    [1000000, '1e+06'],
    [999999, '999999'],
    [999999.9, '1e+06'],
    [0.0001, '0.0001'],
    [0.00001, '1e-05'],
    [-1234567, '-1.23457e+06'],
  ]) {
    assert.equal(generalNumber(value), expected);
  }
  assert.throws(() => generalNumber(Infinity));
  assert.throws(() => generalNumber(NaN));
});

for (const base of [500, 1000000])
  test(`reference HWP5 chart edits all twelve numeric dependencies with base ${base}`, async (t) => {
    if (!process.env.HWPJS_TEST_WASM) {
      t.skip('explicit reference candidate required');
      return;
    }
    const path = 'reference/rhwp/samples/143E433F503322BD33.hwp',
      input = readFileSync(path);
    const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest(input), '1bcdc7a2de38680cdb715556f40c8477f8242131d28de949b09e945022bf35fa');
    const original = streams(input),
      targets = chartNumericTargets(inflateRawSync(original.get('BodyText/Section0')));
    assert.deepEqual(targets, [18, 19, 20, 23, 24, 25, 28, 29, 30, 33, 34, 35]);
    const module = await WebAssembly.compile(wasm),
      wasmHash = digest(wasm);
    for (const [index, paragraph] of targets.entries()) {
      const editor = await createExperimentalHwp5Editor(module, input);
      try {
        editor.enableHistory();
        const source = editor.text(0, paragraph),
          before = editor.save({ allowStaleLayout: true });
        assert.equal(before.layoutRequiresReflow, false);
        assert(source.endsWith('\r'));
        assert.throws(
          () => editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: '검증😀' }),
          /InvalidFormulaNumber/,
        );
        assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
        const number = String(base + index + 1);
        editor.splice({
          section: 0,
          paragraph,
          startUnit: 0,
          endUnit: source.length - 1,
          text: number,
        });
        assert.equal(editor.text(0, paragraph), number + '\r');
        const saved = editor.save({ allowStaleLayout: true }),
          current = streams(saved.bytes);
        assert.equal(saved.layoutRequiresReflow, true);
        assert.equal(verifyChartFormulas(inflateRawSync(current.get('BodyText/Section0')), 3), 3);
        assert.deepEqual([...current.keys()].sort(), [...original.keys()].sort());
        for (const [name, bytes] of original)
          if (name !== 'BodyText/Section0') assert.deepEqual(current.get(name), bytes);
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
        assert.throws(
          () => editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: 'bad' }),
          /InvalidFormulaNumber/,
        );
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), saved);
        const reopened = await createExperimentalHwp5Editor(module, saved.bytes);
        try {
          assert.equal(reopened.text(0, paragraph), number + '\r');
          const roundtrip = reopened.save({ allowStaleLayout: true });
          assert.deepEqual(roundtrip.bytes, saved.bytes);
          assert.equal(
            roundtrip.layoutRequiresReflow,
            false,
            'reopen starts a new unchanged session, not a layout equivalence proof',
          );
        } finally {
          reopened.close();
        }
      } finally {
        editor.close();
      }
    }
    assert.deepEqual(readFileSync(path), input);
    assert.equal(digest(wasm), wasmHash);
    assert.equal(digest(readFileSync(process.env.HWPJS_TEST_WASM)), wasmHash);
  });
