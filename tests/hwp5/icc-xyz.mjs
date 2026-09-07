import assert from 'node:assert/strict';
export function iccXyzEdges(call) {
  let comparisons = 0, rejected = 0, state = 0x9e3779b9;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) | 0;
  function check(values) {
    const input = Buffer.alloc(8 + values.length * 4), expected = Buffer.alloc(values.length * 4);
    input.write('XYZ ');
    values.forEach((value, i) => { input.writeInt32BE(value, 8 + i * 4); expected.writeInt32LE(value, i * 4); });
    assert.deepEqual(call(150, input, input.length), expected); comparisons++;
    if (values.some(value => value < 0)) {
      assert.throws(() => call(151, input, input.length), /InvalidIccV2XyzValue/); rejected++;
    } else { assert.deepEqual(call(151, input, input.length), expected); comparisons++; }
    return input;
  }
  const reject = (input, limit = input.length) => {
    assert.throws(() => call(150, input, limit), e => !(e instanceof WebAssembly.RuntimeError)); rejected++;
  };
  check([]);
  check([0, 2147483647, 1]);
  for (let i = 0; i < 6; i++) { const values = Array(6).fill(0); values[i] = -1; check(values); }
  const base = check([-2147483648, -1, 2147483647, 65536, 1, 0]);
  for (let count = 1; count <= 256; count++) check(Array.from({length: count * 3}, next));
  for (let size = 0; size < base.length; size++) {
    if (size >= 8 && (size - 8) % 12 === 0) continue;
    reject(base.subarray(0, size));
  }
  for (let index = 0; index < 8; index++) for (let bit = 0; bit < 8; bit++) {
    const bad = Buffer.from(base); bad[index] ^= 1 << bit; reject(bad);
  }
  for (let extra = 1; extra < 12; extra++) reject(Buffer.concat([base, Buffer.alloc(extra)]));
  reject(base, base.length - 1);
  check([0, -65536, 0x12345678]);
  return {comparisons, rejected};
}
