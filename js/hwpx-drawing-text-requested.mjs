import { decodeDrawingTextSnapshot } from "./hwpx-drawing-text-snapshot.mjs";
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function drawingTextRequest(nodes, limit) {
  if (!uint(limit) || limit < 1 || limit > 1024) throw Error("InvalidDrawingTextRequestLimit");
  if (!Array.isArray(nodes)) throw Error("InvalidDrawingTextRequest");
  const count = nodes.length;
  if (!uint(count) || count > limit) throw Error("InvalidDrawingTextRequest");
  const requested = [];
  for (let index = 0; index < count; index++) {
    if (!Object.hasOwn(nodes, index)) throw Error("InvalidDrawingTextRequest");
    const node = nodes[index];
    if (!uint(node)) throw Error("InvalidDrawingTextRequest");
    requested.push(node);
  }
  if (nodes.length !== count) throw Error("InvalidDrawingTextRequest");
  return { requested, bytes: new TextEncoder().encode(JSON.stringify(requested)) };
}
export function decodeDrawingTextRequested(bytes, requested) {
  const fail = () => { throw Error("InvalidDrawingTextRequested"); };
  if (!(bytes instanceof Uint8Array) || bytes.length > 1024 * (65536 + 256) + 2) fail();
  let rows;
  try { rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  if (!Array.isArray(rows) || rows.length !== requested.length || rows.length > 1024) fail();
  const encoder = new TextEncoder();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.node !== requested[index] || Object.keys(row).length !== 2) fail();
    if (Object.hasOwn(row, "unavailable")) {
      if (typeof row.unavailable !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(row.unavailable) || row.unavailable === "OutOfMemory") fail();
      return { node: row.node, unavailable: row.unavailable };
    }
    if (!Object.hasOwn(row, "source")) fail();
    const source = decodeDrawingTextSnapshot(encoder.encode(JSON.stringify(row.source)));
    if (source.drawing_node !== row.node) fail();
    return { node: row.node, source };
  });
}
