import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("../../tools/hwp5-reference-browser-audit.mjs", import.meta.url));
const env = { ...process.env, PATH: "/nonexistent-browser-audit-negative-control" };
delete env.HWPJS_TEST_WASM;

test("invalid browser audit arguments fail before any candidate read or browser launch", () => {
  for (const [args, expected] of [
    [["--unknown=1"], "InvalidBrowserAuditArgument"],
    [["--port=0"], "InvalidBrowserAuditPort"],
    [["--port=1", "--port=2"], "InvalidBrowserAuditArgument"],
    [["--paragraph=-1"], "InvalidBrowserAuditSelection"],
    [["--paragraph=0.5"], "InvalidBrowserAuditSelection"],
    [["--occurrence=0"], "InvalidBrowserAuditSelection"],
    [["--occurrence=101"], "InvalidBrowserAuditSelection"],
    [["--paragraph=12", "--occurrence=1"], "Explicit browser candidate required"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, new RegExp(expected));
    assert.doesNotMatch(result.stderr, /spawnSync agent-browser|ENOENT|ENOTFOUND/);
  }
});
