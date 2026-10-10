export function decodeHwp5PageAreaSources(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  return validateHwp5PageAreaSources(rows);
}
export function validateHwp5PageAreaSources(rows) {
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5PageAreaSources");
  const uint = (value, max = 0xffffffff) => Number.isInteger(value) && value >= 0 && value <= max;
  const seen = new Set();
  for (const row of rows) {
    if (!row || !["header", "footer"].includes(row.kind) || !["owner_node", "list_node", "paragraph_count", "control_attributes", "list_attributes", "width", "height", "control_extra_bytes", "list_extra_bytes"].every(key => uint(row[key])) || row.owner_node >= row.list_node || row.list_unknown !== null && !uint(row.list_unknown, 0xffff) || !uint(row.text_references, 255) || !uint(row.number_references, 255) || typeof row.control_extra_nonzero !== "boolean" || typeof row.list_extra_nonzero !== "boolean" || row.control_extra_bytes === 0 && row.control_extra_nonzero || row.list_extra_bytes === 0 && row.list_extra_nonzero || seen.has(row.list_node)) throw new Error("InvalidHwp5PageAreaSources");
    seen.add(row.list_node);
    if (row.control_instance_id !== undefined && row.control_instance_id !== null
      && (!uint(row.control_instance_id) || row.control_extra_bytes !== 4 || row.control_extra_nonzero !== (row.control_instance_id !== 0))) throw new Error("InvalidHwp5PageAreaSources");
  }
  return rows;
}
