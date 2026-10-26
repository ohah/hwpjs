import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { selectedTestFiles } from "../../tools/run-selected-node-tests.mjs";
const validPath = "tests/hwp5/editor.test.mjs";
const missingPath = "tests/hwp5/__missing_test_selection_negative_control__.test.mjs";
test("focused test selection requires every exact path and rejects duplicates", () => {
  assert.equal(selectedTestFiles([validPath]).length, 1);
  assert.equal(selectedTestFiles([validPath, "tests/hwpx/editor.test.mjs"]).length, 2);
  assert.throws(() => selectedTestFiles([]), /EmptyTestSelection/);
  assert.throws(() => selectedTestFiles([validPath, missingPath]), /MissingTestFile/);
  assert.throws(() => selectedTestFiles([validPath, `./${validPath}`]), /DuplicateTestFile/);
  assert.throws(
    () => selectedTestFiles(["web/preview/cell-resize-controls.mjs"]),
    /InvalidTestPath/,
  );
});
test("missing test path terminates before the runner can report a reduced pass", () => {
  const result = spawnSync(
    process.execPath,
    ["tools/run-selected-node-tests.mjs", validPath, missingPath],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MissingTestFile/);
  assert.equal(result.stdout, "");
});

test("exact selection rejects directory and symlink aliases before launching", (t) => {
  const root = mkdtempSync(join(tmpdir(), "hwpjs-test-selection-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "valid.test.mjs"),
    alias = join(root, "alias.test.mjs"),
    directory = join(root, "directory.test.mjs");
  writeFileSync(file, "");
  symlinkSync(file, alias);
  mkdirSync(directory);
  assert.deepEqual(selectedTestFiles([file]), [realpathSync(file)]);
  assert.throws(() => selectedTestFiles([file, alias]), /DuplicateTestFile/);
  assert.throws(() => selectedTestFiles([directory]), /MissingTestFile/);
});

test("focused runner records the exact selection and propagates real child pass and failure", (t) => {
  const root = mkdtempSync(join(tmpdir(), "hwpjs-test-selection-child-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pass = join(root, "pass.test.mjs"),
    fail = join(root, "fail.test.mjs");
  writeFileSync(pass, 'import test from "node:test"; test("SelectedPass", () => {});');
  writeFileSync(
    fail,
    'import test from "node:test"; import assert from "node:assert/strict"; test("SelectedFailure", () => assert.fail("InjectedSelectionFailure"));',
  );
  const launcher = join(root, "runner-alias.mjs");
  symlinkSync(realpathSync("tools/run-selected-node-tests.mjs"), launcher);
  for (const script of ["tools/run-selected-node-tests.mjs", launcher])
    for (const [files, expected] of [
      [[pass], 0],
      [[pass, fail], 1],
    ]) {
      const result = spawnSync(process.execPath, [script, ...files], {
        encoding: "utf8",
        timeout: 15000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, expected);
      const records = result.stdout
        .split("\n")
        .filter((line) => line.startsWith('{"kind":'))
        .map((line) => JSON.parse(line));
      assert.deepEqual(records[0].files, selectedTestFiles(files));
      assert.deepEqual(records.at(-1), {
        kind: "test-complete",
        code: expected,
        signal: null,
        files: files.length,
      });
      assert.match(result.stdout, /SelectedPass/);
      if (expected) assert.match(result.stdout, /InjectedSelectionFailure/);
    }
});
