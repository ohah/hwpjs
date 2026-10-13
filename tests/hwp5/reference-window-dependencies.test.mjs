import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { inspect } from "./style-preservation/text-record-oracle.mjs";
import { tableBindings, tablePlacements } from "./style-preservation/table-binding-oracle.mjs";
import { planParagraphDependencies } from "../../web/preview/paragraph-dependency-plan.mjs";

test("actual huge reference retains independently verified table host outside selected window", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp");
  const before = inspect(input), reader = await createHwp5Reader(wasm), editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    const preview = reader.readText(input), ordinals = new Map(), dependencies = new Map();
    for (const section of preview.sections) for (let paragraph = 0; paragraph < section.paragraphs.length; paragraph++) ordinals.set(`${section.index}:${paragraph}`, ordinals.size);
    let bindings = 0, tables = 0;
    for (const section of preview.sections) {
      const rows = editor.tableBindings(section.index), placements = editor.tablePlacements(section.index);
      assert.deepEqual(rows, tableBindings(before.sections[section.index].bytes));
      assert.deepEqual(placements, tablePlacements(before.sections[section.index].bytes));
      const owners = new Map(placements.map(row => [row.tableNode, row]));
      bindings += rows.length; tables += placements.length;
      for (const row of rows) {
        const owner = owners.get(row.tableNode); assert(owner);
        const child = ordinals.get(`${section.index}:${row.paragraph}`), host = ordinals.get(`${section.index}:${owner.paragraph}`);
        assert(child !== undefined && host !== undefined);
        if (child !== host) dependencies.set(child, [host]);
      }
    }
    assert.equal(ordinals.size, 53448); assert.equal(bindings, 52075); assert.equal(tables, 129);
    const plan = planParagraphDependencies({ total: ordinals.size, offset: 50000, count: 100, dependencies, maxParagraphs: 20000 });
    assert.equal(plan.ordinals.length, 101);
    assert.deepEqual(plan.ordinals.filter(value => value < 50000 || value >= 50100), [35871]);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally { editor.close(); reader.close(); }
});
