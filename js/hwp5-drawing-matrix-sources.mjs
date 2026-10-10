export function validateHwp5DrawingMatrixSources(rows) {
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingMatrixSources");
  const seen = new Set(); let current;
  for (const row of rows) {
    if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node
      || !["translation", "scale", "rotation"].includes(row.kind) || !Array.isArray(row.bits) || row.bits.length !== 6
      || !Array.from(row.bits).every(pair => Array.isArray(pair) && pair.length === 2 && Array.from(pair).every(uint))) throw new Error("InvalidHwp5DrawingMatrixSources");
    if (!current || current.node !== row.component_node) {
      if (current?.next === "rotation" || seen.has(row.component_node) || row.kind !== "translation" || row.pair !== null) throw new Error("InvalidHwp5DrawingMatrixSources");
      seen.add(row.component_node); current = { node: row.component_node, owner: row.owner_node, next: "scale", ordinal: 0 };
    } else {
      if (row.owner_node !== current.owner || row.kind !== current.next || row.pair !== current.ordinal || !uint(row.pair) || row.pair >= 65535) throw new Error("InvalidHwp5DrawingMatrixSources");
      if (row.kind === "rotation") { current.next = "scale"; current.ordinal++; } else current.next = "rotation";
    }
  }
  if (current?.next === "rotation") throw new Error("InvalidHwp5DrawingMatrixSources");
  return rows;
}
export function decodeHwp5DrawingMatrixSources(bytes) {
  return validateHwp5DrawingMatrixSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
