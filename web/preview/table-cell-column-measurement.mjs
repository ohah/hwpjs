import { columnReferenceBoxes } from './column-reference-boxes.mjs';
import { layoutContent } from './layout.mjs';

// 셀 내부 측정 높이만 결정합니다. 본문 페이지와 표 행 높이는 호출자가 소유합니다.
export function measureTableCellColumns(
  paragraphs,
  declaration,
  width,
  minimumHeight,
  measure,
  maxRows,
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (!Number.isFinite(minimumHeight) || minimumHeight < 0 || !Array.isArray(paragraphs))
    return unavailable('InvalidTableCellColumns');
  if (declaration?.same_size !== true || declaration.kind !== 'newspaper')
    return unavailable('UnsupportedTableCellColumns');
  const geometry = columnReferenceBoxes(
    { x: 0, y: 0, width, height: Math.max(1, minimumHeight) },
    declaration,
  );
  if (geometry.state !== 'placed') return geometry;
  const measured = layoutContent(
    { paragraphs, limited: false },
    geometry.boxes[0].width,
    measure,
    maxRows,
    { documentBody: true, includeTerminalAfter: false },
  );
  if (measured.limited) return unavailable('TableCellMeasurementLimit');
  if (
    !measured.rows.length ||
    measured.rows.some((row) => !Number.isFinite(row.height) || row.height <= 0)
  )
    return unavailable('InvalidTableCellColumns');
  const total = measured.rows.reduce((sum, row) => sum + row.height, 0);
  if (!Number.isFinite(total)) return unavailable('InvalidTableCellColumns');
  const pack = (height) => {
    let column = 0,
      y = 0;
    const rows = [];
    for (const row of measured.rows) {
      if (y + row.height > height) {
        column++;
        y = 0;
      }
      if (column >= geometry.boxes.length || row.height > height) return null;
      rows.push({ ...row, x: geometry.boxes[column].x, y, columnOrdinal: column });
      y += row.height;
    }
    return rows;
  };
  const tallest = measured.rows.reduce((height, row) => Math.max(height, row.height), 0);
  let low = Math.max(minimumHeight, total / geometry.boxes.length, tallest);
  let high = Math.max(minimumHeight, total),
    rows = pack(low);
  if (rows) high = low;
  else {
    for (let iteration = 0; iteration < 48; iteration++) {
      const middle = low + (high - low) / 2;
      if (pack(middle)) high = middle;
      else low = middle;
    }
    rows = pack(high);
  }
  if (!rows) return unavailable('TableCellColumnPackingFailed');
  return {
    ...measured,
    state: 'measured',
    rows,
    height: high,
    spatialRows: true,
    columns: geometry.boxes.map((box) => ({ ...box, height: high })),
  };
}
