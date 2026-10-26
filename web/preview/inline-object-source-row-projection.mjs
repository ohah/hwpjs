import { projectInlineObjectPages } from './inline-object-page-projection.mjs';

// Bind native object units to final source fragments, not pre-projection runs.
export function projectInlineObjectSourceRows(objects, rows) {
  const fail = () => ({ state: 'unavailable', error: 'InvalidInlineObjectSourceRows' });
  if (
    !Array.isArray(objects) ||
    !Array.isArray(rows) ||
    objects.some((object) => !object) ||
    rows.some((row) => !row)
  )
    return fail();
  const anchors = [];
  for (const object of objects) {
    const matches = rows
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          row.kind === 'text' &&
          row.section === object.section &&
          row.paragraph === object.paragraph &&
          row.startUnit <= object.unit &&
          object.unit < row.endUnit,
      );
    if (matches.length !== 1) return fail();
    const { row, index } = matches[0],
      points = row.boundaries?.filter((point) => point.unit === object.unit);
    if (points?.length !== 1) return fail();
    anchors.push({
      objectNode: object.objectNode,
      unit: object.unit,
      rowIndex: index,
      x: (row.paragraphX ?? 0) + points[0].x,
      y: 0,
      width: object.width,
      height: object.height,
    });
  }
  return projectInlineObjectPages({ state: 'measured', rows, anchors }, rows);
}
