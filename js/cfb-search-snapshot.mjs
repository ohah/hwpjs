/** ABI v2 length-prefixed UTF-8 records; no case conversion or search rules here. */
export function encodeSnapshot(container) {
  const encoder = new TextEncoder();
  const parts = container.FileIndex.flatMap((entry, i) => [
    encoder.encode(entry.name),
    encoder.encode(container.FullPaths[i]),
  ]);
  const size = 4 + parts.reduce((total, part) => total + 4 + part.length, 0);
  if (size > 0xffffffff)
    throw new RangeError("Search snapshot exceeds ABI size");
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, container.FileIndex.length, true);
  let offset = 4;
  for (const part of parts) {
    view.setUint32(offset, part.length, true);
    offset += 4;
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
