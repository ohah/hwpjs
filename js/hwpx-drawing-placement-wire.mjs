import { decodePictureGeometry } from './hwpx-picture-geometry-wire.mjs';
import { decodePicturePosition } from './hwpx-picture-position-wire.mjs';
import { decodePictureFlow } from './hwpx-picture-flow-wire.mjs';
export function decodeDrawingPlacement(bytes, errorName = 'InvalidDrawingPlacement') {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 144) throw new Error(errorName);
  return {
    geometry: decodePictureGeometry(bytes.subarray(0, 48)),
    position: decodePicturePosition(bytes.subarray(48, 88)),
    flow: decodePictureFlow(bytes.subarray(88, 144)),
  };
}
