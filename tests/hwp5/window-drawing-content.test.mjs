import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { projectHwp5OwnedWindow } from "../../web/preview/hwp5-window-projection.mjs";
import { attachHwp5WindowDrawings } from "../../web/preview/hwp5-window-drawing-content.mjs";

test("actual text box and grouped body windows retain drawing attachment ownership", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const name of ["textbox", "shaperect", "shapecontainer-2"]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, input), reader = await createHwp5Reader(wasm);
    try {
      const projection = reader.readText(input), member = editor.paragraphFlow(0).find(row => row.host === "drawing");
      assert(member);
      const content = projectHwp5OwnedWindow(editor, projection, { offset: member.paragraph, count: 1 });
      attachHwp5WindowDrawings(editor, content);
      for (const key of ["hwp5DrawingErrors", "hwp5DrawingComponentErrors", "hwp5DrawingBodyErrors", "hwp5DrawingMatrixErrors", "hwp5DrawingLocalErrors", "hwp5DrawingCornerErrors", "hwp5DrawingStyleErrors"]) assert.deepEqual(content[key], [], `${name}:${key}`);
      assert(content.hwp5Drawings.length > 0);
      assert(content.hwp5DrawingBodies.some(row => row.paragraphs.includes(member.paragraph)));
      const broken = projectHwp5OwnedWindow(editor, projection, { offset: member.paragraph, count: 1 });
      broken.paragraphs = broken.paragraphs.filter(row => row.paragraph !== member.paragraph);
      attachHwp5WindowDrawings(editor, broken);
      assert(broken.hwp5DrawingBodyErrors.some(row => row.error === "MissingHwp5DrawingBodyParagraph"));
      const duplicate = projectHwp5OwnedWindow(editor, projection, { offset: member.paragraph, count: 1 });
      duplicate.paragraphs.push({ ...duplicate.paragraphs[0] });
      assert.throws(() => attachHwp5WindowDrawings(editor, duplicate), /WindowDependencyBindingMismatch/);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally { editor.close(); reader.close(); }
  }
});
