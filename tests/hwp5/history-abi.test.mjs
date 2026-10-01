import assert from "node:assert/strict";
import test from "node:test";
import { createHistoryApi } from "../../js/editor-history.mjs";

test("shared history wrapper keeps exports optional and checks lifetime before native calls", () => {
  let closed = false;
  const options = { wasm: {}, memory: { error: () => new Error("NativeFailure") }, check() { if (closed) throw new Error("EditorClosed"); }, uint(value) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("InvalidInteger"); }, prefix: "test", unavailable: "HistoryAbiUnavailable" };
  const api = createHistoryApi(options);
  assert.throws(() => api.undo(), { message: "HistoryAbiUnavailable" });
  assert.throws(() => api.enableHistory(), { message: "HistoryAbiUnavailable" });
  options.wasm.test_history_enable = (entries, bytes) => { assert.equal(entries, 16); assert.equal(bytes, 8 * 1024 * 1024); return 1; };
  api.enableHistory();
  assert.throws(() => api.enableHistory({ maxEntries: NaN }), { message: "InvalidInteger" });
  for (const result of [2, -1, 0xffffffff, NaN, undefined, "1", true]) {
    options.wasm.test_undo = () => result;
    assert.throws(() => api.undo(), { message: "NativeFailure" });
  }
  options.wasm.test_undo = () => 0; assert.equal(api.undo(), false);
  options.wasm.test_redo = () => 1; assert.equal(api.redo(), true);
  closed = true;
  for (const key of ["undo", "redo", "enableHistory"])
    assert.throws(() => api[key](), { message: "EditorClosed" });
});
