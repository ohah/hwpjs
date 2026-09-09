// Read-only corpus evidence, NOT image decoding or HWP document validation.
import {createHash} from 'node:crypto';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const signatures = [
  ['gif87a', Buffer.from('GIF87a')],
  ['gif89a', Buffer.from('GIF89a')],
  ['png', Buffer.from([137,80,78,71,13,10,26,10])],
  ['jpeg', Buffer.from([255,216])],
  ['bmp', Buffer.from('BM')],
];
export function imageSignature(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('ExpectedImageBytes');
  if (!bytes.length) return 'empty';
  return signatures.find(([,prefix]) => bytes.length >= prefix.length && prefix.every((n,i) => bytes[i] === n))?.[0] ?? 'unknown';
}

export function previewImageEvidence(cfb) {
  const entry = cfb.findExact('/PrvImage');
  if (entry == null) return {state:'absent'};
  if (entry.type !== 2) return {state:'invalid_kind',kind:entry.type};
  // A malformed host snapshot is an execution error, not an unknown image.
  const bytes = streamBytes(entry);
  return {state:'stream',bytes:bytes.length,contentPresent:Object.hasOwn(entry,'content'),sha256:digest(bytes),signature:imageSignature(bytes),imageValidated:false};
}

function streamBytes(entry) {
  // The legacy-shaped CFB API can omit content for a valid zero-sized stream.
  // Preserve that observation separately; never substitute empty for nonempty data.
  if (!Object.hasOwn(entry,'content') && entry.size === 0) return Buffer.alloc(0);
  if (!(entry.content instanceof Uint8Array)) throw new TypeError('MissingStreamBytes');
  if (entry.size !== undefined && entry.size !== entry.content.length) throw new Error('StreamSizeMismatch');
  return entry.content;
}

// Only errors already observed from strict CFB are classified as corpus rejection.
// New errors need investigation; traps and JS bugs must terminate the survey.
const knownCfbErrors = new Set(['InvalidFat','InvalidUnusedEntry','InvalidRoot']);
export function observePreviewFile(cfb, bytes) {
  const container = Buffer.from([208,207,17,224,161,177,26,225]);
  if (bytes.length < container.length || !container.every((n,i) => bytes[i] === n)) return {state:'non_cfb'};
  try {
    // The public adapter preserves input representation. Request Node Buffers
    // explicitly so Uint8Array writer output and filesystem input agree here.
    try { cfb.parse(Buffer.from(bytes),{strict:true}); }
    catch (error) {
      if (error.constructor !== Error || !knownCfbErrors.has(error.message)) throw error;
      return {state:'cfb_rejected',error:error.message};
    }
    const header = cfb.findExact('/FileHeader');
    if (!header || header.type !== 2) return {state:'unidentified_header'};
    const raw = Buffer.from(streamBytes(header));
    // Fingerprint only: the product Header.parse owns full header validation.
    if (raw.length < 40 || !raw.subarray(0,17).equals(Buffer.from('HWP Document File')) || raw[35] !== 5) return {state:'unidentified_header'};
    return {state:'observed',version:raw.readUInt32LE(32),flags:raw.readUInt32LE(36),preview:previewImageEvidence(cfb)};
  } finally { cfb.close(); }
}

export function summarizePreviewEvidence(rows) {
  const totals = {files:rows.length,uniqueFiles:new Set(rows.map(r=>r.sha256)).size,states:{},previews:{},signatures:{},versions:{},flaggedFiles:0,uniquePreviewStreams:0};
  const previews = new Set();
  for (const {result:r} of rows) {
    totals.states[r.state] = (totals.states[r.state] ?? 0) + 1;
    if (r.state !== 'observed') continue;
    const version = r.version.toString(16);
    totals.versions[version] = (totals.versions[version] ?? 0) + 1;
    if (r.flags & (2|4|16|256|1024)) totals.flaggedFiles++;
    const p = r.preview;
    totals.previews[p.state] = (totals.previews[p.state] ?? 0) + 1;
    if (p.state !== 'stream') continue;
    previews.add(p.sha256);
    const s = totals.signatures[p.signature] ??= {files:0,bytes:0,minBytes:p.bytes,maxBytes:p.bytes};
    s.files++; s.bytes += p.bytes; s.minBytes = Math.min(s.minBytes,p.bytes); s.maxBytes = Math.max(s.maxBytes,p.bytes);
  }
  totals.uniquePreviewStreams = previews.size;
  return totals;
}
