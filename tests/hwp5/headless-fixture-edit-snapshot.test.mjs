import test from "node:test";
import assert from "node:assert/strict";
import { verifyEditedProjection } from "../../tools/headless-fixture-edit-snapshot.mjs";
const target = { section: 0, paragraph: 0, startUnit: 0, text: "검증😀" };
const row = (paragraph, text, clipped = false) => ({ section: 0, paragraph, text, clipped });
const before = () => ({
  limited: true,
  paragraphs: [row(0, "target"), row(1, "boundary text", true)],
});
const after = () => ({
  limited: true,
  paragraphs: [row(0, "검증😀target"), row(1, "boundary", true)],
});
test("display-budget prefix movement requires complete independent source verification", () => {
  const a = before(),
    b = after(),
    copy = structuredClone([a, b]);
  assert.deepEqual(verifyEditedProjection(a, b, target), {
    budgetBoundaryChanges: 1,
    requiresCompleteSourceOracle: true,
  });
  assert.deepEqual([a, b], copy);
  b.paragraphs[1] = structuredClone(a.paragraphs[1]);
  assert.deepEqual(verifyEditedProjection(a, b, target), {
    budgetBoundaryChanges: 0,
    requiresCompleteSourceOracle: false,
  });
});
test("unclipped changes, foreign prefixes, identities and target clipping fail", () => {
  for (const mutate of [
    (b) => {
      b.limited = false;
    },
    (b) => {
      b.paragraphs[1].text = "foreign";
    },
    (b) => {
      b.paragraphs[1].paragraph = 2;
    },
    (b) => {
      b.paragraphs[0].clipped = true;
    },
    (b) => {
      b.paragraphs[0].text = "WRONG";
    },
    (b) => {
      b.paragraphs.pop();
    },
  ]) {
    const b = after();
    mutate(b);
    assert.throws(() => verifyEditedProjection(before(), b, target));
  }
  const a = before(),
    b = after();
  a.paragraphs[1].clipped = false;
  b.paragraphs[1].clipped = false;
  assert.throws(() => verifyEditedProjection(a, b, target), /UnrelatedUnclippedTextChanged/);
});
