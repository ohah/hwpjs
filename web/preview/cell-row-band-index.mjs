import { tableCellBand } from './table-cell-band.mjs';

const unavailable = (error) => ({ state: 'unavailable', error });

/**
 * Immutable geometry snapshot borrowing row identities, never modifying rows.
 * Rebuild after any coordinate/extent change, including caller frame alignment;
 * differently aligned fragment flows require separate indexes.
 * select returns closed-interval intersection candidates in original row order.
 * Boundary rows and zero-advance points are intentional; the caller owns actual
 * fragment inclusion. No epsilon is applied to either endpoint.
 * Preparation inspections count source rows (not sorting comparisons). Query
 * inspections count both binary-search probes and every scanned candidate,
 * including rejected ones; output-order sorting is not a geometry inspection.
 * Queries cost O(log n + k + m log m), where k is the bounded scan and m matches.
 * Long overlapping bands can still require a full scan; counts expose that cost.
 */
export function createCellRowBandIndex(rows, offset = 0) {
  if (!Array.isArray(rows) || !Number.isFinite(offset))
    return unavailable('InvalidCellRowBandIndex');
  const bands = [];
  for (let order = 0; order < rows.length; order++) {
    const row = rows[order];
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      !Number.isFinite(row.y) ||
      row.y < 0 ||
      !Number.isFinite(row.height) ||
      row.height < 0
    )
      return unavailable('InvalidCellRowBandIndex');
    const { start, end } = tableCellBand(offset, row);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      return unavailable('InvalidCellRowBandIndex');
    bands.push({ start, end, row, order });
  }
  bands.sort((a, b) => a.start - b.start || a.order - b.order);
  const prefixMaxEnd = [];
  let maximum = -Infinity;
  for (const band of bands) prefixMaxEnd.push((maximum = Math.max(maximum, band.end)));

  return Object.freeze({
    state: 'prepared',
    inspections: bands.length,
    select(start, end) {
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
        return unavailable('InvalidCellRowBandQuery');
      let inspections = 0,
        low = 0,
        high = bands.length;
      // First start strictly beyond the closed query end.
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        inspections++;
        if (bands[middle].start <= end) low = middle + 1;
        else high = middle;
      }
      const finish = low;
      low = 0;
      high = bands.length;
      // First prefix capable of reaching the closed query start.
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        inspections++;
        if (prefixMaxEnd[middle] < start) low = middle + 1;
        else high = middle;
      }
      const selected = [];
      for (let index = low; index < finish; index++) {
        inspections++;
        if (bands[index].end >= start) selected.push(bands[index]);
      }
      selected.sort((a, b) => a.order - b.order);
      return { state: 'selected', rows: selected.map((band) => band.row), inspections };
    },
  });
}
