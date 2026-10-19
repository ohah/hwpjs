import test from "node:test";
import assert from "node:assert/strict";
import { numericBrowserTargetMatches } from "../../tools/browser/numeric-target.mjs";

test("numeric browser proof rejects an identical pre-existing value in another source cell", () => {
  const expected = { section: 0, paragraph: 88, text: "1" };
  assert.equal(numericBrowserTargetMatches({ value: "1", caret: "0:88:1" }, expected), true);
  assert.equal(numericBrowserTargetMatches({ value: "1", caret: "0:83:1" }, expected), false);
  assert.equal(numericBrowserTargetMatches({ value: "1", caret: "1:88:1" }, expected), false);
  assert.equal(numericBrowserTargetMatches({ value: "30.1", caret: "0:88:1" }, expected), false);
  for (const caret of ["", "0:088:1", "0:88:2", "0:88:NaN", "0:88:1:0", null]) {
    assert.equal(numericBrowserTargetMatches({ value: "1", caret }, expected), false);
  }
  assert.equal(numericBrowserTargetMatches(null, expected), false);
  for (const paragraph of [-1, true, "88", NaN]) assert.equal(numericBrowserTargetMatches({ value: "1", caret: "0:88:1" }, { ...expected, paragraph }), false);
});
