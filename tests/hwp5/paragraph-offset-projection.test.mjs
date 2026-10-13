import test from "node:test";
import assert from "node:assert/strict";
import { displayContent } from "../../web/preview/content.mjs";
import { readFileSync } from "node:fs";
import { createHwp5Reader } from "../../js/hwp5.mjs";

const paragraph = text => ({ text, textPresent: true, declaredUnits: text.length + 1, parentNodeIndex: null, tokens: [] });

test("bounded HWP5 projection reaches late paragraphs without renumbering native identities", () => {
  const source = { version: [5, 0, 0, 0], sections: [{ index: 0, paragraphs: Array.from({ length: 20001 }, (_, i) => paragraph(String(i))) }, { index: 1, paragraphs: [paragraph("뒤😀"), paragraph("마지막")] }] };
  const selected = displayContent(source, { paragraphOffset: 20000, maxParagraphs: 2, maxUnits: 20 });
  assert.equal(selected.totalParagraphs, 20003); assert.equal(selected.limited, true);
  assert.deepEqual(selected.paragraphs.map(p => [p.section, p.paragraph, p.text]), [[0, 20000, "20000"], [1, 0, "뒤😀"]]);
  const last = displayContent(source, { paragraphOffset: 20002, maxParagraphs: 1 });
  assert.deepEqual(last.paragraphs.map(p => [p.section, p.paragraph, p.text]), [[1, 1, "마지막"]]);
  assert.equal(source.sections[0].paragraphs.length, 20001);
  assert.equal(source.sections[1].paragraphs[0].text, "뒤😀");
  assert.equal(displayContent(source, { paragraphOffset: 20003 }).paragraphs.length, 0);
});

test("actual 53448-paragraph reference exposes offset identities beyond default display limit", async () => {
  const reader = await createHwp5Reader(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    const source = reader.readText(readFileSync("reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp"));
    const identities = source.sections.flatMap(section => section.paragraphs.map((_, paragraph) => [section.index, paragraph]));
    assert.equal(identities.length, 53448);
    for (const paragraphOffset of [0, 19999, 20000, 53447]) {
      const selected = displayContent(source, { paragraphOffset, maxParagraphs: 1 });
      assert.equal(selected.totalParagraphs, 53448); assert.equal(selected.paragraphs.length, 1);
      assert.deepEqual([selected.paragraphs[0].section, selected.paragraphs[0].paragraph], identities[paragraphOffset]);
    }
  } finally { reader.close(); }
});

test("offset projection preserves text budget and rejects ambiguous bounds", () => {
  const source = { version: [5, 0, 0, 0], sections: [{ index: 0, paragraphs: [paragraph("skip"), paragraph("😀tail"), paragraph("last")] }] };
  const selected = displayContent(source, { paragraphOffset: 1, maxUnits: 1 });
  assert.deepEqual(selected.paragraphs.map(p => [p.paragraph, p.text, p.editable]), [[1, "", false], [2, "l", false]]);
  for (const key of ["paragraphOffset", "maxUnits", "maxParagraphs"]) for (const value of [-1, 1.5, NaN, Infinity, null, "1", Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => displayContent(source, { [key]: value }), /InvalidDisplayBounds/);
});
