const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const signed = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const uniqueRows = (rows, inspect) => {
  const controls = new Set(),
    objects = new Set();
  if (!Array.isArray(rows)) throw Error("InvalidHwp5FormSources");
  for (const row of rows) {
    if (
      !row ||
      !uint(row.control_node) ||
      !uint(row.object_node) ||
      row.control_node >= row.object_node ||
      controls.has(row.control_node) ||
      objects.has(row.object_node) ||
      !inspect(row)
    )
      throw Error("InvalidHwp5FormSources");
    controls.add(row.control_node);
    objects.add(row.object_node);
  }
  return rows;
};
export function validateHwp5FormSources(rows) {
  return uniqueRows(
    rows,
    (row) =>
      [
        "paragraph_node",
        "source_unit",
        "raw_length",
        "flags",
        "width",
        "height",
        "instance_id",
        "common_extra_bytes",
        "envelope_extra_bytes",
        "property_bytes",
        "property_nodes",
        "other_direct_children",
      ].every((k) => uint(row[k])) &&
      row.paragraph_node < row.control_node &&
      row.source_unit <= 0xfffffff7 &&
      ["unknown", "push_button", "check_box", "combo_box", "radio_button", "edit"].includes(
        row.kind,
      ) &&
      uint(row.type_id) &&
      uint(row.secondary_type_id) &&
      ["offset_x", "offset_y", "z_order", "prevent_page_break"].every((k) =>
        signed(row[k], -2147483648, 2147483647),
      ) &&
      Array.isArray(row.margins) &&
      row.margins.length === 4 &&
      row.margins.every((v) => signed(v, -32768, 32767)) &&
      (row.description_bytes === null || uint(row.description_bytes)),
  );
}
export function validateHwp5FormAnchors(rows) {
  return uniqueRows(
    rows,
    (row) =>
      uint(row.paragraph) &&
      uint(row.source_unit) &&
      row.source_unit <= 0xfffffff7 &&
      uint(row.current_unit) &&
      row.current_unit <= 0xfffffff7,
  );
}
const decode = (bytes, validate) =>
  validate(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
export const decodeHwp5FormSources = (bytes) => decode(bytes, validateHwp5FormSources);
export const decodeHwp5FormAnchors = (bytes) => decode(bytes, validateHwp5FormAnchors);
