import { hwp5DrawingGeometry } from './hwp5-drawing-geometry.mjs';
import { validateHwp5DrawingLocalTransforms } from '../../js/hwp5-drawing-local-transforms.mjs';
import { validateHwp5DrawingRectangleCorners } from '../../js/hwp5-drawing-rectangle-corners.mjs';

// Root rectangles only. Group children need their own component geometry inventory.
export function projectHwp5RectangleGeometry(content) {
  const fail = (error) => ({ state: 'unavailable', error });
  try {
    if (
      content.hwp5DrawingErrors?.length ||
      content.hwp5DrawingLocalErrors?.length ||
      content.hwp5DrawingCornerErrors?.length
    )
      throw new Error('IncompleteHwp5RectangleGeometry');
    const drawings = [],
      seen = new Set();
    for (const drawing of content.hwp5Drawings ?? []) {
      if (drawing.source?.kind_id !== 0x24726563) throw new Error('UnsupportedHwp5RectangleRoot');
      const key = `${drawing.section}:${drawing.componentNode}`;
      if (
        seen.has(key) ||
        drawing.source.component_node !== drawing.componentNode ||
        drawing.source.control_node !== drawing.controlNode
      )
        throw new Error('AmbiguousHwp5RectangleGeometry');
      seen.add(key);
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter(
        (row) => row.section === drawing.section && row.component_node === drawing.componentNode,
      );
      const corners = (content.hwp5DrawingCorners ?? []).filter(
        (row) => row.section === drawing.section && row.component_node === drawing.componentNode,
      );
      if (locals.length !== 1 || corners.length !== 1)
        throw new Error('MissingHwp5RectangleGeometry');
      validateHwp5DrawingLocalTransforms(locals);
      validateHwp5DrawingRectangleCorners(corners);
      if (locals[0].owner_node !== drawing.controlNode)
        throw new Error('UnsupportedHwp5RectangleComponent');
      const source = hwp5DrawingGeometry(drawing.source);
      source.group_context = null;
      source.rendering = {
        matrix: [...locals[0].matrix],
        angle: drawing.source.rotation_angle,
        flip: [
          !!(drawing.source.component_attributes & 1),
          !!(drawing.source.component_attributes & 2),
        ],
        reverse: null,
        unknown_component_attributes: (drawing.source.component_attributes & ~3) >>> 0,
      };
      source.rendering_corners = corners[0].points.map((point) => [...point]);
      if (corners[0].raw_points !== undefined)
        source.rectangle = { points: corners[0].raw_points.map((point) => [...point]) };
      source.round_rate = corners[0].round_rate;
      drawings.push({
        section: drawing.section,
        drawingNode: drawing.componentNode,
        controlNode: drawing.controlNode,
        hostParagraph: drawing.hostParagraph,
        anchorUnit: drawing.anchorUnit,
        source,
      });
    }
    return { state: 'projected', drawings };
  } catch (error) {
    return fail(error.message);
  }
}
