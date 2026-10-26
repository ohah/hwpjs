import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

test("same Worker source preserves complete aift display responses with optional native candidate filtering", async (t) => {
  const candidate = process.env.HWPJS_TEST_WASM;
  const baseline = process.env.HWPJS_BASELINE_WASM;
  assert(candidate && baseline && candidate !== baseline, "Explicit distinct artifacts required");
  const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.notEqual(digest(candidate), digest(baseline), "DistinctWasmArtifactsRequired");
  t.after(() => {
    process.env.HWPJS_TEST_WASM = candidate;
  });
  const bytes = readFileSync("reference/rhwp/samples/hwpx/aift.hwpx");
  const results = [];
  for (const [name, wasm] of [
    ["candidate", candidate],
    ["baseline", baseline],
  ]) {
    await t.test(name, async (sub) => {
      process.env.HWPJS_TEST_WASM = wasm;
      const h = await workerCanvasHarness(sub);
      const loaded = await h.send({ kind: "load", format: "hwpx", bytes });
      assert.equal(loaded.error, undefined);
      const enabled = await h.send({ kind: "enable" });
      assert.equal(enabled.error, undefined);
      const window = await h.send({ kind: "set-edit-window", offset: 3007, count: 1 });
      assert.equal(window.error, undefined);
      const permission = await h.send({
        kind: "query-edit-range",
        requestId: 1,
        section: 2,
        paragraph: 3007,
        startUnit: 0,
        endUnit: 0,
      });
      assert.equal(permission.error, undefined);
      assert.equal(permission.allowed, true);
      const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
      assert.deepEqual(saved, bytes);
      results.push(
        structuredClone({
          load: loaded.content,
          enable: enabled.content,
          window: window.content,
          permission,
        }),
      );
    });
  }
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], results[1]);
});
