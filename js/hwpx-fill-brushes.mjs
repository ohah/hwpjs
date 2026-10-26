export function decodeFillBrushes(bytes) {
  const fail = () => {
    throw new Error("InvalidFillBrushes");
  };
  if (!(bytes instanceof Uint8Array) || bytes.length > 128 * 1024 * 1024) return fail();
  let v;
  try {
    v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const optionalUint = (n) => n === null || uint(n);
  const kinds = ["win_brush", "gradation", "img_brush", "color", "image"];
  if (
    !v ||
    !Array.isArray(v.brushes) ||
    !Array.isArray(v.nodes) ||
    !Array.isArray(v.kind_counts) ||
    v.kind_counts.length !== kinds.length ||
    !v.kind_counts.every(uint)
  )
    return fail();
  for (const key of [
    "header_and_sections",
    "master_pages",
    "other_attributes",
    "unknown_enums",
    "non_six_hex_colors",
    "attribute_bytes",
    "direct_children",
    "color_count_mismatch",
  ])
    if (!uint(v[key])) return fail();
  for (const b of v.brushes) {
    if (
      !b ||
      !["header", "section", "master_page"].includes(b.part_kind) ||
      ![b.part_item_index, b.element_index, b.other_attributes, b.direct_children].every(uint) ||
      !optionalUint(b.section_ordinal) ||
      !optionalUint(b.parent_element_index) ||
      !Array.isArray(b.child_counts) ||
      b.child_counts.length !== 3 ||
      !b.child_counts.every(uint)
    )
      return fail();
  }
  const counts = kinds.map(() => 0);
  for (const [index, n] of v.nodes.entries()) {
    if (
      !n ||
      !kinds.includes(n.kind) ||
      !uint(n.brush_index) ||
      n.brush_index >= v.brushes.length ||
      !optionalUint(n.parent_node_index) ||
      (n.parent_node_index !== null && n.parent_node_index >= index) ||
      ![
        n.element_index,
        n.attribute_bytes,
        n.other_attributes,
        n.unknown_enums,
        n.non_six_hex_colors,
        n.direct_children,
        n.recognized_children,
      ].every(uint) ||
      !Array.isArray(n.raw) ||
      n.raw.length !== 19 ||
      !n.raw.every((s) => s === null || typeof s === "string")
    )
      return fail();
    if (n.parent_node_index !== null && v.nodes[n.parent_node_index].brush_index !== n.brush_index)
      return fail();
    counts[kinds.indexOf(n.kind)]++;
  }
  if (!counts.every((count, i) => count === v.kind_counts[i])) return fail();
  return v;
}
