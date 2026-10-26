import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
const fixture = "reference/rhwp/samples/issue6037/2차원원형-계열추가.hwpx";
const input = existsSync(fixture) ? readFileSync(fixture) : null;
const test = (name, run) =>
  nodeTest(name, { skip: input === null ? "RHWP series fixture is unavailable" : false }, run);
const wasm = () => readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");

for (const missing of [
  "hwpx_edit_chart_series_text",
  "hwpx_edit_set_chart_series_text",
  "hwpx_edit_chart_series_text_max_bytes",
])
  test(`series missing ${missing} refuses without source or history mutation`, async (t) => {
    const instantiate = WebAssembly.instantiate;
    t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await instantiate(...args),
        exports = { ...instance.exports };
      delete exports[missing];
      return { exports };
    });
    const editor = await createHwpxEditor(wasm());
    try {
      editor.open(input, { allowObservedChartOleDeviations: true });
      editor.enableHistory();
      const [wrapper] = editor.chartNodes(0),
        revision = editor.historyRevision();
      const action = () =>
        missing === "hwpx_edit_chart_series_text"
          ? editor.chartSeriesText(0, wrapper)
          : editor.setChartSeriesText(0, wrapper, 0, "text");
      assert.throws(action, /HwpxChartSeriesTextAbiUnavailable/);
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(Buffer.from(editor.save()), input);
    } finally {
      editor.close();
    }
  });

for (const limit of [0, -1, NaN, Infinity, 1.5, 0x100000000, 32])
  test(`series native byte limit validates ${limit} before mutation`, async (t) => {
    const instantiate = WebAssembly.instantiate;
    let calls = 0;
    t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await instantiate(...args),
        exports = { ...instance.exports };
      exports.hwpx_edit_chart_series_text_max_bytes = () => limit;
      exports.hwpx_edit_set_chart_series_text = () => {
        calls++;
        return 1;
      };
      return { exports };
    });
    const editor = await createHwpxEditor(wasm());
    try {
      editor.open(input, { allowObservedChartOleDeviations: true });
      editor.enableHistory();
      const revision = editor.historyRevision();
      assert.throws(() => editor.setChartSeriesText(0, 0, 0, "가".repeat(11)), {
        message: limit === 32 ? "LimitExceeded" : "InvalidChartSeriesTextLimit",
      });
      assert.equal(calls, 0);
      assert.equal(editor.historyRevision(), revision);
      if (limit === 32) {
        editor.setChartSeriesText(0, 0, 0, "가".repeat(10) + "aa");
        assert.equal(calls, 1);
      }
      assert.deepEqual(Buffer.from(editor.save()), input);
    } finally {
      editor.close();
    }
  });
