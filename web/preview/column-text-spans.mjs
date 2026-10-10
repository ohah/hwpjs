/** Current text intervals; definitions and paragraph text remain borrowed. */
export function columnTextSpans(paragraph, flow) {
  const changes = flow.column_changes ?? [];
  if (!Array.isArray(changes)) throw new RangeError("InvalidColumnSpans");
  const points = [{ unit: 0, declaration: flow.column_start_declaration ?? flow.column_declaration }];
  const segments = new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(paragraph.text);
  let previous = 0;
  for (const change of changes) {
    if (!change || !Number.isInteger(change.unit) || change.unit < previous || change.unit > paragraph.text.length || !change.declaration || change.declaration.ambiguous) throw new RangeError("InvalidColumnSpans");
    if (change.unit < paragraph.text.length && segments.containing(change.unit)?.index !== change.unit) throw new RangeError("InvalidColumnSpans");
    previous = change.unit;
    if (points.at(-1).unit === change.unit) points[points.length - 1] = change;
    else points.push(change);
  }
  if (!points[0].declaration || points[0].declaration.ambiguous) throw new RangeError("UnsupportedColumnSpans");
  return points.flatMap((point, index) => {
    const endUnit = points[index + 1]?.unit ?? paragraph.text.length;
    return point.unit === endUnit && paragraph.text.length !== 0 ? [] : [{ startUnit: point.unit, endUnit, declaration: point.declaration }];
  });
}
