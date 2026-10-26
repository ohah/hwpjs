import test from "node:test";
import assert from "node:assert/strict";
import { drawingCellHeightRequest } from "../../web/preview/drawing-cell-height-request.mjs";

function example() {
  const body = {
    x: 90.86666666666672,
    y: 95.58666666666667,
    width: 886.2933333333333,
    height: 196.2,
  };
  return {
    scope: {
      state: "scoped",
      body,
      cellOwner: { section: 0, tableNode: 41, listNode: 48, height: 200 },
    },
    failure: {
      state: "unavailable",
      error: "DrawingNeedsNextPage",
      body: { ...body },
      rectangle: {
        x: 92.16000000000004,
        y: 270.4533333333333,
        width: 120.93333333333334,
        height: 41.57333333333333,
      },
    },
  };
}

test("cell growth request preserves exact owner and measured collision overflow", () => {
  const input = example(),
    before = structuredClone(input),
    request = drawingCellHeightRequest(input.scope, input.failure);
  assert.equal(request.state, "requested");
  assert.deepEqual([request.section, request.tableNode, request.listNode], [0, 41, 48]);
  assert(Math.abs(request.overflow - 20.24) < 1e-8);
  assert(Math.abs(request.minimumHeight - 220.24) < 1e-8);
  assert.deepEqual(input, before);
});

test("cell growth refuses foreign bounds, missing owners and nonvertical failures", () => {
  for (const mutate of [
    (x) => {
      delete x.scope.cellOwner;
    },
    (x) => {
      x.scope.cellOwner.listNode = -1;
    },
    (x) => {
      x.scope.cellOwner.height = Infinity;
    },
    (x) => {
      x.failure.body.y++;
    },
    (x) => {
      x.failure.rectangle.x = 0;
    },
    (x) => {
      x.failure.rectangle.y = 0;
    },
    (x) => {
      x.failure.rectangle.height = NaN;
    },
    (x) => {
      x.failure.rectangle.y = 100;
    },
    (x) => {
      x.failure.error = "UnsupportedDrawingPagePolicy";
    },
  ]) {
    const input = example();
    mutate(input);
    assert.equal(drawingCellHeightRequest(input.scope, input.failure).state, "unavailable");
  }
});
