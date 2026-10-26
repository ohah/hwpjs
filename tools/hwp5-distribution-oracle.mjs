// Independent Node crypto/zlib byte decoder for observed compressed ViewText.
// Does not call the product WASM or claim support for other distribution formats.
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export function decodeDistribution(encoded) {
  return decodeDistributionSection(encoded, true);
}

export function decodeDistributionSection(encoded, compressed) {
  assert.equal(typeof compressed, 'boolean');
  const bytes = Buffer.from(encoded);
  assert(bytes.length >= 260);
  const bits = bytes.readUInt32LE(0);
  assert.equal(bits & 0xfffff, 28);
  const extended = bits >>> 20 === 4095;
  const start = extended ? 8 : 4;
  assert.equal(extended ? bytes.readUInt32LE(4) : bits >>> 20, 256);
  const data = Buffer.from(bytes.subarray(start, start + 256));
  let state = data.readUInt32LE(0),
    remaining = 0,
    mask = 0;
  const random = () => {
    state = (Math.imul(state, 214013) + 2531011) >>> 0;
    return (state >>> 16) & 32767;
  };
  for (let i = 0; i < data.length; i++) {
    if (!remaining) {
      mask = random() & 255;
      remaining = (random() & 15) + 1;
    }
    if (i >= 4) data[i] ^= mask;
    remaining--;
  }
  const offset = 4 + (data[0] & 15);
  const cipher = createDecipheriv('aes-128-ecb', data.subarray(offset, offset + 16), null);
  cipher.setAutoPadding(false);
  const plain = Buffer.concat([cipher.update(bytes.subarray(start + 256)), cipher.final()]);
  return compressed ? inflateRawSync(plain, { maxOutputLength: 32 * 1024 * 1024 }) : plain;
}
