/** Current native global 1-based paragraph numbers and source-tree owners. */
export function decodeTableCaptionBindings(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidTableCaptionBindings");
  let previous = 0;
  for (const row of rows) {
    if (!object(row) || !uint(row.paragraph) || row.paragraph <= previous || !object(row.owner) || !uint(row.owner.table_node) || !uint(row.owner.caption_node) || !uint(row.owner.list_node)) throw new Error("InvalidTableCaptionBindings");
    previous = row.paragraph;
  }
  return rows;
}
