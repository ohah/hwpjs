import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { executeOracle } from "../../tools/oracle-process-async.mjs";

test("actual mixed tables and unknown drawing objects retain protected anchors and complete XML", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitCandidateRequired");
  const path = "reference/rhwp/samples/issue6035/cgmp_evaluation_table.hwpx",
    input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  try {
    editor.open(input);
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
    assert.equal(editor.canEdit(0, 932), false);
    const original = editor.anchorText(0, 932);
    assert.equal(original, "\ufffc".repeat(6));
    for (let unit = 0; unit < 6; unit++) {
      assert.throws(() => editor.spliceAnchored(0, 932, unit, 1, ""), /ProtectedInlineControl/);
      assert.equal(editor.undo(), false);
      assert.deepEqual(Buffer.from(editor.save()), input);
    }
    const text = "보존개체😀<&";
    editor.spliceAnchored(0, 932, 0, 0, text);
    assert.equal(editor.anchorText(0, 932), text + original);
    const saved = Buffer.from(editor.save());
    const request = {
      mode: "anchored",
      before: input.toString("base64"),
      after: saved.toString("base64"),
      section: 0,
      paragraph: 932,
      text,
    };
    for (const flags of [[], ["-O"]]) {
      const diagnostics = JSON.parse(
        await executeOracle(
          "python3",
          [...flags, "tools/hwpx-unknown-anchor-oracle.py", "--self-test"],
          { input: JSON.stringify(request), timeout: 30000 },
        ).catch((error) => {
          error.message += "\n" + String(error.stderr);
          throw error;
        }),
      );
      assert.deepEqual(diagnostics, { positive: 2, negative: 6 });
      await assert.rejects(
        executeOracle("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
          input: JSON.stringify({ ...request, text: "wrong" }),
          timeout: 30000,
        }),
        (error) =>
          error.status === 1 &&
          error.signal === null &&
          /complete XML mismatch/.test(String(error.stderr)),
      );
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.equal(editor.anchorText(0, 932), text + original);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.deepEqual(readFileSync(path), input);
    console.log(
      JSON.stringify({
        kind: "unknown-object-anchor-result",
        inputSha256: sha(input),
        savedSha256: sha(saved),
        wasmSha256: sha(readFileSync(process.env.HWPJS_TEST_WASM)),
      }),
    );
  } finally {
    editor.close();
  }
});
