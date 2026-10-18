import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { hwp5RepeatedWindowDependencies } from "../../web/preview/hwp5-repeated-window-dependencies.mjs";
import { planParagraphDependencies } from "../../web/preview/paragraph-dependency-plan.mjs";

test("actual header footer and master lists stay bound to source hosts in body windows", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  for (const name of ["headerfooter", "table-bug"]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, input), reader = await createHwp5Reader(wasm);
    try {
      const projection = reader.readText(input), flows = editor.paragraphFlow(0);
      const selected = flows.findLast(row => row.host === "body"), repeated = flows.filter(row => ["header", "footer", "master_page"].includes(row.host));
      assert(selected && repeated.length > 0);
      const found = hwp5RepeatedWindowDependencies(editor, projection);
      const plan = planParagraphDependencies({ ...found, offset: selected.paragraph, count: 1, maxParagraphs: 100 });
      for (const row of repeated) assert(plan.ordinals.includes(row.paragraph), `${name}:${row.paragraph}`);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      const missingAnchor = Object.create(editor);
      missingAnchor.structuralAnchors = section => editor.structuralAnchors(section).filter(row => row.kind === "column");
      assert.throws(() => hwp5RepeatedWindowDependencies(missingAnchor, projection), /WindowDependencyBindingMismatch/);
      const missingBody = Object.create(editor);
      missingBody.paragraphFlow = section => editor.paragraphFlow(section).map(row => row.paragraph === repeated[0].paragraph ? { ...row, host: "body" } : row);
      assert.throws(() => hwp5RepeatedWindowDependencies(missingBody, projection), /MissingWindowRepeatedBody/);
    } finally { editor.close(); reader.close(); }
  }
});
