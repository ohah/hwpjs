import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";

test("actual dutmal edits save reopen and preserve nested table reflow", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "explicit dutmal candidate required");
  const input = readFileSync(
    "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx",
  );
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  // XML node indices are session-local: removing stale line caches on save
  // changes later indices. Compare ownership roles, not cross-open handles.
  const tableRoles = (tables) => {
    const tableIndex = new Map(tables.map((table, index) => [table.tableNode, index]));
    const cellIndex = new Map(
      tables.flatMap((table, index) =>
        table.cells.map((cell, ordinal) => [cell.listNode, `${index}:${ordinal}`]),
      ),
    );
    return tables.map((table) => ({
      ...table,
      tableNode: tableIndex.get(table.tableNode),
      parentTableNode:
        table.parentTableNode === null ? null : tableIndex.get(table.parentTableNode),
      parentListNode: table.parentListNode === null ? null : cellIndex.get(table.parentListNode),
      cells: table.cells.map((cell) => ({ ...cell, listNode: cellIndex.get(cell.listNode) })),
    }));
  };
  const baselineTables = tableRoles(loaded.content.tables);
  const check = (content) => {
    const before = structuredClone(content);
    const layout = layoutTableBodyContent(
      content,
      (text) => ({ width: text.length * 4, height: 12 }),
      20000,
    );
    assert.equal(layout.state, "paginated", layout.error);
    assert.deepEqual(
      layout.boxes.map((box) => `${box.tableNode}:${box.listNode}`).sort(),
      content.tables
        .flatMap((table) => table.cells.map((cell) => `${table.tableNode}:${cell.listNode}`))
        .sort(),
    );
    assert.deepEqual(
      tableRoles(content.tables),
      baselineTables,
      "text leaf edits do not alter source table geometry or ownership",
    );
    assert.deepEqual(content, before, "reflow does not mutate current content");
    assert.equal(h.renderer.layout().pageLayoutError, undefined);
    return layout;
  };
  const originalLayout = check(loaded.content);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const node = loaded.content.paragraphs.flatMap((p) => p.dutmal ?? [])[0].node;
  assert(Number.isInteger(node));
  const changed = await h.send({
    kind: "dutmal-text",
    section: 0,
    node,
    textKind: "mainText",
    value: "재조판😀",
  });
  assert.equal(changed.error, undefined);
  check(changed.content);
  const saved = await h.send({ kind: "save" });
  assert.equal(saved.error, undefined);
  const undone = await h.send({ kind: "undo" });
  assert.equal(undone.error, undefined);
  assert.deepEqual(check(undone.content), originalLayout);
  const redone = await h.send({ kind: "redo" });
  assert.equal(redone.error, undefined);
  check(redone.content);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), Buffer.from(saved.bytes));
  const reopened = await h.send({ kind: "load", format: "hwpx", bytes: saved.bytes });
  assert.equal(reopened.error, undefined);
  check(reopened.content);
  assert.equal(reopened.content.paragraphs.flatMap((p) => p.dutmal ?? [])[0].mainText, "재조판😀");
  t.diagnostic(
    "Real Worker/WASM save and reopen; injected text metrics and simulated Canvas are not browser/Hangul layout proof",
  );
});
