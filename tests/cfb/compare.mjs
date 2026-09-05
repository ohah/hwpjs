import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import assert from "node:assert/strict";
import { miniFragmented } from "./mini-fragmented.mjs";

const root = new URL("../../", import.meta.url);
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  process,
  console,
};
runInNewContext(readFileSync(new URL("legacy/cfb.js", root), "utf8"), context);
const CFB = context.module.exports;
const module = await WebAssembly.compile(
  readFileSync(new URL("zig-out/bin/hwpjs.wasm", root)),
);
assert.equal(WebAssembly.Module.imports(module).length, 0);
const { exports: wasm } = await WebAssembly.instantiate(module, {});
const field = (i, key) =>
  Buffer.from(
    new Uint8Array(
      wasm.memory.buffer,
      wasm.cfb_field_ptr(i, key),
      wasm.cfb_field_len(i, key),
    ),
  );
const text = (i, key) => field(i, key).toString("utf8");
const value = (i, key) => Number(wasm.cfb_value(i, key));
let streams = 0;
let files = 0;
let searches = 0;
const failures = [];

function check(name, bytes) {
  const original = CFB.read(bytes, { type: "buffer", raw: true });
  const ptr = wasm.cfb_alloc(bytes.length);
  assert.ok(ptr);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  const ok = wasm.cfb_open(ptr, bytes.length);
  wasm.cfb_free(ptr, bytes.length);
  if (!ok)
    throw new Error(
      new TextDecoder().decode(
        new Uint8Array(
          wasm.memory.buffer,
          wasm.cfb_error_ptr(),
          wasm.cfb_error_len(),
        ),
      ),
    );
  assert.equal(
    wasm.cfb_count(),
    original.FileIndex.length,
    name + ": entry count",
  );
  const raw = (id) =>
    Buffer.from(
      new Uint8Array(
        wasm.memory.buffer,
        wasm.cfb_raw_ptr(id),
        wasm.cfb_raw_len(id),
      ),
    );
  assert.deepEqual(
    raw(-1),
    Buffer.from(original.raw.header),
    name + ": raw header",
  );
  assert.equal(
    wasm.cfb_sector_count(),
    original.raw.sectors.length,
    name + ": sector count",
  );
  original.raw.sectors.forEach((sector, i) =>
    assert.deepEqual(raw(i), Buffer.from(sector), name + ": raw sector " + i),
  );
  original.FileIndex.forEach((e, i) => {
    assert.equal(value(i, 0), e.type, name + ": type " + i);
    assert.equal(text(i, 0), e.name, name + ": name");
    assert.equal(text(i, 1), original.FullPaths[i], name + ": path");
    for (const [key, expected] of [
      [1, e.color],
      [2, e.L >>> 0],
      [3, e.R >>> 0],
      [4, e.C >>> 0],
      [5, e.state >>> 0],
      [8, e.start >>> 0],
      [9, e.size],
    ])
      assert.equal(value(i, key), expected, name + ": metadata " + key);
    assert.equal(field(i, 3).toString("hex"), e.clsid, name + ": CLSID");
    for (const [key, date] of [
      [6, e.ct],
      [7, e.mt],
    ]) {
      const ticks = wasm.cfb_value(i, key);
      if (date)
        assert.ok(
          Math.abs(Number(ticks / 10000n - 11644473600000n) - date.getTime()) <=
            1,
          name + ": time",
        );
      else assert.equal(ticks, 0n);
    }
    if (e.type === 2) {
      assert.deepEqual(
        field(i, 2),
        Buffer.from(e.content ?? []),
        name + ": stream " + e.name,
      );
      streams++;
    }
    for (const query of [
      e.name,
      e.name.toLowerCase(),
      original.FullPaths[i],
      "/" + original.FullPaths[i].split("/").slice(1).join("/"),
      e.name.replace(/[\u0001-\u0006]/g, "!"),
      e.name + "\0",
    ]) {
      const encoded = Buffer.from(query),
        p = wasm.cfb_alloc(encoded.length);
      new Uint8Array(wasm.memory.buffer, p, encoded.length).set(encoded);
      const found = wasm.cfb_find(p, encoded.length);
      wasm.cfb_free(p, encoded.length);
      assert.equal(
        found,
        original.FileIndex.indexOf(CFB.find(original, query)),
        name + ": find " + query,
      );
      searches++;
    }
  });
  wasm.cfb_close();
  files++;
}

