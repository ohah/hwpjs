import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { projectHwp5OwnedWindow } from "../../web/preview/hwp5-window-projection.mjs";
import { attachHwp5WindowObjects } from "../../web/preview/hwp5-window-object-content.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import { queryHwp5WindowContent } from "../../web/preview/hwp5-window-query-content.mjs";

test("window object preparation shares one flow query per render without persistent caching", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const [name, offset] of [
    ["table-caption", 1],
    ["footnote-endnote", 1],
    ["textbox", 1],
    ["shapecontainer-2", 1],
    ["sample-5017-pics", 0],
  ]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, input),
      reader = await createHwp5Reader(wasm);
    try {
      const preview = reader.readText(input),
        counted = Object.create(editor);
      let calls = 0;
      counted.paragraphFlow = (section) => {
        calls++;
        return editor.paragraphFlow(section);
      };
      for (let render = 0; render < 2; render++) {
        const content = projectHwp5OwnedWindow(editor, preview, { offset, count: 1 });
        const before = calls;
        attachHwp5WindowObjects(counted, preview, content);
        assert.equal(calls - before, 1, name);
        for (const key of [
          "tableBindingsErrors",
          "tableLayoutSourceErrors",
          "cellLayoutSourceErrors",
          "tableAnchorErrors",
          "hwp5NoteErrors",
          "hwp5CaptionErrors",
          "hwp5DrawingErrors",
          "hwp5DrawingBodyErrors",
          "hwp5PictureErrors",
          "hwp5PictureTailErrors",
        ])
          assert.deepEqual(content[key], [], `${name}:${key}`);
      }
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
      reader.close();
    }
  }
});

test("window preparation refreshes text and flow after edit and undo", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    editor.enableHistory();
    const render = () => {
      const preview = reader.readText(editor.save({ allowStaleLayout: true }).bytes);
      const content = projectHwp5OwnedWindow(editor, preview, { offset: 1, count: 1 });
      return attachHwp5WindowObjects(editor, preview, content);
    };
    const before = render().paragraphs[0].text;
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "갱신😀" });
    assert.equal(render().paragraphs[0].text, "갱신😀" + before);
    assert.equal(editor.undo(), true);
    assert.equal(render().paragraphs[0].text, before);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
    reader.close();
  }
});

test("complete window query shares flow discovery once and refreshes on every request", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    let calls = 0;
    const counted = Object.create(editor);
    counted.paragraphFlow = (section) => {
      calls++;
      return editor.paragraphFlow(section);
    };
    for (let request = 0; request < 2; request++) {
      const before = calls;
      queryHwp5WindowContent(counted, reader.readText(input), { offset: 1, count: 1 }, true);
      assert.equal(calls - before, 1);
    }
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
    reader.close();
  }
});

test("actual cell and grouped drawing body windows refresh edited ownership and independent save", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const name of ["table-caption", "textbox", "shapecontainer-2"]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, input),
      reader = await createHwp5Reader(wasm);
    try {
      editor.enableHistory();
      const member = editor
        .paragraphFlow(0)
        .find((row) => row.host === (name === "table-caption" ? "table_cell" : "drawing"));
      assert(member);
      const render = () => {
        const saved = editor.save({ allowStaleLayout: true }).bytes,
          preview = reader.readText(saved);
        const content = projectHwp5OwnedWindow(editor, preview, {
          offset: member.paragraph,
          count: 1,
        });
        attachHwp5WindowObjects(editor, preview, content);
        return { saved, content };
      };
      const original = render(),
        text = "본문😀";
      editor.splice({ section: 0, paragraph: member.paragraph, startUnit: 0, endUnit: 0, text });
      const changed = render();
      assert.equal(
        changed.content.paragraphs.find((row) => row.paragraph === member.paragraph).text,
        text + original.content.paragraphs.find((row) => row.paragraph === member.paragraph).text,
      );
      for (const key of [
        "tableAnchorErrors",
        "hwp5DrawingErrors",
        "hwp5DrawingBodyErrors",
        "hwp5CaptionErrors",
      ])
        assert.deepEqual(changed.content[key], [], `${name}:${key}`);
      verifyRaw(input, changed.saved, 0, member.paragraph, 0, 0, text);
      const reopened = await createExperimentalHwp5Editor(wasm, changed.saved);
      try {
        const preview = reader.readText(changed.saved);
        const content = projectHwp5OwnedWindow(reopened, preview, {
          offset: member.paragraph,
          count: 1,
        });
        attachHwp5WindowObjects(reopened, preview, content);
        assert.equal(
          content.paragraphs.find((row) => row.paragraph === member.paragraph).text,
          changed.content.paragraphs.find((row) => row.paragraph === member.paragraph).text,
        );
        for (const key of [
          "tableAnchorErrors",
          "hwp5DrawingErrors",
          "hwp5DrawingBodyErrors",
          "hwp5CaptionErrors",
        ])
          assert.deepEqual(content[key], [], `${name}:reopened:${key}`);
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(render().saved), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(render().saved, changed.saved);
    } finally {
      editor.close();
      reader.close();
    }
  }
});
