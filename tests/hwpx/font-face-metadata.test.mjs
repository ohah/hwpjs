import test from "node:test";
import assert from "node:assert/strict";
import { decodeHwpxFontFaceMetadata } from "../../js/hwpx-font-face-metadata.mjs";
import { decodeFontFaceMetadata } from "../../js/font-face-metadata.mjs";
import { createCharacterFontDisplay } from "../../web/preview/character-font-display.mjs";
const font = { face: "원래", type: "REP", isEmbedded: "true", binaryItemIDRef: null };
const sub = { face: "대체", type: "TTF", isEmbedded: "0", binaryItemIDRef: "" };
const info = {
  familyType: "FCAT_FUTURE",
  weight: "006",
  proportion: null,
  contrast: null,
  strokeVariation: null,
  armStyle: null,
  letterform: null,
  midline: null,
  xHeight: null,
};
const row = { format: "hwpx", language: "hangul", id: 0, font, substitute: sub, typeInfo: info };
const encode = (rows) => new TextEncoder().encode(JSON.stringify({ version: 1, fonts: rows }));

test("HWPX metadata keeps source types and absence instead of HWP5 synthesized bytes", () => {
  assert.deepEqual(decodeHwpxFontFaceMetadata(encode([row])), [row]);
  assert.deepEqual(
    decodeHwpxFontFaceMetadata(encode([{ ...row, substitute: null, typeInfo: null }])),
    [{ ...row, substitute: null, typeInfo: null }],
  );
  assert.throws(() => decodeFontFaceMetadata(encode([row])), /InvalidFontFaceMetadata/);
  for (const changed of [
    { ...row, format: "hwp5" },
    { ...row, extra: 0 },
    { ...row, font: { ...font, type: 1 } },
    { ...row, typeInfo: { ...info, serif: "0" } },
    { ...row, substitute: { ...sub, face: "\ud800" } },
  ])
    assert.throws(
      () => decodeHwpxFontFaceMetadata(encode([changed])),
      /InvalidHwpxFontFaceMetadata/,
    );
});

test("HWPX explicit external TTF fallback is format-separated and embedded candidates are not pretended loaded", () => {
  const content = {
    fontFaces: [{ language: "hangul", id: 0, name: "원래" }],
    characterFontReferences: [{ id: 9, fontIds: [0, null, null, null, null, null, null] }],
    fontFaceMetadata: [row],
  };
  const resolve = (substitute) =>
    createCharacterFontDisplay({ ...content, fontFaceMetadata: [{ ...row, substitute }] })(
      9,
      "가",
      0,
    );
  assert.equal(resolve(sub), '"원래", "대체"');
  assert.equal(resolve({ ...sub, isEmbedded: "false" }), '"원래", "대체"');
  for (const isEmbedded of [null, "", "1", "true", "unknown"])
    assert.equal(resolve({ ...sub, isEmbedded }), '"원래"');
  for (const type of [null, "", "HFT", "REP", "FUTURE"])
    assert.equal(resolve({ ...sub, type }), '"원래"');
  assert.equal(resolve({ ...sub, face: "" }), '"원래"');
});
