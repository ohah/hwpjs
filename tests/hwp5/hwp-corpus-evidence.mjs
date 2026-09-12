import {createHash} from 'node:crypto';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function streamBytes(entry) {
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
export function observeHwpFile(cfb, bytes, observe) {
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
    return {state:'observed',version:raw.readUInt32LE(32),flags:raw.readUInt32LE(36),evidence:observe(cfb)};
  } finally { cfb.close(); }
}
