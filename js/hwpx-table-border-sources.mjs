/** 원본 셀/리소스의 분리된 wire 검증이며 테두리 표시 정책은 아닙니다. */
import { decodeFillBrushes } from './hwpx-fill-brushes.mjs';
export function decodeTableBorderSources(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const fail = () => {
    throw new Error('InvalidTableBorderSources');
  };
  const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const optionalUint = (v) => v === null || uint(v);
  const text = (v) => v === null || (typeof v === 'string' && v.length <= 4096);
  const edge = (v) =>
    v === null || (v && !Array.isArray(v) && ['style', 'width', 'color'].every((k) => text(v[k])));
  if (
    !value ||
    value.sourceOnly !== true ||
    !Array.isArray(value.cells) ||
    !Array.isArray(value.styles) ||
    value.cells.length > 100000 ||
    value.styles.length > 4096
  )
    fail();
  const ids = new Set(),
    nodes = new Set();
  for (const style of value.styles) {
    if (
      !style ||
      !uint(style.id) ||
      !uint(style.node) ||
      ids.has(style.id) ||
      nodes.has(style.node) ||
      !Array.isArray(style.edges) ||
      style.edges.length !== 4 ||
      !style.edges.every(edge) ||
      !edge(style.diagonal) ||
      !['slash', 'back_slash', 'three_d', 'shadow', 'center_line'].every((k) => text(style[k])) ||
      !['slash_node', 'back_slash_node', 'fill_node'].every((k) => optionalUint(style[k])) ||
      !uint(style.unknown_children) ||
      (style.unknown_attributes !== undefined && !uint(style.unknown_attributes))
    )
      fail();
    ids.add(style.id);
    nodes.add(style.node);
    if (style.fill_report !== undefined && style.fill_report !== null) {
      const report = decodeFillBrushes(new TextEncoder().encode(JSON.stringify(style.fill_report)));
      if (
        report.brushes.length !== 1 ||
        report.brushes[0].part_kind !== 'header' ||
        report.brushes[0].section_ordinal !== null ||
        report.brushes[0].element_index !== style.fill_node ||
        report.brushes[0].parent_element_index !== style.node
      )
        fail();
    }
  }
  let previous = -1;
  const lists = new Set();
  for (const cell of value.cells) {
    if (
      !cell ||
      !uint(cell.table_node) ||
      !uint(cell.cell_node) ||
      cell.cell_node <= previous ||
      cell.table_node >= cell.cell_node ||
      !uint(cell.list_node) ||
      cell.list_node <= cell.cell_node ||
      lists.has(cell.list_node) ||
      !optionalUint(cell.border_fill_id) ||
      !optionalUint(cell.style_index) ||
      (cell.border_fill_id === null) !== (cell.style_index === null) ||
      (cell.style_index !== null && value.styles[cell.style_index]?.id !== cell.border_fill_id)
    )
      fail();
    previous = cell.cell_node;
    lists.add(cell.list_node);
  }
  return value;
}
