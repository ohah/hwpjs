import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCfbReader } from "../../js/cfb.mjs";
import { v4File, versionModule } from "./contract-fixtures.mjs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { checkSearchLifecycle } from "./search-lifecycle.mjs";
import { validateAbi } from "../../js/abi.mjs";

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

test("search results do not depend on document lifetime", async () => {
  const api = await createCfbReader(module);
  try {
    const saved = api.parse(v4File());
    const before = api.find(saved, "\ud800");
    api.parse(v4File());
    const replaced = api.find(saved, "\ud800");
    api.close();
    const closed = api.find(saved, "\ud800");
    assert.equal(before?.name ?? null, replaced?.name ?? null);
    assert.equal(before?.name ?? null, closed?.name ?? null);
    assert.equal(before?.name ?? null, null); // A lone surrogate is not the U+FFFD stream name.
    assert.equal(api.find(saved, "\ufffd"), saved.FileIndex[1]);
  } finally {
    api.close();
  }
});

for (const [name, offset, value, error] of [
  ["v4 directory count", 40, 123, /InvalidDirectoryCount/],
  ["FAT role", 4096, 0xffffffff, /InvalidFat/],
])
  test(`reject contradictory ${name}`, async () => {
    const api = await createCfbReader(module);
    const bytes = v4File();
    bytes.writeUInt32LE(value, offset);
    try {
      assert.throws(() => api.parse(bytes), error);
    } finally {
      api.close();
    }
  });

test("reject a WASM module with no ABI", async () => {
  await assert.rejects(
    createCfbReader(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
    /ABI/,
  );
});

test("reject an unsupported ABI before exposing a reader", async () => {
  for (const version of [2, 3, 63])
    await assert.rejects(
      createCfbReader(versionModule(version)),
      /Unsupported.*ABI/,
    );
});

test("reject a supported version with missing required exports", async () => {
  await assert.rejects(
    createCfbReader(versionModule(4)),
    /Missing.*ABI export/,
  );
});

test("reject missing ABI memory and verify the independently pinned ABI version", async () => {
  const { exports } = await WebAssembly.instantiate(module, {});
  assert.equal(exports.hwpjs_abi_version(), 4);
  assert.doesNotThrow(() => validateAbi(exports));
  assert.throws(
    () => validateAbi({ ...exports, memory: undefined }),
    /Missing.*ABI memory/,
  );
});

test("Unicode, path and control aliases match the reference across four lifetimes", async (t) => {
  const api = await createCfbReader(module);
  try {
    t.diagnostic(`lifetime searches: ${checkSearchLifecycle(CFB, api)}`);
  } finally {
    api.close();
  }
});

test("extended DIFAT role must agree with its FAT marker", async () => {
  const source = CFB.utils.cfb_new();
  CFB.utils.cfb_add(source, "/Data", Buffer.alloc(8 * 1024 * 1024));
  const bytes = Buffer.from(CFB.write(source, { type: "buffer" }));
  const difat = bytes.readUInt32LE(68);
  assert.ok(bytes.readUInt32LE(72) > 0);
  const perFat = 512 / 4;
  const fatIndex = Math.floor(difat / perFat);
  const fatSector =
    fatIndex < 109
      ? bytes.readUInt32LE(76 + 4 * fatIndex)
      : bytes.readUInt32LE((difat + 1) * 512 + 4 * (fatIndex - 109));
  const offset = (fatSector + 1) * 512 + 4 * (difat % perFat);
  assert.equal(bytes.readUInt32LE(offset), 0xfffffffc);
  const api = await createCfbReader(module);
  try {
    api.parse(bytes);
    bytes.writeUInt32LE(0xffffffff, offset);
    assert.throws(() => api.parse(bytes), /InvalidDifat/);
  } finally {
    api.close();
  }
});

test("an allocated MiniFAT chain cannot terminate in FREESECT", async () => {
  const source = CFB.utils.cfb_new();
  CFB.utils.cfb_add(source, "/Data", Buffer.from([65]));
  const bytes = Buffer.from(CFB.write(source, { type: "buffer" }));
  const parsed = CFB.read(bytes, { type: "buffer" });
  const start = CFB.find(parsed, "Data").start;
  const offset = (bytes.readUInt32LE(60) + 1) * 512 + start * 4;
  assert.equal(bytes.readUInt32LE(offset), 0xfffffffe);
  bytes.writeUInt32LE(0xffffffff, offset);
  const api = await createCfbReader(module);
  try {
    assert.throws(() => api.parse(bytes), /InvalidMiniChain/);
  } finally {
    api.close();
  }
});
