// Read-only corpus evidence, NOT image decoding or HWP document validation.
import {digest,streamBytes,observeHwpFile} from './hwp-corpus-evidence.mjs';
export {digest} from './hwp-corpus-evidence.mjs';
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

export function observePreviewFile(cfb, bytes) {
  const result=observeHwpFile(cfb,bytes,previewImageEvidence);
  if(result.state!=='observed')return result;
  const {evidence,...header}=result;
  return {...header,preview:evidence};
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
