// Read-only independent DocInfo/deflate/JPEG marker census for three local HWP payloads.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {observeHwpFile, streamBytes} from './hwp-corpus-evidence.mjs';
import {jpegSequentialScans} from './jpeg-scan.mjs';

const files = [
  'reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp',
  'reference/rhwp/samples/task1749/saved_bounds_cumulative_vpos.hwp',
];
const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const results = [];
try {
  for (const file of files) {
    const source = readFileSync(file);
    const sha256 = createHash('sha256').update(source).digest('hex');
    const observation = observeHwpFile(cfb, source, reader => {
      const header = Buffer.from(streamBytes(reader.findExact('/FileHeader')));
      const flags = header.readUInt32LE(36);
      assert.equal(flags & (2 | 4 | 16 | 256 | 1024), 0, 'protected HWP is outside this survey');
      const rawDoc = Buffer.from(streamBytes(reader.findExact('/DocInfo')));
      const doc = flags & 1 ? inflateRawSync(rawDoc, {maxOutputLength: 64 * 1024 * 1024}) : rawDoc;
      const entries = [];
      const declared = {};
      for (const record of documentRecords(doc)) {
        if (record.tag !== 18) continue;
        const payload = doc.subarray(record.start, record.end);
        assert.ok(payload.length >= 6);
        const attr = payload.readUInt16LE(0);
        if ((attr & 15) !== 1) continue;
        const id = payload.readUInt16LE(2), units = payload.readUInt16LE(4);
        assert.ok(6 + units * 2 <= payload.length);
        const ext = payload.subarray(6, 6 + units * 2).toString('utf16le');
        declared[ext.toLowerCase()] = (declared[ext.toLowerCase()] ?? 0) + 1;
        if (ext.toLowerCase() !== 'png') continue;
        const path = `/BinData/BIN${id.toString(16).toUpperCase().padStart(4, '0')}.${ext}`;
        const entry = reader.findExact(path);
        assert.ok(entry && entry.type === 2, path);
        const stored = Buffer.from(streamBytes(entry));
        const compression = (attr >> 4) & 3;
        assert.notEqual(compression, 3);
        const bytes = compression === 1 || compression === 0 && (flags & 1)
          ? inflateRawSync(stored, {maxOutputLength: 64 * 1024 * 1024}) : stored;
        if (!bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) continue;
        const jpeg = jpegSequentialScans(bytes);
        assert.ok(jpeg.frame && !jpeg.deferred);
        const width = jpeg.frame.readUInt16BE(3), height = jpeg.height;
        assert.ok(width > 0 && height > 0);
        entries.push({path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width, height,
          rgbBytes: width * height * 3, scans: jpeg.scans.length, process: jpeg.code});
      }
      return {state: 'decoded', entries, declared};
    });
    assert.equal(observation.state, 'observed');
    results.push({file, fileBytes: source.length, fileSha256: sha256, declared: observation.evidence.declared, entries: observation.evidence.entries});
  }
  assert.deepEqual(results.map(({fileSha256, declared, entries}) => ({fileSha256, declared, entries: entries.map(({path, sha256, rgbBytes, scans, process}) => ({path, sha256, rgbBytes, scans, process}))})), [
    {fileSha256: 'c8b091cc9edf63433a7d21729d675f8fad7f68fc8f09d74b6c0f138fb91de46f', declared: {jpg: 1, bmp: 7, png: 2}, entries: [
      {path: '/BinData/BIN0003.png', sha256: '81959d609dffa4213a69ca08fa87d12b2d71e15232708a8f33b599bc4d0543f7', rgbBytes: 2_597_778, scans: 1, process: 192},
      {path: '/BinData/BIN0004.png', sha256: '51172b15820153be699a7512653f09b622d30b6fc3f47c501b690dcf5d408910', rgbBytes: 7_825_116, scans: 1, process: 192},
    ]},
    {fileSha256: '5ef5d5a3c48303122903a384744eba9a44c72e814c201c9908d4a92e990d0ffb', declared: {png: 2}, entries: [
      {path: '/BinData/BIN0002.PNG', sha256: 'abc7bd9bb0b79d114374be19c8e2b2e6a8c8239f9ec273a859d6e3eab069c3ab', rgbBytes: 41_772, scans: 1, process: 192},
    ]},
  ]);
  console.log(JSON.stringify(results, null, 2));
} finally {
  cfb.close();
}
