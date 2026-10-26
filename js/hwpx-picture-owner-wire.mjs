export function decodePictureOwner(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new Error('InvalidPictureOwner');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x314f5048 || view.getUint32(4, true) === 0)
    throw new Error('InvalidPictureOwner');
  return {
    paragraph: view.getUint32(4, true),
    anchorNode: view.getUint32(8, true),
    anchorUnit: view.getUint32(12, true),
  };
}
