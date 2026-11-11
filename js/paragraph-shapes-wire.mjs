/** HPS1/HPS2/HPS3/HPS4 resources; raw absence and effective heading levels stay distinct. */
export function decodeParagraphShapes(bytes) {
  const fail = () => {
    throw new Error('InvalidParagraphShapes');
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const magic = view.getUint32(0, true);
  const stride =
    magic === 0x31535048
      ? 48
      : magic === 0x32535048
        ? 72
        : magic === 0x33535048
          ? 76
          : magic === 0x34535048
            ? 92
            : 0;
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
    if (stride >= 72) {
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
    if (stride >= 76) {
      const marker = uint(72);
      if (
        marker > 0xffff ||
        (marker > 0 &&
          (shape.headingKind !== 3 ||
            shape.headingId === 0 ||
            marker <= 0x20 ||
            (marker >= 0x7f && marker <= 0x9f) ||
            (marker >= 0xd800 && marker <= 0xdfff)))
      )
        return fail();
      shape.headingMarker = marker || null;
    }
    if (stride === 92 && shape.headingMarker) {
      const width = int(80),
        distance = int(84);
      if (width < -32768 || width > 32767 || distance < -32768 || distance > 32767) return fail();
      shape.headingPlacement = {
        attributes: uint(76),
        width_adjustment: width,
        text_distance: distance,
        char_shape_id: uint(88),
      };
    }
    return shape;
  });
}
