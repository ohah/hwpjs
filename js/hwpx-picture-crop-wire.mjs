export function decodePictureCrop(bytes) {
  const fail = () => {
    throw new Error("InvalidPictureCrop");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length !== 48) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    flags = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 0x31435048 || flags & ~63) fail();
  const clip = [];
  for (let index = 0; index < 4; index++) {
    const value = view.getBigInt64(8 + index * 8, true),
      present = flags & (1 << index);
    if (value < -2147483648n || value > 4294967295n || (!present && value !== 0n)) fail();
    clip.push(present ? Number(value) : null);
  }
  const imageDimensions = [];
  for (let index = 0; index < 2; index++) {
    const value = view.getUint32(40 + index * 4, true),
      present = flags & (1 << (index + 4));
    if (!present && value !== 0) fail();
    imageDimensions.push(present ? value : null);
  }
  return { clip, imageDimensions };
}
