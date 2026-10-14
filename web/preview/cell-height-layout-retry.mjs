/** Keep collision-derived height floors local to one bounded layout invocation. */
export function layoutWithCellHeightRetries(layout, { minimumCellHeight, maxAttempts = 32 } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (typeof layout !== "function" || minimumCellHeight !== undefined && typeof minimumCellHeight !== "function"
    || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 128) return fail("InvalidCellHeightLayoutRetry");
  const floors = new Map();
  const key = owner => `${owner.section}:${owner.tableNode}:${owner.listNode}`;
  const resolve = owner => {
    const original = minimumCellHeight ? minimumCellHeight(owner) : 0;
    return Number.isFinite(original) && original >= 0 ? Math.max(original, floors.get(key(owner)) ?? 0) : NaN;
  };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = layout(resolve), request = result?.cellHeightRequest;
    if (result?.state !== "unavailable" || request === undefined) return result;
    if (result.error !== "DrawingNeedsNextPage" || request?.state !== "requested"
      || ![request.section, request.tableNode, request.listNode].every(value => Number.isSafeInteger(value) && value >= 0)
      || !Number.isFinite(request.minimumHeight) || request.minimumHeight <= 0
      || !Number.isFinite(request.overflow) || request.overflow <= 0) return { ...result, cellHeightRetryError: "InvalidCellHeightLayoutRetry" };
    const previous = resolve(request);
    if (!Number.isFinite(previous) || request.minimumHeight <= previous) return { ...result, cellHeightRetryError: "CellHeightLayoutNoProgress" };
    if (attempt + 1 === maxAttempts) return { ...result, cellHeightRetryError: "CellHeightLayoutRetryLimit" };
    floors.set(key(request), request.minimumHeight);
  }
}
