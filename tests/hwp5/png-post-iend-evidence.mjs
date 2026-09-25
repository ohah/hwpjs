// Independent PNG chunk/CRC boundary oracle. It does not decode IDAT pixels.
import {crc32} from 'node:zlib';

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function inspectPngBoundary(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 8 || !b.subarray(0, 8).equals(signature)) throw Error('InvalidPngSignature');
  let offset = 8, chunks = 0, idats = 0;
  for (;;) {
    if (offset + 12 > b.length) throw Error('MissingPngEnd');
    const length = b.readUInt32BE(offset);
    if (length > 0x7fffffff || length > 16 * 1024 * 1024) throw Error('InvalidPngChunkLength');
    if (length > b.length - offset - 12) throw Error('TruncatedPngChunk');
    const type = b.subarray(offset + 4, offset + 8);
    if (!type.every(c => c >= 65 && c <= 90 || c >= 97 && c <= 122)) throw Error('InvalidPngChunkType');
    const storedCrc = b.readUInt32BE(offset + 8 + length);
    if (storedCrc !== crc32(b.subarray(offset + 4, offset + 8 + length))) throw Error('InvalidPngChecksum');
    chunks++;
    if (chunks > 65536) throw Error('PngChunkLimit');
    const name = type.toString('ascii');
    if (chunks === 1 && name !== 'IHDR') throw Error('MissingPngHeader');
    if (name === 'IDAT') idats++;
    offset += 12 + length;
    if (name !== 'IEND') continue;
    if (length !== 0 || idats === 0) throw Error('InvalidPngEnd');
    const tail = b.subarray(offset);
    return {datastreamBytes: offset, tailBytes: tail.length, tailIsZero: tail.every(value => value === 0), chunks, idats};
  }
}
