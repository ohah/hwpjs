import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { selectedTestFiles } from "../../tools/run-selected-node-tests.mjs";
const validPath = "tests/hwp5/editor.test.mjs";
const missingPath = "tests/hwp5/__missing_test_selection_negative_control__.test.mjs";
test("focused test selection requires every exact path and rejects duplicates", () => {
  assert.equal(selectedTestFiles([validPath]).length, 1);
  assert.equal(selectedTestFiles([validPath, "tests/hwpx/editor.test.mjs"]).length, 2);
  assert.throws(() => selectedTestFiles([]), /EmptyTestSelection/);
  assert.throws(() => selectedTestFiles([validPath, missingPath]), /MissingTestFile/);
  assert.throws(() => selectedTestFiles([validPath, `./${validPath}`]), /DuplicateTestFile/);
  assert.throws(() => selectedTestFiles(["web/preview/cell-resize-controls.mjs"]), /InvalidTestPath/);
});
test("missing test path terminates before the runner can report a reduced pass", () => {
  const result = spawnSync(process.execPath, ["tools/run-selected-node-tests.mjs", validPath, missingPath], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
  assert.match(result.stderr, /MissingTestFile/); assert.equal(result.stdout, "");
});
