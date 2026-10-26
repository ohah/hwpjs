import { projectHwp5GroupGeometry } from './hwp5-group-geometry-projection.mjs';
import { projectHwp5DrawingText } from './hwp5-drawing-text-projection.mjs';
import { projectHwp5PictureGeometry } from './hwp5-picture-geometry.mjs';
import { hwp5DrawingPaintPlan } from './hwp5-drawing-paint-plan.mjs';
import { bindHwp5RootPictureCaptions } from './hwp5-picture-caption-bindings.mjs';
import { bindHwp5RootGroupCaptions } from './hwp5-group-caption-bindings.mjs';
import { projectHwp5RectangleGeometry } from './hwp5-rectangle-geometry-projection.mjs';
import { assembleHwp5RectangleContent } from './hwp5-rectangle-content-projection.mjs';

export function projectHwp5GroupContent(content) {
  if ((content.hwp5Drawings ?? []).some((row) => row.source.kind_id !== 0x24636f6e))
    return { state: 'unavailable', error: 'UnsupportedMixedHwp5GroupRoots' };
  return assembleHwp5GroupContent(content);
}

// Caller validates mixed root kinds; geometry/text inventories remain complete.
export function assembleHwp5GroupContent(content) {
  const fail = (error) => ({ state: 'unavailable', error });
  const geometry = projectHwp5GroupGeometry(content);
  if (geometry.state !== 'projected') return geometry;
  for (const binding of geometry.lineBindings) {
    const lines = (content.lines ?? []).filter(
      (row) =>
        row.section === binding.section &&
        row.anchorNode === binding.lineNode &&
        row.groupContext?.rootAnchor === binding.rootAnchor &&
        row.groupContext?.parentContainer === binding.parentContainer,
    );
    if (lines.length !== 1 || content.lineErrors?.some((row) => row.section === binding.section))
      return fail('IncompleteHwp5GroupedLineSources');
  }
  const text = projectHwp5DrawingText(content);
  if (text.state !== 'projected') return text;
  // Keep the complete text inventory: filtering paragraphs by root kind loses
  // sibling captions and breaks the native paragraph identities used by edits.
  const rectangleRoots = (content.hwp5Drawings ?? []).filter(
    (row) => row.source.kind_id === 0x24726563,
  );
  let rootDrawings = [];
  if (rectangleRoots.length) {
    const rootGeometry = projectHwp5RectangleGeometry({ ...content, hwp5Drawings: rectangleRoots });
    if (rootGeometry.state !== 'projected') return rootGeometry;
    const rootContent = assembleHwp5RectangleContent(content, rootGeometry, text);
    if (rootContent.state !== 'projected') return rootContent;
    rootDrawings = rootContent.content.drawings;
  }
  const captionedGroups = bindHwp5RootGroupCaptions(content, geometry.containers, text.bindings);
  if (captionedGroups.state !== 'projected') return captionedGroups;
  const pictureRoots = new Set(
    (content.hwp5Drawings ?? [])
      .filter((row) => row.source.kind_id === 0x24706963)
      .map((row) => `${row.section}:${row.componentNode}`),
  );
  const groupRoots = new Set(
    captionedGroups.containers
      .filter((row) => row.source.group_context === null)
      .map((row) => `${row.section}:${row.containerNode}`),
  );
  const rectangleKeys = new Set(rootDrawings.map((row) => `${row.section}:${row.drawingNode}`));
  if (
    text.bindings.some(
      (row) =>
        row.kind === 'caption' &&
        !pictureRoots.has(`${row.section}:${row.drawingNode}`) &&
        !groupRoots.has(`${row.section}:${row.drawingNode}`) &&
        !rectangleKeys.has(`${row.section}:${row.drawingNode}`),
    )
  )
    return fail('UnsupportedHwp5GroupCaption');
  if (content.hwp5DrawingStyleErrors?.length) return fail('IncompleteHwp5GroupPaintSources');
  const pictures = projectHwp5PictureGeometry(content);
  if (pictures.state !== 'projected') return pictures;
  if (pictures.pictures.some((row) => row.paintError))
    return fail('UnsupportedHwp5GroupPicturePaint');
  const captionedPictures = bindHwp5RootPictureCaptions(content, pictures.pictures, text.bindings);
  if (captionedPictures.state !== 'projected') return captionedPictures;
  const rectangles = [...rootDrawings],
    polygons = [],
    drawings = [...rootDrawings];
  for (const shape of [...geometry.rectangles, ...geometry.polygons]) {
    const styles = (content.hwp5DrawingStyles ?? []).filter(
      (row) =>
        row.section === shape.section &&
        row.component_node === shape.drawingNode &&
        row.owner_node === shape.source.component.owner_node,
    );
    if (styles.length !== 1) return fail('MissingHwp5GroupPaintSource');
    const paint = hwp5DrawingPaintPlan(styles[0]);
    if (paint.state !== 'planned') return paint;
    const bindings = text.bindings.filter(
      (row) => row.section === shape.section && row.drawingNode === shape.drawingNode,
    );
    if (bindings.length > 1) return fail('AmbiguousHwp5GroupText');
    const polygon = shape.source.rendering_polygon !== undefined;
    if (polygon && bindings.length) return fail('UnsupportedHwp5GroupPolygonText');
    if (shape.source.rendering_polygon?.length === 2 && paint.fill.state !== 'none')
      return fail('UnsupportedHwp5PolylineFill');
    const source = {
      ...shape.source,
      text: bindings[0]?.text ?? null,
      caption: null,
      stroke: paint.stroke,
      paint: { shadow_type: paint.shadowType },
    };
    const current = {
      ...shape,
      source,
      hwp5Style: structuredClone(styles[0]),
      fillPlan: paint.fill,
    };
    (polygon ? polygons : rectangles).push(current);
    if (bindings.length) drawings.push(current);
  }
  if (
    text.bindings.some(
      (binding) =>
        !drawings.some(
          (row) => row.section === binding.section && row.drawingNode === binding.drawingNode,
        ) &&
        !captionedPictures.pictures.some(
          (row) =>
            binding.kind === 'caption' &&
            row.section === binding.section &&
            row.pictureNode === binding.drawingNode &&
            row.caption?.caption_node === binding.caption?.caption_node,
        ) &&
        !captionedGroups.containers.some(
          (row) =>
            binding.kind === 'caption' &&
            row.section === binding.section &&
            row.containerNode === binding.drawingNode &&
            row.source.caption?.caption_node === binding.caption?.caption_node,
        ),
    )
  )
    return fail('MissingHwp5GroupTextGeometry');
  return {
    state: 'projected',
    content: {
      ...content,
      paragraphs: text.paragraphs,
      containers: captionedGroups.containers,
      rectangles,
      polygons,
      drawings,
      pictures: captionedPictures.pictures,
    },
  };
}
