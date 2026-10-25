/** Per-line diagnostics/provenance; wrapping starts a new state. */
export function createTabRowState() {
  const placements = []; let unavailable = null, naturalX;
  return {
    add(measured, unit, x) {
      if (measured.sourceTab) placements.push({ unit, x, width: measured.width, ...measured.sourceTab });
      if (measured.sourceTab) naturalX = measured.sourceTab.start;
      else if (naturalX !== undefined) naturalX = Number.isFinite(measured.advance ?? measured.width) ? naturalX + (measured.advance ?? measured.width) : undefined;
      unavailable ??= measured.tabUnavailable ?? null;
    },
    naturalX() { return naturalX; },
    fields() {
      return { ...(placements.length ? { tabPlacements: placements.slice() } : {}),
        ...(unavailable ? { tabUnavailable: unavailable } : {}) };
    },
  };
}
