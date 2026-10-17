import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("direct series and numeric/string point edits retain one current owner in both orders", async t => {
  assert(process.env.HWPJS_TEST_WASM, "explicit chart candidate required");
  const root = "reference/rhwp/samples/issue6037";
  if (!existsSync(root)) { t.skip("RHWP chart references are unavailable"); return; }
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  let names = 0, transactions = 0, oracleChecks = 0;
  try {
    for (const file of readdirSync(root, { recursive: true }).filter(p => p.endsWith(".hwpx")).sort()) {
      const path = `${root}/${file}`, input = readFileSync(path);
      const open = bytes => editor.open(bytes, { allowObservedChartOleDeviations: true });
      open(input);
      for (const wrapper of editor.chartNodes(0)) {
        const initialNames = editor.chartSeriesText(0, wrapper);
        const initialPoints = editor.chartPoints(0, wrapper);
        const originalQuery = JSON.stringify({ initialNames, initialPoints });
        const numeric = initialPoints.values.points.findIndex(p => ["numeric_cache", "numeric_literal"].includes(p.kind));
        const string = initialPoints.values.points.findIndex(p => ["string_cache", "string_literal"].includes(p.kind));
        if (!initialNames.values.length) continue;
        assert(numeric >= 0 && string >= 0, "mixed fixture must exercise both point kinds");
        for (const [ordinal, name] of initialNames.values.entries()) {
          names++;
          for (const order of [["series", "numeric", "string"], ["string", "numeric", "series"]]) {
            open(input);
            editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
            const expectedNames = structuredClone(initialNames);
            const expectedPoints = structuredClone(initialPoints);
            const states = [input];
            for (const kind of order) {
              const value = kind === "series" ? "혼합 계열😀<&_x0008_\r\n" : kind === "numeric" ? "271.828" : "혼합 범주😀<&_x0008_";
              const point = kind === "numeric" ? numeric : string;
              const row = kind === "series" ? name : initialPoints.values.points[point];
              if (kind === "series") {
                editor.setChartSeriesText(0, wrapper, ordinal, value);
                expectedNames.values[ordinal].text = value;
              } else {
                editor.setChartPoint(0, wrapper, point, value);
                expectedPoints.values.points[point].value = value;
              }
              assert.deepEqual(editor.chartSeriesText(0, wrapper), expectedNames);
              assert.deepEqual(editor.chartPoints(0, wrapper), expectedPoints);
              assert.equal(JSON.stringify({ initialNames, initialPoints }), originalQuery, "earlier owned queries must not change");
              const saved = Buffer.from(editor.save());
              const payload = { before: states.at(-1).toString("base64"), after: saved.toString("base64"), chart: initialPoints.pair.chart_path, ole: initialPoints.pair.ole_path, value_node: row.value_node, value, allow_root_creation_zero: true, ...(kind === "series" ? { kind: "direct_series" } : {}) };
              for (const flags of [[], ["-O"]]) {
                const verify = data => execFileSync("python3", [...flags, "tools/hwpx-chart-session-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
                verify(payload);
                assert.throws(() => verify({ ...payload, value: "wrong" }), error => error.status === 1 && /chart XML mismatch/.test(String(error.stderr)));
                oracleChecks++;
              }
              states.push(saved);
              const revision = editor.historyRevision();
              editor.setChartSeriesText(0, wrapper, ordinal, expectedNames.values[ordinal].text);
              editor.setChartPoint(0, wrapper, numeric, expectedPoints.values.points[numeric].value);
              assert.equal(editor.historyRevision(), revision);
              assert.throws(() => editor.setChartNumericPoint(0, wrapper, numeric, "NaN"), /InvalidChartNumericValue/);
              assert.throws(() => editor.setChartSeriesText(0, wrapper, ordinal, "\ud800"), /InvalidText/);
              assert.equal(editor.historyRevision(), revision);
              assert.deepEqual(Buffer.from(editor.save()), saved);
            }
            for (let index = states.length - 2; index >= 0; index--) {
              assert.equal(editor.undo(), true);
              assert.deepEqual(Buffer.from(editor.save()), states[index]);
              const currentName = editor.chartSeriesText(0, wrapper).values[ordinal].text;
              const currentPoint = editor.chartPoints(0, wrapper).values.points[numeric].value;
              const revision = editor.historyRevision();
              editor.setChartSeriesText(0, wrapper, ordinal, currentName);
              editor.setChartPoint(0, wrapper, numeric, currentPoint);
              assert.equal(editor.historyRevision(), revision, "no-op must retain remaining redo");
            }
            for (const state of states.slice(1)) {
              assert.equal(editor.redo(), true);
              assert.deepEqual(Buffer.from(editor.save()), state);
            }
            open(states.at(-1));
            assert.deepEqual(editor.chartSeriesText(0, wrapper).values, expectedNames.values);
            assert.deepEqual(editor.chartPoints(0, wrapper).values.points, expectedPoints.values.points);
            assert.deepEqual(Buffer.from(editor.save()), states.at(-1));
            transactions++;
          }
        }
      }
      assert.deepEqual(readFileSync(path), input);
    }
    assert.equal(names, 10, "complete direct-series reference inventory");
    assert.equal(transactions, 20);
    assert.equal(oracleChecks, 120);
    t.diagnostic("10 names; 20 mixed transactions; 60 changed states; 120 independent XML/ZIP/OLE checks and 120 wrong-value negative controls; not browser/layout proof");
  } finally { editor.close(); }
});
