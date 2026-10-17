import assert from "node:assert/strict";
import test from "node:test";
import { trackedHwpxFiles } from "../../tools/hwpx-corpus-files.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { workerReopenProjection } from "./worker-reopen-projection.mjs";

test("actual Worker advertises all HWPX channels and edits every anchor and field candidate with history", async t => {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  const wasmBytes = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const nativeExports = new Set(WebAssembly.Module.exports(await WebAssembly.compile(wasmBytes)).filter(row => row.kind === "function").map(row => row.name));
  const resultAvailable = ["hwpx_edit_splice_manual_formula_result", "hwpx_edit_manual_formula_result_max_bytes", "hwpx_edit_manual_formula_result_targets", "hwpx_edit_manual_formula_result_range_target", "hwpx_edit_manual_formula_result_display_text"].every(name => nativeExports.has(name));
  globalThis.self = { postMessage(value) { replies.push(value); } };
  globalThis.fetch = async () => new Response(wasmBytes);
  t.after(() => { globalThis.fetch = previousFetch; if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf; });
  await import(`../../web/preview/reader-worker.mjs?fixture-channels=${Date.now()}`);
  const paths = trackedHwpxFiles();
  assert(paths.length > 0);
  const totals = { paragraphs: 0, plain: 0, anchor: 0, field: 0, formula: 0, protected: 0, encrypted: 0 };
  let fieldCommands = 0, anchorCommands = 0, formulaCommands = 0;
  const wholeFormula = p => p.manualFormulaResults?.length === 1 &&
    p.manualFormulaResults[0].start === 0 && p.manualFormulaResults[0].end === p.text.length;
  const send = async data => {
    await self.onmessage({ data }); assert.equal(replies.length, 1);
    const result = replies.shift(); assert.equal(result.error, undefined, JSON.stringify(result)); return result;
  };
  const reopen = async (bytes, source, expected, origin) => {
    const before = Buffer.from(bytes);
    const loaded = await send({ kind: "load", format: "hwpx", bytes, origin });
    assert.deepEqual(workerReopenProjection(loaded.content), expected);
    assert.deepEqual(Buffer.from(bytes), before);
    await send({ kind: "enable" });
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), before);
    await send({ kind: "load", format: "hwpx", bytes: source, origin });
    await send({ kind: "enable" });
  };
  for (const path of paths) {
    const source = readFileSync(path), before = Buffer.from(source);
    await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: source, origin: path } });
    assert.equal(replies.length, 1); const reply = replies.shift();
    assert.equal(reply.origin, path); assert.deepEqual(source, before);
    if (path.endsWith("/password-12345.hwpx")) {
      assert.equal(reply.error, "EncryptedDocument"); assert.equal(reply.passwordRequired, true);
      totals.encrypted++; continue;
    }
    assert.equal(reply.error, undefined, path); assert.equal(reply.content.limited, false, path);
    assert.equal(reply.content.manualFormulaResultTextAvailable, resultAvailable, path);
    for (const paragraph of reply.content.paragraphs) {
      totals.paragraphs++;
      assert.equal(paragraph.editable, paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0 || wholeFormula(paragraph), JSON.stringify({ path, paragraph }));
      if (paragraph.plainEditable) totals.plain++;
      else if (paragraph.anchorEditable) totals.anchor++;
      else if (paragraph.fieldLabels.length) totals.field++;
      else if (wholeFormula(paragraph)) {
        totals.formula++; assert(path.endsWith("/chart.hwpx"));
        assert([23, 29, 35, 64, 70, 76, 129, 130, 131, 132, 156, 162, 168].includes(paragraph.paragraph));
      }
      else {
        totals.protected++; assert(path.endsWith("/chart.hwpx"));
        assert([23, 29, 35, 64, 70, 76, 129, 130, 131, 132, 156, 162, 168].includes(paragraph.paragraph));
      }
    }
    const fields = reply.content.paragraphs.filter(p => !p.plainEditable && !p.anchorEditable && p.fieldLabels.length > 0);
    const anchors = reply.content.paragraphs.filter(p => p.anchorEditable);
    const formulas = reply.content.paragraphs.filter(p => !p.plainEditable && !p.anchorEditable && !p.fieldLabels.length && wholeFormula(p));
    if (fields.length || anchors.length || formulas.length) {
      await send({ kind: "enable" });
      const inventory = formulas.length ? JSON.parse(execFileSync("python3", ["tools/hwpx-manual-result-inventory.py"], {
        input: source, encoding: "utf8", timeout: 30000,
      })) : [];
      for (const paragraph of formulas) {
        const independent = inventory.filter(row => row.section === paragraph.section && row.localParagraph === paragraph.paragraph + 1);
        assert.equal(independent.length, 1, "IndependentFormulaOwnerMissing");
        const marker = "Worker결과😀<&", display = marker + paragraph.text;
        const edited = await send({ kind: "splice", section: paragraph.section, paragraph: paragraph.paragraph, startUnit: 0, endUnit: 0, text: marker });
        assert.equal(edited.content.paragraphs.find(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).text, display);
        const changed = Buffer.from((await send({ kind: "save" })).bytes);
        assert.notDeepEqual(changed, source);
        for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], {
          input: JSON.stringify({ before: source.toString("base64"), after: changed.toString("base64"), section: paragraph.section, ordinal: independent[0].ordinal, display, selfTest: true }), timeout: 30000,
        });
        assert.equal((await send({ kind: "undo" })).changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        assert.equal((await send({ kind: "redo" })).changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), changed);
        assert.equal((await send({ kind: "undo" })).changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        const reopened = await send({ kind: "load", format: "hwpx", bytes: changed, origin: path });
        assert.equal(reopened.content.paragraphs.find(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).text, display);
        await send({ kind: "enable" });
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), changed);
        await send({ kind: "load", format: "hwpx", bytes: source, origin: path });
        await send({ kind: "enable" });
        formulaCommands++;
      }
      for (const paragraph of fields) {
        const label = paragraph.fieldLabels[0], marker = "Worker필드😀";
        const edited = await send({ kind: "splice", section: paragraph.section, paragraph: paragraph.paragraph, startUnit: label.start, endUnit: label.start, text: marker });
        assert(edited.content.paragraphs.find(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).text.includes(marker));
        const changed = await send({ kind: "save" }); assert.notDeepEqual(Buffer.from(changed.bytes), source);
        const undo = await send({ kind: "undo" }); assert.equal(undo.changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        const redo = await send({ kind: "redo" }); assert.equal(redo.changed, true);
        assert.deepEqual((await send({ kind: "save" })).bytes, changed.bytes);
        await send({ kind: "undo" });
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        await reopen(changed.bytes, source, workerReopenProjection(edited.content), path);
        fieldCommands++;
      }
      for (const paragraph of anchors) {
        const marker = "Worker앵커😀", end = paragraph.text.length;
        const edited = await send({ kind: "splice", section: paragraph.section, paragraph: paragraph.paragraph, startUnit: end, endUnit: end, text: marker });
        assert.equal(edited.content.paragraphs.find(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).text, paragraph.text + marker);
        const changed = await send({ kind: "save" });
        assert.notDeepEqual(Buffer.from(changed.bytes), source);
        assert.equal((await send({ kind: "undo" })).changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        assert.equal((await send({ kind: "redo" })).changed, true);
        assert.deepEqual((await send({ kind: "save" })).bytes, changed.bytes);
        await send({ kind: "undo" });
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        await reopen(changed.bytes, source, workerReopenProjection(edited.content), path);
        anchorCommands++;
      }
    }
  }
  assert.deepEqual(totals, { paragraphs: 1444, plain: 1278, anchor: 146, field: 7, formula: resultAvailable ? 13 : 0, protected: resultAvailable ? 0 : 13, encrypted: 1 });
  assert.equal(formulaCommands, resultAvailable ? 13 : 0);
  assert.equal(fieldCommands, 7);
  assert.equal(anchorCommands, 146);
  t.diagnostic(`HWPX tracked paths=${paths.length}; anchors=${anchorCommands}; fields=${fieldCommands}; each saved edit reopened and resaved byte-exact; real Worker/WASM, not browser or independent XML proof`);
});
