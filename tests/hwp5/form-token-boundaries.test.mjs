import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { controlLinkEvidence } from "./links.mjs";
import { formSourceFixtures } from "./form-source-fixtures.mjs";

test("all observed form tokens reject every interior insertion without losing pending redo", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  let tokens = 0,
    refused = 0;
  for (const { name: path, forms: count } of formSourceFixtures) {
    const input = readFileSync(`reference/rhwp/samples/${path}`),
      source = inspect(input).sections[0].bytes;
    const headers = records(source).flatMap((row, index) => (row.tag === 66 ? [index] : []));
    const forms = controlLinkEvidence(source).filter((row) => row[6] === 0x666f726d);
    assert.equal(forms.length, count);
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.enableHistory();
      editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: "기준😀" });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      assert.equal(editor.undo(), true);
      for (const form of forms) {
        const paragraph = headers.indexOf(form[0]),
          start = form[3];
        assert(paragraph >= 0);
        assert.equal(form[4], 11);
        assert.equal(form[5], form[6]);
        for (let inside = 1; inside < 8; inside++) {
          assert.throws(
            () =>
              editor.splice({
                section: 0,
                paragraph,
                startUnit: start + inside,
                endUnit: start + inside,
                text: "x",
              }),
            (error) => error.message === "SplitControlToken",
            `${path}:${paragraph}:${inside}`,
          );
          refused++;
        }
        assert.throws(
          () =>
            editor.splice({
              section: 0,
              paragraph,
              startUnit: start,
              endUnit: start + 8,
              text: "",
            }),
          (error) => error.message === "UnsupportedControlDeletion",
        );
        refused++;
        tokens++;
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save().bytes), input);
      }
    } finally {
      editor.close();
    }
  }
  assert.equal(tokens, 214);
  assert.equal(refused, 1712);
  t.diagnostic(
    "214 original form tokens, 1712 rejected edits; independent token positions and per-token source/redo checks",
  );
});
