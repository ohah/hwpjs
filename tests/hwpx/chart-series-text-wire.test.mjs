import test from "node:test";
import assert from "node:assert/strict";
import { decodeChartSeriesText } from "../../js/hwpx-chart-series-text.mjs";
const packet = (value) => new TextEncoder().encode(JSON.stringify(value));
test("direct series wire validates typed node owners without fake point indices", () => {
  const row = { series_node: 3, text_node: 4, value_node: 5, text: "이름😀" };
  const value = { kind: "direct_series", values: [row] };
  assert.deepEqual(decodeChartSeriesText(packet(value)), value);
  assert.deepEqual(decodeChartSeriesText(packet({ kind: "direct_series", values: [] })).values, []);
  for (const invalid of [
    null,
    {},
    { ...value, kind: "string_cache" },
    { ...value, values: [row, row] },
    ...[
      null,
      { ...row, text: "\ud800" },
      { ...row, series_node: -1 },
      { ...row, value_node: 4 },
      { ...row, text_node: 0x100000000 },
    ].map((row) => ({ ...value, values: [row] })),
  ]) {
    assert.throws(() => decodeChartSeriesText(packet(invalid)), /InvalidChartSeriesText/);
  }
  assert.throws(() => decodeChartSeriesText(Uint8Array.of(0xff)), TypeError);
});
