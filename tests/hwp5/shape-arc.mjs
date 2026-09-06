import assert from "node:assert/strict";
const w = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const run = (call, bytes, mode) => call(62, Buffer.concat([Buffer.from([mode]), bytes]));
function check(call, b, mode) {
  const start = mode ? 1 : 4, end = start + 24;
  const expected = Buffer.concat([mode ? w(b[0]) : b.subarray(0, 4), b.subarray(start, end), w(b.length - end), b.subarray(end)]);
  const actual = run(call, b, mode); assert.deepEqual(actual, expected);
  for (let i = 0; i < 6; i++) assert.equal(actual.readInt32LE(4 + i * 4), b.readInt32LE(start + i * 4));
  for (let n = 0; n < end; n++) assert.throws(() => run(call, b.subarray(0, n), mode), /UnexpectedEnd/);
  assert.deepEqual(run(call, b, mode), expected);
  return end;
}
export function arcEdges(call) {
  let accepted = 0, rejected = 0;
  for (const mode of [0, 1]) {
    const end = mode ? 25 : 28;
    for (let at = 0; at < end; at++) for (const value of [1, 128, 255]) {
      const b = Buffer.alloc(end + 3); b[at] = value; b.set([0, 128, 255], end);
      rejected += check(call, b, mode); accepted++;
    }
    rejected += check(call, Buffer.alloc(end, 255), mode); accepted++;
  }
  const ambiguous = Buffer.from(Array.from({ length: 28 }, (_, i) => i + 1));
  assert.notDeepEqual(run(call, ambiguous, 0), run(call, ambiguous, 1));
  for (const mode of [2, 255]) { assert.throws(() => run(call, ambiguous, mode), /InvalidMode/); rejected++; }
  assert.throws(() => call(62, Buffer.alloc(0)), /UnexpectedEnd/); rejected++;
  return { accepted, rejected, actualFixtures: 0 };
}
