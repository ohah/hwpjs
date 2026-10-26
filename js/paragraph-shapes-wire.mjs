/** HPS1/HPS2 resources; raw absence and effective heading levels stay distinct. */
export function decodeParagraphShapes(bytes) {
  const fail = () => {
    throw new Error("InvalidParagraphShapes");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const magic = view.getUint32(0, true);
  const stride = magic === 0x31535048 ? 48 : magic === 0x32535048 ? 72 : 0;
  if (!stride || count > 100000 || bytes.length !== 8 + count * stride) return fail();
  return Array.from({ length: count }, (_, index) => {
    const at = 8 + index * stride,
      uint = (offset) => view.getUint32(at + offset, true),
      int = (offset) => view.getInt32(at + offset, true);
    if (
      uint(0) !== index ||
      uint(4) > 7 ||
      uint(28) > 3 ||
      uint(36) > 1 ||
      (!uint(36) && (uint(40) !== 0 || int(44) !== 0))
    )
      return fail();
    const shape = {
      id: index,
      alignment: uint(4),
      left: int(8),
      right: int(12),
      indent: int(16),
      before: int(20),
      after: int(24),
      legacySpacingKind: uint(28),
      legacySpacing: int(32),
      modernSpacing: uint(36) ? { attributes: uint(40), value: int(44) } : null,
    };
    if (stride === 72) {
      if (
        uint(48) > 3 ||
        uint(52) > 65535 ||
        uint(56) > 7 ||
        uint(60) > 1 ||
        (!uint(60) && uint(64) !== 0) ||
        uint(68) !== (uint(60) ? uint(64) : uint(56))
      )
        return fail();
      Object.assign(shape, {
        headingKind: uint(48),
        headingId: uint(52),
        packedHeadingLevel: uint(56),
        extendedHeadingLevel: uint(60) ? uint(64) : null,
        headingLevel: uint(68),
      });
    }
    return shape;
  });
}
