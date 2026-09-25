// Independent, bounded framing oracle for local WMF corpus observations.
export function inspectWmf(bytes) {
  const b = Buffer.from(bytes);
  const placeable = b.length >= 4 && b.readUInt32LE(0) === 0x9ac6cdd7;
  const start = placeable ? 22 : 0;
  if (b.length < start + 24) throw Error('TruncatedWmfHeader');
  if (placeable) {
    if (b.readUInt32LE(16) !== 0) throw Error('InvalidWmfPlaceableReserved');
    let checksum = 0;
    for (let i = 0; i < 10; i++) checksum ^= b.readUInt16LE(i * 2);
    if (checksum !== b.readUInt16LE(20)) throw Error('InvalidWmfPlaceableChecksum');
  }
  const type = b.readUInt16LE(start);
  if (type !== 1 && type !== 2) throw Error('UnsupportedWmfMetafileType');
  if (b.readUInt16LE(start + 2) !== 9) throw Error('InvalidWmfHeaderSize');
  const version = b.readUInt16LE(start + 4);
  if (version !== 0x100 && version !== 0x300) throw Error('UnsupportedWmfVersion');
  if (b.readUInt32LE(start + 6) * 2 !== b.length - start || b.length % 2) throw Error('InvalidWmfSize');
  if (placeable && type === 2 && b.readUInt16LE(4) !== 0) throw Error('InvalidWmfPlaceableHandle');
  let offset = start + 18, records = 0, maxRecord = 0;
  for (;;) {
    if (offset + 6 > b.length) throw Error('MissingWmfEof');
    const words = b.readUInt32LE(offset);
    if (words < 3) throw Error('InvalidWmfRecordSize');
    if (words * 2 > b.length - offset) throw Error('TruncatedWmfRecord');
    const fn = b.readUInt16LE(offset + 4);
    offset += words * 2;
    records++;
    maxRecord = Math.max(maxRecord, words);
    if (fn !== 0) continue;
    if (words !== 3) throw Error('InvalidWmfEofRecord');
    if (offset !== b.length) throw Error('DataAfterWmfEof');
    break;
  }
  if (maxRecord !== b.readUInt32LE(start + 12)) throw Error('InvalidWmfMaxRecord');
  return {placeable, records, maxRecord};
}
