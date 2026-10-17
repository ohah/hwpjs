import test from "node:test";
import assert from "node:assert/strict";
import { decodeFontFaceMetadata } from "../../js/font-face-metadata.mjs";
import { decodeFontFaces } from "../../js/font-faces.mjs";
import { attachCharacterFonts } from "../../web/preview/character-font-content.mjs";
import { createCharacterFontDisplay } from "../../web/preview/character-font-display.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";

const row = { language: "hangul", id: 0, attributes: 0xe1, substitute: { kind: 1, name: "대체" }, typeInfo: [0, 1, 2, 3, 4, 5, 6, 7, 8, 255], defaultName: "기본" };
const encode = fonts => new TextEncoder().encode(JSON.stringify({ version: 1, fonts }));

test("font metadata wire retains unknown kinds and absent/empty/invalid names without changing old API", () => {
  assert.deepEqual(decodeFontFaceMetadata(encode([row])), [row]);
  const invalidName = { ...row, substitute: { kind: 255, name: null }, defaultName: "" };
  assert.deepEqual(decodeFontFaceMetadata(encode([invalidName])), [invalidName]);
  assert.deepEqual(decodeFontFaceMetadata(encode([])), []);
  assert.deepEqual(decodeFontFaceMetadata(encode([row, { ...row, language: "latin" }])), [row, { ...row, language: "latin" }]);
  assert.throws(() => decodeFontFaces(encode([row])), /InvalidFontFaces/);
  assert.deepEqual(decodeFontFaces(new TextEncoder().encode('[{"language":"hangul","id":0,"name":"원래"}]')), [{ language: "hangul", id: 0, name: "원래" }]);
  for (const fonts of [[{ language: "missing", id: 0, name: null }], [{ language: "hangul", id: -1, name: null }], [{ language: "latin", id: 0, name: null }, { language: "hangul", id: 0, name: null }]]) assert.throws(() => decodeFontFaces(new TextEncoder().encode(JSON.stringify(fonts))), /InvalidFontFaces/);
});

test("font metadata wire rejects malformed presence, ordering, UTF8 and sizes", () => {
  for (const changed of [
    { ...row, extra: 0 }, { ...row, id: -1 }, { ...row, id: "0" }, { ...row, attributes: 256 },
    { ...row, attributes: 0 }, { ...row, substitute: null }, { ...row, substitute: { kind: 256, name: "x" } },
    { ...row, typeInfo: Array(9).fill(0) }, { ...row, typeInfo: Array(10).fill(1.5) },
    { ...row, defaultName: "\ud800" }, { ...row, defaultName: "가".repeat(1366) },
  ]) assert.throws(() => decodeFontFaceMetadata(encode([changed])), /InvalidFontFaceMetadata/);
  for (const fonts of [[row, row], [{ ...row, language: "latin" }, row]]) assert.throws(() => decodeFontFaceMetadata(encode(fonts)), /InvalidFontFaceMetadata/);
  for (const input of [new Uint8Array([255]), new TextEncoder().encode('{"version":2,"fonts":[]}'), new TextEncoder().encode('[]'), null]) assert.throws(() => decodeFontFaceMetadata(input), /InvalidFontFaceMetadata/);
});

test("optional Worker attachment isolates metadata failure from existing names and editing", () => {
  const names = [{ language: "hangul", id: 0, name: "원래" }];
  const content = attachCharacterFonts({ fontFaces: () => names, fontFaceMetadata: () => { throw Error("Unavailable"); } }, {});
  assert.equal(content.fontFaces, names);
  assert.equal(content.fontFaceMetadata, null);
  assert.equal(content.fontFaceMetadataError, "Unavailable");
  assert.equal(attachCharacterFonts({}, {}).fontFaceMetadata, null);
});

test("display keeps primary first, uses only explicit TTF and never guesses default-name priority", () => {
  const content = { fontFaces: [{ language: "hangul", id: 0, name: "원래" }], characterFontReferences: [{ id: 9, fontIds: [0, null, null, null, null, null, null] }], fontFaceMetadata: [row] };
  const original = structuredClone(content);
  assert.equal(createCharacterFontDisplay(content)(9, "가", 0), '"원래", "대체"');
  const style = createTextStyle({ ...content, characterShapes: [{ id: 9, height: 1200 }] }, "16px sans-serif");
  assert.equal(style({ text: "가", characterRanges: [{ start: 0, end: 1, charShapeId: 9 }] }, 0), '12pt "원래", "대체", sans-serif');
  for (const kind of [0, 2, 255]) assert.equal(createCharacterFontDisplay({ ...content, fontFaceMetadata: [{ ...row, substitute: { kind, name: "대체" } }] })(9, "가", 0), '"원래"');
  for (const name of [null, "", "원래"]) assert.equal(createCharacterFontDisplay({ ...content, fontFaceMetadata: [{ ...row, substitute: { kind: 1, name } }] })(9, "가", 0), '"원래"');
  assert.equal(createCharacterFontDisplay({ ...content, fontFaceMetadata: [{ ...row, language: "latin" }] })(9, "가", 0), '"원래"');
  const escaped = createCharacterFontDisplay({ ...content, fontFaceMetadata: [{ ...row, substitute: { kind: 1, name: 'x"\\\n' } }] })(9, "가", 0);
  assert.equal(escaped, '"원래", "x\\22 \\5c \\a "');
  assert.deepEqual(content, original);
});
