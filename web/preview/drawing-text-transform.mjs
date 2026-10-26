import { drawingQuadGeometry } from './drawing-quad-geometry.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

// Map original text coordinates to the already-composed drawing corners.
export function drawingTextTransform(source, origin) {
  const fail = (error) => ({ state: 'unavailable', error }),
    points = source?.rectangle?.points;
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    !Array.from(points).every(
      (p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite),
    )
  )
    return fail('MissingDrawingLocalRectangle');
  const [a, b, c, d] = points;
  if (
    a[0] !== 0 ||
    a[1] !== 0 ||
    b[1] !== 0 ||
    d[0] !== 0 ||
    b[0] !== c[0] ||
    c[1] !== d[1] ||
    b[0] <= 0 ||
    d[1] <= 0
  )
    return fail('UnsupportedDrawingLocalRectangle');
  if (
    source.rendering?.reverse !== null ||
    !Array.isArray(source.rendering?.flip) ||
    source.rendering.flip.length !== 2 ||
    !Array.from(source.rendering.flip).every((v) => v === false)
  )
    return fail('UnsupportedDrawingTextFlip');
  const geometry = drawingQuadGeometry(source, origin);
  if (geometry.state !== 'mapped') return fail(geometry.state);
  const width = hwpUnitPixels(b[0]),
    height = hwpUnitPixels(d[1]);
  const [ma, mb, mc, md, me, mf] = geometry.matrix;
  const transform = [ma / width, mb / width, mc / height, md / height, me, mf];
  if (![width, height, ...transform].every(Number.isFinite) || width <= 0 || height <= 0)
    return fail('InvalidDrawingTextTransform');
  return { state: 'mapped', width, height, transform };
}
