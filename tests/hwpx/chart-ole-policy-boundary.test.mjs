import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
const fixture = "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx";
const input = existsSync(fixture) ? readFileSync(fixture) : null;
const test = (name, run) =>
  nodeTest(
    name,
    { skip: input === null ? "RHWP chart reference fixture is unavailable" : false },
    run,
  );
const wasm = () => readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");

test("missing chart OLE policy ABI preserves an existing edited session", async (t) => {
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args),
      exports = { ...instance.exports };
    delete exports.hwpx_edit_open_with_chart_ole_policy;
    return { exports };
  });
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input);
    editor.enableHistory();
    const [wrapper] = editor.chartNodes(0);
    editor.setChartPoint(0, wrapper, 0, "유지😀");
    const saved = editor.save(),
      revision = editor.historyRevision();
    assert.throws(
      () => editor.open(input, { allowObservedChartOleDeviations: true }),
      /HwpxChartOlePolicyAbiUnavailable/,
    );
    assert.deepEqual(editor.save(), saved);
    assert.equal(editor.historyRevision(), revision);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), saved);
  } finally {
    editor.close();
  }
});

test("chart OLE policy validates JS options and native flags before replacing session", async (t) => {
  const instantiate = WebAssembly.instantiate;
  let exports;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args);
    exports = instance.exports;
    return instance;
  });
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input);
    editor.enableHistory();
    const [wrapper] = editor.chartNodes(0);
    editor.setChartPoint(0, wrapper, 0, "유지😀");
    const saved = editor.save(),
      revision = editor.historyRevision();
    for (const options of [null, [], 1, "true"])
      assert.throws(() => editor.open(input, options), /InvalidEditorOptions/);
    for (const value of [null, 0, 1, "true", {}, []])
      assert.throws(
        () => editor.open(input, { allowObservedChartOleDeviations: value }),
        /InvalidChartOlePolicy/,
      );
    for (const flag of [2, 0xffffffff])
      assert.equal(exports.hwpx_edit_open_with_chart_ole_policy(0, 0, flag), 0);
    assert.equal(exports.hwpx_edit_open_with_chart_ole_policy(0, 64 * 1024 * 1024 + 1, 1), 0);
    assert.equal(exports.hwpx_edit_open_with_chart_ole_policy(0, 0, 1), 0);
    assert.deepEqual(editor.save(), saved);
    assert.equal(editor.historyRevision(), revision);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), saved);
  } finally {
    editor.close();
  }
});
