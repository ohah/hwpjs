import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { records } from './style-preservation/text-record-oracle.mjs';
export function independentPictureBytes(decoded, ordinal) {
  const entries = records(decoded.decode(decoded.streams.get('DocInfo'))).filter(
      (row) => row.tag === 18,
    ),
    p = entries[ordinal - 1].payload;
  const flags = p.readUInt16LE(0);
  assert.equal(flags & 15, 1);
  const id = p.readUInt16LE(2),
    units = p.readUInt16LE(4),
    extension = p.subarray(6, 6 + units * 2).toString('utf16le');
  const stored = decoded.streams.get(`BinData/BIN${id.toString(16).padStart(4, '0')}.${extension}`);
  assert(stored);
  const mode = (flags >>> 4) & 3;
  assert(mode <= 2);
  return mode === 1 || (mode === 0 && decoded.compressed) ? inflateRawSync(stored) : stored;
}
