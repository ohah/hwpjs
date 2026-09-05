// Deterministic malformed-input sweep. Never feed mutated files to the legacy parser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { v4File } from "./contract-fixtures.mjs";
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
const seeds = [
  v4File(),
  miniFragmented(context.module.exports),
  readFileSync(
    new URL("legacy/rust/crates/hwp-core/tests/fixtures/example.hwp", root),
  ),
];
const { instance } = await WebAssembly.instantiate(
  readFileSync(new URL("zig-out/bin/hwpjs.wasm", root)),
  {},
);
const wasm = instance.exports;
const decoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
let state = Number(process.env.CFB_MUTATION_SEED ?? 0xc0ffee) >>> 0;
const initialSeed = state;
const random = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
};
let accepted = 0,
  rejected = 0,
  recoveries = 0;
function check(bytes, required = false) {
  const ptr = wasm.cfb_alloc(bytes.length);
  assert.ok(ptr);
  try {
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
    const ok = wasm.cfb_open(ptr, bytes.length);
    assert.ok(ok === 0 || ok === 1);
    if (!ok) {
      assert.equal(wasm.cfb_count(), 0);
      assert.ok(wasm.cfb_error_len() > 0);
      assert.ok(!required, "known-good seed must recover");
      return false;
    }
    const count = wasm.cfb_count();
    assert.ok(count > 0 && count <= 1_000_000);
    assert.equal(wasm.cfb_value(0, 0), 5n);
    for (let i = 0; i < count; i++) {
      for (const key of [0, 1])
        decoder.decode(
          new Uint8Array(
            wasm.memory.buffer,
            wasm.cfb_field_ptr(i, key),
            wasm.cfb_field_len(i, key),
          ),
        );
      if (wasm.cfb_value(i, 0) === 2n)
        assert.equal(BigInt(wasm.cfb_field_len(i, 2)), wasm.cfb_value(i, 9));
    }
    return true;
  } finally {
    wasm.cfb_free(ptr, bytes.length);
    wasm.cfb_close();
  }
}
const values = [
  0, 1, 0xfffffffc, 0xfffffffd, 0xfffffffe, 0xffffffff, 0x7fffffff, 0x80000000,
];
for (let i = 0; i < 12000; i++) {
  const bytes = Buffer.from(seeds[i % seeds.length]);
  let length = bytes.length;
  switch (i % 4) {
    case 0:
      bytes[random() % bytes.length] ^= 1 << (random() % 8);
      break;
    case 1:
      bytes.writeUInt32LE(
        values[random() % values.length],
        random() % (bytes.length - 3),
      );
      break;
    case 2:
      length = random() % bytes.length;
      break;
    case 3:
      for (let j = 0; j < 4; j++)
        bytes[random() % bytes.length] = random() & 255;
      break;
  }
  try {
    if (check(bytes.subarray(0, length))) accepted++;
    else rejected++;
  } catch (error) {
    throw new Error(`mutation seed=${initialSeed}, case=${i}`, {
      cause: error,
    });
  }
  if (i % 100 === 0) {
    check(seeds[0], true);
    recoveries++;
  }
}
console.log(
  JSON.stringify({
    seed: initialSeed,
    mutations: accepted + rejected,
    accepted,
    rejected,
    recoveries,
    traps: 0,
  }),
);
