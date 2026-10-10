import { validateHwp5TableLayoutSources } from "../../js/hwp5-table-layout-sources.mjs";
import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";
import { hwp5TableFlags } from "./hwp5-table-flags.mjs";
/** Explicit HWP5 flags -> shared geometry; preserve raw declarations separately. */
export function hwp5TableGeometry(source) {
  validateHwp5TableLayoutSources([source]);
  const flags = source.object_flags, table = hwp5TableFlags(source.table_flags);
  if ((flags & 0xc0000002) !== 0 || table.unknown_flags !== 0 || source.object_extra_bytes !== 0 || source.table_extra_bytes !== 0) throw new Error("UnsupportedHwp5TableExtension");
  let decoded;
  try { decoded = hwp5ObjectFlags(flags); } catch { throw new Error("UnsupportedHwp5TableEnum"); }
  if (table.page_break === null) throw new Error("UnsupportedHwp5TableEnum");
  return {
    geometry: { width: source.width, height: source.height, width_relative: decoded.width_relative, height_relative: decoded.height_relative, treat_as_character: decoded.treat_as_character, vertical_offset: source.offset_y, horizontal_offset: source.offset_x },
    text_wrap: decoded.text_wrap, text_flow: decoded.text_flow, has_caption: decoded.has_caption,
    inner_margin_setup: table.inner_margin_setup, no_adjust: table.no_adjust,
    affect_line_spacing: decoded.affect_line_spacing, flow_with_text: decoded.flow_with_text,
    allow_overlap: decoded.allow_overlap, hold_anchor: decoded.hold_anchor,
    vertical_relative: decoded.vertical_relative, horizontal_relative: decoded.horizontal_relative, vertical_alignment: decoded.vertical_alignment, horizontal_alignment: decoded.horizontal_alignment,
    out_margin: [...source.outer_margins], in_margin: [...source.inner_margins],
  };
}
export function hwp5TablePagination(source) {
  validateHwp5TableLayoutSources([source]);
  const table = hwp5TableFlags(source.table_flags);
  if (table.unknown_flags !== 0 || table.page_break === null) throw new Error("UnsupportedHwp5TablePagination");
  return { page_break: table.page_break, repeat_header: table.repeat_header, no_adjust: table.no_adjust, cell_spacing: source.cell_spacing };
}
