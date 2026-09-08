import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {profilePng} from './png-profile.mjs';
const w = n => {const b = Buffer.alloc(4); b.writeUInt32LE(n); return b;};
export function imageContainerInput(bytes, selected = 1, pixels = 256 * 1024 * 1024, binaries = 100000) {
  return Buffer.concat([Buffer.from([selected]), w(pixels), w(binaries), w(64 * 1024 * 1024), bytes]);
}
export function containerImagesActual(call, bytes) {
  const baseline = call(25, Buffer.concat([w(64 * 1024 * 1024), bytes]));
  const off = call(244, imageContainerInput(bytes, 0));
  const on = call(244, imageContainerInput(bytes));
  assert.deepEqual(off.subarray(0, -44), baseline);
  assert.deepEqual(off.subarray(-44), Buffer.alloc(44));
  assert.deepEqual(on.subarray(0, -44), baseline);
  const r = on.subarray(-44);
  assert.equal(r.readUInt32LE(0), 1);
  assert.equal(r.readUInt32LE(4), r.readUInt32LE(8) + r.readUInt32LE(12));
  assert.equal(r.readUInt32LE(40), 1);
  return {png: r.readUInt32LE(8), unhandled: r.readUInt32LE(12)};
}
function fixture(cfb, payload, refs, compressed) {
  const header = Buffer.alloc(256);
  header.write('HWP Document File');
  header.writeUInt32LE(0x05000107, 32);
  const frame = (tag, b, level = 0) => Buffer.concat([w(tag | (level << 10) | (b.length << 20)), b]);
  const map = Buffer.alloc(60); map.writeUInt32LE(refs);
  const item = Buffer.from([compressed ? 0x11 : 0x21, 0, 9, 0, 3, 0, 112, 0, 110, 0, 103, 0]);
  const doc = Buffer.concat([frame(16, Buffer.alloc(26)), frame(17, map), ...Array.from({length: refs}, () => frame(18, item, 1))]);
  return cfb.write({nodes: [
    {name: 'Root Entry', kind: 5}, {name: 'FileHeader', parent: 0, content: header},
    {name: 'DocInfo', parent: 0, content: doc}, {name: 'BodyText', parent: 0, kind: 1},
    {name: 'BinData', parent: 0, kind: 1},
    {name: 'BIN0009.png', parent: 4, content: compressed ? deflateRawSync(payload) : payload},
  ]});
}
export function containerImagesEdges(call, cfb) {
  let comparisons = 0, rejected = 0;
  const words = b => Array.from({length: b.length / 4}, (_, i) => b.readUInt32LE(i * 4));
  const png = profilePng(2); // 1x1 RGB8: one filter byte plus three samples.
  for (const compressed of [false, true]) for (const refs of [1, 2, 5]) {
    const bytes = fixture(cfb, png, refs, compressed);
    const baseline = call(25, Buffer.concat([w(64 * 1024 * 1024), bytes]));
    const off = call(244, imageContainerInput(bytes, 0, 0, 0));
    assert.deepEqual(off.subarray(0, -44), baseline);
    assert.deepEqual(words(off.subarray(-44)), Array(11).fill(0));
    const on = call(244, imageContainerInput(bytes, 1, 4 * refs, refs));
    assert.deepEqual(on.subarray(0, -44), baseline);
    assert.deepEqual(words(on.subarray(-44)), [1, refs, refs, 0, 4 * refs, 0, 0, 0, 0, 0, 1]);
    comparisons += 2;
    for (const input of [imageContainerInput(bytes, 1, 4 * refs - 1, refs), imageContainerInput(bytes, 1, 4 * refs, refs - 1)]) {
      assert.throws(() => call(244, input), /LimitExceeded/);
      assert.deepEqual(call(244, imageContainerInput(bytes, 1, 4 * refs, refs)), on);
      rejected++; comparisons++;
    }
  }
  for (const compressed of [false, true]) {
    const bytes = fixture(cfb, Buffer.from('bad'), 2, compressed);
    call(244, imageContainerInput(bytes, 0)); comparisons++;
    assert.throws(() => call(244, imageContainerInput(bytes)), /UnexpectedEnd/); rejected++;
  }
  return {comparisons, rejected};
}
