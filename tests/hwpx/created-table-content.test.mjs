import test from "node:test";
import assert from "node:assert/strict";
import { attachCreatedTables } from "../../web/preview/created-table-content.mjs";
test("pending table outside window gates all source modes without granting paragraph eligibility", () => {
  const paragraphs = [
    { section: 0, paragraph: 0, editable: true, plainEditable: true, anchorEditable: true, fieldLabels: [1], anchoredSplitAvailable: true },
    { section: 0, paragraph: 1, editable: true, plainEditable: false, anchorEditable: true },
    { section: 2, paragraph: 0, editable: true, plainEditable: true },
  ];
  const calls = [];
  const content = attachCreatedTables({
    createdTables: section => section === 1 ? [{ host_paragraph: 1, cells: [] }] : [],
    createdTableHostMode: section => { calls.push(section); return section === 0; },
  }, { paragraphs }, true, 100, 3);
  assert.deepEqual(content.createdTables, []);
  assert.deepEqual(calls, [0, 2]);
  assert.deepEqual(paragraphs.map(p => p.editable), [true, false, false]);
  assert(paragraphs.every(p => !p.anchorEditable && !p.anchoredSplitAvailable && p.fieldLabels.length === 0));
  assert.equal(content.readOnly, false);
});
test("created table projection filters window hosts and preserves generated identity", () => {
  const table = { identity: "9007199254740993", host_paragraph: 3, anchor_unit: 4, cells: [{ text: "😀" }] };
  const content = { paragraphs: [{ section: 0, paragraph: 2, editable: true }] };
  attachCreatedTables({ createdTables: () => [table, { ...table, identity: "2", host_paragraph: 4 }] }, content, true, 2);
  assert.equal(content.createdTables.length, 1);
  assert.equal(content.createdTables[0].identity, table.identity);
  assert.equal(content.createdTables[0].hostParagraph, 2);
  assert.equal(content.createdTables[0].anchorUnit, 4);
  assert.equal(content.paragraphs[0].editable, false);
});
test("created table projection refuses text truncation and does not query unavailable ABI", () => {
  const content = { paragraphs: [{ section: 0, paragraph: 2, editable: true }] };
  assert.throws(() => attachCreatedTables({ createdTables: () => [{ host_paragraph: 3, cells: [{ text: "😀" }] }] }, content, true, 1), /CreatedTableDisplayTextBudgetExceeded/);
  assert.equal(content.createdTables, undefined); assert.equal(content.paragraphs[0].editable, true);
  attachCreatedTables({ createdTables: () => { throw new Error("unexpected query"); } }, content, false, 1);
  assert.deepEqual(content.createdTables, []);
  assert.equal(content.tableCreationAvailable, false);
});
