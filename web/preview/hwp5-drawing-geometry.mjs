import { validateHwp5DrawingSources } from "../../js/hwp5-drawing-sources.mjs";
import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";

export function hwp5DrawingGeometry(source) {
  validateHwp5DrawingSources([source]);
  if (source.object_extra_bytes !== 0 || !Array.isArray(source.outer_margins)) throw new Error("UnsupportedHwp5DrawingObjectExtension");
  const flags = hwp5ObjectFlags(source.flags);
  return { size_protected: flags.size_protected, geometry: { width: source.width, height: source.height,
    width_relative: flags.width_relative, height_relative: flags.height_relative, treat_as_character: flags.treat_as_character,
    horizontal_offset: source.offset_x, vertical_offset: source.offset_y },
    position: { relations: [flags.vertical_relative, flags.horizontal_relative, flags.vertical_alignment, flags.horizontal_alignment],
      flags: [flags.affect_line_spacing, flags.flow_with_text, flags.allow_overlap, flags.hold_anchor] },
    flow: { text_wrap: flags.text_wrap, text_flow: flags.text_flow, z_order: source.z_order },
    text_wrap: flags.text_wrap, text_flow: flags.text_flow, flow_with_text: flags.flow_with_text, allow_overlap: flags.allow_overlap,
    affect_line_spacing: flags.affect_line_spacing, hold_anchor: flags.hold_anchor, has_caption: flags.has_caption,
    out_margin: [...source.outer_margins], z_order: source.z_order };
}
export function attachHwp5DrawingGeometry(content) {
  content.hwp5DrawingGeometry = [];
  content.hwp5DrawingGeometryErrors = [];
  for (const section of new Set((content.hwp5Drawings ?? []).map(row => row.section))) {
    try {
      const prepared = content.hwp5Drawings.filter(row => row.section === section).map(row => ({ section, controlNode: row.controlNode, componentNode: row.componentNode, source: hwp5DrawingGeometry(row.source) }));
      content.hwp5DrawingGeometry.push(...prepared);
    } catch (error) { content.hwp5DrawingGeometryErrors.push({ section, error: error.message }); }
  }
  return content;
}
