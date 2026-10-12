import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("Worker exposes and edits all regulatory formula definitions with saved history", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(value) { replies.push(value); } };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM));
  t.after(() => { globalThis.fetch = previousFetch; if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf; });
  await import(`../../web/preview/reader-worker.mjs?regulatory=${Date.now()}`);
  const send = async data => { await self.onmessage({ data }); assert.equal(replies.length, 1); return replies.shift(); };
  const path = "reference/rhwp/samples/issue3637/regulatory_impact_nested_table_escape.hwpx";
  const input = readFileSync(path);
  for (let ordinal = 0; ordinal < 3; ordinal++) {
    const loaded = await send({ kind: "load", format: "hwpx", bytes: input });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.content.formulas.length, 3);
    assert.equal(loaded.content.formulaDefinitionAvailable, true);
    const row = loaded.content.formulas[ordinal];
    const formula = ordinal === 1 ? "=SUM(G2,G3,G4,G5,G6,G7,G8,G9,G10,G11)" : "=AVG(B?,C?,D?,E?,F?,G?)";
    const command = { kind: "formula-definition", section: row.section, beginElement: row.beginElement, formula };
    assert.equal((await send(command)).error, "EditorNotOpen");
    assert.equal((await send({ kind: "enable" })).error, undefined);
    const changed = await send(command);
    assert.equal(changed.error, undefined);
    assert.equal(changed.content.formulas[ordinal].formula, formula);
    const saved = Buffer.from((await send({ kind: "save" })).bytes);
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-formula-definition-oracle.py"], {
      input: JSON.stringify({ before: input.toString("base64"), after: saved.toString("base64"), ordinal, formula }), timeout: 30000,
    });
    assert.equal((await send({ kind: "undo" })).error, undefined);
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
    const rejected = await send({ ...command, formula: "=UNKNOWN(G2)" });
    assert.equal(rejected.error, "UnsupportedFormulaExpression");
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), input);
    assert.equal((await send({ kind: "redo" })).error, undefined);
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), saved);
  }
  assert.deepEqual(readFileSync(path), input);
});
