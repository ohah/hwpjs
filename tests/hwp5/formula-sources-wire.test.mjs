import test from "node:test";
import assert from "node:assert/strict";
import { decodeHwp5FormulaSources } from "../../js/hwp5-formula-sources.mjs";
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const row = { source_node: 118, paragraph: 23, formula: "=SUM(B?:E?)", last_result: "67.5", derived: false };
test("formula source wire distinguishes raw cached and derived values and rejects malformed ownership", () => {
  assert.deepEqual(decodeHwp5FormulaSources(bytes([])), []);
  assert.deepEqual(decodeHwp5FormulaSources(bytes([row])), [row]);
  assert.deepEqual(decodeHwp5FormulaSources(bytes([{ ...row, derived: true }])), [{ ...row, derived: true }]);
  for (const patch of [{ source_node: 0 }, { source_node: -1 }, { source_node: 1.5 }, { paragraph: null }, { paragraph: 0x100000000 }, { formula: "SUM(A1:A2)" }, { formula: "=" }, { formula: "=\ud800" }, { last_result: 1 }, { last_result: "\ud800" }, { derived: 1 }])
    assert.throws(() => decodeHwp5FormulaSources(bytes([{ ...row, ...patch }])), { message: "InvalidHwp5FormulaSources" });
  assert.throws(() => decodeHwp5FormulaSources(bytes([row, row])), { message: "InvalidHwp5FormulaSources" });
  assert.throws(() => decodeHwp5FormulaSources(bytes({})), { message: "InvalidHwp5FormulaSources" });
});
