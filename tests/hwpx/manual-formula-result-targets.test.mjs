import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { decodeFieldTargets } from "../../js/hwpx-field-target-wire.mjs";

test("formula result target queries use current paragraph coordinates and preserve native history", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    const original = editor.manualFormulaResultTargets(0, 24);
    assert.equal(original.length, 1);
    assert.equal(original[0].start, 0);
    assert.equal(original[0].end, 4);
    assert.deepEqual(editor.manualFormulaResultTargets(0, 20), []);
    const source = editor.formulaSources(0)[0];
    editor.spliceManualFormulaResult(0, original[0].beginElement, 0, 0, "앞😀");
    const saved = Buffer.from(editor.save()),
      revision = editor.historyRevision();
    const changed = editor.manualFormulaResultTargets(0, 24);
    assert.deepEqual(changed, [{ ...original[0], end: 7 }]);
    assert.deepEqual(editor.manualFormulaResultRangeTarget(0, 24, 0, 7), changed[0]);
    assert.equal(editor.manualFormulaResultRangeTarget(0, 24, 0, 8), null);
    assert.throws(() => editor.manualFormulaResultRangeTarget(0, 24, 2, 2), {
      message: "SplitSurrogatePair",
    });
    assert.throws(() => editor.manualFormulaResultRangeTarget(0, 24, 3, 2), {
      message: "InvalidTextPosition",
    });
    assert.throws(() => editor.manualFormulaResultTargets(0xffffffff, 24), {
      message: "InvalidSectionIndex",
    });
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(editor.formulaSources(0)[0], source);
    assert(Buffer.from(editor.save()).equals(saved));
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.manualFormulaResultTargets(0, 24), original);
    assert(Buffer.from(editor.save()).equals(input));
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.manualFormulaResultTargets(0, 24), changed);
    assert(Buffer.from(editor.save()).equals(saved));
  } finally {
    editor.close();
  }
});

for (const [missing, query] of [
  ["hwpx_edit_manual_formula_result_targets", (e) => e.manualFormulaResultTargets(0, 24)],
  [
    "hwpx_edit_manual_formula_result_range_target",
    (e) => e.manualFormulaResultRangeTarget(0, 24, 0, 0),
  ],
])
  test(`formula result query missing ${missing} refuses without edit permission`, async (t) => {
    const instantiate = WebAssembly.instantiate;
    t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await instantiate(...args),
        exports = { ...instance.exports };
      delete exports[missing];
      return { exports };
    });
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
    );
    const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
    try {
      editor.open(input);
      editor.enableHistory();
      const revision = editor.historyRevision();
      assert.throws(() => query(editor), {
        message: "HwpxManualFormulaResultTargetAbiUnavailable",
      });
      assert.equal(editor.historyRevision(), revision);
      assert(Buffer.from(editor.save()).equals(input));
    } finally {
      editor.close();
    }
  });

test("shared field target decoder rejects truncated oversized and inverted wire and respects byte offsets", () => {
  const bytes = new Uint8Array(16),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, 220, true);
  view.setUint32(8, 2, true);
  view.setUint32(12, 7, true);
  const container = new Uint8Array(24);
  container.set(bytes, 4);
  assert.deepEqual(decodeFieldTargets(container.subarray(4, 20)), [
    { beginElement: 220, start: 2, end: 7 },
  ]);
  for (let end = 0; end < bytes.length; end++)
    assert.throws(() => decodeFieldTargets(bytes.subarray(0, end)), {
      message: "InvalidFieldTargets",
    });
  view.setUint32(0, 4097, true);
  assert.throws(() => decodeFieldTargets(bytes), { message: "InvalidFieldTargets" });
  view.setUint32(0, 1, true);
  view.setUint32(12, 1, true);
  assert.throws(() => decodeFieldTargets(bytes), { message: "InvalidFieldTargets" });
  assert.throws(() => decodeFieldTargets(null), { message: "InvalidFieldTargets" });
});
