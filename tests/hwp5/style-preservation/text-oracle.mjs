// Rust JSON oracle for root paragraphs; raw nested verification lives separately.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { inspect, paragraphRecords, expectedSection, verifyRaw } from "./text-record-oracle.mjs";
export * from "./text-record-oracle.mjs";
export const rust = createRequire(import.meta.url)("../../../legacy/rust/packages/hwpjs/dist/index.js");

export function verify(beforeBytes, afterBytes, section, paragraph, start, end, utf8) {
  verifyRaw(beforeBytes, afterBytes, section, paragraph, start, end, utf8);
  const target = inspect(beforeBytes).sections[section];
  const oldJson = JSON.parse(rust.toJson(beforeBytes)), newJson = JSON.parse(rust.toJson(afterBytes));
  const oldP = oldJson.body_text.sections[section].paragraphs[paragraph], newP = newJson.body_text.sections[section].paragraphs[paragraph];
  assert(oldP && newP, "root paragraph must be visible in Rust JSON");
  const expectedText = paragraphRecords(expectedSection(target.bytes, paragraph, start, end, utf8), paragraph).direct.find(r => r.tag === 67).payload;
  assert.equal(newP.para_header.text_char_count, expectedText.length / 2);
  assert.equal(newP.records.find(r => r.type === "para_text").text, expectedText.subarray(0, -2).toString("utf16le"));
  const header = { ...oldP.para_header, text_char_count: newP.para_header.text_char_count, char_shape_count: newP.para_header.char_shape_count, range_tag_count: newP.para_header.range_tag_count, line_align_count: newP.para_header.line_align_count };
  assert.deepEqual(newP.para_header, header);
  oldJson.body_text.sections[section].paragraphs[paragraph] = newP;
  assert.deepEqual(newJson, oldJson, "Rust JSON outside the selected paragraph must remain equal");
}
