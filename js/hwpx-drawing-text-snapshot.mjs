import { validateTableCaption } from "./hwpx-table-caption.mjs";
export function decodeDrawingTextSnapshot(bytes) {
  const fail = () => { throw new Error("InvalidDrawingTextSnapshot"); };
  if (!(bytes instanceof Uint8Array) || bytes.length > 65536) return fail();
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail(); }
  const uint = v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
  const signed = v => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
  const optional = (v, check) => v === null || check(v);
  if (!value || ![value.drawing_node, value.paragraph, value.anchor_unit].every(uint) || value.paragraph === 0) return fail();
  if (value.group_context !== undefined && value.group_context !== null) {
    const group = value.group_context;
    if (!group || ![group.parent_container, group.root_anchor, group.depth].every(uint) || group.depth < 1
      || group.root_anchor > group.parent_container || group.parent_container >= value.drawing_node) return fail();
  }
  const geometry = value.geometry, text = value.text;
  if (!geometry || !text || !uint(text.node) || text.node <= value.drawing_node || !optional(text.list_node, uint) || (text.list_node !== null && text.list_node <= text.node)) return fail();
  if (![geometry.width, geometry.height].every(v => optional(v, uint)) || !optional(geometry.width_relative, v => uint(v) && v <= 4) || !optional(geometry.height_relative, v => uint(v) && v <= 2) || ![null, false, true].includes(geometry.treat_as_character) || ![geometry.horizontal_offset, geometry.vertical_offset].every(v => optional(v, signed))) return fail();
  if (![false, true].includes(text.margin_present) || !Array.isArray(text.margins) || text.margins.length !== 4 || !text.margins.every(v => optional(v, signed)) || ![null, false, true].includes(text.editable) || !optional(text.last_width, uint) || (!text.margin_present && text.margins.some(v => v !== null))) return fail();
  if (![text.text_direction, text.line_wrap, text.vertical_alignment].every(v => optional(v, n => uint(n) && n <= 2))) return fail();
  if (Object.hasOwn(value, "position")) {
    const p = value.position;
    if (!p || !Array.isArray(p.flags) || p.flags.length !== 4 || !p.flags.every(v => [null, false, true].includes(v)) || !Array.isArray(p.relations) || p.relations.length !== 4 || !p.relations.every((v, i) => optional(v, n => uint(n) && n <= [2, 3, 4, 4][i]))) return fail();
  }
  if (Object.hasOwn(value, "flow")) {
    const f = value.flow;
    if (!f || !optional(f.text_wrap, n => uint(n) && n <= 5) || !optional(f.text_flow, n => uint(n) && n <= 3) || !optional(f.z_order, signed) || !Array.isArray(f.outside_margins) || f.outside_margins.length !== 4 || !f.outside_margins.every(v => optional(v, signed))) return fail();
  }
  if (Object.hasOwn(value, "caption")) {
    try { validateTableCaption(value.caption); } catch { return fail(); }
    if (value.caption !== null && value.caption.caption_node <= value.drawing_node) return fail();
  }
  if (Object.hasOwn(value, "transform_identity") && ![null, false, true].includes(value.transform_identity)) return fail();
  if (Object.hasOwn(value, "rendering")) {
    const r = value.rendering;
    if (!r || !Array.isArray(r.flip) || r.flip.length !== 2 || !r.flip.every(v => [null, false, true].includes(v)) || ![null, false, true].includes(r.reverse) || !optional(r.angle, uint)) return fail();
    if (Object.hasOwn(r, "center") && (!Array.isArray(r.center) || r.center.length !== 2 || !r.center.every(v => optional(v, signed)))) return fail();
    if (Object.hasOwn(r, "rotate_image") && ![null, false, true].includes(r.rotate_image)) return fail();
    if (r.matrix === null) {
      if (!["UnsupportedPictureMatrixSequence", "IncompletePictureMatrix", "NonFinitePictureMatrix"].includes(r.matrix_error)) return fail();
    } else if (!Array.isArray(r.matrix) || r.matrix.length !== 6 || !r.matrix.every(Number.isFinite) || r.matrix_error !== null) return fail();
  }
  if (Object.hasOwn(value, "rectangle")) {
    const r = value.rectangle;
    if (!r || typeof r.present !== "boolean" || !uint(r.unknown_children) || !Array.isArray(r.points) || r.points.length !== 4 || !r.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => optional(v, signed))) || !Array.isArray(r.point_present) || r.point_present.length !== 4 || !r.point_present.every(v => typeof v === "boolean")) return fail();
    if (r.points.some((point, i) => !r.point_present[i] && point.some(v => v !== null)) || !r.present && r.point_present.some(Boolean)) return fail();
  }
  if (Object.hasOwn(value, "stroke")) {
    if (value.stroke === null) {
      if (!["UnsupportedLineStrokeDecoration", "UnsupportedLineStrokeColor", "UnsupportedLineStrokeStyle"].includes(value.stroke_error)) return fail();
    } else {
      const s = value.stroke;
      if (!s || value.stroke_error !== null || !optional(s.color, n => uint(n) && n <= 0xffffff) || !optional(s.width, uint) || !optional(s.style, n => uint(n) && n <= 6)) return fail();
    }
  }
  if (Object.hasOwn(value, "rendering_corners") && value.rendering_corners !== null && (!Array.isArray(value.rendering_corners) || value.rendering_corners.length !== 4 || !value.rendering_corners.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) return fail();
  if (Object.hasOwn(value, "paint")) {
    const p = value.paint;
    if (!p || ![p.fill_node, p.shadow_node].every(v => optional(v, uint)) || !optional(p.shadow_type, n => uint(n) && n <= 14) || p.shadow_node === null && p.shadow_type !== null) return fail();
  }
  return value;
}
