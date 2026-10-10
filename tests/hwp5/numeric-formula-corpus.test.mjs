import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { inflateRawSync } from "node:zlib";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { verifyChartFormulas, chartNumericTargets } from "./style-preservation/formula-record-oracle.mjs";
import { generalNumber } from "./style-preservation/general-number-oracle.mjs";

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
function streams(bytes) {
  const cfb = context.module.exports.parse(Buffer.from(bytes)), out = new Map();
  cfb.FileIndex.forEach((entry, i) => { if (entry.type === 2) out.set(cfb.FullPaths[i].slice(cfb.FullPaths[0].length), Buffer.from(entry.content)); });
  return out;
}

for (const base of [500, 1000000]) test(`all 48 chart numeric dependencies recalculate 13 formulas with base ${base}`, async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  const targets = [];
  try {
    editor.enableHistory();
    for (let paragraph = 0; paragraph < editor.paragraphCount(0); paragraph++) {
      const source = editor.text(0, paragraph);
      const before = editor.save({ allowStaleLayout: true });
      try { editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "검증😀" }); }
      catch (error) {
        if (error.message !== "InvalidFormulaNumber") throw error;
        assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
        targets.push(paragraph);
        const number = String(base + targets.length);
        assert.notEqual(source.replace(/\r$/, "").replaceAll(",", ""), number, "probe must actually change the numeric value");
        editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: source.length - 1, text: number });
        assert.equal(editor.text(0, paragraph), number + "\r");
        const saved = editor.save({ allowStaleLayout: true });
        const inventory = streams(saved.bytes);
        assert.equal(verifyChartFormulas(inflateRawSync(inventory.get("BodyText/Section0"))), 13);
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }), saved);
        const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
        try { assert.equal(reopened.text(0, paragraph), number + "\r"); }
        finally { reopened.close(); }
        continue;
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }), before);
    }
    assert.equal(targets.length, 48);
    const final = streams(editor.save({ allowStaleLayout: true }).bytes);
    const original = streams(input);
    assert.deepEqual(targets, chartNumericTargets(inflateRawSync(original.get("BodyText/Section0"))), "native refusal selection must match independent record dependency inventory");
    assert.deepEqual([...final.keys()].sort(), [...original.keys()].sort());
    for (const [path, bytes] of original) if (path !== "BodyText/Section0") assert.deepEqual(final.get(path), bytes);
  } finally { editor.close(); }
});

test("independent general-number oracle has fixed exponent and rounding boundary expectations", () => {
  for (const [value, expected] of [[0, "0"], [-0, "-0"], [1, "1"], [1.25, "1.25"], [1000060, "1.00006e+06"], [1000000, "1e+06"], [999999, "999999"], [999999.9, "1e+06"], [0.0001, "0.0001"], [0.00001, "1e-05"], [-1234567, "-1.23457e+06"]]) {
    assert.equal(generalNumber(value), expected);
  }
  assert.throws(() => generalNumber(Infinity));
  assert.throws(() => generalNumber(NaN));
});
