import test from "node:test";
import assert from "node:assert/strict";
import { insertPrefix } from "../../tools/hwpx-prefix-edit-probe.mjs";
import { queryPrefixRoute } from "../../tools/hwpx-prefix-route-query.mjs";

function editor() {
  return {
    canEdit: () => false,
    anchorText() { throw new Error("UnsupportedParagraphControl"); },
    fieldLabels: () => [{ beginElement: 7, start: 0, end: 10 }, { beginElement: 8, start: 0, end: 10 }],
    fieldRangeTarget: () => ({ beginElement: 8, start: 0, end: 10 }),
  };
}

test("prefix mutation and read-only route share native ownership instead of first label", () => {
  const e = editor(), calls = [];
  e.spliceFieldLabel = (...args) => calls.push(args);
  e.fieldRangeTarget = (...args) => {
    assert.deepEqual(args, [0, 5, 0, 0]);
    return { beginElement: 8, start: 0, end: 10 };
  };
  assert.equal(queryPrefixRoute(e, 0, 5), "field");
  assert.equal(calls.length, 0);
  insertPrefix(e, 0, 5, "앞😀<&");
  assert.deepEqual(calls, [[0, 5, 8, 0, 0, "앞😀<&"]]);
});

test("prefix never falls back after native refusal or malformed or shifted targets", () => {
  const e = editor();
  let edits = 0;
  e.spliceFieldLabel = () => edits++;
  for (const target of [null, { beginElement: 8, start: 1, end: 10 }, { beginElement: -1, start: 0, end: 10 }, { beginElement: 8, start: 0, end: NaN }]) {
    e.fieldRangeTarget = () => target;
    assert.throws(() => insertPrefix(e, 0, 5, "x"), /UnsupportedFieldLabelRange/);
    assert.throws(() => queryPrefixRoute(e, 0, 5), /UnsupportedFieldLabelRange/);
  }
  for (const message of ["OutOfMemory", "UnsupportedFieldLabelRange", "SourceBindingMismatch"]) {
    e.fieldRangeTarget = () => { throw new Error(message); };
    assert.throws(() => insertPrefix(e, 0, 5, "x"), error => error.message === message);
    assert.throws(() => queryPrefixRoute(e, 0, 5), error => error.message === message);
  }
  assert.equal(edits, 0);
});
