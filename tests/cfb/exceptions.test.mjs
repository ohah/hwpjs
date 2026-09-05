// Evidence for pre-existing divergences, NOT blanket approval of compatibility exceptions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, Script } from "node:vm";
import test from "node:test";
import { createCfbReader } from "../../js/cfb.mjs";
import { directoryOrder } from "./exception-fixtures.mjs";
import { miniContainer } from "./structured-fixtures.mjs";

const context = createContext({
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
});
new Script(
  readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
).runInContext(context);
const script = new Script("module.exports.parse(bytes)");
function legacy(bytes) {
  context.bytes = bytes;
  return script.runInContext(context, { timeout: 200 });
}
const module = await WebAssembly.compile(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);

test("directory fixtures have zero storage starts and no unused allocated sector", () => {
  for (const cycle of [false, true]) {
    const bytes = directoryOrder(cycle);
    assert.equal(bytes.length, 3 * 4096);
    assert.equal(bytes.readUInt32LE(4096), 0xfffffffd);
    assert.equal(bytes.readUInt32LE(4100), 0xfffffffe);
    for (let offset = 4104; offset < 8192; offset += 4)
      assert.equal(bytes.readUInt32LE(offset), 0xffffffff);
    let storages = 0;
    for (let offset = 8192; offset < bytes.length; offset += 128) {
      if (bytes[offset + 66] === 0) {
        const expected = Buffer.alloc(128);
        for (const field of [68, 72, 76])
          expected.writeUInt32LE(0xffffffff, field);
        assert.deepEqual(bytes.subarray(offset, offset + 128), expected);
      }
      if (bytes[offset + 66] !== 1) continue;
      storages++;
      assert.equal(bytes.readUInt32LE(offset + 116), 0);
      assert.equal(bytes.readBigUInt64LE(offset + 120), 0n);
    }
    assert.equal(storages, cycle ? 2 : 1);
  }
});

test("pending exception: parent after siblings gives different paths", async () => {
  const bytes = directoryOrder();
  const api = await createCfbReader(module);
  try {
    const reference = legacy(bytes),
      actual = api.parse(bytes);
    assert.equal(reference.FullPaths[1], "Root Entry/Folder/A");
    assert.equal(reference.FullPaths[2], "B");
    assert.equal(actual.FullPaths[2], "Root Entry/Folder/B");
  } finally {
    api.close();
  }
});
test("pending exception: directory cycle is stopped by a VM execution deadline", async () => {
  const bytes = directoryOrder(true);
  const api = await createCfbReader(module);
  try {
    assert.throws(() => legacy(bytes), {
      code: "ERR_SCRIPT_EXECUTION_TIMEOUT",
    });
    assert.throws(() => api.parse(bytes), { message: "CyclicDirectory" });
    assert.equal(legacy(directoryOrder()).FileIndex.length, 32);
    assert.equal(api.parse(directoryOrder()).FileIndex.length, 32);
  } finally {
    api.close();
  }
});
test("pending exception: early MiniFAT termination silently truncates legacy content", async () => {
  const bytes = miniContainer(3, 129, false).bytes;
  bytes.writeUInt32LE(0xfffffffe, 1536);
  const api = await createCfbReader(module);
  try {
    const stream = legacy(bytes).FileIndex[1];
    assert.equal(stream.size, 129);
    assert.equal(stream.content.length, 64);
    assert.throws(() => api.parse(bytes), { message: "InvalidMiniSector" });
  } finally {
    api.close();
  }
});
