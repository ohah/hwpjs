import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createCfbReader } from "../../js/cfb.mjs";
import { v4File } from "./contract-fixtures.mjs";
import { miniContainer } from "./structured-fixtures.mjs";
import { assertExactResult } from "./exact-result.mjs";

const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
};
runInNewContext(
  readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
  context,
);
const CFB = context.module.exports;
const module = await WebAssembly.compile(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);

test("exact return shape: all real HWP fixtures including unused entries and blob methods", async () => {
  const api = await createCfbReader(module);
  const dir = new URL(
    "../../legacy/rust/crates/hwp-core/tests/fixtures/",
    import.meta.url,
  );
  try {
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".hwp"))) {
      const bytes = readFileSync(new URL(name, dir));
      assertExactResult(api.parse(bytes), CFB.parse(bytes), name);
    }
  } finally {
    api.close();
  }
});

test("exact return shape: empty, MiniFAT and regular streams across input representations", async () => {
  const api = await createCfbReader(module);
  try {
    for (const bytes of [
      v4File(),
      ...[3, 4].flatMap((v) =>
        [0, 1, 64, 65, 4095].map((size) => miniContainer(v, size, true).bytes),
      ),
    ]) {
      for (const input of [bytes, new Uint8Array(bytes), Array.from(bytes)]) {
        assertExactResult(
          api.parse(input, { raw: true }),
          CFB.parse(input, { raw: true }),
        );
      }
      for (const type of ["binary", "base64"]) {
        const input = bytes.toString(type);
        assertExactResult(
          api.read(input, { type, raw: true }),
          CFB.read(input, { type, raw: true }),
        );
      }
    }
  } finally {
    api.close();
  }
});

test("exact blob cursor operations on copied output", async () => {
  const api = await createCfbReader(module);
  try {
    for (const asArray of [false, true]) {
      const bytes = v4File();
      for (let i = 12288; i < bytes.length; i++) bytes[i] = i % 251;
      const input = asArray ? Array.from(bytes) : bytes;
      const a = api.parse(input).FileIndex[1].content;
      const e = CFB.parse(input).FileIndex[1].content;
      for (const [size, type] of [[1], [2], [2, "i"], [4], [16], [3]]) {
        assert.equal(a.read_shift(size, type), e.read_shift(size, type));
        assert.equal(a.l, e.l);
      }
      for (const args of [
        [1, 255],
        [2, 0xfedc],
        [4, 0xdeadbeef],
        [-4, -321],
        [4, "01234567", "hex"],
        [6, "가A", "utf16le"],
      ]) {
        assert.equal(a.write_shift(...args), a);
        e.write_shift(...args);
        assertExactResult(a, e, "written cursor");
      }
      a.l = e.l = 0;
      const hex = Buffer.from(e.slice(0, 4)).toString("hex");
      a.chk(hex, "prefix ");
      e.chk(hex, "prefix ");
      assert.equal(a.l, e.l);
      let expectedError;
      try {
        e.chk("ffff", "marker ");
      } catch (err) {
        expectedError = err.message;
      }
      assert.throws(() => a.chk("ffff", "marker "), { message: expectedError });
      assert.equal(a.l, e.l);
    }
  } finally {
    api.close();
  }
});

test("exact accepted header metadata, FILETIME bits and nullable options", async () => {
  const api = await createCfbReader(module);
  try {
    for (const version of [3, 4]) {
      for (const ticks of [
        0n,
        1n,
        133000000001234567n,
        0x7fffffffffffffffn,
        0x8000000000000000n,
        0xffffffffffffffffn,
      ]) {
        const bytes = miniContainer(version, 65, true).bytes;
        const directory = version === 3 ? 1024 : 8192;
        bytes.fill(0xab, 8, 24); // tolerated header CLSID
        bytes.writeUInt16LE(0xffff, 24); // tolerated minor and byte order
        bytes.writeUInt16LE(0xffff, 28);
        bytes.writeBigUInt64LE(ticks, directory + 128 + 100);
        bytes.writeBigUInt64LE(ticks, directory + 128 + 108);
        bytes.writeUInt32LE(0xf1234567, directory + 128 + 96);
        bytes.fill(0xcd, directory + 128 + 80, directory + 128 + 96);
        assertExactResult(api.parse(bytes, null), CFB.parse(bytes, null));
        assertExactResult(
          api.read(bytes.toString("base64"), null),
          CFB.read(bytes.toString("base64"), null),
        );
      }
    }
  } finally {
    api.close();
  }
});

test("exact header failure messages from the same validation branches", async () => {
  const api = await createCfbReader(module);
  try {
    const cases = [Buffer.alloc(0), Buffer.alloc(511)];
    for (const [offset, value] of [
      [0, 0],
      [26, 5],
      [30, 8],
      [30, 9],
      [32, 5],
      [34, 1],
      [56, 64],
    ]) {
      const bytes = v4File();
      bytes.writeUInt16LE(value, offset);
      cases.push(bytes);
    }
    const v3 = miniContainer(3, 1, false).bytes;
    v3.writeUInt32LE(1, 40);
    cases.push(v3);
    for (const bytes of cases) {
      let message;
      try {
        CFB.parse(bytes);
      } catch (e) {
        message = e.message;
      }
      assert.equal(
        typeof message,
        "string",
        "reference must reject the targeted header",
      );
      assert.throws(() => api.parse(bytes), { name: "Error", message });
      assertExactResult(api.parse(v4File()), CFB.parse(v4File()));
    }
  } finally {
    api.close();
  }
});

test("empty content presence is not inferred from size or entry kind", async () => {
  const api = await createCfbReader(module);
  try {
    for (const version of [3, 4]) {
      const directory = version === 3 ? 1024 : 8192;
      for (const start of [0, 0xfffffffe]) {
        const bytes = miniContainer(version, 1, false).bytes;
        bytes.writeUInt32LE(0, directory + 128 + 120);
        bytes.writeUInt32LE(start, directory + 128 + 116);
        const actual = api.parse(bytes),
          expected = CFB.parse(bytes);
        assertExactResult(actual, expected);
        assert.equal(
          Object.hasOwn(actual.FileIndex[1], "content"),
          start === 0,
        );
        assert.equal(
          Object.hasOwn(actual.FileIndex[2], "content"),
          true,
          "unused slot with mini stream backing",
        );
      }
    }
  } finally {
    api.close();
  }
});
