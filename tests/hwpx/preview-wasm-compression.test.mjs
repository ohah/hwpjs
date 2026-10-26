import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync, brotliDecompressSync } from "node:zlib";
import { createPreviewWasmCompression } from "../../tools/preview-wasm-compression.mjs";

const decode = (representation) =>
  representation.encoding === "br"
    ? brotliDecompressSync(representation.bytes)
    : representation.encoding === "gzip"
      ? gunzipSync(representation.bytes)
      : representation.bytes;

test("WASM gzip and Brotli are lossless, independently cached and invalidated by source changes", () => {
  const compress = createPreviewWasmCompression(),
    body = Buffer.alloc(10000, 65);
  const gzip = compress(body, "gzip"),
    br = compress(body, "gzip, deflate, br");
  assert.equal(gzip.encoding, "gzip");
  assert.equal(br.encoding, "br");
  assert.ok(gzip.bytes.length < body.length);
  assert.ok(br.bytes.length < body.length);
  assert.deepEqual(decode(gzip), body);
  assert.deepEqual(decode(br), body);
  assert.equal(compress(Buffer.from(body), "gzip"), gzip);
  assert.equal(compress(Buffer.from(body), "br"), br);
  body[0] = 66;
  const changed = compress(body, "gzip"),
    changedBr = compress(body, "br");
  assert.notEqual(changed, gzip);
  assert.notEqual(changedBr, br);
  assert.deepEqual(decode(changed), body);
  assert.deepEqual(decode(changedBr), body);
});

test("WASM encoding negotiation honors quality, explicit refusals, wildcard and identity preferences", () => {
  const compress = createPreviewWasmCompression(),
    body = Buffer.from("WASM");
  const cases = [
    [undefined, null],
    ["", null],
    ["notgzip", null],
    ["gzip;q=0", null],
    ["gzip;q=2", null],
    ["gzip;q=invalid", null],
    ["br;q=0,gzip", "gzip"],
    ["gzip;q=0,br", "br"],
    ["gzip;q=1,br;q=0.5", "gzip"],
    ["gzip;q=0.1, br;q=1.000", "br"],
    ["GZIP ; Q=0.500, BR;q=0.200", "gzip"],
    ["*", "br"],
    ["br;q=0,*;q=1", "gzip"],
    ["gzip;q=0,br;q=0,*;q=1", null],
    ["identity;q=1,br;q=0.5", null],
    ["identity;q=0,br;q=0.1", "br"],
    ["*;q=0,identity;q=1", null],
    ["gzip;q=1,gzip;q=0", null],
  ];
  for (const [header, encoding] of cases) {
    const result = compress(body, header);
    assert.equal(result.encoding, encoding, String(header));
    assert.deepEqual(decode(result), body, String(header));
  }
  for (const header of [
    "*;q=0",
    "identity;q=0",
    "identity;q=0,br;q=0,gzip;q=0",
    "br;q=bad,*;q=0",
  ]) {
    assert.deepEqual(compress(body, header), { encoding: null, bytes: null }, header);
  }
});
