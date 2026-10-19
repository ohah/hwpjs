import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("actual hyperlink host page declaration survives field edit independent XML history and Worker reload", async t => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM), path = "reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx";
  const input = readFileSync(path), editor = await createHwpxEditor(wasm), marker = "검증😀<&";
  let saved;
  try {
    editor.open(input); editor.enableHistory();
    const declarations = editor.pageAreaDeclarations(0);
    assert.equal(declarations.length, 1); assert.equal(declarations[0].paragraph, 49); assert.equal(declarations[0].unit, 0);
    assert.equal(editor.canEdit(0, 49), false);
    const labels = editor.fieldLabels(0, 49); assert.equal(labels.length, 1);
    editor.spliceFieldLabel(0, 49, labels[0].beginElement, labels[0].start, 0, marker);
    assert.deepEqual(editor.pageAreaDeclarations(0), declarations);
    saved = editor.save();
    const request = { before: input.toString("base64"), after: Buffer.from(saved).toString("base64"),
      paragraph: 49, beginId: "1687662581", text: marker };
    for (const flags of [[], ["-O"]]) {
      execFileSync("python3", [...flags, "tools/hwpx-field-edit-oracle.py"], { input: JSON.stringify(request), timeout: 30000 });
      assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-field-edit-oracle.py"], {
        input: JSON.stringify({ ...request, text: "wrong" }), timeout: 30000,
      }), error => error.status === 1 && /ValueError/.test(String(error.stderr)));
    }
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
    assert.deepEqual(editor.pageAreaDeclarations(0), declarations);
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save(), saved);
    editor.open(saved);
    assert.deepEqual(editor.pageAreaDeclarations(0).map(row => [row.paragraph, row.unit]), [[49, 0]]);
  } finally { editor.close(); }
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: reply => replies.push(reply) };
  globalThis.fetch = async () => new Response(wasm);
  t.after(() => { globalThis.self = previousSelf; globalThis.fetch = previousFetch; });
  await import(`../../web/preview/reader-worker.mjs?field-page-declaration=${Date.now()}`);
  try {
    await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: saved } });
    assert.equal(replies.length, 1);
    const reply = replies.shift(); assert.equal(reply.error, undefined);
    assert.deepEqual(reply.content.pageAreaDeclarationErrors, []);
    assert.deepEqual(reply.content.pageAreaDeclarations.map(row => [row.section, row.paragraph, row.unit]), [[0, 48, 0]]);
  } finally { await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } }); }
  assert.deepEqual(readFileSync(path), input);
});
