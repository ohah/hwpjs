import test from "node:test";
import assert from "node:assert/strict";
import { measureInlineTableParagraph } from "../../web/preview/inline-table-paragraph-measurement.mjs";

const paragraph = { section: 0, paragraph: 1, text: "전😀\ufffc중\ufffc후", editable: true };
const measure = text => ({ width: [...text].length * 8, height: 16 });
const entries = [{ tableNode: 9, unit: 3, width: 30, height: 32 }, { createdTableIdentity: "9", unit: 5, width: 40, height: 48 }];

test("source and generated inline tables share text measurement without aliasing node IDs", () => {
  const before = structuredClone({ paragraph, entries });
  const result = measureInlineTableParagraph(paragraph, entries, 500, measure);
  assert.equal(result.state, "measured", result.error);
  assert.equal(result.rows.map(row => row.text).join(""), paragraph.text);
  assert.equal(result.anchors[0].tableNode, 9);
  assert.equal(result.anchors[1].createdTableIdentity, "9");
  assert.equal(Object.hasOwn(result.anchors[1], "tableNode"), false);
  assert.equal(Object.hasOwn(result.anchors[1], "objectNode"), false);
  assert.deepEqual(result.anchors.map(anchor => anchor.unit), [3, 5]);
  assert.deepEqual({ paragraph, entries }, before);
  const large = measureInlineTableParagraph(paragraph, [entries[0], { ...entries[1], createdTableIdentity: "18446744073709551615" }], 500, measure);
  assert.equal(large.anchors[1].createdTableIdentity, "18446744073709551615");
});

test("generated inline table measurement rejects ambiguous or lossy identities", () => {
  for (const value of [0, 9, "0", "09", "", "18446744073709551616", null]) {
    assert.equal(measureInlineTableParagraph(paragraph, [entries[0], { ...entries[1], createdTableIdentity: value }], 500, measure).error, "InvalidInlineTableMeasurement");
  }
  for (const tableNode of [undefined, 0, 9]) {
    assert.equal(measureInlineTableParagraph(paragraph, [entries[0], { ...entries[1], tableNode }], 500, measure).error, "InvalidInlineTableMeasurement");
  }
  const duplicates = [{ ...entries[1], unit: 3 }, entries[1]];
  assert.equal(measureInlineTableParagraph(paragraph, duplicates, 500, measure).error, "InvalidInlineTableMeasurement");
});
