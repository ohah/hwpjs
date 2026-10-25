import { selectDrawingBrush } from "./drawing-solid-fill.mjs";

/** Preserve source shaping parameters; this is not a Canvas approximation. */
export function drawingGradientSource(content, drawing) {
  return selectedGradientSource(selectDrawingBrush(content,drawing));
}

export function selectedGradientSource(selected) {
  if (selected.state !== "selected") return selected;
  const fail = error => ({ state: "unavailable", error });
  const { brush, nodes } = selected;
  const roots = nodes.filter(n => n.parent_node_index === null);
  if (brush.direct_children !== 1 || brush.other_attributes !== 0 || roots.length !== 1 || roots[0].kind !== "gradation") return fail("UnsupportedDrawingGradientVariant");
  const root = roots[0];
  const colors = nodes.filter(n => n.kind === "color");
  if (colors.some(n => n.parent_node_index === null || selected.report.nodes[n.parent_node_index] !== root)) return fail("InvalidDrawingGradientParent");
  if (root.direct_children !== colors.length || root.other_attributes !== 0 || root.unknown_enums !== 0 || root.non_six_hex_colors !== 0 || colors.length < 2 || nodes.length !== colors.length + 1 || colors.some(n => n.direct_children !== 0 || n.other_attributes !== 0 || !/^#[0-9a-f]{6}$/i.test(n.raw[13] ?? ""))) return fail("UnsupportedDrawingGradientSource");
  if (root.raw[9] === null || !/^\d+$/.test(root.raw[9]) || Number(root.raw[9]) !== colors.length) return fail("DrawingGradientColorCountMismatch");
  return { state: "gradient_source", type: root.raw[4], angle: root.raw[5], center: [root.raw[6], root.raw[7]], step: root.raw[8], stepCenter: root.raw[10], alpha: root.raw[11], colors: colors.map(n => n.raw[13]) };
}
