/** Shared current paragraph/owner envelope; component IDs stay format-specific. */
export function decodeCaptionBindings(bytes, ownerField, errorName) {
  if (!["table_node", "picture_node"].includes(ownerField)) throw new Error("InvalidCaptionBindingOwnerField");
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error(errorName);
  let previous = 0;
  for (const row of rows) {
    if (!object(row) || !uint(row.paragraph) || row.paragraph <= previous || !object(row.owner)
      || !uint(row.owner[ownerField]) || !uint(row.owner.caption_node) || !uint(row.owner.list_node)) throw new Error(errorName);
    previous = row.paragraph;
  }
  return rows;
}
