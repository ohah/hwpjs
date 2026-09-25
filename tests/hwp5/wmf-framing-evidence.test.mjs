import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectWmf} from './wmf-framing-evidence.mjs';

function standard() {
  const b = Buffer.alloc(24);
  b.writeUInt16LE(1, 0);
  b.writeUInt16LE(9, 2);
  b.writeUInt16LE(0x300, 4);
  b.writeUInt32LE(12, 6);
  b.writeUInt32LE(3, 12);
  b.writeUInt32LE(3, 18);
  return b;
}

function placeable() {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x9ac6cdd7, 0);
  b.writeUInt16LE(1440, 14);
  let checksum = 0;
  for (let i = 0; i < 10; i++) checksum ^= b.readUInt16LE(i * 2);
  b.writeUInt16LE(checksum, 20);
  standard().copy(b, 22);
  return b;
}

test('independent WMF oracle distinguishes standard, placeable and damaged framing', () => {
  assert.deepEqual(inspectWmf(standard()), {placeable: false, records: 1, maxRecord: 3});
  assert.deepEqual(inspectWmf(placeable()), {placeable: true, records: 1, maxRecord: 3});
  const wrongSize = standard();
  wrongSize.writeUInt32LE(11, 6);
  assert.throws(() => inspectWmf(wrongSize), {message: 'InvalidWmfSize'});
  const extra = Buffer.concat([standard(), Buffer.from([1, 0])]);
  assert.throws(() => inspectWmf(extra), {message: 'InvalidWmfSize'});
  extra.writeUInt32LE(13, 6);
  assert.throws(() => inspectWmf(extra), {message: 'DataAfterWmfEof'});
  const wrongChecksum = placeable();
  wrongChecksum[20] ^= 1;
  assert.throws(() => inspectWmf(wrongChecksum), {message: 'InvalidWmfPlaceableChecksum'});
  const wrongMax = standard();
  wrongMax.writeUInt32LE(4, 12);
  assert.throws(() => inspectWmf(wrongMax), {message: 'InvalidWmfMaxRecord'});
});
