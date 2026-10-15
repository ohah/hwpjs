import test from "node:test";
import assert from "node:assert/strict";
import { measureCreatedTableHost } from "../../web/preview/created-table-host-measurement.mjs";
import { measureSourceInlineTables } from "../../web/preview/source-table-inline-measurement.mjs";

test("source and generated tables at the same unit keep disjoint numeric identities", () => {
  const paragraph = { section: 0, paragraph: 1, text: "앞\ufffc뒤", editable: true };
  const table = { section: 0, hostParagraph: 1, identity: "9", anchorUnit: 1 };
  const sourceTables = [{ tableNode: 9, unit: 1, width: 40, height: 30 }];
  const before = structuredClone({ paragraph, table, sourceTables });
  const measure = text => ({ width: [...text].length * 8, height: 16 });
  const result = measureCreatedTableHost(paragraph, [{ table, width: 32, height: 40 }], 500, measure, { sourceTables });
  assert.equal(result.state, "measured", result.error);
  assert.equal(result.rows.map(row => row.text).join(""), paragraph.text);
  assert.equal(result.anchors.length, 2);
  const generated = result.anchors.find(anchor => anchor.createdTableIdentity === "9");
  const original = result.anchors.find(anchor => anchor.tableNode === 9);
  assert.equal(generated.tableNode, undefined);
  assert.equal(original.createdTableIdentity, undefined);
  assert.equal(generated.unit, 1); assert.equal(original.unit, 1);
  assert.equal(original.x - generated.x, 32);
  const sourceOnly = measureCreatedTableHost(paragraph, [], 500, measure, { sourceTables });
  assert.equal(sourceOnly.state, "measured", sourceOnly.error);
  assert.equal(sourceOnly.anchors[0].tableNode, 9);
  for (const entries of [[...sourceTables, ...sourceTables], [{ ...sourceTables[0], unit: 0 }], [null]]) {
    assert.equal(measureCreatedTableHost(paragraph, [{ table, width: 32, height: 40 }], 500, measure, { sourceTables: entries }).error, "UnsupportedCreatedTableHostControls");
  }
  assert.deepEqual({ paragraph, table, sourceTables }, before);
});

test("source inline measurement refuses incomplete ownership rather than treating it as a generated table", () => {
  const measure = () => 8;
  for (const content of [{}, { paragraphs: [], tables: {} }, { paragraphs: [], tables: [null] }]) {
    assert.equal(measureSourceInlineTables(content, measure, 100).error, "InvalidSourceInlineTables");
  }
  assert.equal(measureSourceInlineTables({ paragraphs: [], tables: [], structuralAnchorErrors: [1] }, measure, 100).error, "IncompleteTableSources");
  assert.equal(measureSourceInlineTables({ paragraphs: [], tables: [] }, measure, 0).error, "InvalidSourceInlineTables");
});
