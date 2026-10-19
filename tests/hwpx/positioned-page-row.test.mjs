import test from "node:test";
import assert from "node:assert/strict";
import { paginateBodyRows } from "../../web/preview/page-row-flow.mjs";
import { positionedRowFragments } from "../../web/preview/positioned-row-fragments.mjs";

const setting = { width: 15000, height: 7500, orientation: "widely", gutter_type: "left_only", duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 } };
const flow = { section: 0, paragraph: 0, top_level: true, single_column: true, page_break: false, column_break: false };
const paragraph = { section: 0, paragraph: 0, text: "a😀b" };
const source = { kind: "text", section: 0, paragraph: 0, startUnit: 0, endUnit: 4, paragraphSource: paragraph, height: 20 };
function fragment(start, end, paragraphX) {
  return { kind: "text", section: 0, paragraph: 0, startUnit: start, endUnit: end, text: paragraph.text.slice(start, end),
    width: 40, height: 20, textHeight: 20, paragraphX, boundaries: [0, 1, 3, 4].filter(unit => start <= unit && unit <= end).map((unit, index) => ({ unit, x: index * 8 })) };
}

test("positioned row callback sees final page coordinates and advances a fragmented line only once", () => {
  const before = structuredClone({ setting, flow, source });
  const rows = [source, { ...source, startUnit: 4, endUnit: 4 }];
  const contexts = [];
  const result = paginateBodyRows(rows, setting, [flow], {
    rowY: (_row, context) => context.y + 5,
    measurePositionedRow(item, row, context) {
      contexts.push({ ...context });
      return item.startUnit === 0 ? { ...row, endUnit: 4, positionedFragments: [fragment(0, 1, 0), fragment(1, 4, 80)] }
        : { ...row, endUnit: 4, text: "", width: 200 };
    },
  });
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(result.rows.map(row => [row.y, row.paragraphX]), [[25, 0], [25, 80], [50, undefined]]);
  assert.equal(result.rows[0].x, 20);
  assert.equal(result.rows[0].flowAnchorY, 20);
  assert.equal(result.spatialRows, true);
  assert.deepEqual(contexts.map(c => c.y), [25, 50]);
  assert.equal(result.rows.slice(0, 2).map(row => row.text).join(""), paragraph.text);
  assert.ok(result.rows.every(row => row.positionedFragments === undefined));
  assert.deepEqual({ setting, flow, source }, before);
});

test("positioned fragments are remeasured after page movement and count against the real row budget", () => {
  const rows = [{ kind: "gap", section: 0, paragraph: 0, height: 90 }, source];
  const contexts = [];
  const options = {
    measurePositionedRow(item, row, context) {
      if (item.kind !== "text") return row;
      contexts.push([context.pageOrdinal, context.y]);
      return { ...row, positionedFragments: [fragment(0, 1, 0), fragment(1, 4, 80)] };
    },
  };
  const result = paginateBodyRows(rows, setting, [flow], options);
  assert.equal(result.state, "paginated", result.error);
  assert.deepEqual(contexts, [[0, 110], [1, 140]]);
  assert.deepEqual(result.rows.slice(1).map(row => [row.pageOrdinal, row.y, row.flowAnchorY]), [[1, 140, 140], [1, 140, 140]]);
  assert.equal(paginateBodyRows(rows, setting, [flow], { ...options, maxRows: 2 }).error, "PositionedRowFragmentLimit");
});

test("an empty paragraph keeps exactly one insertion boundary", () => {
  const empty = { ...source, startUnit: 0, endUnit: 0, paragraphSource: { ...paragraph, text: "" } };
  const result = paginateBodyRows([empty], setting, [flow], {
    measurePositionedRow(item, row) {
      return { ...row, positionedFragments: [{ kind: "text", section: 0, paragraph: 0, text: "", startUnit: 0, endUnit: 0,
        width: 200, height: 20, textHeight: 20, boundaries: [{ unit: 0, x: 0 }] }] };
    },
  });
  assert.equal(result.state, "paginated", result.error);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].boundaries, [{ unit: 0, x: 0 }]);
});

test("positioned fragments reject source loss, split surrogates, stale placement and copied table identity", () => {
  const valid = { ...source, positionedFragments: [fragment(0, 1, 0), fragment(1, 4, 80)] };
  assert.equal(positionedRowFragments(source, valid, 2).state, "expanded");
  for (const mutate of [
    row => row.positionedFragments[1].startUnit = 2,
    row => row.positionedFragments[0].endUnit = 2,
    row => row.positionedFragments[1].text = "wrong",
    row => row.positionedFragments[1].pageOrdinal = 0,
    row => row.positionedFragments[1].height = 21,
    row => row.positionedFragments[1].boundaries[1].x = 100,
    row => row.positionedFragments[1].paragraph = 1,
    row => row.positionedFragments[1].positionedFragments = [],
    row => row.positionedFragments[1].boundaries = [],
    row => row.positionedFragments[1].boundaries.splice(1, 1),
  ]) {
    const row = structuredClone(valid); mutate(row);
    assert.equal(positionedRowFragments(source, row, 10).error, "InvalidPositionedRowFragments");
  }
  assert.equal(positionedRowFragments(source, valid, 1).error, "PositionedRowFragmentLimit");
  assert.equal(positionedRowFragments({ ...source, bandOrdinal: 0 }, valid, 10).error, "UnsupportedPositionedTableFragments");
  assert.equal(paginateBodyRows([source], setting, [flow], { measurePositionedRow: null }).error, "InvalidPageFlowBounds");
  assert.equal(paginateBodyRows([source], setting, [flow], { measurePositionedRow: (_item, row) => ({ ...row, paragraph: 1 }) }).error, "UnsupportedPageRow");
  const table = { ...source, tableIndex: 0, bandOrdinal: 0 };
  assert.equal(paginateBodyRows([table], setting, [flow], { measurePositionedRow: (_item, row) => ({ ...row, tableIndex: 1 }) }).error, "UnsupportedPageRow");
});
