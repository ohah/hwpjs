import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("query parity rejects missing empty unknown and duplicate arguments before reporting success", () => {
  for (const [args, message] of [
    [[], "MissingQueryParityArtifacts"],
    [["--before-wasm="], "InvalidQueryParityArgument"],
    [["--unknown=value"], "InvalidQueryParityArgument"],
    [["--before-wasm=a", "--before-wasm=b", "--after-wasm=c"], "DuplicateQueryParityArgument"],
    [["--before-wasm=a", "--after-wasm=b", "--root="], "InvalidQueryParityArgument"],
    [["--before-wasm=a", "--after-wasm=b", "--max-rss-mib=0"], "InvalidQueryParityLimit"],
    [["--before-wasm=a", "--after-wasm=b", "--max-duration-ms=bad"], "InvalidQueryParityLimit"],
  ]) {
    const result = spawnSync(process.execPath, ["tools/hwpx-query-parity-audit.mjs", ...args], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert(result.stderr.includes(message), result.stderr);
    assert(!result.stdout.includes('"kind":"summary"'));
  }
});
