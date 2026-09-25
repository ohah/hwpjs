import assert from 'node:assert/strict';
import test from 'node:test';
import {crc32, deflateSync} from 'node:zlib';
import {inspectPngBoundary} from './png-post-iend-evidence.mjs';

function chunk(type, payload) {
  const t = Buffer.from(type, 'ascii'), b = Buffer.alloc(12 + payload.length);
  b.writeUInt32BE(payload.length, 0);
  t.copy(b, 4);
  payload.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + payload.length)), 8 + payload.length);
  return b;
}

function png() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, 255]))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('independent PNG boundary distinguishes exact, zero, nonzero and corrupt tails', () => {
  const valid = png();
  assert.deepEqual(inspectPngBoundary(valid), {datastreamBytes: valid.length, tailBytes: 0, tailIsZero: true, chunks: 3, idats: 1});
  const zeros = Buffer.concat([valid, Buffer.from([0, 0])]);
  assert.deepEqual(inspectPngBoundary(zeros), {datastreamBytes: valid.length, tailBytes: 2, tailIsZero: true, chunks: 3, idats: 1});
  assert.equal(inspectPngBoundary(Buffer.concat([valid, Buffer.from([0, 1])])).tailIsZero, false);
  assert.equal(inspectPngBoundary(Buffer.concat([valid, valid])).tailIsZero, false);
  const damaged = Buffer.from(zeros);
  damaged[valid.length - 1] ^= 1;
  assert.throws(() => inspectPngBoundary(damaged), {message: 'InvalidPngChecksum'});
});
