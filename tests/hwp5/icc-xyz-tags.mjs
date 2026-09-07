import assert from 'node:assert/strict';
const kinds = ['rXYZ', 'gXYZ', 'bXYZ', 'lumi', 'wtpt'];
const classes = ['scnr', 'mntr', 'prtr', 'link', 'spac', 'abst', 'nmcl'];
export function iccXyzTagEdges(call) {
  let comparisons = 0, rejected = 0;
  function input(cls, name, values) {
    const b = Buffer.alloc(16 + values.length * 4);
    b.write(cls, 0); b.write(name, 4); b.write('XYZ ', 8);
    values.forEach((v, i) => b.writeInt32BE(v, 16 + i * 4));
    return b;
  }
  function reject(b, pattern, limit = b.length) {
    assert.throws(() => call(152, b, limit), pattern); rejected++;
  }
  function check(cls, name, values) {
    const b = input(cls, name, values), expected = Buffer.alloc(24), kind = kinds.indexOf(name);
    if (kind >= 0) {
      const displayWhite = cls === 'mntr' && name === 'wtpt';
      // Independent exact integer interval oracle for four-decimal rounding.
      if (displayWhite && values.some((raw, i) => {
        const scaled = BigInt(raw) * 20000n, target = BigInt([9642, 10000, 8249][i]) * 131072n;
        return scaled < target - 65536n || scaled >= target + 65536n;
      })) { reject(b, /InvalidIccIlluminant/); return b; }
      expected.writeUInt32LE(1, 0); expected.writeUInt32LE(kind, 4);
      values.forEach((v, i) => expected.writeInt32LE(v, 8 + i * 4));
      expected.writeUInt32LE((displayWhite ? 0 : 1) | (name === 'lumi' && (values[0] !== 0 || values[2] !== 0) ? 2 : 0), 20);
    }
    assert.deepEqual(call(152, b, b.length), expected); comparisons++; return b;
  }
  for (const cls of classes) for (const name of kinds) for (const values of [[0, 0, 0], [-2147483648, -1, 2147483647], [63190, 65536, 54061]]) check(cls, name, values);
  for (let axis = 0; axis < 3; axis++) for (let delta = -12; delta <= 12; delta++) {
    const values = [63190, 65536, 54061]; values[axis] += delta; check('mntr', 'wtpt', values);
  }
  for (const name of ['RXYZ', 'bkpt', 'abcd']) check('mntr', name, []);
  for (const name of kinds) {
    for (const values of [[], Array(6).fill(0)]) reject(input('scnr', name, values), /InvalidIccXyzTagCount/);
    const b = input('scnr', name, [1, 2, 3]);
    for (let size = 0; size < b.length; size++) reject(b.subarray(0, size), /InvalidProbeInput|InvalidIccXyzTagCount|InvalidIccTagDataSize|InvalidIccXyzSize/);
    const badType = Buffer.from(b); badType[8] ^= 32; reject(badType, /InvalidIccXyzType/);
    for (let i = 12; i < 16; i++) { const bad = Buffer.from(b); bad[i] = 1; reject(bad, /InvalidIccTagReserved/); }
    reject(b, /LimitExceeded/, b.length - 1);
  }
  reject(input('????', 'wtpt', [63190, 65536, 54061]), /InvalidIccProfileClass/);
  check('mntr', 'wtpt', [63190, 65536, 54061]);
  return {comparisons, rejected};
}
