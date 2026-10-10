/** HCS1 read-only resources; signed native height, not CSS pixels. */
export function decodeCharacterShapes(bytes) {
  const fail = () => { throw new Error("InvalidCharacterShapes"); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x31534348) return fail();
  const count = view.getUint32(4, true);
  if (count > 1000000 || bytes.length !== 8 + count * 12) return fail();
  let previous = -1;
  return Array.from({ length: count }, (_, index) => {
    const offset = 8 + index * 12, id = view.getUint32(offset, true), rawHeight = view.getInt32(offset + 4, true), flags = view.getUint32(offset + 8, true);
    if (id <= previous || flags > 7 || (!(flags & 1) && rawHeight !== 0)) return fail();
    previous = id;
    return { id, height: flags & 1 ? rawHeight : null, bold: Boolean(flags & 2), italic: Boolean(flags & 4) };
  });
}

export function decodeCharacterRanges(bytes) {
  const fail = () => { throw new Error("InvalidCharacterRanges"); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x31524348) return fail();
  const count = view.getUint32(4, true);
  if (count > 1000000 || bytes.length !== 8 + count * 16) return fail();
  let cursor = 0;
  return Array.from({ length: count }, (_, index) => {
    const offset = 8 + index * 16, start = view.getUint32(offset, true), end = view.getUint32(offset + 4, true), id = view.getUint32(offset + 8, true), flags = view.getUint32(offset + 12, true);
    if (start !== cursor || end < start || flags > 1 || (flags === 0 && id !== 0)) return fail();
    cursor = end;
    return { start, end, charShapeId: flags ? id : null };
  });
}
