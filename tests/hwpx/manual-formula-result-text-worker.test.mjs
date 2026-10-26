import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";

async function worker(t, suffix) {
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
  await import(`../../web/preview/reader-worker.mjs?formula-text=${suffix}-${Date.now()}`);
  return async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
}
const required = [
  "hwpx_edit_splice_manual_formula_result",
  "hwpx_edit_manual_formula_result_max_bytes",
  "hwpx_edit_manual_formula_result_targets",
  "hwpx_edit_manual_formula_result_range_target",
  "hwpx_edit_manual_formula_result_display_text",
];
for (const missing of required)
  test(`Canvas result text missing ${missing} stays protected`, async (t) => {
    const instantiate = WebAssembly.instantiate,
      exportsOf = WebAssembly.Module.exports;
    t.mock.method(WebAssembly.Module, "exports", (module) =>
      exportsOf(module).filter((entry) => entry.name !== missing),
    );
    t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await instantiate(...args),
        exports = { ...instance.exports };
      delete exports[missing];
      return { exports };
    });
    const send = await worker(t, missing);
    const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
    const loaded = await send({ kind: "load", format: "hwpx", bytes: input });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.content.manualFormulaResultTextAvailable, false);
    const row = loaded.content.paragraphs.find((row) => row.section === 0 && row.paragraph === 23);
    assert.deepEqual(row.manualFormulaResults, []);
    assert.equal(row.editable, false);
    assert.equal((await send({ kind: "enable" })).error, undefined);
    const refused = await send({
      kind: "splice",
      section: 0,
      paragraph: 23,
      startUnit: 0,
      endUnit: 0,
      text: "x",
    });
    assert(
      ["ProtectedFieldRange", "UnsupportedParagraphControl", "UnsupportedFieldLabelRange"].includes(
        refused.error,
      ),
      refused.error,
    );
    assert.notEqual(refused.applied, true);
    assert(Buffer.from((await send({ kind: "save" })).bytes).equals(input));
  });
test("Canvas splice Worker routes current formula result text through native ownership and history", async (t) => {
  const send = await worker(t, "actual");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const loaded = await send({ kind: "load", format: "hwpx", bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.manualFormulaResultTextAvailable, true);
  const rowOf = (reply) =>
    reply.content.paragraphs.find((row) => row.section === 0 && row.paragraph === 23);
  assert.equal(rowOf(loaded).editable, true);
  assert.equal(rowOf(loaded).manualFormulaResults[0].end, 4);
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const changed = await send({
    kind: "splice",
    section: 0,
    paragraph: 23,
    startUnit: 0,
    endUnit: 0,
    text: "앞😀",
  });
  assert.equal(changed.error, undefined);
  assert.equal(rowOf(changed).text, "앞😀67.5");
  assert.equal(rowOf(changed).manualFormulaResults[0].end, 7);
  const permission = await send({
    kind: "query-edit-range",
    requestId: 1,
    section: 0,
    paragraph: 23,
    startUnit: 0,
    endUnit: 7,
  });
  assert.equal(permission.error, undefined);
  assert.equal(permission.allowed, true);
  const outside = await send({
    kind: "query-edit-range",
    requestId: 2,
    section: 0,
    paragraph: 23,
    startUnit: 0,
    endUnit: 8,
  });
  assert.equal(outside.error, undefined);
  assert.equal(outside.allowed, false);
  const saved = Buffer.from((await send({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]])
    execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
      input: JSON.stringify({
        before: input.toString("base64"),
        after: saved.toString("base64"),
        ordinal: 0,
        display: "앞😀67.5",
        selfTest: true,
      }),
      timeout: 30000,
    });
  const rejected = await send({
    kind: "splice",
    section: 0,
    paragraph: 23,
    startUnit: 2,
    endUnit: 2,
    text: "x",
  });
  assert.equal(rejected.error, "SplitSurrogatePair");
  assert(Buffer.from((await send({ kind: "save" })).bytes).equals(saved));
  const undone = await send({ kind: "undo" });
  assert.equal(rowOf(undone).text, "67.5");
  assert.equal(rowOf(undone).manualFormulaResults[0].end, 4);
  assert(Buffer.from((await send({ kind: "save" })).bytes).equals(input));
  const redone = await send({ kind: "redo" });
  assert.equal(rowOf(redone).text, "앞😀67.5");
  assert(Buffer.from((await send({ kind: "save" })).bytes).equals(saved));
  const window = await send({ kind: "query-edit-window", offset: 23, count: 1 });
  assert.equal(window.error, undefined);
  assert.equal(rowOf(window).text, "앞😀67.5");
  assert.equal(rowOf(window).manualFormulaResults[0].end, 7);
  assert(Buffer.from((await send({ kind: "save" })).bytes).equals(saved));
  const tailPermission = await send({
    kind: "query-edit-range",
    requestId: 3,
    section: 0,
    paragraph: 23,
    startUnit: 6,
    endUnit: 6,
  });
  const continued = await send({
    kind: "splice",
    section: 0,
    paragraph: 23,
    startUnit: 6,
    endUnit: 6,
    text: "P",
  });
  assert.deepEqual(
    {
      permissionError: tailPermission.error,
      allowed: tailPermission.allowed,
      editError: continued.error,
    },
    { permissionError: undefined, allowed: true, editError: undefined },
  );
  assert.equal(rowOf(continued).text, "앞😀67.P5");
  const continuedBytes = Buffer.from((await send({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]])
    execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
      input: JSON.stringify({
        before: input.toString("base64"),
        after: continuedBytes.toString("base64"),
        ordinal: 0,
        display: "앞😀67.P5",
        selfTest: true,
      }),
      timeout: 30000,
    });
  assert.equal((await send({ kind: "undo" })).error, undefined);
  assert(Buffer.from((await send({ kind: "save" })).bytes).equals(saved));
});
