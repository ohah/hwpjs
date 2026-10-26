import { decodeDrawingTextSnapshot } from './hwpx-drawing-text-snapshot.mjs';

export function decodeDrawingTextSnapshots(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('InvalidDrawingTextSnapshots');
  const rows = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error('InvalidDrawingTextSnapshots');
  const encoder = new TextEncoder();
  return rows.map((row, index) => {
    const value = decodeDrawingTextSnapshot(encoder.encode(JSON.stringify(row)));
    if (index && value.drawing_node <= rows[index - 1].drawing_node)
      throw new Error('InvalidDrawingTextSnapshots');
    return value;
  });
}
