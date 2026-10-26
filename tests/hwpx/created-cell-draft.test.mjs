import test from "node:test";
import assert from "node:assert/strict";
import { projectCreatedCellDraft } from "../../web/preview/created-cell-draft.mjs";
test("generated cell draft changes only its derived identity owner and not source text", () => {
  const content = {
    paragraphs: [{ section: 0, paragraph: 1, text: "원본" }],
    createdTables: ["1", "2"].map((identity) => ({
      section: 0,
      identity,
      cells: [0, 1].map((column) => ({ row: 0, column, text: "" })),
    })),
  };
  const before = structuredClone(content);
  const view = projectCreatedCellDraft(content, {
    section: 0,
    createdCell: { identity: "2", row: 0, column: 1 },
    text: "조합😀",
  });
  assert.equal(view.createdTables[1].cells[1].text, "조합😀");
  assert.equal(view.createdTables[1].cells[0].text, "");
  assert.equal(view.createdTables[0], content.createdTables[0]);
  assert.equal(view.paragraphs, content.paragraphs);
  assert.deepEqual(content, before);
  assert.equal(projectCreatedCellDraft(content, null), content);
});
