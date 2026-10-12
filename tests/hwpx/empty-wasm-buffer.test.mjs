import test from "node:test";
import assert from "node:assert/strict";
import { createMemory } from "../../js/wasm-memory.mjs";

test("WASM zero length sentinel buffers need no dereference while nonempty bounds stay strict", () => {
  const memory = createMemory({ memory: { buffer: new ArrayBuffer(16) } });
  for (const pointer of [0, 16, 0xffffffff, -1]) assert.deepEqual(memory.copy(pointer, 0), new Uint8Array(0));
  assert.throws(() => memory.copy(0xffffffff, 1), RangeError);
  assert.throws(() => memory.copy(16, 1), RangeError);
  assert.throws(() => memory.copy(0, -1), RangeError);
  const wasm = { memory: { buffer: new ArrayBuffer(16) } };
  new Uint8Array(wasm.memory.buffer).set([1, 2, 3]);
  const copied = createMemory(wasm).copy(0, 3);
  new Uint8Array(wasm.memory.buffer).fill(0);
  assert.deepEqual(copied, new Uint8Array([1, 2, 3]));
});
