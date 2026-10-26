// Actual footprints stay unchanged; TOP_BOTTOM continuation blocks only body flow.
export function floatingTableBodyExclusions(placements, page) {
  return placements
    .filter((placement) => placement.pageOrdinal === page.ordinal && !placement.inline)
    .map((placement) =>
      placement.table.sourceGeometry.text_wrap === 1 &&
      placement.fragmentOrdinal < placement.fragmentCount - 1
        ? {
            ...placement,
            footprint: {
              ...placement.footprint,
              height: page.page.y + page.page.height - placement.footprint.y,
            },
          }
        : placement,
    );
}

// A logical table anchor has no glyph row to trigger the ordinary line walker.
export function floatingTableAnchorCursor(placements, page, y) {
  let next = y;
  for (const placement of floatingTableBodyExclusions(placements, page)) {
    const rectangle = placement.footprint;
    if (
      placement.table.sourceGeometry.text_wrap === 1 &&
      y >= rectangle.y &&
      y < rectangle.y + rectangle.height
    )
      next = Math.max(next, rectangle.y + rectangle.height);
  }
  return next;
}
