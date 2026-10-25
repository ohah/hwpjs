import { createPcxDecoder } from "../../js/pcx-decoder.mjs";
// Sniff only a PCX RLE candidate; all structural/palette/run rules remain native.
export function createPictureBitmapDecoder(module, { native = createPcxDecoder, bitmap = value => createImageBitmap(value), imageData = (rgba, width, height) => new ImageData(rgba, width, height) } = {}) {
  let pcx, pending = Promise.resolve();
  return async bytes => {
    if (!(bytes instanceof Uint8Array)) throw new Error("InvalidPictureBytes");
    if (bytes.length < 3 || bytes[0] !== 0x0a || bytes[2] !== 1) return bitmap(new Blob([bytes]));
    const result = pending.then(async () => {
      pcx ??= native(module);
      const decoded = (await pcx).decode(bytes);
      return bitmap(imageData(decoded.rgba, decoded.width, decoded.height));
    });
    pending = result.then(() => {}, () => {});
    return result;
  };
}
