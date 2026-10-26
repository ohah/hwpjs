import test from "node:test";
import assert from "node:assert/strict";
import {
  applyParagraphSplit,
  paragraphBreakIntent,
} from "../../web/preview/paragraph-split-command.mjs";

test("paragraph split dispatch preserves target units and never drops explicit intent", () => {
  const calls = [];
  const editor = Object.fromEntries(
    ["splitParagraph", "splitParagraphAnchored", "splitParagraphWithBreak"].map((name) => [
      name,
      (args) => {
        calls.push([name, args]);
        return true;
      },
    ]),
  );
  const target = { section: 3, paragraph: 17, atUnit: 2, endUnit: 9 };
  assert.equal(applyParagraphSplit(editor, target, { kind: "split" }), true);
  applyParagraphSplit(editor, target, { kind: "split", anchored: true }, true);
  for (const kind of ["page", "column"])
    applyParagraphSplit(editor, target, { kind: "split", breakBefore: kind });
  assert.deepEqual(calls, [
    ["splitParagraph", target],
    ["splitParagraphAnchored", target],
    ["splitParagraphWithBreak", { ...target, kind: "page" }],
    ["splitParagraphWithBreak", { ...target, kind: "column" }],
  ]);
});

test("paragraph break message rejects undefined coercions merge and ambiguous anchor modes", () => {
  assert.equal(paragraphBreakIntent({ kind: "split" }), null);
  const editor = new Proxy(
    {},
    {
      get() {
        return () => assert.fail("invalid message must not mutate native state");
      },
    },
  );
  for (const value of [undefined, null, true, 1, 2, "PAGE", "", {}, []])
    assert.throws(
      () => applyParagraphSplit(editor, {}, { kind: "split", breakBefore: value }),
      /InvalidParagraphBreakKind/,
    );
  assert.throws(
    () => paragraphBreakIntent({ kind: "merge", breakBefore: "page" }),
    /InvalidStructureCommand/,
  );
  assert.throws(
    () => paragraphBreakIntent({ kind: "split", anchored: true, breakBefore: "page" }),
    /InvalidStructureCommand/,
  );
  assert.throws(
    () => paragraphBreakIntent({ kind: "split", anchored: "true", breakBefore: "column" }),
    /InvalidAnchorMode/,
  );
});
