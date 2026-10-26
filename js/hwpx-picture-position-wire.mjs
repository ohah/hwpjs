export function decodePicturePosition(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 40)
    throw new Error("InvalidPicturePosition");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    presence = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 0x31505048 || presence & ~255)
    throw new Error("InvalidPicturePosition");
  const maxima = [1, 1, 1, 1, 2, 3, 4, 4];
  const fields = maxima.map((maximum, index) => {
    const value = view.getUint32(8 + index * 4, true),
      present = Boolean(presence & (1 << index));
    if (value > maximum || (!present && value !== 0)) throw new Error("InvalidPicturePosition");
    return present ? (index < 4 ? Boolean(value) : value) : null;
  });
  return { flags: fields.slice(0, 4), relations: fields.slice(4) };
}
