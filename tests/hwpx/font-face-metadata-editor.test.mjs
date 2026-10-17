import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { attachCharacterFonts } from "../../web/preview/character-font-content.mjs";
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/facename.hwpx";
const expected = () => JSON.parse(execFileSync("python3", ["tests/hwpx/font-face-metadata-oracle.py", fixture], { encoding: "utf8" }));

test("older HWPX WASM keeps names and save when metadata ABI is absent", { skip: !process.env.HWPJS_HWPX_BASELINE_WASM && "HWPJS_HWPX_BASELINE_WASM is not set" }, async () => {
  const bytes = readFileSync(fixture);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_HWPX_BASELINE_WASM));
  try {
    editor.open(bytes);
    const names = editor.fontFaces();
    assert.throws(() => editor.fontFaceMetadata(), /HwpxFontFaceMetadataAbiUnavailable/);
    const content = attachCharacterFonts(editor, {});
    assert.deepEqual(content.fontFaces, names);
    assert.equal(content.fontFaceMetadata, null);
    assert.equal(content.fontFaceMetadataError, "HwpxFontFaceMetadataAbiUnavailable");
    assert.deepEqual(Buffer.from(editor.save()), bytes);
  } finally { editor.close(); }
});

test("actual HWPX metadata preserves optional XML values and current resource history", async () => {
  const bytes = readFileSync(fixture), source = expected();
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(bytes);
    assert.deepEqual(editor.fontFaceMetadata(), source);
    assert.ok(source.some(row => row.substitute !== null));
    assert.deepEqual(editor.fontFaces().map(({ language, id, name }) => [language, id, name]), source.map(row => [row.language, row.id, row.font.face]));
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    editor.enableHistory();
    editor.setCharacterFontName({ section: 0, paragraph: 1, startUnit: 0, endUnit: 1, language: "hangul", name: "HWPX Metadata Font" });
    const current = editor.fontFaceMetadata();
    const appended = current.find(row => row.font.face === "HWPX Metadata Font");
    assert.ok(appended);
    assert.equal(appended.font.type, "TTF");
    assert.equal(appended.substitute, null);
    assert.equal(appended.typeInfo, null);
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.fontFaceMetadata(), source);
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.fontFaceMetadata(), current);
  } finally { editor.close(); }
  assert.throws(() => editor.fontFaceMetadata(), /EditorClosed/);
});

test("actual HWPX Worker transports source-specific metadata without replacing names", async t => {
  const oldSelf = globalThis.self, oldFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.fetch = oldFetch; if (oldSelf === undefined) delete globalThis.self; else globalThis.self = oldSelf; });
  await import(`../../web/preview/reader-worker.mjs?hwpx-font-metadata=${Date.now()}`);
  const send = async data => { await self.onmessage({ data }); assert.equal(replies.length, 1); return replies.shift(); };
  assert.equal((await send({ kind: "load", format: "hwpx", bytes: readFileSync(fixture) })).error, undefined);
  const reply = await send({ kind: "enable" });
  assert.equal(reply.error, undefined);
  assert.equal(reply.content.fontFaceMetadataError, null);
  assert.deepEqual(reply.content.fontFaceMetadata, expected());
});
