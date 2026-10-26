import { projectFloatingDrawing } from './drawing-page-projection.mjs';
import { layoutGroupedDrawingText } from './grouped-drawing-text-layout.mjs';

export function drawingRootSource(drawing, containers = []) {
  const group = drawing?.source?.group_context;
  if (group === null) return { state: 'selected', source: drawing.source, grouped: false };
  if (!group) return { state: 'unavailable', error: 'MissingDrawingGroupContext' };
  const roots = containers.filter(
    (c) => c.section === drawing.section && c.containerNode === group.root_anchor,
  );
  if (
    roots.length !== 1 ||
    roots[0].source.container_node !== group.root_anchor ||
    roots[0].source.group_context !== null
  )
    return { state: 'unavailable', error: 'AmbiguousDrawingGroupRoot' };
  return { state: 'selected', source: roots[0].source, grouped: true };
}

export function projectDrawingTextPage(
  drawing,
  containers,
  paragraphs,
  declaration,
  pageRows,
  measure,
  options,
) {
  const root = drawingRootSource(drawing, containers);
  if (root.state !== 'selected') return root;
  return root.grouped
    ? layoutGroupedDrawingText(
        drawing,
        root.source,
        paragraphs,
        declaration,
        pageRows,
        measure,
        options,
      )
    : projectFloatingDrawing(drawing, paragraphs, declaration, pageRows, measure, options);
}
