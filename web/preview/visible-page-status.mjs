// Read-only viewport projection of the current measured layout.
export function visiblePageStatus(layout, top, height) {
  if (
    layout?.state !== "paginated" ||
    !Array.isArray(layout.pages) ||
    !Number.isFinite(top) ||
    top < 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(top + height)
  )
    return null;
  let previousEnd = -Infinity,
    best = null,
    bestOverlap = 0;
  for (let index = 0; index < layout.pages.length; index++) {
    const page = layout.pages[index],
      box = page?.paper;
    if (
      page?.ordinal !== index ||
      (page.section !== undefined && (!Number.isSafeInteger(page.section) || page.section < 0)) ||
      !Number.isFinite(box?.y) ||
      box.y < 0 ||
      !Number.isFinite(box?.height) ||
      box.height <= 0 ||
      !Number.isFinite(box.y + box.height) ||
      box.y < previousEnd
    )
      return null;
    previousEnd = box.y + box.height;
    const overlap = Math.max(0, Math.min(top + height, previousEnd) - Math.max(top, box.y));
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = page;
    }
  }
  return best
    ? {
        ordinal: best.ordinal,
        section: best.section ?? null,
        displayedPages: layout.pages.length,
        limited: layout.limited === true,
      }
    : null;
}
