import test from "node:test";
import assert from "node:assert/strict";
import { insertPrefix } from "../../tools/hwpx-prefix-edit-probe.mjs";

test("structural anchor refusal still requires a unique field and propagates label edit failure", () => {
  const calls = [];
  const editor = {
    canEdit: () => false,
    anchorText() {
      throw new Error("UnsupportedStructuralFieldEdit");
    },
    fieldLabels: () => [{ beginElement: 7, start: 0, end: 0 }],
    spliceFieldLabel: (...args) => calls.push(args),
  };
  insertPrefix(editor, 2, 2383, "경로😀<&");
  assert.deepEqual(calls, [[2, 2383, 7, 0, 0, "경로😀<&"]]);
  editor.fieldLabels = () => [];
  assert.throws(() => insertPrefix(editor, 2, 2383, "x"), /UnsupportedFieldLabelRange/);
  editor.fieldLabels = () => [{ beginElement: 7, start: 0, end: 0 }];
  editor.spliceFieldLabel = () => {
    throw new Error("ProtectedFieldRange");
  };
  assert.throws(() => insertPrefix(editor, 2, 2383, "x"), /ProtectedFieldRange/);
  assert.equal(calls.length, 1);
});

test("prefix probe selects explicit plain anchored or unique field paths without moving offset", () => {
  for (const path of ["plain", "anchored", "field"]) {
    const calls = [];
    const editor = {
      canEdit: () => path === "plain",
      anchorText() {
        if (path !== "anchored") throw new Error("UnsupportedParagraphControl");
        return "abc";
      },
      fieldLabels: () => [{ start: 0, end: 3, beginElement: 7 }],
      splice: (...args) => calls.push(["plain", ...args]),
      spliceAnchored: (...args) => calls.push(["anchored", ...args]),
      spliceFieldLabel: (...args) => calls.push(["field", ...args]),
    };
    insertPrefix(editor, 1, 2, "한😀");
    assert.deepEqual(calls, [
      path === "field" ? [path, 1, 2, 7, 0, 0, "한😀"] : [path, 1, 2, 0, 0, "한😀"],
    ]);
  }
});

test("prefix probe rejects missing ambiguous or shifted labels and unexpected query failure", () => {
  let edits = 0;
  const editor = {
    canEdit: () => false,
    anchorText() {
      throw new Error("UnsupportedParagraphControl");
    },
    fieldLabels: () => [],
    spliceFieldLabel() {
      edits++;
    },
  };
  for (const labels of [
    [],
    [{ start: 1, end: 3, beginElement: 7 }],
    [
      { start: 0, end: 3 },
      { start: 0, end: 3 },
    ],
  ]) {
    editor.fieldLabels = () => labels;
    assert.throws(() => insertPrefix(editor, 0, 1, "x"), /UnsupportedFieldLabelRange/);
  }
  editor.anchorText = () => {
    throw new Error("OutOfMemory");
  };
  assert.throws(() => insertPrefix(editor, 0, 1, "x"), /OutOfMemory/);
  assert.equal(edits, 0);
});
test("prefix probe requires explicit native exterior eligibility and propagates query failures", () => {
  const calls = [];
  const editor = {
    canEdit: () => false,
    canEditOutsideField: (...args) => {
      assert.deepEqual(args, [1, 2, 0, 0]);
      return true;
    },
    splice: (...args) => calls.push(args),
  };
  insertPrefix(editor, 1, 2, "x");
  assert.deepEqual(calls, [[1, 2, 0, 0, "x"]]);
  editor.canEditOutsideField = () => {
    throw new Error("OutOfMemory");
  };
  assert.throws(() => insertPrefix(editor, 1, 2, "x"), /OutOfMemory/);
  assert.equal(calls.length, 1);
});
