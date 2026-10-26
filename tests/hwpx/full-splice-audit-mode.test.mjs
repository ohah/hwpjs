import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("full splice audit mode rejects ambiguous values before reading artifact or fixtures", () => {
  for (const mode of ["0", "true", "yes", ""]) {
    const env = {
      ...process.env,
      HWPJS_FULL_SPLICE_AUDIT: mode,
      HWPJS_TEST_WASM: "/missing-artifact-for-mode-test/hwpjs.wasm",
    };
    delete env.NODE_TEST_CONTEXT;
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          ["--test", "tests/hwpx/table-fixture-splice-positions.test.mjs"],
          {
            env,
            encoding: "utf8",
            timeout: 30000,
          },
        ),
      (error) =>
        error.status === 1 &&
        /InvalidFullSpliceAuditMode/.test(String(error.stdout) + String(error.stderr)) &&
        !/ENOENT/.test(String(error.stdout) + String(error.stderr)),
    );
  }
});
