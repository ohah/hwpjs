export function decodeFieldTargets(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) throw new Error("InvalidFieldTargets");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  if (count > 4096 || bytes.length !== 4 + count * 12) throw new Error("InvalidFieldTargets");
  return Array.from({ length: count }, (_, index) => {
    const offset = 4 + index * 12;
    const target = { beginElement: view.getUint32(offset, true), start: view.getUint32(offset + 4, true), end: view.getUint32(offset + 8, true) };
    if (target.end < target.start) throw new Error("InvalidFieldTargets");
    return target;
  });
}
