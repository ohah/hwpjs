/** HPS1 signed raw values; zero and absent modern spacing remain distinct. */
export function decodeParagraphShapes(bytes) {
  const fail = () => { throw new Error("InvalidParagraphShapes"); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 0x31535048 || count > 100000 || bytes.length !== 8 + count * 48) return fail();
  return Array.from({ length: count }, (_, index) => {
    const at = 8 + index * 48, uint = offset => view.getUint32(at + offset, true), int = offset => view.getInt32(at + offset, true);
    if (uint(0) !== index || uint(4) > 7 || uint(28) > 3 || uint(36) > 1 || (!uint(36) && (uint(40) !== 0 || int(44) !== 0))) return fail();
    return { id: index, alignment: uint(4), left: int(8), right: int(12), indent: int(16), before: int(20), after: int(24), legacySpacingKind: uint(28), legacySpacing: int(32), modernSpacing: uint(36) ? { attributes: uint(40), value: int(44) } : null };
  });
}
