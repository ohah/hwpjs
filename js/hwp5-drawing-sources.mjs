export function validateHwp5DrawingSources(rows) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingSources");
  const controls = new Set(),
    components = new Set();
  for (const row of rows) {
    if (
      !row ||
      ![
        "control_node",
        "component_node",
        "paragraph_node",
        "kind_id",
        "flags",
        "width",
        "height",
        "instance_id",
        "original_width",
        "original_height",
        "current_width",
        "current_height",
        "component_attributes",
        "matrix_pairs",
        "component_extra_bytes",
      ].every((key) => integer(row[key], 0, 0xffffffff)) ||
      !["offset_x", "offset_y", "component_offset_x", "component_offset_y"].every((key) =>
        integer(row[key], -2147483648, 2147483647),
      ) ||
      !integer(row.rotation_angle, -32768, 32767) ||
      row.matrix_pairs > 65535 ||
      !(row.paragraph_node < row.control_node && row.control_node < row.component_node) ||
      controls.has(row.control_node) ||
      components.has(row.component_node)
    )
      throw new Error("InvalidHwp5DrawingSources");
    controls.add(row.control_node);
    components.add(row.component_node);
    const keys = [
      "z_order",
      "outer_margins",
      "prevent_page_break",
      "description_bytes",
      "object_extra_bytes",
    ];
    if (keys.some((key) => Object.hasOwn(row, key))) {
      if (
        !integer(row.z_order, -2147483648, 2147483647) ||
        !integer(row.prevent_page_break, -2147483648, 2147483647) ||
        !Array.isArray(row.outer_margins) ||
        row.outer_margins.length !== 4 ||
        !Array.from(row.outer_margins).every((value) => integer(value, -32768, 32767)) ||
        (row.description_bytes !== null &&
          (!integer(row.description_bytes, 0, 131070) || row.description_bytes % 2 !== 0)) ||
        !integer(row.object_extra_bytes, 0, 0xffffffff)
      )
        throw new Error("InvalidHwp5DrawingSources");
    }
  }
  return rows;
}
export function decodeHwp5DrawingSources(bytes) {
  return validateHwp5DrawingSources(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
}
