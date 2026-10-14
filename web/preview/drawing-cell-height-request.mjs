/** Derive a view-only cell height floor from a proven cell-local collision failure. */
export function drawingCellHeightRequest(scope, failure) {
  const refused = () => ({ state: "unavailable", error: "InvalidDrawingCellHeightRequest" });
  if (scope?.state !== "scoped" || failure?.state !== "unavailable" || failure.error !== "DrawingNeedsNextPage") return refused();
  const owner = scope.cellOwner, body = scope.body, rectangle = failure.rectangle;
  if (!owner || ![owner.section, owner.tableNode, owner.listNode].every(value => Number.isSafeInteger(value) && value >= 0)
    || !Number.isFinite(owner.height) || owner.height <= 0) return refused();
  for (const box of [body, failure.body, rectangle]) {
    if (!box || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
      || box.width <= 0 || box.height <= 0) return refused();
  }
  if (!["x", "y", "width", "height"].every(key => body[key] === failure.body[key])
    || rectangle.x < body.x || rectangle.x + rectangle.width > body.x + body.width || rectangle.y < body.y) return refused();
  const overflow = rectangle.y + rectangle.height - (body.y + body.height);
  const minimumHeight = owner.height + overflow;
  if (!(overflow > 0) || !Number.isFinite(minimumHeight) || minimumHeight <= owner.height) return refused();
  return { state: "requested", section: owner.section, tableNode: owner.tableNode, listNode: owner.listNode, minimumHeight, overflow };
}
