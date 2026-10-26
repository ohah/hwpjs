import { alignTableCellFlow } from './table-cell-vertical-alignment.mjs';

// Sorted mandatory cuts are in the same grid coordinate system as the cell.
export function cellCrossesMandatoryCut(top, bottom, cuts) {
  let low = 0,
    high = cuts.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (cuts[mid] <= top) low = mid + 1;
    else high = mid;
  }
  return low < cuts.length && cuts[low] < bottom;
}

// Content actually split across fragments flows from the top. An intact cell
// body in its first physical slice retains its source alignment in that slice.
export function alignCellFragmentFlow(flow, top, start, finish, insets) {
  if (flow.fragmentVerticalAlignment === undefined) return flow;
  if (![0, 1, 2].includes(flow.fragmentVerticalAlignment))
    throw Error('UnsupportedCellVerticalAlignment');
  if (
    ![top, start, finish, flow.height, insets?.top, insets?.bottom].every(Number.isFinite) ||
    start < top ||
    finish <= start ||
    flow.height < 0 ||
    insets.top < 0 ||
    insets.bottom < 0
  )
    throw Error('InvalidCellVerticalAlignment');
  if (start !== top || flow.height + insets.top + insets.bottom > finish - start) return flow;
  return alignTableCellFlow(flow, finish - start, insets, flow.fragmentVerticalAlignment);
}
