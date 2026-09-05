import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCfbReader } from "../../js/cfb.mjs";
import { v4File } from "./contract-fixtures.mjs";
import { runInNewContext } from "node:vm";

const module = await WebAssembly.compile(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);

test("FILETIME uses unsigned i64 bits at the JS boundary", async () => {
  const api = await createCfbReader(module);
  try {
    for (const ticks of [
      0x7fffffffffffffffn,
      0x8000000000000000n,
      0xffffffffffffffffn,
    ]) {
      const bytes = v4File();
      bytes.writeBigUInt64LE(ticks, 8192 + 100);
      const time = api.parse(bytes).FileIndex[0].ct.getTime();
      const expected = Number(ticks / 10000n - 11644473600000n);
      assert.ok(
        Math.abs(time - expected) <= 1,
        `${ticks}: ${time} != ${expected}`,
      );
    }
  } finally {
    api.close();
  }
});

test("invalid byte values and unsupported encodings are not silently coerced", async () => {
  const api = await createCfbReader(module);
  try {
    for (const value of [321, -1, NaN, Infinity, 1.5, "65", undefined]) {
      const bytes = Array.from(v4File());
      bytes[12288] = value;
      assert.throws(() => api.parse(bytes), TypeError, String(value));
    }
    assert.throws(() => api.parse(Uint16Array.from(v4File())), TypeError);
    const binary = v4File().toString("binary");
    assert.throws(
      () =>
        api.read(binary.slice(0, 12288) + "\u0141" + binary.slice(12289), {
          type: "binary",
        }),
      TypeError,
    );
    assert.throws(() => api.read(v4File(), { type: "typo" }), TypeError);
  } finally {
    api.close();
  }
});

test("cross-realm ArrayBuffer and byte views preserve their bytes", async () => {
  const api = await createCfbReader(module);
  try {
    const bytes = Array.from(v4File());
    for (const expression of [
      "Uint8Array.from(bytes).buffer",
      "Uint8Array.from(bytes)",
    ]) {
      const foreign = runInNewContext(expression, { bytes });
      assert.equal(api.parse(foreign).FileIndex[1].content.length, 4096);
    }
  } finally {
    api.close();
  }
});

test("a leading U+FEFF in root and stream names is data, not a text transport BOM", async () => {
  const api = await createCfbReader(module);
  try {
    const bytes = v4File();
    for (const [offset, name] of [
      [8192, "\ufeffRoot"],
      [8320, "\ufeffData"],
    ]) {
      bytes.fill(0, offset, offset + 64);
      const encoded = Buffer.from(name + "\0", "utf16le");
      encoded.copy(bytes, offset);
      bytes.writeUInt16LE(encoded.length, offset + 64);
    }
    const saved = api.parse(bytes);
    assert.equal(saved.FileIndex[0].name, "\ufeffRoot");
    assert.equal(saved.FileIndex[1].name, "\ufeffData");
    assert.equal(saved.FullPaths[1], "\ufeffRoot/\ufeffData");
    for (const phase of ["active", "replaced", "closed"]) {
      if (phase === "replaced") api.parse(v4File());
      if (phase === "closed") api.close();
      assert.equal(api.find(saved, "\ufeffData"), saved.FileIndex[1], phase);
      assert.equal(api.find(saved, "Data"), null, phase);
      assert.equal(api.find(saved, "/\ufeffData"), saved.FileIndex[1], phase);
    }
  } finally {
    api.close();
  }
});

for (const [name, mutate] of [
  ["used stream marked free", (b) => b.writeUInt32LE(0xffffffff, 4104)],
  ["stream child references root", (b) => b.writeUInt32LE(0, 8320 + 76)],
  ["root sibling references itself", (b) => b.writeUInt32LE(0, 8192 + 68)],
  [
    "directory color outside its domain",
    (b) => {
      b[8320 + 67] = 2;
    },
  ],
  ["missing name terminator", (b) => b.writeUInt16LE(2, 8320 + 64)],
  ["live entry without a name field", (b) => b.writeUInt16LE(0, 8320 + 64)],
  ["slash in a single entry name", (b) => b.writeUInt16LE(47, 8320)],
  [
    "NUL separating an invalid surrogate pair",
    (b) => {
      b.writeUInt16LE(0xd800, 8320);
      b.writeUInt16LE(0, 8322);
      b.writeUInt16LE(0xdc00, 8324);
      b.writeUInt16LE(0, 8326);
      b.writeUInt16LE(8, 8320 + 64);
    },
  ],
])
  test(`reject ${name} and recover on the next open`, async () => {
    const api = await createCfbReader(module);
    try {
      const bytes = v4File();
      mutate(bytes);
      assert.throws(
        () => api.parse(bytes),
        (e) => e instanceof Error && !(e instanceof WebAssembly.RuntimeError),
      );
      assert.equal(api.parse(v4File()).FileIndex[1].content.length, 4096);
    } finally {
      api.close();
    }
  });
