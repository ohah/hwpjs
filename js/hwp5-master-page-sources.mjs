export function decodeHwp5MasterPageSources(bytes) {
  return validateHwp5MasterPageSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

export function validateHwp5MasterPageSources(rows) {
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5MasterPageSources");
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  const seen = new Set();
  for (const row of rows) {
    if (!row || !["owner_node", "list_node", "paragraph_count", "list_attributes", "width", "height", "extra_bytes"].every(key => uint(row[key]))
      || row.owner_node >= row.list_node || row.list_unknown !== null && !uint(row.list_unknown, 0xffff)
      || !uint(row.text_reference, 255) || !uint(row.number_reference, 255)
      || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero
      || seen.has(row.list_node)) throw new Error("InvalidHwp5MasterPageSources");
    seen.add(row.list_node);
  }
  return rows;
}
