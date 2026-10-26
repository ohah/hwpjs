import { assembleHwp5GroupContent } from './hwp5-group-content-projection.mjs';
import { hwp5PolygonPathSource } from './hwp5-polygon-path-source.mjs';
import { hwp5DrawingGeometry } from './hwp5-drawing-geometry.mjs';
import { hwp5DrawingPaintPlan } from './hwp5-drawing-paint-plan.mjs';

// Preserve the complete group/text/picture inventory; never repartition owned paragraphs.
export function projectHwp5GroupedMixedContent(content) {
  const fail = (error) => ({ state: 'unavailable', error });
  try {
    const roots = content.hwp5Drawings ?? [];
    if (
      !roots.some((row) => row.source?.kind_id === 0x24636f6e) ||
      roots.some(
        (row) => ![0x24636f6e, 0x24726563, 0x24706963, 0x24706f6c].includes(row.source?.kind_id),
      )
    )
      return fail('UnsupportedHwp5GroupedMixedRoots');
    if (['hwp5PolygonPointErrors', 'hwp5DrawingStyleErrors'].some((key) => content[key]?.length))
      return fail('IncompleteHwp5GroupedPolygonSources');
    const groups = assembleHwp5GroupContent(content);
    if (groups.state !== 'projected') return groups;
    const polygons = [...(groups.content.polygons ?? [])];
    for (const root of roots.filter((row) => row.source.kind_id === 0x24706f6c)) {
      const rows = (content.hwp5PolygonPoints ?? []).filter(
        (row) => row.section === root.section && row.component_node === root.componentNode,
      );
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter(
        (row) => row.section === root.section && row.component_node === root.componentNode,
      );
      const styles = (content.hwp5DrawingStyles ?? []).filter(
        (row) =>
          row.section === root.section &&
          row.component_node === root.componentNode &&
          row.owner_node === root.controlNode,
      );
      if (
        rows.length !== 1 ||
        locals.length !== 1 ||
        locals[0].owner_node !== root.controlNode ||
        styles.length !== 1
      )
        return fail('MissingHwp5GroupedPolygonSource');
      const path = hwp5PolygonPathSource(rows[0]);
      if (path.state !== 'planned') return path;
      if (
        root.source.rotation_angle !== 0 ||
        root.source.component_attributes !== 0 ||
        !Array.isArray(locals[0].matrix) ||
        locals[0].matrix.length !== 6 ||
        !Array.from(locals[0].matrix).every((value, i) => value === [1, 0, 0, 0, 1, 0][i])
      )
        return fail('UnsupportedHwp5GroupedPolygonTransform');
      const source = hwp5DrawingGeometry(root.source),
        { width, height } = source.geometry;
      if (
        source.has_caption ||
        ![2, 3].includes(source.text_wrap) ||
        rows[0].points.some(([x, y]) => x < 0 || y < 0 || x > width || y > height)
      )
        return fail('UnsupportedHwp5GroupedPolygonFlow');
      const paint = hwp5DrawingPaintPlan(styles[0]);
      if (paint.state !== 'planned') return paint;
      if (path.source.rendering_polygon.length === 2 && paint.fill.state !== 'none')
        return fail('UnsupportedHwp5PolylineFill');
      Object.assign(source, path.source, {
        group_context: null,
        text: null,
        caption: null,
        rendering: {
          matrix: [...locals[0].matrix],
          angle: 0,
          flip: [false, false],
          reverse: null,
          unknown_component_attributes: 0,
        },
        rendering_corners: [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ],
        stroke: paint.stroke,
        paint: { shadow_type: paint.shadowType },
      });
      polygons.push({
        section: root.section,
        drawingNode: root.componentNode,
        controlNode: root.controlNode,
        hostParagraph: root.hostParagraph,
        anchorUnit: root.anchorUnit,
        source,
        hwp5Style: structuredClone(styles[0]),
      });
    }
    return { state: 'projected', content: { ...groups.content, polygons } };
  } catch (error) {
    return fail(error.message);
  }
}
