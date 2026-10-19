import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runFlowBreakBrowserAudit } from "../../tools/browser/flow-break-roundtrip.mjs";

for (const entry of ["flow-break-browser-audit.mjs", "flow-break-menu-browser-audit.mjs", "flow-break-search-browser-audit.mjs", "flow-break-ribbon-browser-audit.mjs"]) {
  test(`${entry} rejects unexpected arguments before reading a WASM or opening a browser`, () => {
    assert.throws(() => execFileSync(process.execPath, [`tools/${entry}`, "--unexpected"], {
      env: { ...process.env, HWPJS_TEST_WASM: "/nonexistent-flow-browser-argument-probe.wasm" }, encoding: "utf8", stdio: "pipe",
    }), error => error.status === 1 && /UnexpectedBrowserArguments/.test(error.stderr) && !/ENOENT/.test(error.stderr));
  });
}

test("shared flow browser audit rejects unknown actuation modes before browser setup", async () => {
  await assert.rejects(runFlowBreakBrowserAudit({ inputMode: "injected-script" }), /InvalidFlowBrowserInputMode/);
});
