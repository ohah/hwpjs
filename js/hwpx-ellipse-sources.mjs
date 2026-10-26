import { validShapeCommonSource as validCommon } from './hwpx-shape-common-source.mjs';
import { validGroupContext } from './hwpx-group-context.mjs';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const coordinate = (value) =>
  value === null || (Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff);
export function decodeEllipseSources(bytes) {
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const text = (value) =>
    value === null || (typeof value === 'string' && new TextEncoder().encode(value).length <= 4096);
  if (
    !Array.isArray(rows) ||
    rows.length > 100000 ||
    rows.some((row, index) => {
      const owner = row?.owner,
        geometry = row?.geometry;
      return (
        !object(row) ||
        row.sourceOnly !== true ||
        !uint(row.node) ||
        (index > 0 && row.node <= rows[index - 1].node) ||
        (Object.hasOwn(row, 'common') && !validCommon(row.common)) ||
        (row.common &&
          Object.hasOwn(row.common, 'group_context') &&
          !validGroupContext(row.common.group_context, row.node)) ||
        (row.common?.group_context &&
          row.common.group_context.root_anchor !== owner?.anchor_node) ||
        !object(owner) ||
        !['paragraph', 'anchor_node', 'anchor_unit'].every((key) => uint(owner[key])) ||
        owner.paragraph < 1 ||
        !object(geometry) ||
        !['interval_dirty', 'has_arc_properties', 'arc_type'].every((key) => text(geometry[key])) ||
        !Array.isArray(geometry.points) ||
        geometry.points.length !== 7 ||
        !Array.from(geometry.points).every(
          (point) =>
            point === null || (object(point) && coordinate(point.x) && coordinate(point.y)),
        )
      );
    })
  )
    throw new Error('InvalidEllipseSources');
  return rows;
}
