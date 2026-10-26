import { validateHwp5DrawingComponentSources } from '../../js/hwp5-drawing-component-sources.mjs';
import { validateHwp5DrawingLocalTransforms } from '../../js/hwp5-drawing-local-transforms.mjs';
import { validateHwp5DrawingRectangleCorners } from '../../js/hwp5-drawing-rectangle-corners.mjs';
import { hwp5DrawingGeometry } from './hwp5-drawing-geometry.mjs';
import { projectHwp5GroupPolygonGeometry } from './hwp5-group-polygon-geometry.mjs';

const kinds = new Map([
  [0x24636f6e, 'container'],
  [0x24726563, 'rectangle'],
  [0x24706963, 'picture'],
  [0x246c696e, 'line'],
  [0x24706f6c, 'polygon'],
]);
// 그룹 원점은 최상위 object_common만 소유합니다. 자식 행렬은 다시 부모와 곱하지 않습니다.
export function projectHwp5GroupGeometry(content) {
  try {
    if (
      [
        'hwp5DrawingErrors',
        'hwp5DrawingComponentErrors',
        'hwp5DrawingLocalErrors',
        'hwp5DrawingCornerErrors',
      ].some((key) => content[key]?.length)
    )
      throw new Error('IncompleteHwp5GroupGeometry');
    const containers = [],
      rectangles = [],
      polygons = [],
      pictureBindings = [],
      lineBindings = [];
    for (const section of new Set(
      (content.hwp5DrawingComponents ?? []).map((row) => row.section),
    )) {
      const rows = validateHwp5DrawingComponentSources(
        content.hwp5DrawingComponents.filter((row) => row.section === section),
      );
      const byNode = new Map(rows.map((row) => [row.component_node, row]));
      const rootFor = (row) => {
        let current = row;
        while (current.second_id === null) current = byNode.get(current.owner_node);
        return current;
      };
      for (const row of rows) {
        const root = rootFor(row);
        if (root.kind_id !== 0x24636f6e) continue;
        const kind = kinds.get(row.kind_id);
        if (!kind) throw new Error('UnsupportedHwp5GroupChild');
        const anchors = (content.hwp5Drawings ?? []).filter(
          (item) => item.section === section && item.componentNode === root.component_node,
        );
        if (anchors.length !== 1 || anchors[0].controlNode !== root.owner_node)
          throw new Error('MissingHwp5GroupRootAnchor');
        const anchor = anchors[0];
        const locals = (content.hwp5DrawingLocalTransforms ?? []).filter(
          (item) => item.section === section && item.component_node === row.component_node,
        );
        if (locals.length !== 1 || locals[0].owner_node !== row.owner_node)
          throw new Error('MissingHwp5GroupLocalTransform');
        validateHwp5DrawingLocalTransforms(locals);
        const context =
          row.second_id !== null
            ? null
            : { parent_container: row.owner_node, root_anchor: root.component_node };
        const rendering = {
          matrix: [...locals[0].matrix],
          angle: row.rotation_angle,
          flip: [!!(row.attributes & 1), !!(row.attributes & 2)],
          reverse: null,
          unknown_component_attributes: (row.attributes & ~3) >>> 0,
        };
        const binding = {
          section,
          hostParagraph: anchor.hostParagraph,
          anchorUnit: anchor.anchorUnit,
        };
        if (kind === 'container') {
          const source = row.second_id !== null ? hwp5DrawingGeometry(anchor.source) : {};
          Object.assign(source, {
            container_node: row.component_node,
            group_context: context,
            rendering,
            component: structuredClone(row),
            shape_children: rows
              .filter((child) => child.owner_node === row.component_node)
              .map((child) => ({
                node: child.component_node,
                kind: kinds.get(child.kind_id) ?? 'unsupported',
              })),
          });
          containers.push({ ...binding, containerNode: row.component_node, source });
        } else if (kind === 'rectangle') {
          const corners = (content.hwp5DrawingCorners ?? []).filter(
            (item) => item.section === section && item.component_node === row.component_node,
          );
          if (corners.length !== 1 || !corners[0].raw_points)
            throw new Error('MissingHwp5GroupRectangleCorners');
          validateHwp5DrawingRectangleCorners(corners);
          rectangles.push({
            ...binding,
            drawingNode: row.component_node,
            source: {
              group_context: context,
              rendering,
              rendering_corners: corners[0].points.map((point) => [...point]),
              rectangle: { points: corners[0].raw_points.map((point) => [...point]) },
              round_rate: corners[0].round_rate,
              component: structuredClone(row),
            },
          });
        } else if (kind === 'polygon') {
          const polygon = projectHwp5GroupPolygonGeometry(content, row, locals[0]);
          if (polygon.state !== 'projected') throw new Error(polygon.error);
          polygons.push({
            ...binding,
            drawingNode: row.component_node,
            source: { ...polygon.source, group_context: context, rendering },
          });
        } else if (kind === 'line')
          lineBindings.push({
            ...binding,
            lineNode: row.component_node,
            parentContainer: row.owner_node,
            rootAnchor: root.component_node,
            component: structuredClone(row),
          });
        else
          pictureBindings.push({
            ...binding,
            pictureNode: row.component_node,
            parentContainer: row.owner_node,
            rootAnchor: root.component_node,
            component: structuredClone(row),
          });
      }
    }
    const declaredRoots = (content.hwp5Drawings ?? []).filter(
      (row) => row.source?.kind_id === 0x24636f6e,
    );
    if (
      declaredRoots.length !== containers.filter((row) => row.source.group_context === null).length
    )
      throw new Error('IncompleteHwp5GroupRoots');
    return { state: 'projected', containers, rectangles, polygons, pictureBindings, lineBindings };
  } catch (error) {
    return { state: 'unavailable', error: error.message };
  }
}
