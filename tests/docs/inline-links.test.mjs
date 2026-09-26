import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineLocalTargets } from "../../tools/docs-inline-links.mjs";

test("inline link probe keeps relative targets and excludes fragments and external URLs", () => {
  assert.deepEqual(inlineLocalTargets("[one](a.md#part) [two](<b%20c.md>) [anchor](#here) [web](https://example.com/x)"), ["a.md", "b c.md"]);
});
