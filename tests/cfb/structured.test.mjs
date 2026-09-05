import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createCfbReader } from "../../js/cfb.mjs";
import { miniContainer } from "./structured-fixtures.mjs";
import { v4File } from "./contract-fixtures.mjs";

const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
  console,
};
runInNewContext(
  readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
  context,
);
const CFB = context.module.exports;
const module = await WebAssembly.compile(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);

for (const version of [3, 4]) {
  for (const fragmented of [false, true]) {
    test(`v${version} MiniFAT ${fragmented ? "fragmented" : "contiguous"}: full byte oracle`, async () => {
      const api = await createCfbReader(module);
      try {
        for (const size of [
          0, 1, 63, 64, 65, 127, 128, 129, 511, 512, 513, 4095,
        ]) {
          for (let salt = 0; salt < 16; salt++) {
            const { bytes, expected } = miniContainer(
              version,
              size,
              fragmented,
              salt,
            );
            const result = api.parse(bytes, { raw: true });
            assert.deepEqual(
              Buffer.from(api.find(result, "Data").content),
              expected,
            );
            assert.equal(result.FileIndex[1].storage, "minifat");
            // Legacy omits content for an empty stream; compare its byte meaning.
            assert.deepEqual(
              Buffer.from(CFB.find(CFB.parse(bytes), "Data").content ?? []),
              expected,
            );
            assert.deepEqual(
              Buffer.from(result.raw.header),
              bytes.subarray(0, version === 3 ? 512 : 4096),
            );
            api.close();
            assert.equal(api.find(result, "/data"), result.FileIndex[1]);
            assert.deepEqual(
              Buffer.from(result.FileIndex[1].content),
              expected,
            );
          }
        }
      } finally {
        api.close();
      }
    });
  }
}

test("ABI 3 storage classification comes from the core at the 4096 boundary", async () => {
  const { exports: wasm } = await WebAssembly.instantiate(module, {});
  const api = await createCfbReader(module);
  try {
    for (const [bytes, expected] of [
      [miniContainer(4, 4095, true).bytes, 0],
      [v4File(), 1],
    ]) {
      const ptr = wasm.cfb_alloc(bytes.length);
      assert.ok(ptr);
      try {
        new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
        assert.equal(wasm.cfb_open(ptr, bytes.length), 1);
        // Independently pinned wire field; do not derive this oracle from the schema.
        assert.equal(wasm.cfb_value(1, 10), BigInt(expected));
        assert.equal(
          api.parse(bytes).FileIndex[1].storage,
          expected ? "fat" : "minifat",
        );
      } finally {
        wasm.cfb_close();
        wasm.cfb_free(ptr, bytes.length);
      }
    }
  } finally {
    api.close();
  }
});

test("multiple DIFAT sectors: full payload oracle and exact link errors", async () => {
  const expected = Buffer.from(
    Array.from({ length: 16 * 1024 * 1024 }, (_, i) => i % 251),
  );
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "/Data", expected);
  const bytes = Buffer.from(CFB.write(container, { type: "buffer" }));
  assert.ok(
    bytes.readUInt32LE(72) >= 2,
    "fixture must traverse multiple DIFAT sectors",
  );
  const api = await createCfbReader(module);
  try {
    assert.deepEqual(
      Buffer.from(api.find(api.parse(bytes), "Data").content),
      expected,
    );
    const first = bytes.readUInt32LE(68);
    const link = (first + 1) * 512 + 508;
    for (const [value, message] of [
      [first, "CyclicOrSharedSector"],
      [0x7fffffff, "InvalidSector"],
    ]) {
      const damaged = Buffer.from(bytes);
      damaged.writeUInt32LE(value, link);
      assert.throws(() => api.parse(damaged), { name: "Error", message });
      assert.deepEqual(
        Buffer.from(api.find(api.parse(bytes), "Data").content),
        expected,
      );
    }
  } finally {
    api.close();
  }
});
