import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { projectHwp5OwnedWindow } from "../../web/preview/hwp5-window-projection.mjs";
import { attachHwp5WindowNotes } from "../../web/preview/hwp5-window-note-content.mjs";

test("actual footnote window attaches complete selected note and excludes other endnote", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input), reader = await createHwp5Reader(wasm);
  try {
    const content = projectHwp5OwnedWindow(editor, reader.readText(input), { offset: 1, count: 1 });
    attachHwp5WindowNotes(editor, content);
    assert.deepEqual(content.hwp5NoteErrors, []);
    assert.equal(content.hwp5Notes.length, 2);
    assert(content.hwp5Notes.every(row => row.kind === "footnote"));
    assert.deepEqual(content.hwp5Notes.flatMap(row => row.paragraphs), [1, 2]);
    assert(content.currentParagraphFlows.every(row => row.paragraph <= 2));
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    const broken = projectHwp5OwnedWindow(editor, reader.readText(input), { offset: 1, count: 1 });
    broken.paragraphs = broken.paragraphs.filter(row => row.paragraph !== 2);
    assert.throws(() => attachHwp5WindowNotes(editor, broken), /MissingHwp5NoteBody/);
    broken.paragraphs = broken.paragraphs.filter(row => row.paragraph === 0);
    assert.throws(() => attachHwp5WindowNotes(editor, broken), /MissingHwp5NoteBody/);
  } finally { editor.close(); reader.close(); }
});
