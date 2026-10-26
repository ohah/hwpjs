export function decodeAutomaticNumberSites(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const optional = (value) => value === null || uint(value);
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidAutomaticNumberSites");
  const nodes = new Set();
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      !uint(row.number_node) ||
      nodes.has(row.number_node) ||
      !optional(row.anchor_node) ||
      !optional(row.paragraph) ||
      !optional(row.anchor_unit) ||
      (row.paragraph === null) !== (row.anchor_unit === null) ||
      row.paragraph === 0 ||
      (row.anchor_node === null && row.paragraph !== null)
    )
      throw new Error("InvalidAutomaticNumberSites");
    nodes.add(row.number_node);
  }
  return rows;
}
