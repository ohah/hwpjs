// Read-only HWP BinData/WMF evidence, independent of the Zig WMF parser.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {inspectWmf} from './wmf-framing-evidence.mjs';

const input = process.argv[2] ?? 'reference/rhwp/samples/156636617_240617 2024년 5월 월간 수출입 현황(확정치).hwp';

const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
try {
  cfb.parse(readFileSync(input), {strict: true});
  const header = Buffer.from(streamBytes(cfb.findExact('/FileHeader')));
  const flags = header.readUInt32LE(36);
  const storedDoc = Buffer.from(streamBytes(cfb.findExact('/DocInfo')));
  const doc = flags & 1 ? inflateRawSync(storedDoc, {maxOutputLength: 64 * 1024 * 1024}) : storedDoc;
  const found = [];
  for (const record of documentRecords(doc)) {
    if (record.tag !== 18) continue;
    const payload = doc.subarray(record.start, record.end);
    assert.ok(payload.length >= 6);
    const attr = payload.readUInt16LE(0);
    if ((attr & 15) !== 1) continue;
    const id = payload.readUInt16LE(2), units = payload.readUInt16LE(4);
    assert.ok(6 + units * 2 <= payload.length);
    const extension = payload.subarray(6, 6 + units * 2).toString('utf16le');
    if (extension.toLowerCase() !== 'wmf') continue;
    const path = `/BinData/BIN${id.toString(16).toUpperCase().padStart(4, '0')}.${extension}`;
    const stored = Buffer.from(streamBytes(cfb.findExact(path)));
    const compression = (attr >> 4) & 3;
    assert.notEqual(compression, 3);
    const bytes = compression === 1 || compression === 0 && (flags & 1)
      ? inflateRawSync(stored, {maxOutputLength: 64 * 1024 * 1024}) : stored;
    found.push({id, extension, compression, storedBytes: stored.length, decodedBytes: bytes.length,
      ...inspectWmf(bytes), sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  assert.deepEqual(found, [
    {id: 3, extension: 'wmf', compression: 0, storedBytes: 19471, decodedBytes: 92032,
      placeable: false, records: 988, maxRecord: 4118, sha256: '11c89d411b2451fdc05584484086fd4e3ec3115aeb8f4ba87b248efd7caf1449'},
    {id: 4, extension: 'wmf', compression: 0, storedBytes: 7462, decodedBytes: 35626,
      placeable: false, records: 539, maxRecord: 4118, sha256: '2fa3e8c1ced0751ad0aab422686ad325e721ee7cf1edf882c22b18be5df4f49f'},
  ]);
  console.log(JSON.stringify({file: input, wmf: found}));
} finally {
  cfb.close();
}
