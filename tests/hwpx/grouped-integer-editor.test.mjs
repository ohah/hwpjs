import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("grouped million result survives numeric edits whole XML and exact history", async () => {
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx";
  const input = readFileSync(path),
    original = Buffer.from(input);
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    const saves = [Buffer.from(input)];
    for (const paragraph of [20, 21, 22, 23]) {
      const text = editor.paragraphTextSnapshot(0)[paragraph - 1].text;
      editor.splice(0, paragraph, 0, text.length, "250000");
      saves.push(Buffer.from(editor.save()));
    }
    const saved = saves.at(-1);
    assert.equal(editor.paragraphTextSnapshot(0)[23].text, "1,000,000");
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "1,000,000");
    const request = { before: input.toString("base64"), after: saved.toString("base64") };
    const wrong = execFileSync("python3", ["tests/hwpx/formula-result-mutation.py"], {
      input: JSON.stringify({ bytes: request.after, ordinal: 0, display: "1e+06" }),
      encoding: "utf8",
      timeout: 30000,
    }).trim();
    for (const flags of [[], ["-O"]]) {
      const verify = (value) =>
        execFileSync("python3", [...flags, "tests/hwpx/grouped-integer-save-oracle.py"], {
          input: JSON.stringify(value),
          encoding: "utf8",
          timeout: 30000,
        });
      assert.deepEqual(JSON.parse(verify(request)), { wholeXmlZip: true, result: "1,000,000" });
      assert.throws(
        () => verify({ ...request, after: wrong }),
        (error) => error.status === 1 && String(error.stderr).includes("complete XML mismatch"),
      );
    }
    for (let i = saves.length - 2; i >= 0; i--) {
      assert.equal(editor.undo(), true);
      assert(Buffer.from(editor.save()).equals(saves[i]));
    }
    for (let i = 1; i < saves.length; i++) {
      assert.equal(editor.redo(), true);
      assert(Buffer.from(editor.save()).equals(saves[i]));
    }
    editor.open(saved);
    assert.equal(editor.paragraphTextSnapshot(0)[23].text, "1,000,000");
    assert(Buffer.from(editor.save()).equals(saved));
    assert(readFileSync(path).equals(original));
  } finally {
    editor.close();
  }
});
