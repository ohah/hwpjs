import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("Worker AVG split returns current target and recalculated result through save history", async (t) => {
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(value) {
      replies.push(value);
    },
  };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?avg-split=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    const result = replies.shift();
    assert.equal(result.error, undefined, result.error);
    return result;
  };
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  await send({ kind: "load", format: "hwpx", bytes: input });
  await send({ kind: "enable" });
  const split = await send({
    kind: "split",
    section: 0,
    paragraph: 152,
    atUnit: 0,
    anchored: true,
  });
  assert.deepEqual(split.content.formulaErrors, []);
  assert.equal(split.content.formulas[10].last_result, "215.33");
  assert.deepEqual(split.splitTarget, { section: 0, paragraph: 153 });
  const saved = Buffer.from((await send({ kind: "save" })).bytes);
  execFileSync("python3", ["tools/hwpx-sum-split-oracle.py"], {
    input: JSON.stringify({
      before: input.toString("base64"),
      after: saved.toString("base64"),
      part: "Contents/section0.xml",
      index: 152,
      at: 0,
    }),
    timeout: 30000,
  });
  const undone = await send({ kind: "undo" });
  assert.equal(undone.content.formulas[10].last_result, "266.00");
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
  const redone = await send({ kind: "redo" });
  assert.equal(redone.content.formulas[10].last_result, "215.33");
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), saved);
  const reopened = await send({ kind: "load", format: "hwpx", bytes: saved });
  assert.equal(reopened.content.formulas[10].last_result, "215.33");
});
