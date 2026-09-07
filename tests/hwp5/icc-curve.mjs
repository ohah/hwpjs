import assert from 'node:assert/strict';
export function iccCurveEdges(call) {
  let comparisons = 0, rejected = 0;
  function input(values) {
    const b = Buffer.alloc(12 + values.length * 2); b.write('curv'); b.writeUInt32BE(values.length, 8);
    values.forEach((v, i) => b.writeUInt16BE(v, 12 + i * 2)); return b;
  }
  function check(values) {
    const b = input(values), out = Buffer.alloc(4 + values.length * 2);
    out.writeUInt32LE(Math.min(2, values.length)); values.forEach((v, i) => out.writeUInt16LE(v, 4 + i * 2));
    assert.deepEqual(call(153, b, b.length), out); comparisons++; return b;
  }
  function reject(b, pattern, limit = b.length) { assert.throws(() => call(153, b, limit), pattern); rejected++; }
  check([]);
  for (let gamma = 0; gamma < 65536; gamma++) check([gamma]);
  for (let n = 2; n <= 256; n++) check(Array.from({length:n}, (_, i) => (i * 4051 + n * 257) & 65535));
  for (const n of [0,1,2,3,10,0x7fffffff,0x80000000,0xffffffff]) for (let size = 0; size <= 33; size++) {
    const b = Buffer.alloc(34); b.write('curv'); b.writeUInt32BE(n,8);
    if (size >= 12 && size === 12 + 2 * n) continue;
    reject(b.subarray(0,size), /InvalidIccTagDataSize|InvalidIccCurveSize/);
  }
  const base = input([1,65535,0]);
  for (let i=0;i<8;i++) for(let bit=0;bit<8;bit++) { const bad=Buffer.from(base); bad[i]^=1<<bit; reject(bad, i<4?/InvalidIccCurveType/:/InvalidIccTagReserved/); }
  reject(base,/LimitExceeded/,base.length-1); check([65535,0,1]);
  return {comparisons,rejected};
}
