import { sourceTableCellInsets } from './table-source-insets.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

/** Bounded geometry/policy diagnostics; never retain text, flows or source objects. */
export function tableHeightEvidence(entry) {
  if (
    !entry?.table ||
    entry.measured?.state !== 'measured' ||
    !(entry.measured.flows instanceof Map)
  )
    return null;
  const cells = [];
  for (const cell of entry.table.cells ?? []) {
    const flow = entry.measured.flows.get(cell.listNode),
      insets = sourceTableCellInsets(entry.table, cell);
    if (
      !flow ||
      !insets ||
      !Number.isSafeInteger(cell.listNode) ||
      cell.listNode < 0 ||
      !Number.isInteger(cell.height) ||
      cell.height < 0 ||
      cell.height > 0xffffffff ||
      !Number.isFinite(flow.height) ||
      flow.height < 0
    )
      continue;
    const sourceHeight = hwpUnitPixels(cell.height),
      contentHeight = flow.height + insets.top + insets.bottom;
    if (!Number.isFinite(contentHeight)) continue;
    cells.push({
      listNode: cell.listNode,
      sourceHeight,
      contentHeight,
      growth: Math.max(0, contentHeight - sourceHeight),
      rowCount: flow.rows?.length ?? 0,
    });
  }
  cells.sort((a, b) => b.growth - a.growth || a.listNode - b.listNode);
  const policy = {};
  if (['whole', 'row-bands'].includes(entry.splitMode)) policy.splitMode = entry.splitMode;
  if (['none', 'table', 'cell'].includes(entry.table.pagination?.page_break))
    policy.storedPageBreak = entry.table.pagination.page_break;
  if (typeof entry.inline === 'boolean') policy.inline = entry.inline;
  policy.captionReserved = entry.captionReservation?.state === 'reserved';
  return { cellCount: cells.length, cells: cells.slice(0, 8), policy };
}
