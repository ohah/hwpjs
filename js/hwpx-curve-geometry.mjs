import { validShapeCommonSource } from './hwpx-shape-common-source.mjs';
import { validGroupContext } from './hwpx-group-context.mjs';
import { validDrawingTextValues } from './hwpx-drawing-text-values.mjs';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const coordinate = (value) =>
  value === null || (Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff);
export function decodeCurveGeometry(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    !object(value) ||
    value.sourceOnly !== true ||
    !uint(value.node) ||
    (Object.hasOwn(value, 'common') &&
      (!validShapeCommonSource(value.common) ||
        !validGroupContext(value.common.group_context, value.node))) ||
    (Object.hasOwn(value, 'text') &&
      value.text !== null &&
      !validDrawingTextValues(value.text, value.node)) ||
    !Array.isArray(value.segments) ||
    value.segments.length > 65536 ||
    !Array.from(value.segments).every(
      (segment) =>
        object(segment) &&
        (segment.kind === null ||
          (typeof segment.kind === 'string' &&
            new TextEncoder().encode(segment.kind).length <= 4096)) &&
        ['x1', 'y1', 'x2', 'y2'].every((key) => coordinate(segment[key])),
    )
  )
    throw new Error('InvalidCurveGeometry');
  return value;
}
