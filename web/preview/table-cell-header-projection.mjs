import { selectRepeatedTableHeader } from './table-repeated-header.mjs';
import { projectRepeatedTableHeaders } from './repeated-table-header-projection.mjs';

// Placements use the table's left edge before body/header prefix displacement.
export function projectCellTableHeaders(
  table,
  measured,
  placements,
  { origin, padding, firstTop = 0, maxRows = 20000 } = {},
) {
  const fail = (error) => ({ state: 'unavailable', error });
  const header = selectRepeatedTableHeader(table, measured?.grid?.rows);
  if (
    header.state !== 'selected' ||
    !Array.isArray(placements) ||
    !placements.length ||
    !Number.isFinite(firstTop) ||
    firstTop < 0
  )
    return fail('InvalidRepeatedTableHeader');
  const fragments = placements.map((row, index) => ({
    ...row,
    startRow: 0,
    endRow: header.endRow,
    offset: 0,
    height: header.height,
    cells: header.cells,
    y: row.y + (index === 0 ? firstTop : 0),
  }));
  const options = { origin, padding, maxRows };
  const canonical = projectRepeatedTableHeaders(table, measured, fragments.slice(0, 1), {
    ...options,
    canonical: true,
  });
  if (canonical.state !== 'placed') return canonical;
  const replay = projectRepeatedTableHeaders(table, measured, fragments.slice(1), {
    ...options,
    maxRows: maxRows - canonical.rows.length,
  });
  if (replay.state !== 'placed') return replay;
  return {
    ...canonical,
    repeatedTableHeaderRows: replay.rows,
    repeatedTableHeaderBoxes: replay.boxes,
  };
}
