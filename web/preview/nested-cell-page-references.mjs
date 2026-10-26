// Caption columns are local layout frames; ordinary items use the physical page frame.
export function nestedCellPageReferences(item, placement, dx, dy) {
  if (item.captionNode === undefined) return placement.referenceBoxes;
  const column = item.referenceBoxes?.column;
  if (
    !column ||
    ![
      dx,
      dy,
      column.x,
      column.y,
      column.width,
      column.height,
      column.x + dx,
      column.y + dy,
      column.x + dx + column.width,
      column.y + dy + column.height,
    ].every(Number.isFinite) ||
    column.width <= 0 ||
    column.height <= 0
  )
    throw Error('InvalidNestedCaptionBounds');
  return { ...placement.referenceBoxes, column: { ...column, x: column.x + dx, y: column.y + dy } };
}
