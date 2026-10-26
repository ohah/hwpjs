import { encodeU32IndexRequest } from './u32-index-request.mjs';
import { decodeLineGeometry } from './hwpx-line-geometry.mjs';
import { decodeLineDisplay } from './hwpx-line-display-wire.mjs';
export function encodeLineDisplayNodes(nodes, limit) {
  return encodeU32IndexRequest(
    nodes,
    limit,
    'InvalidLineDisplayBatchLimit',
    'InvalidLineDisplayBatchNodes',
  );
}
const errorName = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value) &&
  value !== 'OutOfMemory';
export function decodeLineDisplayBatch(bytes, nodes) {
  const fail = () => {
    throw Error('InvalidLineDisplayBatch');
  };
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length !== nodes.length) fail();
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || row.node !== nodes[index]) fail();
    if (Object.hasOwn(row, 'error')) {
      if (Object.keys(row).length !== 2 || !errorName(row.error)) fail();
      return row;
    }
    if (Object.keys(row).length !== 3 || !Object.hasOwn(row, 'geometry')) fail();
    const geometry = decodeLineGeometry(
      new TextEncoder().encode(JSON.stringify(row.geometry)),
      nodes[index],
    );
    if (Object.hasOwn(row, 'displayError')) {
      if (!errorName(row.displayError)) fail();
      return { node: row.node, geometry, displayError: row.displayError };
    }
    if (
      !Array.isArray(row.display) ||
      row.display.length !== 72 ||
      !row.display.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    )
      fail();
    const display = decodeLineDisplay(Uint8Array.from(row.display)),
      g = geometry.geometry;
    if (
      display.lineNode !== row.node ||
      display.paragraph !== g.paragraph ||
      display.anchorNode !== g.anchor_node ||
      display.anchorUnit !== g.anchor_unit ||
      display.endpoints.some((p, i) => p.some((n, j) => n !== g.endpoints[i][j]))
    )
      fail();
    return { node: row.node, geometry, display };
  });
}
