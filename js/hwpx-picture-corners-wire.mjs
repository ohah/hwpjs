export function decodePictureRenderingCorners(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 72) throw new Error("InvalidPictureRenderingCorners");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x314b5048 || view.getUint32(4, true) !== 0) throw new Error("InvalidPictureRenderingCorners");
  return Array.from({ length: 4 }, (_, index) => Array.from({ length: 2 }, (_, coordinate) => {
    const number = view.getFloat64(8 + (index * 2 + coordinate) * 8, true);
    if (!Number.isFinite(number)) throw new Error("InvalidPictureRenderingCorners");
    return number;
  }));
}
