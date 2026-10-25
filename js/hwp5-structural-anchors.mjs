export const HWP5_STRUCTURAL_ANCHOR_KINDS = Object.freeze(["section", "column", "header", "footer", "bookmark"]);
export function decodeHwp5StructuralAnchors(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5StructuralAnchors");
  const seen = new Set();
  for (const row of rows) {
    if (!row || !HWP5_STRUCTURAL_ANCHOR_KINDS.includes(row.kind) || !["control_node", "paragraph", "source_unit", "current_unit"].every(key => uint(row[key])) || row.source_unit > 0xfffffff7 || row.current_unit > 0xfffffff7 || seen.has(row.control_node)) throw new Error("InvalidHwp5StructuralAnchors");
    seen.add(row.control_node);
  }
  return rows;
}
