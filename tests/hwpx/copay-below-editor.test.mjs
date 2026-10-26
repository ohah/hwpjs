import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("copay BELOW queries preserve source while numeric edits recalculate across history", async () => {
  const path = "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx";
  const input = readFileSync(path);
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    assert.equal(editor.paragraphTextSnapshot(0)[88].text, "30.1");
    const source = editor.formulaSources(0)[0];
    assert.equal(source.values.last_result, "184.9");
    assert.deepEqual(
      editor.formulaCurrent(0).map((field) => field.values.last_result),
      ["100", "1,749,831", "23,860", "1,749,831", "23,860"],
    );
    assert.deepEqual(editor.formulaSources(0)[0], source);
    assert(Buffer.from(editor.save()).equals(input));
    editor.splice(0, 89, 0, 4, "40.1");
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "194.9");
    assert.deepEqual(editor.formulaSources(0)[0], source);
    const saved = Buffer.from(editor.save());
    assert(!saved.equals(input));
    const request = { before: input.toString("base64"), after: saved.toString("base64") };
    const wrong = execFileSync("python3", ["tests/hwpx/formula-result-mutation.py"], {
      input: JSON.stringify({ bytes: request.after, ordinal: 0, display: "184.9" }),
      encoding: "utf8",
      timeout: 30000,
    }).trim();
    for (const flags of [[], ["-O"]]) {
      const verify = (value) =>
        execFileSync("python3", [...flags, "tests/hwpx/copay-below-save-oracle.py"], {
          input: JSON.stringify(value),
          encoding: "utf8",
          timeout: 30000,
        });
      assert.deepEqual(JSON.parse(verify(request)), {
        wholeXmlZip: true,
        belowCells: 8,
        result: "194.9",
      });
      assert.throws(
        () => verify({ ...request, after: wrong }),
        (error) => error.status === 1 && String(error.stderr).includes("complete XML mismatch"),
      );
    }
    assert.equal(editor.undo(), true);
    assert(Buffer.from(editor.save()).equals(input));
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "100");
    assert.deepEqual(editor.formulaSources(0)[0], source);
    assert.equal(editor.redo(), true);
    assert(Buffer.from(editor.save()).equals(saved));
    editor.open(saved);
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, "194.9");
    assert(Buffer.from(editor.save()).equals(saved));
    assert(readFileSync(path).equals(input));
  } finally {
    editor.close();
  }
});
