// Validate final page coordinates, after the root table's horizontal placement.
// Cell bounds are not paper bounds; visible overflow is never silently clipped.
export function nestedTablePaperBounds(boxes) {
  if (!Array.isArray(boxes)) return { state: "unavailable", error: "InvalidNestedTablePaperBounds" };
  for (const box of boxes) {
    if (!(box?.depth > 0)) continue;
    const paper = box.referenceBoxes?.paper;
    if (!paper || ![box.x, box.y, box.width, box.height, paper.x, paper.y, paper.width, paper.height,
      box.x + box.width, box.y + box.height, paper.x + paper.width, paper.y + paper.height].every(Number.isFinite)
      || box.width <= 0 || box.height <= 0 || paper.width <= 0 || paper.height <= 0)
      return { state: "unavailable", error: "InvalidNestedTablePaperBounds", tableNode: box.tableNode };
    if (box.x < paper.x - 1e-8 || box.y < paper.y - 1e-8
      || box.x + box.width > paper.x + paper.width + 1e-8 || box.y + box.height > paper.y + paper.height + 1e-8)
      return { state: "unavailable", error: "NestedTablePaperOverflow", tableNode: box.tableNode, listNode: box.listNode,
        rectangle: { x: box.x, y: box.y, width: box.width, height: box.height }, paper };
  }
  return { state: "contained" };
}
