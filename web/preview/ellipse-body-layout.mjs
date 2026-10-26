import { projectEllipsePage } from './ellipse-page-projection.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { ellipsePaintPlan, ellipsePaintGeometry } from './ellipse-paint.mjs';
import { projectGroupedEllipse } from './grouped-ellipse-page-projection.mjs';
import { validGroupContext } from '../../js/hwpx-group-context.mjs';
export function layoutEllipseBody(content, measure, maxRows, layoutBody) {
  const fail = (error) => ({ state: 'unavailable', error });
  const anchors = [],
    nodes = new Set(),
    units = new Set();
  const groupOwners = new Map();
  for (const item of content.ellipses) {
    const row = item?.source,
      section = item?.section,
      paragraph = row?.owner?.paragraph - 1,
      unit = row?.owner?.anchor_unit;
    const owner = content.paragraphs.find(
      (p) => p.section === section && p.paragraph === paragraph,
    );
    const group = row?.common?.group_context;
    if (group) {
      const roots = (content.containers ?? []).filter(
        (c) => c.section === section && c.containerNode === group.root_anchor,
      );
      if (
        !validGroupContext(group, row.node) ||
        row.owner?.anchor_node !== group.root_anchor ||
        roots.length !== 1 ||
        roots[0].source?.group_context !== null ||
        !owner ||
        owner.drawingText ||
        owner.drawingCaption ||
        !Number.isSafeInteger(unit) ||
        unit < 0 ||
        owner.text[unit] !== '\ufffc' ||
        row.sourceOnly !== true ||
        nodes.has(`${section}:${row.node}`)
      )
        return fail('UnsupportedEllipseGroupOwner');
      const key = `${section}:${group.root_anchor}`,
        previous = groupOwners.get(key),
        root = roots[0];
      if (
        (previous && (previous.paragraph !== paragraph || previous.unit !== unit)) ||
        (root.hostParagraph !== undefined && root.hostParagraph !== paragraph) ||
        (root.anchorUnit !== undefined && root.anchorUnit !== unit)
      )
        return fail('AmbiguousEllipseGroupOwner');
      groupOwners.set(key, { paragraph, unit });
      nodes.add(`${section}:${row.node}`);
      continue;
    }
    if (
      !row?.common ||
      row.sourceOnly !== true ||
      row.owner.anchor_node !== row.node ||
      !owner ||
      owner.tableCell ||
      owner.drawingText ||
      owner.drawingCaption ||
      !Number.isSafeInteger(unit) ||
      unit < 0 ||
      owner.text[unit] !== '\ufffc'
    )
      return fail('UnsupportedEllipseBodyOwner');
    const key = `${section}:${row.node}`,
      position = `${section}:${paragraph}:${unit}`;
    if (
      nodes.has(key) ||
      units.has(position) ||
      content.tables?.some(
        (t) => t.section === section && t.hostParagraph === paragraph && t.anchorUnit === unit,
      ) ||
      content.pictures?.some(
        (p) => p.section === section && p.paragraph === paragraph && p.anchorUnit === unit,
      ) ||
      content.floatingDrawingAnchors?.some(
        (a) =>
          a.section === section &&
          (a.node === row.node || (a.paragraph === paragraph && a.anchorUnit === unit)),
      )
    )
      return fail('AmbiguousEllipseBodyAnchor');
    nodes.add(key);
    units.add(position);
    anchors.push({ section, paragraph, anchorUnit: unit, node: row.node });
  }
  const containers = content.containers?.map((root) => {
    const owner = groupOwners.get(`${root.section}:${root.containerNode}`);
    return owner ? { ...root, hostParagraph: owner.paragraph, anchorUnit: owner.unit } : root;
  });
  const body = {
    ...content,
    containers,
    ellipses: [],
    floatingDrawingAnchors: [...(content.floatingDrawingAnchors ?? []), ...anchors],
  };
  const measured = (text, p, unit, kind) =>
    kind === 'text' && text === '\ufffc' && units.has(`${p.section}:${p.paragraph}:${unit}`)
      ? { width: 0, height: textMeasurement(measure('', p, unit, kind)).height }
      : measure(text, p, unit, kind);
  const result = layoutBody(body, measured, maxRows);
  if (result.state !== 'paginated') return result;
  const placements = [];
  for (const item of content.ellipses) {
    const group = item.source.common.group_context;
    const placed = group
      ? projectGroupedEllipse(
          item.section,
          item.source,
          containers.find(
            (c) => c.section === item.section && c.containerNode === group.root_anchor,
          )?.source,
          content.paragraphs,
          result.rows,
        )
      : projectEllipsePage(item.section, item.source, content.paragraphs, result.rows);
    if (placed.state !== 'placed') return placed;
    const paintPlan = ellipsePaintGeometry(placed)
      ? ellipsePaintPlan(content, item)
      : { state: 'unavailable', error: 'UnsupportedEllipseShearPaint' };
    placements.push({ ...placed, paintPlan });
  }
  const pending = placements.filter((p) => p.paintPlan.state !== 'planned');
  return {
    ...result,
    placedEllipses: placements,
    ...(pending.length
      ? {
          objectCoverage: 'incomplete',
          unrenderedObjects: [
            ...(result.unrenderedObjects ?? []),
            ...pending.map((p) => ({
              section: p.section,
              ellipseNode: p.node,
              error: p.paintPlan.error ?? 'UnsupportedEllipseShearPaint',
            })),
          ],
        }
      : {}),
  };
}
