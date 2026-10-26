import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyRangePrefixes } from "./style-preservation/range-prefix-fixture.mjs";

test("actual manual keeps strict refusal and explicitly edits all 178 overlapping range prefixes", async (t) => {
  if (!process.env.HWPJS_TEST_WASM) {
    t.skip("explicit range policy candidate required");
    return;
  }
  const path = "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwp";
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const input = readFileSync(path),
    wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  assert.equal(digest(input), "40d6d05eac4d55bdc4b0c62c42d93af104d5123b447581246f36fd15de7bd46f");
  await verifyRangePrefixes(path, 178, { normalizeObservedCfb: false }, 0);
  assert.deepEqual(readFileSync(path), input);
  assert.equal(digest(readFileSync(process.env.HWPJS_TEST_WASM)), digest(wasm));
});
