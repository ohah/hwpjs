import { decodeRectangleRenderingSource } from "./hwpx-rectangle-rendering-source.mjs";

export function decodeRectangleRenderingSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidRectangleRenderingSources");
  const encoder = new TextEncoder();
  return rows.map((row, index) => {
    const value = decodeRectangleRenderingSource(encoder.encode(JSON.stringify(row)));
    if (index && value.rectangle_node <= rows[index - 1].rectangle_node) throw new Error("InvalidRectangleRenderingSources");
    return value;
  });
}
