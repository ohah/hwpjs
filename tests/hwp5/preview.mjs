import assert from "node:assert/strict";
export function previewStats(bytes) {
  assert.equal(bytes.length % 2, 0);
  const value = bytes.toString("utf16le"),
    result = [value.length, 0, 0, 0, 0];
  // JS string iteration combines surrogate pairs but preserves isolated units.
  for (const char of value) {
    const cp = char.codePointAt(0);
    result[cp >= 0xd800 && cp <= 0xdfff ? 2 : 1]++;
    if (cp === 0) result[3]++;
    if (cp === 0xfeff) result[4]++;
  }
  return result;
}
export function previewActual(call, bytes) {
  const out = call(26, bytes),
    expected = previewStats(bytes);
  assert.equal(out.length, 20 + bytes.length);
  assert.deepEqual(
    Array.from({ length: 5 }, (_, i) => out.readUInt32LE(i * 4)),
    expected,
  );
  assert.deepEqual(out.subarray(20), bytes);
  return expected;
}
export function previewEdges(call) {
  const bytes = Buffer.alloc(2);
  for (let unit = 0; unit <= 65535; unit++) {
    bytes.writeUInt16LE(unit);
    previewActual(call, bytes);
  }
  const boundary = [
    0, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfeff, 0xffff,
  ];
  for (const a of boundary)
    for (const b of boundary)
      for (const c of boundary) {
        const raw = Buffer.alloc(6);
        [a, b, c].forEach((u, i) => raw.writeUInt16LE(u, i * 2));
        previewActual(call, raw);
      }
  // Includes body control codes as ordinary units, BOM in the middle, NUL,
  // a supplementary scalar and unpaired surrogates; no terminator requirement.
  const sample = Buffer.from(
    "\ufeff\u0002\u000bA\0😀\ud800B\udc00\ufeffZ",
    "utf16le",
  );
  for (let n = 0; n <= sample.length; n++) {
    if (n % 2)
      assert.throws(
        () => call(26, sample.subarray(0, n)),
        /InvalidPreviewTextSize/,
      );
    else previewActual(call, sample.subarray(0, n));
    previewActual(call, sample);
  }
  previewActual(call, Buffer.alloc(8192)); // No invented 2048-byte preview limit.
  return {
    singleUnits: 65536,
    boundaryTriples: 729,
    prefixes: sample.length + 1,
  };
}
