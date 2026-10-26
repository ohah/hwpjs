export function decodePictureGeometry(bytes) {
  const fail = () => {
    throw new Error('InvalidPictureGeometry');
  };
  if (!(bytes instanceof Uint8Array) || bytes.length !== 48) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint32(4, true);
  if (view.getUint32(0, true) !== 0x31475048 || flags & ~127 || view.getUint32(28, true)) fail();
  const values = Array.from({ length: 5 }, (_, i) => view.getUint32(8 + i * 4, true));
  if (values[2] > 4 || values[3] > 2 || values[4] > 1) fail();
  const result = {};
  for (const [index, name] of [
    'width',
    'height',
    'widthRelative',
    'heightRelative',
    'treatAsCharacter',
  ].entries()) {
    if (!(flags & (1 << index)) && values[index] !== 0) fail();
    result[name] =
      flags & (1 << index) ? (index === 4 ? Boolean(values[index]) : values[index]) : null;
  }
  for (const [index, name] of ['horizontalOffset', 'verticalOffset'].entries()) {
    const value = view.getBigInt64(32 + index * 8, true),
      present = flags & (1 << (index + 5));
    if (value < -2147483648n || value > 4294967295n || (!present && value !== 0n)) fail();
    result[name] = present ? Number(value) : null;
  }
  return result;
}
