const validBox = (box) =>
  box &&
  [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
    Number.isFinite,
  ) &&
  box.width > 0 &&
  box.height > 0;
const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Explicit current-page policy; exhaustion requires pagination, not overlap. */
export function restrictDrawingPlacement(
  rectangle,
  body,
  occupied,
  { section, pageOrdinal, restrictToBody, allowOverlap },
) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !validBox(rectangle) ||
    !validBox(body) ||
    !Array.isArray(occupied) ||
    !Number.isSafeInteger(section) ||
    section < 0 ||
    !Number.isSafeInteger(pageOrdinal) ||
    pageOrdinal < 0 ||
    typeof restrictToBody !== 'boolean' ||
    typeof allowOverlap !== 'boolean'
  )
    return fail('InvalidRestrictedDrawingPlacement');
  if (
    occupied.some(
      (item) =>
        !item ||
        !validBox(item.rectangle) ||
        !Number.isSafeInteger(item.section) ||
        item.section < 0 ||
        !Number.isSafeInteger(item.pageOrdinal) ||
        item.pageOrdinal < 0,
    )
  )
    return fail('InvalidDrawingCollisionInventory');
  if (restrictToBody && rectangle.height > body.height) return fail('DrawingExceedsBodyHeight');
  const placed = { ...rectangle };
  if (restrictToBody)
    placed.y = Math.max(body.y, Math.min(placed.y, body.y + body.height - placed.height));
  const effectiveOverlap = !restrictToBody && allowOverlap;
  const blockers = new Set();
  if (!effectiveOverlap) {
    const candidates = occupied.filter(
      (item) => item.section === section && item.pageOrdinal === pageOrdinal,
    );
    for (let i = 0; i <= candidates.length; i++) {
      const hits = candidates.filter((item) => overlaps(placed, item.rectangle));
      if (!hits.length) break;
      for (const item of hits) blockers.add(item);
      let next = placed.y;
      for (const item of hits) next = Math.max(next, item.rectangle.y + item.rectangle.height);
      if (!Number.isFinite(next) || next <= placed.y)
        return fail('InvalidDrawingCollisionInventory');
      placed.y = next;
      if (!Number.isFinite(placed.y + placed.height))
        return fail('InvalidRestrictedDrawingPlacement');
    }
    if (candidates.some((item) => overlaps(placed, item.rectangle)))
      return fail('UnresolvedDrawingCollision');
  }
  if (restrictToBody && placed.y + placed.height > body.y + body.height)
    return {
      ...fail('DrawingNeedsNextPage'),
      rectangle: placed,
      body: { ...body },
      blockers: [...blockers].map((item) => ({
        section: item.section,
        pageOrdinal: item.pageOrdinal,
        node: item.node,
        kind: item.kind,
        rectangle: { ...item.rectangle },
      })),
    };
  return { state: 'placed', rectangle: placed, effectiveAllowOverlap: effectiveOverlap };
}
