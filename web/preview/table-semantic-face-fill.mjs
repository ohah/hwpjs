import { rgbCss } from './rgb-css.mjs';
import { isSourceColorProfile } from '../../js/hwpx-document-provenance.mjs';

/** Consume Native's owner-bound semantic color; never classify/redecode raw XML. */
export function tableSemanticFaceFill(style, fill) {
  if (!Object.hasOwn(style, 'semantic_face_colors')) return fill;
  const fail = () => ({ state: 'unavailable', error: 'InvalidTableSemanticFaceColors' });
  if (
    !Array.isArray(style.semantic_face_colors) ||
    (Object.hasOwn(style, 'source_color_profile') &&
      !isSourceColorProfile(style.source_color_profile))
  )
    return fail();
  const nodes = style.fill_report?.nodes ?? [];
  if (!Array.isArray(nodes)) return fail();
  const source = new Map();
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.kind !== 'string')
      return fail();
    if (node.kind !== 'win_brush' || node.raw?.[0] === null) continue;
    if (
      !Array.isArray(node.raw) ||
      typeof node.raw[0] !== 'string' ||
      !Number.isSafeInteger(node.element_index) ||
      node.element_index < 0 ||
      source.has(node.element_index)
    )
      return fail();
    source.set(node.element_index, node);
  }
  if (style.semantic_face_colors.length !== source.size) return fail();
  const values = new Map();
  for (const value of style.semantic_face_colors) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      !['node', 'field', 'rgb'].every((key) => Object.hasOwn(value, key)) ||
      !Number.isSafeInteger(value.node) ||
      value.node < 0 ||
      !source.has(value.node) ||
      values.has(value.node) ||
      value.field !== 'winBrush.faceColor' ||
      (value.rgb !== null && rgbCss(value.rgb) === null)
    )
      return fail();
    values.set(value.node, value.rgb);
  }
  // Existing unsupported variants and pattern/hatch/gradient policies stay intact.
  if (fill?.state !== 'solid') return fill;
  if (source.size !== 1) return fail();
  const color = rgbCss(values.get(source.keys().next().value));
  if (color === null) return { state: 'unavailable', error: 'UnknownTableSemanticFaceColor' };
  return { ...fill, color };
}
