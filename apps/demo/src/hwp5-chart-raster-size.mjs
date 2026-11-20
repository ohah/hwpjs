import { hwpUnitPixels } from '../../../web/preview/hwp-units.mjs';

/** Pixel density only: document geometry is never rounded or changed. The
 * short edge uses the SDK's half-up nearest-pixel aspect rule. */
export function hwp5ChartRasterSize({ width, height }) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 0x7fffffff))
    throw Error('InvalidHwp5ChartRasterGeometry');
  const wide = width >= height,
    long = Math.max(width, height),
    short = Math.min(width, height);
  // At least 64 pixels on the short edge after half-up rounding. Work in
  // integers; all products are below Number.MAX_SAFE_INTEGER for HWP i32 sizes.
  const minimumLong = Math.max(64, Math.ceil((127 * long) / (2 * short)));
  if (minimumLong > 2048) throw Error('Hwp5ChartRasterAspectUnavailable');
  const longPixels = Math.max(minimumLong, Math.min(2048, Math.ceil(hwpUnitPixels(long))));
  const shortPixels = Math.floor((2 * longPixels * short + long) / (2 * long));
  if (shortPixels < 64 || shortPixels > 2048 || longPixels * shortPixels > 4 * 1024 * 1024)
    throw Error('ChartCreatePreviewPixelLimit');
  return Object.freeze(
    wide ? { width: longPixels, height: shortPixels } : { width: shortPixels, height: longPixels },
  );
}
