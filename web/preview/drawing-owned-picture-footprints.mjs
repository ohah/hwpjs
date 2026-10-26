// Local inline pictures move with their drawing. Preserve their occupied bounds
// in the parent's obstacle instead of making the drawing collide with itself.
export function combineDrawingPictureFootprints(footprints, bindings) {
  const validBox = (b) =>
    b &&
    [b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(Number.isFinite) &&
    b.width > 0 &&
    b.height > 0;
  if (!Array.isArray(footprints) || !Array.isArray(bindings))
    return { state: "unavailable", error: "InvalidDrawingPictureFootprint" };
  const removed = new Set(),
    parents = new Map();
  for (const binding of bindings) {
    if (
      !binding ||
      ![binding.section, binding.drawingNode, binding.pictureNode].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    )
      return { state: "unavailable", error: "InvalidDrawingPictureFootprint" };
    const matches = (kind, node) =>
      footprints.filter((f) => f.kind === kind && f.section === binding.section && f.node === node);
    const own = matches("drawing", binding.drawingNode),
      child = matches("picture", binding.pictureNode);
    if (
      own.length !== 1 ||
      child.length !== 1 ||
      !Number.isSafeInteger(own[0].pageOrdinal) ||
      own[0].pageOrdinal < 0 ||
      own[0].pageOrdinal !== child[0].pageOrdinal ||
      removed.has(child[0]) ||
      !validBox(own[0].rectangle) ||
      !validBox(child[0].rectangle)
    )
      return { state: "unavailable", error: "AmbiguousDrawingPictureFootprint", ...binding };
    removed.add(child[0]);
    const current = parents.get(own[0]) ?? own[0],
      a = current.rectangle,
      b = child[0].rectangle;
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y);
    const rectangle = {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
    if (
      ![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) ||
      rectangle.width <= 0 ||
      rectangle.height <= 0
    )
      return { state: "unavailable", error: "InvalidDrawingPictureFootprint", ...binding };
    parents.set(own[0], { ...own[0], rectangle });
  }
  return {
    state: "collected",
    footprints: footprints.filter((f) => !removed.has(f)).map((f) => parents.get(f) ?? f),
  };
}
