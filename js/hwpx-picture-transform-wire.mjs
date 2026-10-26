export function decodePictureTransform(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureTransform");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true),
    flags = view.getUint32(12, true),
    angle = view.getUint32(16, true),
    identity = view.getUint32(20, true);
  if (
    view.getUint32(0, true) !== 0x31545048 ||
    count > 1024 ||
    bytes.length !== 24 + count * 56 ||
    flags & ~0x70f ||
    identity > 2 ||
    (!(flags & 8) && angle !== 0)
  )
    fail();
  const booleans = [0, 1, 2].map((index) => {
    const present = flags & (1 << index),
      value = Boolean(flags & (1 << (index + 8)));
    if (!present && value) fail();
    return present ? value : null;
  });
  const matrices = [];
  for (let index = 0; index < count; index++) {
    const at = 24 + index * 56,
      kind = view.getUint32(at, true),
      presence = view.getUint32(at + 4, true);
    if (kind > 2 || presence & ~63) fail();
    const values = Array.from({ length: 6 }, (_, field) => {
      const value = view.getFloat64(at + 8 + field * 8, true),
        present = presence & (1 << field);
      if (!present && value !== 0) fail();
      return present ? value : null;
    });
    matrices.push({ kind: ["translation", "scale", "rotation"][kind], values });
  }
  return {
    flip: booleans.slice(0, 2),
    reverse: booleans[2],
    angle: flags & 8 ? angle : null,
    identity: identity === 0 ? null : identity === 1,
    unknownMatrixNodes: view.getUint32(8, true),
    matrices,
  };
}
