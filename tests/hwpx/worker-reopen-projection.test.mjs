import test from "node:test";
import assert from "node:assert/strict";
import { workerReopenProjection } from "./worker-reopen-projection.mjs";

test("reopen projection detects other text, missing objects, duplicate owners and clipped content", () => {
  const original = {
    format: "hwpx",
    limited: false,
    paragraphs: [
      { section: 0, paragraph: 0, text: "edited😀" },
      { section: 0, paragraph: 1, text: "other" },
    ],
    tables: [{}],
    drawings: [],
    pictures: [{}],
    containers: [],
  };
  const expected = workerReopenProjection(original);
  assert.deepEqual(workerReopenProjection(structuredClone(original)), expected);
  for (const mutate of [
    (value) => {
      value.paragraphs[1].text = "lost";
    },
    (value) => {
      value.paragraphs.pop();
    },
    (value) => {
      value.tables.pop();
    },
    (value) => {
      value.pictures.pop();
    },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(
      () => assert.deepEqual(workerReopenProjection(changed), expected),
      assert.AssertionError,
    );
  }
  for (const mutate of [
    (value) => {
      value.limited = true;
    },
    (value) => {
      delete value.containers;
    },
    (value) => {
      value.paragraphs[1].paragraph = 0;
    },
    (value) => {
      value.paragraphs[1].section = -1;
    },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => workerReopenProjection(changed), assert.AssertionError);
  }
});
