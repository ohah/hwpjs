import assert from "node:assert/strict";
import test from "node:test";
import { decodeHwp5DrawingObjectExtras } from "../../js/hwp5-drawing-object-extras.mjs";

test("opaque drawing tail wire rejects inconsistent lengths identities and invalid hexadecimal", () => {
  const encode = value => new TextEncoder().encode(JSON.stringify(value));
  const row = { control_node: 2, paragraph_node: 1, extra_bytes: 2, extra_hex: "ff80" };
  assert.deepEqual(decodeHwp5DrawingObjectExtras(encode([row])), [row]);
  assert.deepEqual(decodeHwp5DrawingObjectExtras(encode([{ ...row, extra_bytes: 0, extra_hex: "" }])), [{ ...row, extra_bytes: 0, extra_hex: "" }]);
  for (const patch of [{ extra_hex: "FF80" }, { extra_hex: "gg00" }, { extra_hex: "ff" }, { extra_bytes: -1 }, { extra_bytes: true }, { paragraph_node: 2 }, { control_node: 0 }])
    assert.throws(() => decodeHwp5DrawingObjectExtras(encode([{ ...row, ...patch }])), /InvalidHwp5DrawingObjectExtras/);
  assert.throws(() => decodeHwp5DrawingObjectExtras(encode([row, row])), /InvalidHwp5DrawingObjectExtras/);
  assert.throws(() => decodeHwp5DrawingObjectExtras(encode([row, { ...row, control_node: 1 }])), /InvalidHwp5DrawingObjectExtras/);
});
