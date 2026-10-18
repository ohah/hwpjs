import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hwp5BrowserReferenceCase } from "../../tools/browser/hwp5-reference-cases.mjs";
const script = fileURLToPath(new URL("../../tools/hwp5-reference-browser-audit.mjs", import.meta.url));
const env = { ...process.env, PATH: "/nonexistent-browser-audit-negative-control" };
delete env.HWPJS_TEST_WASM;

test("invalid browser audit arguments fail before any candidate read or browser launch", () => {
  for (const [args, expected] of [
    [["--unknown=1"], "InvalidBrowserAuditArgument"],
    [["--case=missing"], "UnknownBrowserReferenceCase"],
    [["--port=0"], "InvalidBrowserAuditPort"],
    [["--port=1", "--port=2"], "InvalidBrowserAuditArgument"],
    [["--paragraph=-1"], "InvalidBrowserAuditSelection"],
    [["--paragraph=0.5"], "InvalidBrowserAuditSelection"],
    [["--occurrence=0"], "InvalidBrowserAuditSelection"],
    [["--occurrence=101"], "InvalidBrowserAuditSelection"],
    [["--case=market", "--paragraph=50001"], "InvalidBrowserAuditSelection"],
    [["--paragraph=12", "--occurrence=1"], "Explicit browser candidate required"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, new RegExp(expected));
    assert.doesNotMatch(result.stderr, /spawnSync agent-browser|ENOENT|ENOTFOUND/);
  }
});

test("browser reference cases own their source positions and explicit opening policy", () => {
  assert.equal(hwp5BrowserReferenceCase().fixture, "hwpspec.hwp");
  assert.deepEqual(hwp5BrowserReferenceCase("roadmap"), { fixture: "issue5941/1490000-201600081_roadmap_research.hwp", section: 0, paragraph: 5, occurrence: 1, distribution: false, normalize: false });
  for (const name of ["__proto__", "constructor", "missing", "", null]) assert.throws(() => hwp5BrowserReferenceCase(name), /UnknownBrowserReferenceCase/);
  assert(Object.isFrozen(hwp5BrowserReferenceCase("roadmap")));
  const market = hwp5BrowserReferenceCase("market");
  assert.equal(market.paragraph, 50000);
  assert.deepEqual(market.window, { offset: 50000, count: 1 });
  assert.equal(market.timeoutMs, 120000);
  assert(Object.isFrozen(market)); assert(Object.isFrozen(market.window));
});
