import { validateCellBorder } from './cell-border-command.mjs';
import { tableCellRegion, completeTableRegionRequest } from './table-cell-region.mjs';

export function tableBorderPlan(table, request) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !completeTableRegionRequest(table, request) ||
    !['outer', 'inner', 'all'].includes(request.region)
  )
    return fail('CompleteOriginalTableRequired');
  let border;
  try {
    border = validateCellBorder({
      section: request.section,
      tableNode: request.tableNode,
      listNode: request.listNode,
      edges: 15,
      style: request.style,
      width: request.width,
      color: request.color,
    });
  } catch {
    return fail('InvalidCellBorder');
  }
  const region = tableCellRegion(table, request);
  if (region.state !== 'planned') return region;
  const cells = [],
    bounds = region.bounds;
  for (const cell of region.cells) {
    let outer = 0;
    if (cell.column === bounds.columnStart) outer |= 1;
    if (cell.column + cell.columnSpan === bounds.columnEnd) outer |= 2;
    if (cell.row === bounds.rowStart) outer |= 4;
    if (cell.row + cell.rowSpan === bounds.rowEnd) outer |= 8;
    const edges = request.region === 'all' ? 15 : request.region === 'outer' ? outer : 15 ^ outer;
    if (edges) cells.push(Object.freeze({ ...border, listNode: cell.listNode, edges }));
  }
  return { state: 'planned', cells: Object.freeze(cells), bounds };
}
