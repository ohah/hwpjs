import { rgbCss } from './rgb-css.mjs';
import { tableSemanticFaceFill } from './table-semantic-face-fill.mjs';
import { isSourceColorProfile } from '../../js/hwpx-document-provenance.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value) => Number.isSafeInteger(value) && value >= 0;
const slots = Object.freeze({
  'winBrush.faceColor': 0,
  'winBrush.hatchColor': 1,
  'color.value': 13,
});
const fail = () => ({ state: 'unavailable', error: 'InvalidTableSemanticFillColors' });

/** Validate Native's owner-bound canonical values; never classify or decode XML. */
export function tableSemanticFillProjection(style, selected) {
  if (!object(style)) return fail();
  const faceValidation = tableSemanticFaceFill(style, undefined);
  if (faceValidation?.state === 'unavailable') return faceValidation;
  if (!own(style, 'semantic_fill_colors'))
    return {
      state: 'ready',
      project(source) {
        if (source.state === 'solid') return tableSemanticFaceFill(style, source);
        if (source.state !== 'pattern' || !own(style, 'semantic_face_colors')) return source;
        const face = tableSemanticFaceFill(style, { state: 'solid', color: source.background });
        return face.state === 'solid' ? { ...source, background: face.color } : face;
      },
    };
  if (
    !Array.isArray(style.semantic_fill_colors) ||
    (own(style, 'source_color_profile') && !isSourceColorProfile(style.source_color_profile))
  )
    return fail();
  const report = style.fill_report;
  if (style.fill_node === null)
    return report === null && style.semantic_fill_colors.length === 0
      ? { state: 'ready', project: (source) => source }
      : fail();
  if (
    !object(report) ||
    !Array.isArray(report.nodes) ||
    !Array.isArray(report.brushes) ||
    report.brushes.length !== 1 ||
    selected?.state !== 'selected' ||
    selected.report !== report ||
    selected.brush !== report.brushes[0] ||
    selected.nodes !== report.nodes
  )
    return fail();
  const brush = selected.brush,
    nodes = report.nodes;
  if (
    !uint(style.node) ||
    !uint(style.fill_node) ||
    !object(brush) ||
    brush.part_kind !== 'header' ||
    brush.section_ordinal !== null ||
    brush.element_index !== style.fill_node ||
    brush.parent_element_index !== style.node
  )
    return fail();
  const expected = new Map(),
    ids = new Set();
  for (const [index, node] of nodes.entries()) {
    if (
      !object(node) ||
      !uint(node.element_index) ||
      ids.has(node.element_index) ||
      node.brush_index !== 0 ||
      !Array.isArray(node.raw) ||
      node.raw.length !== 19
    )
      return fail();
    ids.add(node.element_index);
    if (
      node.parent_node_index !== null &&
      (!uint(node.parent_node_index) || node.parent_node_index >= index)
    )
      return fail();
    let fields;
    if (node.kind === 'win_brush') {
      if (node.parent_node_index !== null) return fail();
      fields = ['winBrush.faceColor', 'winBrush.hatchColor'];
    } else if (node.kind === 'color') {
      const parent = nodes[node.parent_node_index];
      if (
        node.parent_node_index === null ||
        parent?.kind !== 'gradation' ||
        parent.parent_node_index !== null ||
        parent.brush_index !== node.brush_index
      )
        return fail();
      fields = ['color.value'];
    } else if (['gradation', 'img_brush', 'image'].includes(node.kind)) fields = [];
    else return fail();
    for (const field of fields) {
      const raw = node.raw[slots[field]];
      if (raw === null) continue;
      if (typeof raw !== 'string') return fail();
      expected.set(`${node.element_index}:${field}`, { node, field });
    }
  }
  const values = new Map();
  for (const value of style.semantic_fill_colors) {
    if (
      !object(value) ||
      Object.keys(value).length !== 3 ||
      !['node', 'field', 'rgb'].every((key) => own(value, key)) ||
      !uint(value.node) ||
      typeof value.field !== 'string' ||
      !own(slots, value.field) ||
      (value.rgb !== null && rgbCss(value.rgb) === null)
    )
      return fail();
    const key = `${value.node}:${value.field}`;
    if (!expected.has(key) || values.has(key)) return fail();
    if (
      value.rgb !== null &&
      !/^#[0-9a-f]{6}$/i.test(expected.get(key).node.raw[slots[value.field]])
    )
      return fail();
    values.set(key, value.rgb);
  }
  if (values.size !== expected.size) return fail();
  if (own(style, 'semantic_face_colors')) {
    const faces = [...expected].filter(([, entry]) => entry.field === 'winBrush.faceColor');
    if (style.semantic_face_colors.length !== faces.length) return fail();
    for (const face of style.semantic_face_colors) {
      if (values.get(`${face.node}:winBrush.faceColor`) !== face.rgb) return fail();
    }
  }
  const color = (node, field) => rgbCss(values.get(`${node.element_index}:${field}`));
  return {
    state: 'ready',
    project(source) {
      if (source.state === 'solid' || source.state === 'pattern') {
        const node = nodes[0],
          face = color(node, 'winBrush.faceColor');
        if (face === null) return { state: 'unavailable', error: 'UnknownTableSemanticFillColor' };
        if (source.state === 'solid') return { ...source, color: face };
        const hatch = color(node, 'winBrush.hatchColor');
        return hatch === null
          ? { state: 'unavailable', error: 'UnknownTableSemanticFillColor' }
          : { ...source, background: face, color: hatch };
      }
      if (source.state !== 'gradient_source') return source;
      const colors = nodes
        .filter((node) => node.kind === 'color')
        .map((node) => color(node, 'color.value'));
      return colors.some((value) => value === null)
        ? { state: 'unavailable', error: 'UnknownTableSemanticFillColor' }
        : { ...source, colors };
    },
  };
}
