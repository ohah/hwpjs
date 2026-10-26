import { groupShapeChildren } from './group-shape-children.mjs';
import { placeGroupedRoot } from './grouped-root-placement.mjs';
import { groupedPaintLayer } from './grouped-paint-layer.mjs';

// Endpoints already contain the child's renderingInfo. Only the root supplies
// a page origin; never add component offsets or apply parent matrices again.
export function placeGroupedLine(line, containers, boxes, host) {
  try {
    const group = line.groupContext;
    if (!group || group.parentContainer !== group.rootAnchor)
      throw new Error('UnsupportedGroupedLineOwner');
    const roots = (containers ?? []).filter(
      (row) => row.section === line.section && row.containerNode === group.rootAnchor,
    );
    if (roots.length !== 1) throw new Error('AmbiguousGroupedLineRoot');
    const root = roots[0];
    if (
      root.source?.group_context !== null ||
      root.hostParagraph !== line.paragraph ||
      root.anchorUnit !== line.anchorUnit ||
      root.source.container_node !== group.rootAnchor
    )
      throw new Error('InvalidGroupedLineRoot');
    if (
      groupShapeChildren(root.source).filter(
        (row) => row.kind === 'line' && row.node === line.anchorNode,
      ).length !== 1
    )
      throw new Error('MissingGroupedLineBinding');
    return {
      ...placeGroupedRoot(root.source, boxes, host, {
        section: line.section,
        paragraph: line.paragraph,
        unit: line.anchorUnit,
      }),
      paintLayer: groupedPaintLayer(root.source),
    };
  } catch (error) {
    return { state: 'unavailable', error: error.message };
  }
}
