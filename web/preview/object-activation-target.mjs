const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
const contains = (r, x, y) =>
  r &&
  [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
  r.width > 0 &&
  r.height > 0 &&
  x >= r.x &&
  y >= r.y &&
  x < r.x + r.width &&
  y < r.y + r.height;

/** Actual painted object frames only; this query grants no mutation authority. */
export function objectActivationTarget(
  { content, layout, charts, picture, outlines, borderTolerance = 5 },
  x,
  y,
) {
  if (![x, y].every(Number.isFinite)) return null;
  const hits = new Map();
  const add = (target) => {
    if (!uint(target.section)) return;
    const node =
      target.kind === 'chart'
        ? target.wrapper
        : target.kind === 'picture'
          ? target.pictureNode
          : target.drawingNode;
    if (uint(node)) hits.set(`${target.kind}:${target.section}:${node}`, Object.freeze(target));
  };
  if (picture?.picture)
    add({
      kind: 'picture',
      section: picture.picture.section,
      pictureNode: picture.picture.pictureNode,
    });
  // Match direct input's existing picture selection, including pictures inside text boxes.
  if (hits.size === 1) return hits.values().next().value;
  for (const item of charts ?? [])
    if (contains(item, x, y))
      add({ kind: 'chart', section: item.target.section, wrapper: item.target.wrapper });
  if (hits.size) return hits.size === 1 ? hits.values().next().value : null;
  const owners = new Map();
  for (const drawing of content.drawings ?? []) {
    const id = `${drawing.section}:${drawing.drawingNode}`;
    owners.set(id, owners.has(id) ? null : drawing);
  }
  const border = (rectangle) =>
    contains(rectangle, x, y) &&
    Number.isFinite(borderTolerance) &&
    borderTolerance > 0 &&
    Math.min(
      x - rectangle.x,
      y - rectangle.y,
      rectangle.x + rectangle.width - x,
      rectangle.y + rectangle.height - y,
    ) <= borderTolerance;
  const drawing = (item, rectangle) => {
    const owner = owners.get(`${item.section}:${item.drawingNode}`);
    if (
      !owner ||
      owner.hostParagraph !== item.hostParagraph ||
      owner.anchorUnit !== item.anchorUnit ||
      owner.source?.transform_identity !== true ||
      owner.source?.rendering?.angle !== 0 ||
      owner.source?.group_context != null ||
      !border(rectangle)
    )
      return;
    add({ kind: 'drawing', section: owner.section, drawingNode: owner.drawingNode });
  };
  for (const item of layout.placedDrawings ?? []) drawing(item, item.rectangle);
  for (const item of [...(outlines?.front ?? []), ...(outlines?.behind ?? [])])
    drawing(item.drawing, item.origin);
  // An overlapping different object is ambiguous; do not open a different owner's dialog.
  return hits.size === 1 ? hits.values().next().value : null;
}
