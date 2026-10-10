export function validateHwp5NoteSources(rows) {
  const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5NoteSources");
  const seen = new Set(), controls = new Map();
  for (const row of rows) {
    if (!row || !["footnote", "endnote"].includes(row.kind) || !["control_node", "list_node", "paragraph_count", "paragraph", "source_unit", "current_unit", "number", "number_shape", "control_extra_bytes", "list_attributes", "list_extra_bytes"].every(key => uint(row[key], 0xffffffff)) || row.control_node >= row.list_node || row.source_unit > 0xfffffff7 || row.current_unit > 0xfffffff7 || !uint(row.prefix, 65535) || !uint(row.suffix, 65535) || row.instance_id !== null && !uint(row.instance_id, 0xffffffff) || row.list_unknown !== null && !uint(row.list_unknown, 65535) || typeof row.control_extra_nonzero !== "boolean" || typeof row.list_extra_nonzero !== "boolean" || row.control_extra_bytes === 0 && row.control_extra_nonzero || row.list_extra_bytes === 0 && row.list_extra_nonzero || seen.has(row.list_node)) throw new Error("InvalidHwp5NoteSources");
    const previous = controls.get(row.control_node);
    if (previous && ["kind", "paragraph", "source_unit", "current_unit", "number", "prefix", "suffix", "number_shape", "instance_id", "control_extra_bytes", "control_extra_nonzero"].some(key => previous[key] !== row[key])) throw new Error("InvalidHwp5NoteSources");
    controls.set(row.control_node, row); seen.add(row.list_node);
  }
  return rows;
}
export function decodeHwp5NoteSources(bytes) {
  return validateHwp5NoteSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