const fixtures = new URL("legacy/rust/crates/hwp-core/tests/fixtures/", root);
for (const name of readdirSync(fixtures).filter((n) => n.endsWith(".hwp"))) {
  try {
    check(name, readFileSync(new URL(name, fixtures)));
  } catch (error) {
    failures.push({ name, error: error.message });
  }
}
for (const size of [0, 1, 63, 64, 65, 4095, 4096, 4097, 8 * 1024 * 1024]) {
  const container = CFB.utils.cfb_new();
  const data = Buffer.alloc(size);
  for (let i = 0; i < size; i++) data[i] = i % 251;
  CFB.utils.cfb_add(container, "/한글/표😀/Data", data);
  CFB.utils.cfb_add(container, "/Straße/éλληνικά", Buffer.from("unicode"));
  const name = "generated-" + size;
  try {
    check(name, CFB.write(container, { type: "buffer" }));
  } catch (error) {
    failures.push({ name, error: error.message });
  }
}
try {
  check("minifat-fragmented", miniFragmented(CFB));
} catch (error) {
  failures.push({ name: "minifat-fragmented", error: error.message });
}
// Independent v4 construction: FAT sector 0, directory sector 1, stream sector 2.
const v4 = Buffer.alloc(4 * 4096);
Buffer.from("d0cf11e0a1b11ae1", "hex").copy(v4);
v4.writeUInt16LE(0x3e, 24);
v4.writeUInt16LE(4, 26);
v4.writeUInt16LE(0xfffe, 28);
v4.writeUInt16LE(12, 30);
v4.writeUInt16LE(6, 32);
v4.writeUInt32LE(1, 40);
v4.writeUInt32LE(1, 44);
v4.writeUInt32LE(1, 48);
v4.writeUInt32LE(4096, 56);
v4.writeUInt32LE(0xfffffffe, 60);
v4.writeUInt32LE(0xfffffffe, 68);
v4.fill(255, 76, 512);
v4.writeUInt32LE(0, 76);
v4.fill(255, 4096, 8192);
v4.writeUInt32LE(0xfffffffd, 4096);
v4.writeUInt32LE(0xfffffffe, 4100);
v4.writeUInt32LE(0xfffffffe, 4104);
function entry(offset, name, type, start, size, child = 0xffffffff) {
  const encoded = Buffer.from(name + "\0", "utf16le");
  encoded.copy(v4, offset);
  v4.writeUInt16LE(encoded.length, offset + 64);
  v4[offset + 66] = type;
  v4[offset + 67] = 1;
  v4.writeUInt32LE(0xffffffff, offset + 68);
  v4.writeUInt32LE(0xffffffff, offset + 72);
  v4.writeUInt32LE(child, offset + 76);
  v4.writeUInt32LE(start, offset + 116);
  v4.writeUInt32LE(size, offset + 120);
}
entry(8192, "CustomRoot", 5, 0xfffffffe, 0, 1);
entry(8320, "Data", 2, 2, 4096);
Buffer.from("00112233445566778899aabbccddeeff", "hex").copy(v4, 8192 + 80);
v4.writeUInt32LE(0xf1234567, 8320 + 96);
v4.writeBigUInt64LE(133000000001234567n, 8320 + 100);
v4.writeBigUInt64LE(133000000009876543n, 8320 + 108);
for (let i = 12288; i < v4.length; i++) v4[i] = i % 251;
try {
  check("v4", v4);
} catch (error) {
  failures.push({ name: "v4", error: error.message });
}
// v4 fragmented regular stream: sector 3 followed by sector 2.
const fragmented = Buffer.alloc(5 * 4096);
v4.copy(fragmented);
fragmented.writeUInt32LE(2, 4096 + 3 * 4);
fragmented.writeUInt32LE(0xfffffffe, 4096 + 2 * 4);
fragmented.writeUInt32LE(3, 8320 + 116);
fragmented.writeUInt32LE(6000, 8320 + 120);
for (let i = 0; i < 6000; i++)
  fragmented[(i < 4096 ? 16384 : 12288) + (i % 4096)] = i % 239;
try {
  check("v4-fragmented", fragmented);
} catch (error) {
  failures.push({ name: "v4-fragmented", error: error.message });
}

// Malformed files are never passed to the legacy parser (some malformed chains can hang it).
let rejected = 0;
function reject(name, bytes) {
  const ptr = wasm.cfb_alloc(bytes.length);
  assert.ok(ptr);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  try {
    assert.equal(wasm.cfb_open(ptr, bytes.length), 0, name);
    assert.equal(wasm.cfb_count(), 0, name);
    rejected++;
  } finally {
    wasm.cfb_free(ptr, bytes.length);
    wasm.cfb_close();
  }
}
for (const length of [0, 8, 511, 4095, 8192, 10000])
  reject("truncated-" + length, v4.subarray(0, length));
for (const [name, offset, value] of [
  ["bad-signature", 0, 0],
  ["bad-sector-shift", 30, 9],
  ["bad-cutoff", 56, 64],
  ["bad-fat-location", 76, 9999],
  ["directory-cycle", 4100, 1],
  ["directory-child-cycle", 8192 + 76, 0],
  ["directory-child-oob", 8192 + 76, 99999],
  ["stream-size-high", 8320 + 124, 1],
  ["stream-cycle", 4104, 2],
  ["stream-oob", 8320 + 116, 99999],
]) {
  const bytes = Buffer.from(v4);
  bytes.writeUInt32LE(value, offset);
  reject(name, bytes);
}

// Exercise the public JS memory API against the reference, including retained results.
const { createCfbReader } = await import("../../js/cfb.mjs");
const api = await createCfbReader(module);
const saved = api.read(v4, { type: "buffer", raw: true });
assert.equal(api.find(saved, "data").size, 4096);
for (const [data, type] of [
  [v4.toString("base64"), "base64"],
  [v4.toString("binary"), "binary"],
  [Array.from(v4), "array"],
]) {
  const parsed = api.read(data, { type });
  assert.deepEqual(
    Buffer.from(api.find(parsed, "/Data").content),
    v4.subarray(12288),
  );
  assert.equal(api.find(saved, "/Data"), saved.FileIndex[1]);
}
api.close();
assert.equal(api.find(saved, "data"), saved.FileIndex[1]);
const { createNodeCfbReader } = await import("../../js/cfb-node.mjs");
const nodeReader = await createNodeCfbReader(module);
const nodeParsed = nodeReader.read(new URL("example.hwp", fixtures), {
  type: "file",
});
assert.equal(nodeReader.find(nodeParsed, "FileHeader").content.length, 256);
nodeReader.close();
console.log(
  JSON.stringify({ files, streams, searches, rejected, failures }, null, 2),
);
if (failures.length) process.exitCode = 1;
