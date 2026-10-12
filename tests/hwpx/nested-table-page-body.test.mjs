import test from "node:test";
import assert from "node:assert/strict";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

function fixture() {
  const table = (node, host, list, member, parent, parentList, width) => ({ section: 0, tableNode: node, hostParagraph: host, anchorUnit: 1, parentTableNode: parent, parentListNode: parentList, rows: 1, columns: 1, sourceCaption: null,
    pagination: { page_break: "none", cell_spacing: 0 },
    sourceGeometry: { geometry: { width, height: 6000, width_relative: 4, height_relative: 2, treat_as_character: parent !== null, horizontal_offset: 0, vertical_offset: 0 }, text_wrap: 1, text_flow: 0, flow_with_text: true, allow_overlap: false, vertical_relative: 2, horizontal_relative: 2, vertical_alignment: 0, horizontal_alignment: 0, in_margin: [0, 0, 0, 0], out_margin: [0, 0, 0, 0] },
    cells: [{ listNode: list, row: 0, column: 0, rowSpan: 1, columnSpan: 1, width, height: 6000, paragraphs: [member], sourceMargin: { has_margin: false, header: false } }] });
  return {
    tables: [table(1, 0, 11, 1, null, null, 15000), table(2, 1, 12, 2, 1, 11, 3000)],
    paragraphs: [{ section: 0, paragraph: 0, text: "\ufffc" }, { section: 0, paragraph: 1, text: "A\ufffcB", tableCell: { tableNode: 1, listNode: 11 } }, { section: 0, paragraph: 2, text: "child😀", tableCell: { tableNode: 2, listNode: 12 } }],
    paragraphFlows: [0, 1, 2].map(paragraph => ({ section: 0, paragraph, top_level: paragraph === 0, host: paragraph === 0 ? "body" : "table_cell", single_column: true, column_declaration: null, column_break: false, page_break: false })),
    pageSettings: [{ section_ordinal: 0, width: 45000, height: 60000, orientation: "widely", gutter_type: "left_only", duplicate_margins: 0, margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 } }],
  };
}

test("nested inline child is measured inside its parent and projected exactly once", () => {
  const content = fixture(), before = structuredClone(content);
  const result = layoutTableBodyContent(content, text => ({ width: text.length * 4, height: 12 }), 20000);
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(result.boxes.map(box => box.tableNode).sort(), [1, 2]);
  const childRows = result.rows.filter(row => row.kind === "text" && row.paragraph === 2);
  assert.equal(childRows.map(row => row.text).join(""), "child😀");
  assert(childRows.every(row => row.tableNode === 2 && row.listNode === 12));
  assert.deepEqual(content, before);
  const invalid = fixture(); invalid.tables[1].parentListNode = 999;
  let calls = 0;
  assert.equal(layoutTableBodyContent(invalid, () => { calls++; return 4; }, 20000).error, "InvalidNestedTableFlow");
  assert.equal(calls, 0);
});

test("actual nested inline fixture reports child width overflow instead of omitting children", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit field display candidate required");
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: "load", format: "hwpx", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx") });
  assert.equal(loaded.error, undefined);
  const before = structuredClone(loaded.content);
  assert.equal(loaded.content.tables.filter(row => row.parentTableNode != null).length, 5);
  const result = layoutTableBodyContent(loaded.content, text => ({ width: text.length * 4, height: 10 }), 20000);
  assert.equal(result.error, "InlineObjectLineWidthOverflow");
  assert.equal(result.tableNode, 2282);
  assert(Number.isFinite(result.availableWidth));
  assert(result.objects.some(object => object.width > result.availableWidth));
  assert.deepEqual(loaded.content, before);
});
