import assert from 'node:assert/strict';

// Independent reduced-rational domain/sign analysis, not a copy of root construction.
export function admissible(g, ordinate) {
  if (g === 0) return ordinate === 65536n ? null : [];
  let p = BigInt(g), q = 65536n;
  while (q > 1n && p % 2n === 0n) { p /= 2n; q /= 2n; }
  return [-1, 0, 1].filter(sign => {
    if (sign === 0) return p > 0n && ordinate === 0n;
    if (sign < 0 && q !== 1n) return false;
    const valueSign = sign < 0 && p % 2n !== 0n ? -1 : 1;
    return ordinate !== 0n && valueSign === (ordinate < 0n ? -1 : 1);
  });
}

export function powerLevelEdges(call) {
  let comparisons = 0, rejected = 0;
  function check(g, offset, target) {
    const input = Buffer.alloc(12);
    [g, offset, target].forEach((v, i) => input.writeInt32BE(v, i * 4));
    const out = call(182, input, input.length);
    const ordinate = BigInt(target) - BigInt(offset), signs = admissible(g, ordinate);
    assert.equal(out.readUInt32LE(), signs === null ? 1 : 0);
    assert.equal(out.readUInt32LE(4), signs?.length ?? 0);
    assert.equal(out.length, 8 + 20 * (signs?.length ?? 0));
    const actualSigns = [];
    for (let i = 0; i < (signs?.length ?? 0); i++) {
      const at = 8 + 20 * i, sign = out.readInt32LE(at);
      actualSigns.push(sign);
      const n = out.readBigUInt64LE(at + 4), p = out.readInt32LE(at + 12), q = out.readUInt32LE(at + 16);
      if (sign === 0) { assert.equal(n, 0n); assert.equal(p, 0); assert.equal(q, 0); }
      else {
        assert.ok(q > 0); assert.ok(n > 0n);
        assert.equal(n, ordinate < 0n ? -ordinate : ordinate);
        // The symbolic exponent must invert the original exponent exactly.
        assert.equal(BigInt(p) * BigInt(g), 65536n * BigInt(q));
      }
    }
    assert.deepEqual(actualSigns.sort((a,b) => a-b), signs ?? []);
    comparisons++;
  }
  // Every representable integer exponent, positive/negative/zero level values.
  for (let k = -32768; k < 32768; k++) for (const target of [-65536, 0, 65536, 131072]) check(k * 65536, 0, target);
  // Every fractional-bit pattern at the negative extreme, zero and positive extreme.
  for (const whole of [-32768, 0, 32767]) for (let bits = 0; bits < 65536; bits++)
    for (const target of [-65536, 65536]) check(whole * 65536 + bits, 0, target);
  // Fractional neighbors of integer exponents and signed ordinate overflow edges.
  const extrema = [-2147483648, -65536, -1, 0, 1, 65536, 2147483647];
  for (const g of [-2147483648, -2147483647, -196609, -196607, -131073, -131071, -65537, -65535, -32768, -1, 0, 1, 32768, 65535, 65537, 131071, 131073, 196607, 196609, 2147483647])
    for (const offset of extrema) for (const target of extrema) check(g, offset, target);
  const good = Buffer.alloc(12); good.writeInt32BE(65536);
  for (let length = 0; length < 12; length++) { assert.throws(() => call(182, good.subarray(0, length), 12), /InvalidProbeInput/); rejected++; }
  assert.throws(() => call(182, Buffer.alloc(13), 13), /InvalidProbeInput/); rejected++;
  assert.throws(() => call(182, good, 11), /LimitExceeded/); rejected++;
  check(131072, -65536, 65536);
  return {comparisons, rejected};
}
