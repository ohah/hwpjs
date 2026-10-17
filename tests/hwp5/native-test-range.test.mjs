import test from "node:test";
import assert from "node:assert/strict";
import { nativeAuditOptions, nativeTestRange } from "../../tools/native-test-range.mjs";

test("native audit defaults preserve whole inventory and explicit ranges remain partial", () => {
  const defaults = nativeAuditOptions(["--binary=/test"]);
  assert.deepEqual(defaults, { binary: "/test", size: 100, start: 0, end: null, expectedSha256: undefined });
  assert.deepEqual(nativeTestRange(defaults, 4077), { start: 0, end: 4077, fullInventoryCovered: true });
  const resume = nativeAuditOptions(["--binary=/test", "--start-index=2532", "--batch-size=1", `--expected-sha256=${"a".repeat(64)}`]);
  assert.deepEqual(nativeTestRange(resume, 4077), { start: 2532, end: 4077, fullInventoryCovered: false });
  const single = nativeAuditOptions(["--binary=/test", "--start-index=2531", "--end-index=2532"]);
  assert.deepEqual(nativeTestRange(single, 4077), { start: 2531, end: 2532, fullInventoryCovered: false });
});

test("native ranges reject missing binary unknown duplicate malformed and unsafe arguments", () => {
  for (const args of [[], ["--binary="], ["--start-index=1"], ["--binary=/x", "--foo=1"], ["--binary=/x", "--start-index=1", "--start-index=2"]]) assert.throws(() => nativeAuditOptions(args));
  for (const option of ["batch-size=0", "batch-size=1001", "batch-size=01", "start-index=-1", "start-index=1.5", "start-index=4294967296", "start-index=Infinity", "start-index=01", "end-index=0", "end-index=NaN", "expected-sha256=abc", `expected-sha256=${"A".repeat(64)}`]) assert.throws(() => nativeAuditOptions(["--binary=/x", `--${option}`]), option);
  assert.throws(() => nativeAuditOptions(["--binary=/x", "--start-index=2", "--end-index=2"]), /InvalidNativeTestRange/);
  assert.throws(() => nativeAuditOptions(["--binary=/x", "--start-index=2", "--end-index=1"]), /InvalidNativeTestRange/);
});

test("native selection refuses inventory overflow instead of silently clamping or claiming empty success", () => {
  for (const args of [["--start-index=4"], ["--end-index=5"], ["--start-index=4", "--end-index=5"]]) assert.throws(() => nativeTestRange(nativeAuditOptions(["--binary=/x", ...args]), 4), /OutsideInventory/);
  for (const count of [0, -1, 1.5, Infinity, 0x100000000]) assert.throws(() => nativeTestRange(nativeAuditOptions(["--binary=/x"]), count), /InvalidNativeTestCount/);
  for (const options of [{ start: -1, end: null }, { start: 0, end: undefined }, { start: 1, end: 1 }, { start: 0.5, end: null }]) assert.throws(() => nativeTestRange(options, 4), /InvalidNativeTestRange/);
});
