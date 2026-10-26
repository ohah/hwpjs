import { ellipseRenderingGeometry } from './ellipse-rendering-geometry.mjs';
import { drawingPageAnchor } from './drawing-page-anchor.mjs';
import { placeGroupedRoot } from './grouped-root-placement.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { validGroupContext } from '../../js/hwpx-group-context.mjs';

// renderingInfo supplies root-group coordinates, as for grouped rectangles.
// Translate the center/bounds only; never apply the root origin to radius vectors.
export function projectGroupedEllipse(section, row, root, paragraphs, pageRows) {
  const fail = (error) => ({ state: 'unavailable', error });
  const group = row?.common?.group_context;
  if (
    !Number.isSafeInteger(section) ||
    section < 0 ||
    row?.sourceOnly !== true ||
    !group ||
    !validGroupContext(group, row.node) ||
    group.root_anchor !== root?.container_node ||
    row.owner?.anchor_node !== group.root_anchor ||
    !Number.isSafeInteger(row.owner.paragraph) ||
    row.owner.paragraph < 1
  )
    return fail('GroupRootBindingMismatch');
  const order = signedInt32(row.common.flow?.z_order),
    wrap = root.flow?.text_wrap;
  const inline = root.geometry?.treat_as_character === true;
  if (order === null || !(inline ? [1, 2, 3].includes(wrap) : [2, 3].includes(wrap)))
    return fail('UnsupportedGroupedEllipsePagePolicy');
  const geometry = ellipseRenderingGeometry(row);
  if (geometry.state !== 'resolved') return geometry;
  const drawing = {
    section,
    hostParagraph: row.owner.paragraph - 1,
    anchorUnit: row.owner.anchor_unit,
  };
  const selected = drawingPageAnchor(drawing, paragraphs, pageRows);
  if (selected.state !== 'selected') return selected;
  const placed = placeGroupedRoot(root, selected.host.referenceBoxes, selected.host, {
    section,
    paragraph: drawing.hostParagraph,
    unit: drawing.anchorUnit,
  });
  if (placed.state !== 'placed') return placed;
  const { x, y } = placed.rectangle;
  const center = [geometry.center[0] + x, geometry.center[1] + y];
  const bounds = { ...geometry.bounds, x: geometry.bounds.x + x, y: geometry.bounds.y + y };
  if (![...center, ...Object.values(bounds)].every(Number.isFinite))
    return fail('InvalidEllipsePageBounds');
  return {
    state: 'placed',
    section,
    node: row.node,
    paragraph: drawing.hostParagraph,
    anchorUnit: drawing.anchorUnit,
    pageOrdinal: selected.host.pageOrdinal,
    layer: !inline && wrap === 2 ? 'behind' : 'front',
    zOrder: order,
    center,
    u: geometry.u,
    v: geometry.v,
    bounds,
  };
}
