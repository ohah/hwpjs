import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("manual result empty whitespace Unicode and exact byte limit retain text styles and history", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    for (const display of ["", " ", "가\u0301", "😀", "x".repeat(4096)]) {
      editor.open(input); editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
      const source = editor.formulaSources(0)[0];
      editor.setManualFormulaResult(0, source.begin_element, display);
      const saved = Buffer.from(editor.save());
      assert.equal(editor.formulaCurrent(0)[0].values.last_result, display);
      assert.equal(editor.paragraphTextSnapshot(0)[23].text, display);
      const styles = editor.characterRanges(0, 24);
      assert(styles.every(range => range.start >= 0 && range.start <= range.end && range.end <= display.length));
      if (display.length) assert.equal(styles.at(-1).end, display.length);
      assert.deepEqual(editor.formulaSources(0)[0], source);
      for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
        input: JSON.stringify({ before: input.toString("base64"), after: saved.toString("base64"), ordinal: 0, display, selfTest: true }), timeout: 30000,
      });
      assert.equal(editor.undo(), true); assert(Buffer.from(editor.save()).equals(input));
      assert.equal(editor.redo(), true); assert(Buffer.from(editor.save()).equals(saved));
      editor.open(saved);
      assert.equal(editor.formulaCurrent(0)[0].values.last_result, display);
      assert(Buffer.from(editor.save()).equals(saved));
    }
  } finally { editor.close(); }
});

test("manual result invalid coordinates preserve source bytes revision and pending redo", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(input); editor.enableHistory();
    const source = editor.formulaSources(0)[0];
    editor.setManualFormulaResult(0, source.begin_element, "좌표😀");
    const edited = Buffer.from(editor.save());
    assert.equal(editor.undo(), true);
    const revision = editor.historyRevision();
    const cases = [];
    for (const invalid of [-1, 0.5, NaN, Infinity, 0x100000000, "0", null, undefined, 1n]) {
      cases.push([invalid, source.begin_element, "InvalidInteger"]);
      cases.push([0, invalid, "InvalidInteger"]);
    }
    cases.push([0xffffffff, source.begin_element, "InvalidSectionIndex"]);
    cases.push([0, 0xffffffff, "InvalidFormulaFieldNode"]);
    cases.push([0, 0, "InvalidFormulaFieldNode"]);
    for (const [section, begin, message] of cases) {
      assert.throws(() => editor.setManualFormulaResult(section, begin, "오류"), { message });
      assert(Buffer.from(editor.save()).equals(input));
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(editor.formulaSources(0)[0], source);
      assert.equal(editor.formulaCurrent(0)[0].values.last_result, "67.5");
    }
    assert.equal(editor.redo(), true);
    assert(Buffer.from(editor.save()).equals(edited));
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "좌표😀");
  } finally { editor.close(); }
});
