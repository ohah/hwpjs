// Optional read-only census of declared PNG BinData in the local HWP corpus.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {observeHwpFile, streamBytes} from './hwp-corpus-evidence.mjs';
import {inspectPngBoundary} from './png-post-iend-evidence.mjs';

const roots = process.argv.slice(2);
const dirs = roots.length ? roots : ['legacy/rust/crates/hwp-core/tests/fixtures', 'reference/rhwp/samples'];
const cfb = await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const states = {}, documentStates = {}, errors = {}, examples = {}, tailSizes = {};
const failureItems = [];
const knownErrors = new Set(['MissingBinDataStream', 'UnsupportedCompression', 'Z_DATA_ERROR',
  'InvalidPngSignature', 'MissingPngEnd', 'InvalidPngChunkLength', 'TruncatedPngChunk',
  'InvalidPngChunkType', 'InvalidPngChecksum', 'PngChunkLimit', 'MissingPngHeader', 'InvalidPngEnd']);
let files = 0, declaredPng = 0, exact = 0, zeroTail = 0, zeroTailBytes = 0, nonzeroTail = 0;

try {
  for (const root of dirs) for (const name of readdirSync(root, {recursive: true}).filter(x => /\.hwp$/i.test(x)).sort()) {
    files++;
    const file = join(root, name);
    const observation = observeHwpFile(cfb, readFileSync(file), reader => {
      const header = Buffer.from(streamBytes(reader.findExact('/FileHeader')));
      const flags = header.readUInt32LE(36);
      if (flags & (2 | 4 | 16 | 256 | 1024)) return {state: 'unsupported_security'};
      const rawDoc = Buffer.from(streamBytes(reader.findExact('/DocInfo')));
      const doc = flags & 1 ? inflateRawSync(rawDoc, {maxOutputLength: 64 * 1024 * 1024}) : rawDoc;
      for (const record of documentRecords(doc)) {
        if (record.tag !== 18) continue;
        const payload = doc.subarray(record.start, record.end);
        if (payload.length < 6) throw Error('TruncatedBinData');
        const attr = payload.readUInt16LE(0);
        if ((attr & 15) !== 1) continue;
        const id = payload.readUInt16LE(2), units = payload.readUInt16LE(4);
        if (6 + units * 2 > payload.length) throw Error('TruncatedBinData');
        const ext = payload.subarray(6, 6 + units * 2).toString('utf16le');
        if (ext.toLowerCase() !== 'png') continue;
        declaredPng++;
        const path = `/BinData/BIN${id.toString(16).toUpperCase().padStart(4, '0')}.${ext}`;
        let decodedLength = null, decodedPrefix = null;
        try {
          const entry = reader.findExact(path);
          if (!entry || entry.type !== 2) throw Error('MissingBinDataStream');
          const stored = Buffer.from(streamBytes(entry));
          const compression = (attr >> 4) & 3;
          if (compression === 3) throw Error('UnsupportedCompression');
          const data = compression === 1 || compression === 0 && (flags & 1)
            ? inflateRawSync(stored, {maxOutputLength: 64 * 1024 * 1024}) : stored;
          decodedLength = data.length;
          decodedPrefix = data.subarray(0, 16).toString('hex');
          const boundary = inspectPngBoundary(data);
          if (boundary.tailBytes === 0) exact++;
          else {
            const kind = boundary.tailIsZero ? 'zero' : 'nonzero';
            if (boundary.tailIsZero) {
              zeroTail++;
              zeroTailBytes += boundary.tailBytes;
            } else nonzeroTail++;
            tailSizes[boundary.tailBytes] = (tailSizes[boundary.tailBytes] ?? 0) + 1;
            examples[kind] ??= {file, path, ...boundary};
          }
        } catch (error) {
          const kind = error.code === 'Z_DATA_ERROR' ? error.code : error.message;
          if (!knownErrors.has(kind)) throw error;
          errors[kind] = (errors[kind] ?? 0) + 1;
          examples[kind] ??= {file, path};
          failureItems.push({file, path, kind, decodedLength, decodedPrefix});
        }
      }
      return {state: 'decoded'};
    });
    states[observation.state] = (states[observation.state] ?? 0) + 1;
    if (observation.evidence?.state) documentStates[observation.evidence.state] = (documentStates[observation.evidence.state] ?? 0) + 1;
  }
  console.log(JSON.stringify({files, states, documentStates, declaredPng, exact, zeroTail, zeroTailBytes, nonzeroTail, tailSizes, errors, examples, failureItems}, null, 2));
} finally {
  cfb.close();
}
