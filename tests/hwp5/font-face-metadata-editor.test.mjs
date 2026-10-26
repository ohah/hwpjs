import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { expectedFontMetadata } from "./font-face-metadata-oracle.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { attachCharacterFonts } from "../../web/preview/character-font-content.mjs";

function plainCharacter(input) {
  const source = inspect(input);
  for (const [section, body] of source.sections.entries()) {
    let paragraph = -1;
    for (const row of records(body.bytes)) {
      if (row.tag === 66) paragraph++;
      if (row.tag !== 67) continue;
      for (let unit = 0; unit < row.payload.length / 2;) {
        const code = row.payload.readUInt16LE(unit * 2);
        if (code >= 32 && (code < 0xd800 || code > 0xdfff))
          return { section, paragraph, startUnit: unit, endUnit: unit + 1 };
        unit += code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      }
    }
  }
  throw Error("MissingPlainCharacter");
}

test("actual HWP5 metadata API matches independent resources and preserves save/history", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const name of ["facename", "noori", "shapecontainer-2", "table-bug"]) {
    const bytes = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, bytes);
    try {
      const expected = expectedFontMetadata(bytes),
        names = editor.fontFaces();
      assert.deepEqual(editor.fontFaceMetadata(), expected, name);
      assert.ok(
        expected.some((row) => row.substitute !== null),
        name,
      );
      assert.ok(names.every((row) => Object.keys(row).sort().join() === "id,language,name"));
      assert.deepEqual(Buffer.from(editor.save().bytes), bytes, name);
      const detached = editor.fontFaceMetadata();
      detached[0].attributes = 255;
      assert.deepEqual(editor.fontFaceMetadata(), expected);
      editor.enableHistory();
      editor.setCharacterFontName({
        ...plainCharacter(bytes),
        language: "hangul",
        name: "Metadata History Test",
      });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      const edited = editor.fontFaceMetadata();
      assert.deepEqual(edited, expectedFontMetadata(saved), name);
      assert.equal(editor.undo(), true, name);
      assert.deepEqual(editor.fontFaceMetadata(), expected, name);
      assert.deepEqual(Buffer.from(editor.save().bytes), bytes, name);
      assert.equal(editor.redo(), true, name);
      assert.deepEqual(editor.fontFaceMetadata(), edited, name);
    } finally {
      editor.close();
    }
    assert.throws(() => editor.fontFaceMetadata(), /Closed/);
  }
});

test("actual Worker carries optional metadata without replacing the existing font list", async (t) => {
  const oldSelf = globalThis.self,
    oldFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (value) => replies.push(value) };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldSelf === undefined) delete globalThis.self;
    else globalThis.self = oldSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?font-metadata=${Date.now()}`);
  const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/facename.hwp");
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  assert.equal((await send({ kind: "load", bytes })).error, undefined);
  const reply = await send({ kind: "enable" });
  assert.equal(reply.error, undefined);
  assert.equal(reply.content.fontFaceMetadataError, null);
  assert.deepEqual(reply.content.fontFaceMetadata, expectedFontMetadata(bytes));
  assert.ok(
    reply.content.fontFaces.every((row) => Object.keys(row).sort().join() === "id,language,name"),
  );
});

test(
  "older WASM keeps names and save available when optional metadata ABI is absent",
  { skip: !process.env.HWPJS_BASELINE_WASM && "HWPJS_BASELINE_WASM is not set" },
  async () => {
    const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/facename.hwp");
    const editor = await createExperimentalHwp5Editor(
      readFileSync(process.env.HWPJS_BASELINE_WASM),
      bytes,
    );
    try {
      const names = editor.fontFaces();
      assert.throws(() => editor.fontFaceMetadata(), /Hwp5FontFaceMetadataAbiUnavailable/);
      const content = attachCharacterFonts(editor, {});
      assert.deepEqual(content.fontFaces, names);
      assert.equal(content.fontFaceMetadata, null);
      assert.equal(content.fontFaceMetadataError, "Hwp5FontFaceMetadataAbiUnavailable");
      assert.deepEqual(Buffer.from(editor.save().bytes), bytes);
    } finally {
      editor.close();
    }
  },
);
