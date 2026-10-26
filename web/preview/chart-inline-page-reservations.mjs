import { inlinePictureRowPlacement } from './inline-picture-row-placement.mjs';
import { rowTextHeight } from './row-geometry.mjs';
const tolerance = 1e-7;

// Final measured UTF-16 anchor geometry, shared with inline Canvas placement.
export function reserveInlineChartPages(charts, content, body) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!Array.isArray(charts) || !Array.isArray(body?.rows))
    return fail('IncompleteInlineChartMeasurement');
  const reservations = [];
  for (const chart of charts) {
    const item = chart?.inlineItem;
    if (!item) return fail('UnsupportedInlineChartPage');
    const competing = [
      ...(content.pictures ?? []),
      ...(content.tables ?? []),
      ...(content.drawings ?? []),
    ];
    if (
      competing.some(
        (other) =>
          other.section === chart.section &&
          (other.hostParagraph ?? other.paragraph) === chart.paragraph &&
          other.anchorUnit === chart.anchorUnit,
      )
    )
      return fail('AmbiguousInlineChartAnchor');
    const hosts = body.rows
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          row.kind === 'text' &&
          row.section === chart.section &&
          row.paragraph === chart.paragraph &&
          row.startUnit <= chart.anchorUnit &&
          row.endUnit > chart.anchorUnit,
      );
    if (hosts.length !== 1) return fail('AmbiguousInlineChartAnchor');
    const { row, index } = hosts[0];
    if (
      row.transform !== undefined ||
      !Number.isSafeInteger(row.pageOrdinal) ||
      row.pageOrdinal < 0
    )
      return fail('UnsupportedInlineChartTransform');
    const placement = inlinePictureRowPlacement(item, row, index);
    if (placement.state !== 'placed') return placement;
    const boundaries = row.boundaries,
      at = boundaries.findIndex((boundary) => boundary.unit === chart.anchorUnit);
    const advance = boundaries[at + 1]?.x - boundaries[at]?.x;
    const textHeight = rowTextHeight(row);
    if (
      !Number.isFinite(advance) ||
      Math.abs(advance - item.width) > tolerance ||
      !Number.isFinite(textHeight) ||
      textHeight < item.height
    )
      return fail('IncompleteInlineChartMeasurement');
    const box = row.referenceBoxes?.column ?? row.referenceBoxes?.page,
      r = placement.rectangle;
    if (
      !box ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0 ||
      r.x < box.x - tolerance ||
      r.y < box.y - tolerance ||
      r.x + r.width > box.x + box.width + tolerance ||
      r.y + r.height > box.y + box.height + tolerance
    )
      return fail('InlineChartPageOverflow');
    reservations.push({
      section: chart.section,
      oleNode: chart.node,
      wrapper: chart.wrapper,
      paragraph: chart.paragraph,
      anchorUnit: chart.anchorUnit,
      pageOrdinal: row.pageOrdinal,
      columnOrdinal: row.columnOrdinal,
      rectangle: r,
      inline: true,
      paintable: true,
    });
  }
  return { state: 'reserved', reservations };
}
