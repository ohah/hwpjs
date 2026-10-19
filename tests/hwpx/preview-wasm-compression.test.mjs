import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createPreviewWasmCompression } from "../../tools/preview-wasm-compression.mjs";

test("WASM gzip is lossless, reused for identical content and invalidated by content changes", () => {
  const compress = createPreviewWasmCompression(), body = Buffer.alloc(10000, 65);
  const first = compress(body, "gzip, deflate, br");
  assert.ok(first.length < body.length); assert.deepEqual(gunzipSync(first), body);
  assert.equal(compress(Buffer.from(body), "gzip"), first);
  body[0] = 66;
  const changed = compress(body, "gzip");
  assert.notEqual(changed, first); assert.deepEqual(gunzipSync(changed), body);
});

test("WASM compression respects gzip quality and leaves unsupported or refused encodings alone", () => {
  const compress = createPreviewWasmCompression(), body = Buffer.from("WASM");
  for (const header of [undefined, "", "br", "gzip;q=0", "gzip;q=0.000", "gzip;q=2", "gzip;q=invalid", "notgzip"]) assert.equal(compress(body, header), null);
  for (const header of ["gzip", "GZIP", "gzip;q=0.1", "br, gzip;q=1.000"]) assert.deepEqual(gunzipSync(compress(body, header)), body);
});
