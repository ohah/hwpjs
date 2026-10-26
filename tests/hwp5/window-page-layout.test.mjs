import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { queryHwp5WindowContent } from "../../web/preview/hwp5-window-query-content.mjs";
import { layoutHwp5PageContent } from "../../web/preview/hwp5-page-layout.mjs";
import { layoutHwp5WindowContent } from "../../web/preview/hwp5-window-page-layout.mjs";

test("actual bounded HWP5 preview uses explicit fragment scope without relaxing full page guard", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const [name, offset] of [
    ["charshape", 1],
    ["table-caption", 1],
    ["sample-5017-pics", 0],
  ]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, input),
      reader = await createHwp5Reader(wasm);
    try {
      const content = queryHwp5WindowContent(
          editor,
          reader.readText(input),
          { offset, count: 1 },
          true,
        ),
        before = structuredClone(content);
      assert.equal(layoutHwp5PageContent(content, () => 8).error, "IncompleteHwp5ColumnFlow");
      const fragment = layoutHwp5WindowContent(content, () => 8);
      assert.equal(fragment.state, "paginated", `${name}:${fragment.error}`);
      assert.equal(fragment.layoutScope, "paragraph-window-fragment");
      assert.equal(fragment.documentPageNumbersExact, false);
      assert.equal(fragment.limited, true);
      assert.deepEqual(content.structuralAnchorErrors, []);
      if (name === "table-caption") {
        const missingAnchors = structuredClone(content);
        for (const paragraph of missingAnchors.paragraphs) delete paragraph.structuralAnchors;
        assert.equal(
          layoutHwp5WindowContent(missingAnchors, () => 8).error,
          "InvalidBlockTableAnchorPosition",
        );
      }
      assert.deepEqual(content, before);
      const invalid = structuredClone(content);
      invalid.paragraphs[0].clipped = true;
      assert.equal(layoutHwp5WindowContent(invalid, () => 8).error, "InvalidHwp5WindowSelection");
      const partial = { ...content, tables: [{ partial: true }] };
      assert.equal(layoutHwp5WindowContent(partial, () => 8).error, "IncompleteHwp5WindowTables");
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
      reader.close();
    }
  }
});
