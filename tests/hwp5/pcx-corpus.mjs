// Explicit read-only HWP PCX evidence; requires the local rhwp sample clone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';

const input = process.argv[2] ?? 'reference/rhwp/samples/복학원서.hwp';
const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
try {
  cfb.parse(readFileSync(input), {strict: true});
  const header = cfb.findExact('/FileHeader');
  const docInfo = cfb.findExact('/DocInfo');
  assert.equal(header?.type, 2);
  assert.equal(docInfo?.type, 2);
  const flags = Buffer.from(streamBytes(header)).readUInt32LE(36);
  const storedDoc = Buffer.from(streamBytes(docInfo));
  const doc = flags & 1 ? inflateRawSync(storedDoc, {maxOutputLength: 64 * 1024 * 1024}) : storedDoc;
  const found = [];
  for (const record of documentRecords(doc)) {
    if (record.tag !== 18) continue;
    const payload = doc.subarray(record.start, record.end);
    assert.ok(payload.length >= 4);
    const attributes = payload.readUInt16LE(0);
    if ((attributes & 15) !== 1) continue;
    assert.ok(payload.length >= 6);
    const id = payload.readUInt16LE(2);
    const units = payload.readUInt16LE(4);
    assert.ok(6 + units * 2 <= payload.length);
    const extension = payload.subarray(6, 6 + units * 2).toString('utf16le');
    if (extension.toLowerCase() !== 'pcx') continue;
    const path = `/BinData/BIN${id.toString(16).toUpperCase().padStart(4, '0')}.${extension}`;
    const entry = cfb.findExact(path);
    assert.equal(entry?.type, 2);
    const stored = Buffer.from(streamBytes(entry));
    const compression = (attributes >> 4) & 3;
    assert.ok(compression !== 3);
    const decoded = compression === 1 || compression === 0 && (flags & 1)
      ? inflateRawSync(stored, {maxOutputLength: 64 * 1024 * 1024}) : stored;
    found.push({id, extension, compression, storedBytes: stored.length, decodedBytes: decoded.length,
      sha256: createHash('sha256').update(decoded).digest('hex'), prefix: decoded.subarray(0, 4).toString('hex')});
  }
  assert.deepEqual(found, [{id: 1, extension: 'PCX', compression: 0, storedBytes: 12165, decodedBytes: 41315,
    sha256: '72140b43b43f5cfc4f1dc10f43480587a0ed4743cddbb795da8f276520582d1a', prefix: '0a050101'}]);
  console.log(JSON.stringify({file: input, pcx: found}));
} finally {
  cfb.close();
}
