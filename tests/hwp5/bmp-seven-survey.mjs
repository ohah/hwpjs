// Independent real-HWP BinData/BMP census and RGBA oracle. Local rhwp clone only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {crc32, inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {observeHwpFile, streamBytes} from './hwp-corpus-evidence.mjs';
import {bmpLayoutOracle, bmpPixelsOracle} from './bmp-oracle.mjs';

const file = 'reference/rhwp/samples/hwpx/hancom-hwp/hang_job_01.hwp';
const source = readFileSync(file);
const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
try {
  const observed = observeHwpFile(cfb, source, reader => {
    const header = Buffer.from(streamBytes(reader.findExact('/FileHeader')));
    const flags = header.readUInt32LE(36);
    assert.equal(flags & (2 | 4 | 16 | 256 | 1024), 0);
    const rawDoc = Buffer.from(streamBytes(reader.findExact('/DocInfo')));
    const doc = flags & 1 ? inflateRawSync(rawDoc, {maxOutputLength: 64 * 1024 * 1024}) : rawDoc;
    const entries = [];
    for (const record of documentRecords(doc)) {
      if (record.tag !== 18) continue;
      const payload = doc.subarray(record.start, record.end);
      assert.ok(payload.length >= 6);
      const attr = payload.readUInt16LE(0);
      if ((attr & 15) !== 1) continue;
      const id = payload.readUInt16LE(2), units = payload.readUInt16LE(4);
      assert.ok(6 + units * 2 <= payload.length);
      const ext = payload.subarray(6, 6 + units * 2).toString('utf16le');
      if (ext.toLowerCase() !== 'bmp') continue;
      const path = `/BinData/BIN${id.toString(16).toUpperCase().padStart(4, '0')}.${ext}`;
      const entry = reader.findExact(path);
      assert.ok(entry && entry.type === 2, path);
      const stored = Buffer.from(streamBytes(entry));
      const compression = (attr >> 4) & 3;
      assert.notEqual(compression, 3);
      const bytes = compression === 1 || compression === 0 && (flags & 1)
        ? inflateRawSync(stored, {maxOutputLength: 64 * 1024 * 1024}) : stored;
      const layout = bmpLayoutOracle(bytes), image = bmpPixelsOracle(bytes);
      assert.equal(bytes.readUInt32LE(14), 40);
      assert.equal(bytes.readUInt32LE(10), 54);
      assert.equal(image.readUInt32LE(8), layout.width * layout.height * 4);
      const highByte = {zero: 0, opaque: 0, other: 0};
      if (layout.bits === 32 && layout.compression === 0) for (let at = 3; at < layout.pixels.length; at += 4) {
        const value = layout.pixels[at];
        if (value === 0) highByte.zero++;
        else if (value === 255) highByte.opaque++;
        else highByte.other++;
      }
      assert.equal(highByte.zero + highByte.opaque + highByte.other, layout.width * layout.height);
      entries.push({path, encodedBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: layout.width,
        height: layout.height, bits: layout.bits, compression: layout.compression, rgbaBytes: image.readUInt32LE(8), rgbaCrc32: crc32(image.subarray(16)), highByte});
    }
    return {state: 'decoded', entries};
  });
  assert.equal(observed.state, 'observed');
  const entries = observed.evidence.entries;
  assert.equal(entries.length, 7);
  assert.equal(entries.reduce((sum, item) => sum + item.rgbaBytes, 0), 4_269_640);
  assert.deepEqual(entries.map(({highByte}) => highByte), [
    {zero: 0, opaque: 976_053, other: 1_995},
    {zero: 0, opaque: 10_368, other: 422},
    {zero: 0, opaque: 11_664, other: 472},
    {zero: 0, opaque: 16_879, other: 457},
    {zero: 0, opaque: 14_560, other: 350},
    {zero: 0, opaque: 19_314, other: 411},
    {zero: 0, opaque: 14_042, other: 423},
  ]);
  const fileSha256 = createHash('sha256').update(source).digest('hex');
  assert.equal(fileSha256, 'c8b091cc9edf63433a7d21729d675f8fad7f68fc8f09d74b6c0f138fb91de46f');
  assert.deepEqual(entries.map(({path, encodedBytes, rgbaBytes, rgbaCrc32, bits, compression}) => ({path, encodedBytes, rgbaBytes, rgbaCrc32, bits, compression})), [
    {path: '/BinData/BIN0002.bmp', encodedBytes: 3_912_246, rgbaBytes: 3_912_192, rgbaCrc32: 3_328_180_045, bits: 32, compression: 0},
    {path: '/BinData/BIN0005.bmp', encodedBytes: 43_214, rgbaBytes: 43_160, rgbaCrc32: 3_238_137_512, bits: 32, compression: 0},
    {path: '/BinData/BIN0006.bmp', encodedBytes: 48_598, rgbaBytes: 48_544, rgbaCrc32: 2_316_897_933, bits: 32, compression: 0},
    {path: '/BinData/BIN0007.bmp', encodedBytes: 69_398, rgbaBytes: 69_344, rgbaCrc32: 3_207_307_936, bits: 32, compression: 0},
    {path: '/BinData/BIN0008.bmp', encodedBytes: 59_694, rgbaBytes: 59_640, rgbaCrc32: 543_781_140, bits: 32, compression: 0},
    {path: '/BinData/BIN0009.bmp', encodedBytes: 78_954, rgbaBytes: 78_900, rgbaCrc32: 1_962_280_315, bits: 32, compression: 0},
    {path: '/BinData/BIN000A.bmp', encodedBytes: 57_914, rgbaBytes: 57_860, rgbaCrc32: 1_926_907_482, bits: 32, compression: 0},
  ]);
  console.log(JSON.stringify({file, fileBytes: source.length, fileSha256, entries}, null, 2));
} finally {
  cfb.close();
}
