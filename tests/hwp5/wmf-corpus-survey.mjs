// Optional read-only census of declared WMF BinData in the local HWP corpus.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {observeHwpFile, streamBytes} from './hwp-corpus-evidence.mjs';
import {inspectWmf} from './wmf-framing-evidence.mjs';

const roots = process.argv.slice(2);
const dirs = roots.length ? roots : ['legacy/rust/crates/hwp-core/tests/fixtures', 'reference/rhwp/samples'];
const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const states = {}, documentStates = {}, errors = {}, examples = {};
const knownItemErrors = new Set([
  'MissingBinDataStream', 'UnsupportedCompression', 'Z_DATA_ERROR',
  'TruncatedWmfHeader', 'InvalidWmfPlaceableReserved', 'InvalidWmfPlaceableChecksum',
  'UnsupportedWmfMetafileType', 'InvalidWmfHeaderSize', 'UnsupportedWmfVersion',
  'InvalidWmfSize', 'InvalidWmfPlaceableHandle', 'MissingWmfEof',
  'InvalidWmfRecordSize', 'TruncatedWmfRecord', 'InvalidWmfEofRecord',
  'DataAfterWmfEof', 'InvalidWmfMaxRecord',
]);
let files = 0, declaredWmf = 0, valid = 0, placeable = 0, records = 0, bytes = 0;

try {
  for (const root of dirs) for (const name of readdirSync(root, {recursive: true}).filter(x => /\.hwp$/i.test(x)).sort()) {
    files++;
    const file = join(root, name);
    const observation = observeHwpFile(cfb, readFileSync(file), reader => {
      const h = Buffer.from(streamBytes(reader.findExact('/FileHeader')));
      const flags = h.readUInt32LE(36);
      if (flags & (2 | 4 | 16 | 256 | 1024)) return {state: 'unsupported_security'};
      const storedDoc = Buffer.from(streamBytes(reader.findExact('/DocInfo')));
      const doc = flags & 1 ? inflateRawSync(storedDoc, {maxOutputLength: 64 * 1024 * 1024}) : storedDoc;
      for (const record of documentRecords(doc)) {
        if (record.tag !== 18) continue;
        const payload = doc.subarray(record.start, record.end);
        if (payload.length < 6) throw Error('TruncatedBinData');
        const attr = payload.readUInt16LE(0);
        if ((attr & 15) !== 1) continue;
        const id = payload.readUInt16LE(2), units = payload.readUInt16LE(4);
        if (6 + units * 2 > payload.length) throw Error('TruncatedBinData');
        const ext = payload.subarray(6, 6 + units * 2).toString('utf16le');
        if (ext.toLowerCase() !== 'wmf') continue;
        declaredWmf++;
        const path = `/BinData/BIN${id.toString(16).toUpperCase().padStart(4, '0')}.${ext}`;
        try {
          const entry = reader.findExact(path);
          if (!entry || entry.type !== 2) throw Error('MissingBinDataStream');
          const stored = Buffer.from(streamBytes(entry));
          const compression = (attr >> 4) & 3;
          if (compression === 3) throw Error('UnsupportedCompression');
          const data = compression === 1 || compression === 0 && (flags & 1)
            ? inflateRawSync(stored, {maxOutputLength: 64 * 1024 * 1024}) : stored;
          const result = inspectWmf(data);
          valid++;
          placeable += Number(result.placeable);
          records += result.records;
          bytes += data.length;
        } catch (error) {
          const kind = error.code === 'Z_DATA_ERROR' ? error.code : error.message;
          if (!knownItemErrors.has(kind)) throw error;
          errors[kind] = (errors[kind] ?? 0) + 1;
          examples[kind] ??= {file, path};
        }
      }
      return {state: 'decoded'};
    });
    states[observation.state] = (states[observation.state] ?? 0) + 1;
    if (observation.evidence?.state) documentStates[observation.evidence.state] = (documentStates[observation.evidence.state] ?? 0) + 1;
  }
  console.log(JSON.stringify({files, states, documentStates, declaredWmf, valid, placeable, records, bytes, errors, examples}, null, 2));
} finally {
  cfb.close();
}
