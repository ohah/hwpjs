import { placeFloatingComponentSource } from './component-placement.mjs';

/** Source rectangle only: does not establish a page, reserve flow or paint OLE. */
export function placeFloatingOleSource(source, boxes, options) {
  if (source?.transform_identity !== true)
    return {
      state: 'unavailable',
      error:
        source?.transform_identity === false
          ? 'UnsupportedOleTransform'
          : 'MissingOleTransformProof',
    };
  return placeFloatingComponentSource(source, boxes, options);
}
