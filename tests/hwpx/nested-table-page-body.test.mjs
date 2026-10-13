import test from "node:test";
import assert from "node:assert/strict";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";
import { tableTextPaintOrder, topTablePaintRowIndex } from "../../web/preview/table-text-paint-order.mjs";
import { rowAtPoint } from "../../web/preview/row-geometry.mjs";

function fixture() {
  const table = (node, host, list, member, parent, parentList, width) => ({ section: 0, tableNode: node, hostParagraph: host, anchorUnit: parent === null ? 0 : 1, parentTableNode: parent, parentListNode: parentList, rows: 1, columns: 1, sourceCaption: null,
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

test("behind floating child is produced and projected without consuming a text-width unit", () => {
  const content = fixture();
  const child = content.tables[1];
  child.sourceGeometry.geometry.treat_as_character = false;
  child.sourceGeometry.text_wrap = 2;
  child.sourceGeometry.affect_line_spacing = false;
  const before = structuredClone(content);
  const result = layoutTableBodyContent(content, text => ({ width: text.length * 4, height: 12 }), 20000);
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(result.boxes.map(box => box.tableNode).sort(), [1, 2]);
  const childRows = result.rows.filter(row => row.tableNode === 2);
  assert.equal(childRows.map(row => row.text).join(""), "child😀");
  assert(childRows.every(row => row.tablePaintLayer === "behind"));
  const host = result.rows.find(row => row.paragraph === 1);
  assert.equal(host.text, "A\ufffcB");
  assert.deepEqual(host.inlineTables, [{ tableNode: 2, unit: 1 }]);
  assert.equal(host.boundaries.find(point => point.unit === 1).x, host.boundaries.find(point => point.unit === 2).x);
  const order = tableTextPaintOrder(result.rows);
  assert(order.indexOf(result.rows.indexOf(childRows[0])) < order.indexOf(result.rows.indexOf(host)));
  assert.deepEqual(content, before);
  const front = structuredClone(content); front.tables[1].sourceGeometry.text_wrap = 3;
  const frontResult = layoutTableBodyContent(front, text => ({ width: text.length * 4, height: 12 }), 20000);
  assert.equal(frontResult.state, "paginated", frontResult.error);
  assert(frontResult.rows.filter(row => row.tableNode === 2).every(row => row.tablePaintLayer === "front"));
  const invalid = structuredClone(content); invalid.tables[1].sourceGeometry.affect_line_spacing = true;
  assert.equal(layoutTableBodyContent(invalid, text => ({ width: text.length * 4, height: 12 }), 20000).error, "UnsupportedNestedTableAnchor");
});

test("table paint order keeps geometry intact and groups behind body front", () => {
  const rows = [{ tablePaintLayer: "front" }, {}, { tablePaintLayer: "behind" }, {}];
  const before = structuredClone(rows);
  assert.deepEqual(tableTextPaintOrder(rows), [2, 1, 3, 0]);
  assert.deepEqual(rows, before);
  assert.equal(topTablePaintRowIndex(rows, () => true), 0);
  assert.throws(() => tableTextPaintOrder([{ tablePaintLayer: "unknown" }]), /InvalidTablePaintLayer/);
});

test("inline and behind or front nested siblings share current paragraph anchors", () => {
  for (const wrap of [2, 3]) {
    const content = fixture();
    const overlay = structuredClone(content.tables[1]);
    Object.assign(overlay, { tableNode: 3, anchorUnit: 3 });
    overlay.cells[0].listNode = 13; overlay.cells[0].paragraphs = [3];
    overlay.sourceGeometry.geometry.treat_as_character = false;
    overlay.sourceGeometry.text_wrap = wrap;
    overlay.sourceGeometry.affect_line_spacing = false;
    content.tables.push(overlay);
    content.paragraphs[1].text = "A\ufffcB\ufffcC";
    content.paragraphs.push({ section: 0, paragraph: 3, text: "overlay😀", tableCell: { tableNode: 3, listNode: 13 } });
    content.paragraphFlows.push({ ...content.paragraphFlows[2], paragraph: 3 });
    const before = structuredClone(content);
    const result = layoutTableBodyContent(content, text => ({ width: text.length * 4, height: 12 }), 20000);
    assert.equal(result.state, "paginated", result.error);
    assert.deepEqual(result.boxes.map(box => box.tableNode).sort(), [1, 2, 3]);
    const host = result.rows.find(row => row.kind === "text" && row.paragraph === 1);
    assert.equal(host.text, "A\ufffcB\ufffcC");
    assert.equal(host.boundaries.find(b => b.unit === 3).x, host.boundaries.find(b => b.unit === 4).x);
    assert(host.boundaries.find(b => b.unit === 2).x > host.boundaries.find(b => b.unit === 1).x);
    const overlayRows = result.rows.filter(row => row.tableNode === 3);
    assert.equal(overlayRows.map(row => row.text).join(""), "overlay😀");
    assert(overlayRows.every(row => row.tablePaintLayer === (wrap === 2 ? "behind" : "front")));
    assert.deepEqual(content, before);
    const reverse = structuredClone(content); reverse.tables.reverse();
    const reversed = layoutTableBodyContent(reverse, text => ({ width: text.length * 4, height: 12 }), 20000);
    assert.equal(reversed.state, "paginated", reversed.error);
    assert.deepEqual(reversed.boxes.map(box => [box.tableNode, box.x, box.y]).sort(), result.boxes.map(box => [box.tableNode, box.x, box.y]).sort());
  }
});

test("renderer paints floating child text behind its host without painting its placeholder", async t => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const content = fixture();
  content.tables[1].sourceGeometry.geometry.treat_as_character = false;
  content.tables[1].sourceGeometry.text_wrap = 2;
  content.tables[1].sourceGeometry.affect_line_spacing = false;
  const calls = [];
  h.canvas.getContext("2d").fillText = text => calls.push(text);
  h.renderer.show({ ...content, format: "hwpx", limited: false });
  h.paint();
  assert.equal(h.renderer.layout().pageLayoutError, undefined);
  assert(calls.includes("c")); assert(calls.includes("A"));
  assert(calls.indexOf("c") < calls.indexOf("A"));
  assert(!calls.includes("◇"));
  const layout = h.renderer.layout();
  const host = layout.rows.find(row => row.kind === "text" && row.paragraph === 1);
  const point = rowAtPoint(layout, (host.x ?? 20) + (host.paragraphX ?? 0) + 2, host.y + (host.textTop ?? 8) + 2);
  assert.equal(layout.rows[point].paragraph, 1, "foreground host text wins over overlapping behind text");
  t.diagnostic("Synthetic content with actual renderer and simulated Canvas; no browser pixel or Hangul fidelity proof");
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
