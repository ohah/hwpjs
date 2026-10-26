import { object, uint, nullableUint, field } from './chart-display-fields.mjs';

export function validChartStockSettings(stock, kind, plotNode, usedNodes) {
  if (kind !== 'stockChart') return stock === null;
  if (!object(stock)) return false;
  for (const key of ['high_low_node', 'up_down_node', 'up_node', 'down_node'])
    if (!nullableUint(stock[key])) return false;
  if (
    stock.up_down_node === null &&
    (stock.up_node !== null || stock.down_node !== null || stock.gap_width !== null)
  )
    return false;
  const parent = stock.up_down_node ?? plotNode;
  if (!field(stock.gap_width, (value) => uint(value) && value <= 500, parent)) return false;
  for (const key of ['up_node', 'down_node'])
    if (stock[key] !== null && stock[key] <= parent) return false;
  for (const node of [
    stock.high_low_node,
    stock.up_down_node,
    stock.up_node,
    stock.down_node,
    stock.gap_width?.node ?? null,
  ]) {
    if (node === null) continue;
    if (node <= plotNode || usedNodes.has(node)) return false;
    usedNodes.add(node);
  }
  return true;
}
