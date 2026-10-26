import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("partial manual result API edits all thirteen actual fields with XML ZIP history and reopen", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    const fields = editor.formulaCurrent(0);
    assert.equal(fields.length, 13);
    for (const [ordinal, field] of fields.entries()) {
      editor.open(input);
      editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
      const source = editor.formulaSources(0)[ordinal];
      const display = "앞😀" + field.values.last_result;
      editor.spliceManualFormulaResult(0, field.begin_element, 0, 0, "앞😀");
      const saved = Buffer.from(editor.save());
      assert.equal(editor.formulaCurrent(0)[ordinal].values.last_result, display);
      assert.deepEqual(editor.formulaSources(0)[ordinal], source);
      for (const flags of [[], ["-O"]])
        execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
          input: JSON.stringify({
            before: input.toString("base64"),
            after: saved.toString("base64"),
            ordinal,
            display,
            selfTest: true,
          }),
          timeout: 30000,
        });
      assert.equal(editor.undo(), true);
      assert(Buffer.from(editor.save()).equals(input));
      const revision = editor.historyRevision();
      editor.spliceManualFormulaResult(0, field.begin_element, 0, 0, "");
      assert.equal(editor.historyRevision(), revision);
      assert.throws(
        () => editor.spliceManualFormulaResult(0, field.begin_element, 0xffffffff, 1, "x"),
        { message: "InvalidTextPosition" },
      );
      assert.equal(editor.historyRevision(), revision);
      assert(Buffer.from(editor.save()).equals(input));
      assert.equal(editor.redo(), true);
      assert(Buffer.from(editor.save()).equals(saved));
      editor.open(saved);
      editor.spliceManualFormulaResult(0, field.begin_element, 0, 3, "");
      assert.equal(editor.formulaCurrent(0)[ordinal].values.last_result, field.values.last_result);
      assert.equal(editor.formulaSources(0)[ordinal].values.last_result, source.values.last_result);
    }
  } finally {
    editor.close();
  }
});

for (const missing of [
  "hwpx_edit_splice_manual_formula_result",
  "hwpx_edit_manual_formula_result_max_bytes",
])
  test(`partial manual result missing ${missing} refuses without changing history`, async (t) => {
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
      assert.throws(
        () =>
          editor.spliceManualFormulaResult(0, editor.formulaSources(0)[0].begin_element, 0, 0, "x"),
        { message: "HwpxManualFormulaResultSpliceAbiUnavailable" },
      );
      assert.equal(editor.historyRevision(), revision);
      assert(Buffer.from(editor.save()).equals(input));
    } finally {
      editor.close();
    }
  });

test("partial manual result API preserves redo on surrogate XML size and coordinate refusals", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    const begin = editor.formulaSources(0)[0].begin_element;
    editor.spliceManualFormulaResult(0, begin, 0, 0, "😀");
    const before = Buffer.from(editor.save());
    editor.spliceManualFormulaResult(0, begin, 0, 2, "한");
    const changed = Buffer.from(editor.save());
    assert.equal(editor.undo(), true);
    const revision = editor.historyRevision();
    for (const [section, node, start, deleted, text, message] of [
      [0, begin, 1, 0, "x", "SplitSurrogatePair"],
      [0, begin, 0, 0, "\0", "InvalidXmlCharacter"],
      [0, begin, 0, 0, "\ud800", "InvalidText"],
      [0, begin, 0, 0, "x".repeat(4096), "LimitExceeded"],
      [0, begin, 0, 0, "x".repeat(4097), "LimitExceeded"],
      [0xffffffff, begin, 0, 0, "x", "InvalidSectionIndex"],
      [0, 0xffffffff, 0, 0, "x", "InvalidFormulaFieldNode"],
      [0, begin, -1, 0, "x", "InvalidInteger"],
      [0, begin, 0, NaN, "x", "InvalidInteger"],
    ]) {
      assert.throws(() => editor.spliceManualFormulaResult(section, node, start, deleted, text), {
        message,
      });
      assert.equal(editor.historyRevision(), revision);
      assert(Buffer.from(editor.save()).equals(before));
    }
    assert.equal(editor.redo(), true);
    assert(Buffer.from(editor.save()).equals(changed));
  } finally {
    editor.close();
  }
});
