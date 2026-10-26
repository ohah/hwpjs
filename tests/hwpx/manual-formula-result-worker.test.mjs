import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";

for (const missing of [
  "hwpx_edit_set_manual_formula_result",
  "hwpx_edit_manual_formula_result_max_bytes",
])
  test(`actual Worker refuses missing manual result ABI ${missing} without editing`, async (t) => {
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
    await import(`../../web/preview/reader-worker.mjs?manual-missing=${missing}-${Date.now()}`);
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      return replies.shift();
    };
    const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
    const loaded = await send({ kind: "load", format: "hwpx", bytes: input });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.content.manualFormulaResultAvailable, false);
    assert.equal((await send({ kind: "enable" })).error, undefined);
    const first = loaded.content.formulas[0];
    const refused = await send({
      kind: "manual-formula-result",
      section: first.section,
      beginElement: first.beginElement,
      display: "수동",
    });
    assert.equal(refused.error, "HwpxManualFormulaResultAbiUnavailable");
    assert.notEqual(refused.applied, true);
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
  });

test("actual Worker manual formula result refreshes display and preserves definition history", async (t) => {
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
  await import(`../../web/preview/reader-worker.mjs?manual-result=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const loaded = await send({
    kind: "load",
    format: "hwpx",
    bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx"),
  });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.manualFormulaResultAvailable, true);
  const first = loaded.content.formulas[0];
  const command = {
    kind: "manual-formula-result",
    section: first.section,
    beginElement: first.beginElement,
    display: "수동😀<&",
  };
  assert.equal((await send(command)).error, "EditorNotOpen");
  assert.equal((await send({ kind: "enable" })).error, undefined);
  const definition = await send({
    kind: "formula-definition",
    section: first.section,
    beginElement: first.beginElement,
    formula: "=AVG(B?:E?)",
  });
  assert.equal(definition.error, undefined);
  const before = Buffer.from((await send({ kind: "save" })).bytes);
  const changed = await send(command);
  assert.equal(changed.error, undefined);
  assert.deepEqual(changed.content.formulaErrors, []);
  assert.equal(changed.content.formulas[0].formula, "=AVG(B?:E?)");
  assert.equal(changed.content.formulas[0].last_result, command.display);
  assert.ok(changed.content.paragraphs.some((row) => row.text === command.display));
  const after = Buffer.from((await send({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]])
    execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
      input: JSON.stringify({
        before: before.toString("base64"),
        after: after.toString("base64"),
        ordinal: 0,
        display: command.display,
        selfTest: true,
      }),
      timeout: 30000,
    });
  const undone = await send({ kind: "undo" });
  assert.equal(undone.error, undefined);
  assert.equal(undone.content.formulas[0].last_result, "16.875");
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), before);
  assert.equal((await send({ ...command, display: "\u0000" })).error, "InvalidXmlCharacter");
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), before);
  assert.equal((await send({ kind: "redo" })).content.formulas[0].last_result, command.display);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), after);
  const reopened = await send({ kind: "load", format: "hwpx", bytes: after });
  assert.equal(reopened.error, undefined);
  assert.equal(reopened.content.formulas[0].formula, "=AVG(B?:E?)");
  assert.equal(reopened.content.formulas[0].last_result, command.display);
  assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), after);
});
