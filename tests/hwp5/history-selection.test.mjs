import test from "node:test";
import assert from "node:assert/strict";
import { createHistorySelectionStore } from "../../web/preview/history-selection.mjs";

test("selection metadata follows explicit revisions without maintaining another undo stack", () => {
  const store = createHistorySelectionStore(3);
  const before = {
    anchor: { section: 0, paragraph: 5, unit: 0 },
    focus: { section: 0, paragraph: 5, unit: 0 },
  };
  store.remember(0, before);
  before.focus.unit = 99;
  store.remember(1, { anchor: { paragraph: 7 }, focus: { paragraph: 7 } });
  assert.equal(store.selection(0).focus.unit, 0);
  const returned = store.selection(0);
  returned.anchor.paragraph = 999;
  assert.equal(store.selection(0).anchor.paragraph, 5);
  assert.equal(store.selection(1).focus.paragraph, 7);
  assert.equal(store.selection(2), null);
  // A new branch must receive a new native revision, not reuse a stack index.
  store.remember(2, { focus: { paragraph: 6 } });
  assert.equal(store.selection(1).focus.paragraph, 7);
  store.remember(3, null);
  assert.equal(store.selection(0), null);
  assert.equal(store.selection(3), null);
  assert.throws(() => store.remember(-1, before));
  assert.throws(() => store.remember(NaN, before));
  assert.throws(() => store.remember(0xffffffff, before));
  assert.throws(() => store.remember(0x100000000, before));
  assert.equal(
    store.selection(1).focus.paragraph,
    7,
    "invalid revision does not evict existing metadata",
  );
  store.reset();
  assert.equal(store.selection(1), null);
  assert.throws(() => createHistorySelectionStore(0));
});

test("native reachable revision reconciliation removes stale branches without evicting deep undo metadata", () => {
  const store = createHistorySelectionStore(4);
  store.remember(0, { focus: { paragraph: 5 } });
  store.remember(1, { focus: { paragraph: 7 } });
  for (let revision = 2; revision < 150; revision++) {
    store.retain([0, 1, revision]);
    store.remember(revision, { focus: { paragraph: 9 } });
  }
  assert.equal(store.selection(0).focus.paragraph, 5);
  assert.equal(store.selection(1).focus.paragraph, 7);
  assert.equal(store.selection(148), null);
  assert.equal(store.selection(149).focus.paragraph, 9);
  for (const revisions of [
    [0, 0],
    [0xffffffff],
    Array.from({ length: 65537 }, (_, index) => index),
    null,
  ])
    assert.throws(() => store.retain(revisions));
  assert.equal(store.selection(0).focus.paragraph, 5);
  assert.throws(() => store.retain([0, 1], 2));
  assert.equal(
    store.selection(149).focus.paragraph,
    9,
    "failed current revision validation is atomic",
  );
});
