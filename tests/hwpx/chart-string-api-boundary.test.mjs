import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
const fixture = "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx";
const input = existsSync(fixture) ? readFileSync(fixture) : null;
const test = (name, run) => nodeTest(name, { skip: input === null ? "RHWP chart reference fixture is unavailable" : false }, run);
const wasm = () => readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");

for (const missing of ["hwpx_edit_set_chart_point", "hwpx_edit_chart_point_max_bytes"]) test(`chart string missing ${missing} refuses without mutation`, async t => {
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    delete exports[missing]; return { exports };
  });
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input); editor.enableHistory();
    const revision = editor.historyRevision();
    assert.throws(() => editor.setChartPoint(0, 0, 0, "text"), /HwpxChartEditAbiUnavailable/);
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});

for (const setter of ["setChartPoint", "setChartNumericPoint"]) for (const limit of [0, -1, NaN, Infinity, 32.5, 0x100000000, 32]) test(`chart ${setter} validates native limit ${limit}`, async t => {
  const instantiate = WebAssembly.instantiate;
  let calls = 0;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    exports.hwpx_edit_chart_point_max_bytes = () => limit;
    exports.hwpx_edit_set_chart_point = () => { calls++; return 1; };
    exports.hwpx_edit_set_chart_numeric_point = () => { calls++; return 1; };
    return { exports };
  });
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input); editor.enableHistory();
    const revision = editor.historyRevision();
    assert.throws(() => editor[setter](0, 0, 0, "가".repeat(11)), { message: limit === 32 ? "LimitExceeded" : "InvalidChartPointLimit" });
    assert.equal(calls, 0);
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});

test("chart numeric native limit accepts the exact byte boundary only", async t => {
  const instantiate = WebAssembly.instantiate;
  let calls = 0;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    exports.hwpx_edit_chart_point_max_bytes = () => 32;
    exports.hwpx_edit_set_chart_numeric_point = () => { calls++; return 1; };
    return { exports };
  });
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input);
    editor.setChartNumericPoint(0, 0, 0, "1".repeat(32));
    assert.equal(calls, 1);
    assert.throws(() => editor.setChartNumericPoint(0, 0, 0, "1".repeat(33)), /LimitExceeded/);
    assert.equal(calls, 1);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});

test("legacy numeric-only chart ABI retains its frozen limit without enabling strings", async t => {
  const instantiate = WebAssembly.instantiate;
  let calls = 0;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    delete exports.hwpx_edit_chart_point_max_bytes;
    delete exports.hwpx_edit_set_chart_point;
    exports.hwpx_edit_set_chart_numeric_point = () => { calls++; return 1; };
    return { exports };
  });
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input);
    editor.setChartNumericPoint(0, 0, 0, "1");
    assert.equal(calls, 1);
    assert.throws(() => editor.setChartNumericPoint(0, 0, 0, "1".repeat(1024 * 1024 + 1)), /LimitExceeded/);
    assert.throws(() => editor.setChartPoint(0, 0, 0, "text"), /HwpxChartEditAbiUnavailable/);
    assert.equal(calls, 1);
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});

test("chart string invalid arguments preserve redo and edited owner", async () => {
  const editor = await createHwpxEditor(wasm());
  try {
    editor.open(input); editor.enableHistory();
    const [wrapper] = editor.chartNodes(0);
    const current = editor.chartPoints(0, wrapper);
    const point = current.values.points.findIndex(row => row.kind === "string_cache");
    editor.setChartPoint(0, wrapper, point, "새 값😀");
    const edited = editor.save();
    assert.equal(editor.undo(), true);
    const revision = editor.historyRevision();
    for (const value of ["\ud800", "\udfff", 123, null]) assert.throws(() => editor.setChartPoint(0, wrapper, point, value), /InvalidText/);
    assert.throws(() => editor.setChartPoint(0xffffffff, wrapper, point, "x"), /InvalidSectionIndex/);
    assert.throws(() => editor.setChartPoint(0, 0xffffffff, point, "x"), /InvalidChartPair/);
    assert.throws(() => editor.setChartPoint(0, wrapper, 0xffffffff, "x"), /InvalidChartPointIndex/);
    assert.throws(() => editor.setChartPoint(0, wrapper, point, "가".repeat(350000)), /LimitExceeded/);
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save(), edited);
  } finally { editor.close(); }
});
