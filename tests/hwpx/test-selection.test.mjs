import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { selectedTestFiles } from "../../tools/run-selected-node-tests.mjs";
test("focused test selection requires every exact path and rejects duplicates", () => {
  const path = "tests/hwp5/cell-resize.test.mjs";
  assert.equal(selectedTestFiles([path]).length, 1);
  assert.throws(() => selectedTestFiles([]), /EmptyTestSelection/);
  assert.throws(() => selectedTestFiles([path, "tests/hwp5/cell-resize-controls.test.mjs"]), /MissingTestFile/);
  assert.throws(() => selectedTestFiles([path, `./${path}`]), /DuplicateTestFile/);
  assert.throws(() => selectedTestFiles(["web/preview/cell-resize-controls.mjs"]), /InvalidTestPath/);
});
test("missing test path terminates before the runner can report a reduced pass", () => {
  const result = spawnSync(process.execPath, ["tools/run-selected-node-tests.mjs", "tests/hwp5/cell-resize.test.mjs", "tests/hwp5/cell-resize-controls.test.mjs"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
  assert.match(result.stderr, /MissingTestFile/); assert.equal(result.stdout, "");
});
