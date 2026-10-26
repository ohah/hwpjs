import { countedPointLayoutArg } from './hwp5-counted-point-layout.mjs';
export const curveLayoutArg = (layout) => countedPointLayoutArg(layout, 'InvalidCurvePointLayout');
export function validateHwp5DrawingCurvePoints(rows) {
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const signed = (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
  const fail = () => {
    throw new Error('InvalidHwp5DrawingCurvePoints');
  };
  if (!Array.isArray(rows) || rows.length > 1_000_000) fail();
  const owners = new Set();
  for (const [i, r] of rows.entries()) {
    if (
      !r ||
      !uint(r.component_node) ||
      !uint(r.curve_node) ||
      r.component_node >= r.curve_node ||
      owners.has(r.component_node) ||
      (i > 0 && r.curve_node <= rows[i - 1].curve_node) ||
      !uint(r.extra_bytes) ||
      !Array.isArray(r.raw_points) ||
      r.raw_points.length > 1_000_000 ||
      !Array.from(r.raw_points).every(
        (p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(signed),
      ) ||
      !Array.isArray(r.segments) ||
      r.segments.length !== Math.max(0, r.raw_points.length - 1) ||
      !Array.from(r.segments).every((v) => uint(v) && v <= 255)
    )
      fail();
    owners.add(r.component_node);
  }
  return rows;
}
export function decodeHwp5DrawingCurvePoints(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024)
    throw new Error('InvalidHwp5DrawingCurvePoints');
  return validateHwp5DrawingCurvePoints(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
