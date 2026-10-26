import test from "node:test";
import assert from "node:assert/strict";
import { layoutWithCellHeightRetries } from "../../web/preview/cell-height-layout-retry.mjs";

const owner = { section: 0, tableNode: 41, listNode: 48 };
const failure = (minimumHeight) => ({
  state: "unavailable",
  error: "DrawingNeedsNextPage",
  cellHeightRequest: { state: "requested", ...owner, minimumHeight, overflow: 20 },
});

test("cell height retries are monotonic, owner isolated and invocation local", () => {
  const observed = [];
  const result = layoutWithCellHeightRetries(
    (resolve) => {
      observed.push(resolve(owner));
      assert.equal(resolve({ ...owner, listNode: 49 }), 10);
      return resolve(owner) < 200 ? failure(200) : { state: "paginated", rows: [] };
    },
    { minimumCellHeight: () => 10 },
  );
  assert.equal(result.state, "paginated");
  assert.deepEqual(observed, [10, 200]);
  layoutWithCellHeightRetries((resolve) => {
    assert.equal(resolve(owner), 0);
    return { state: "paginated" };
  });
});

test("nonprogressing and unbounded requests retain the original failure", () => {
  const stuck = layoutWithCellHeightRetries(() => failure(200));
  assert.equal(stuck.error, "DrawingNeedsNextPage");
  assert.equal(stuck.cellHeightRetryError, "CellHeightLayoutNoProgress");
  let attempts = 0;
  const bounded = layoutWithCellHeightRetries(
    (resolve) => {
      attempts++;
      return failure(resolve(owner) + 20);
    },
    { maxAttempts: 3 },
  );
  assert.equal(attempts, 3);
  assert.equal(bounded.cellHeightRetryError, "CellHeightLayoutRetryLimit");
  const foreign = layoutWithCellHeightRetries(() => ({
    ...failure(200),
    error: "MissingTableSourceInsets",
  }));
  assert.equal(foreign.cellHeightRetryError, "InvalidCellHeightLayoutRetry");
  assert.equal(
    layoutWithCellHeightRetries(() => failure(200), { maxAttempts: 0 }).error,
    "InvalidCellHeightLayoutRetry",
  );
});
