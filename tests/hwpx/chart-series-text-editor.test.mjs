import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("all ten direct series names support public two-copy save with independent XML and history", async t => {
  if (!existsSync("reference/rhwp/samples/issue6037")) { t.skip("RHWP series fixtures are unavailable"); return; }
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const root = "reference/rhwp/samples/issue6037";
  let verified = 0;
  try {
    for (const file of readdirSync(root, { recursive: true }).filter(p => p.endsWith(".hwpx")).sort()) {
      const path = `${root}/${file}`, input = readFileSync(path);
      editor.open(input, { allowObservedChartOleDeviations: true });
      for (const wrapper of editor.chartNodes(0)) {
        const original = editor.chartSeriesText(0, wrapper);
        assert.equal(original.kind, "direct_series");
        for (const [ordinal, row] of original.values.entries()) {
          editor.open(input, { allowObservedChartOleDeviations: true });
          editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
          const points = editor.chartPoints(0, wrapper);
          const text = verified % 3 ? "시리즈😀<&_x0008_\0\r\n\t" : "";
          editor.setChartSeriesText(0, wrapper, ordinal, text);
          const saved = editor.save();
          const current = editor.chartSeriesText(0, wrapper);
          for (const [index, before] of original.values.entries()) assert.deepEqual(current.values[index], { ...before, text: index === ordinal ? text : before.text });
          assert.deepEqual(editor.chartPoints(0, wrapper), points);
          const payload = { before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), chart: points.pair.chart_path, ole: points.pair.ole_path, value_node: row.value_node, kind: "direct_series", value: text, allow_root_creation_zero: true };
          for (const flags of [[], ["-O"]]) {
            const verify = data => execFileSync("python3", [...flags, "tools/hwpx-chart-session-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
            verify(payload);
            assert.throws(() => verify({ ...payload, value: "wrong" }), error => error.status === 1 && /chart XML mismatch/.test(String(error.stderr)));
            assert.throws(() => verify({ ...payload, value_node: points.values.points[0].value_node }), error => error.status === 1 && /not a direct series name/.test(String(error.stderr)));
          }
          assert.equal(editor.undo(), true);
          assert.deepEqual(Buffer.from(editor.save()), input);
          const revision = editor.historyRevision();
          assert.throws(() => editor.setChartSeriesText(0, wrapper, original.values.length, "bad"), /InvalidChartSeriesTextIndex/);
          assert.throws(() => editor.setChartSeriesText(0, wrapper, ordinal, "\ud800"), /InvalidText/);
          assert.equal(editor.historyRevision(), revision);
          editor.setChartSeriesText(0, wrapper, ordinal, row.text);
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.save(), saved);
          editor.open(saved, { allowObservedChartOleDeviations: true });
          assert.equal(editor.chartSeriesText(0, wrapper).values[ordinal].text, text);
          assert.deepEqual(editor.save(), saved);
          verified++;
        }
      }
      assert.deepEqual(readFileSync(path), input);
    }
    assert.equal(verified, 10, "complete independently observed direct name inventory");
  } finally { editor.close(); }
});
