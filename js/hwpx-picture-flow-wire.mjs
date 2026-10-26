export function decodePictureFlow(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 56) throw new Error("InvalidPictureFlow");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    presence = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 0x31465048 || presence & ~127)
    throw new Error("InvalidPictureFlow");
  const fields = Array.from({ length: 7 }, (_, index) => {
    const value =
      index < 2
        ? view.getUint32(8 + index * 4, true)
        : Number(view.getBigInt64(16 + (index - 2) * 8, true));
    const present = Boolean(presence & (1 << index));
    if (index < 2 ? value > [5, 3][index] : value < -2147483648 || value > 4294967295)
      throw new Error("InvalidPictureFlow");
    if (!present && value !== 0) throw new Error("InvalidPictureFlow");
    return present ? value : null;
  });
  return {
    textWrap: fields[0],
    textFlow: fields[1],
    zOrder: fields[2],
    outsideMargins: fields.slice(3),
  };
}
