/** Gap is measured in bar widths; overlap controls adjacent-series advance. */
export function chartBarSpacing(settings, seriesCount, categoryCount, grouping) {
  if (![seriesCount, categoryCount].every((value) => Number.isSafeInteger(value) && value > 0))
    return { state: "unavailable", reason: "InvalidBarSpacingCount" };
  const gapDefaulted = settings.gap_width == null,
    overlapDefaulted = settings.overlap == null;
  const gap = gapDefaulted ? 150 : settings.gap_width.value;
  // Missing overlap remains a labelled preview choice, not a native default.
  const overlap = overlapDefaulted ? (grouping === "clustered" ? 0 : 100) : settings.overlap.value;
  if (gap === null || overlap === null)
    return { state: "unavailable", reason: "MissingBarSpacingValue" };
  if (
    !Number.isInteger(gap) ||
    gap < 0 ||
    gap > 500 ||
    !Number.isInteger(overlap) ||
    overlap < -100 ||
    overlap > 100
  )
    return { state: "unavailable", reason: "InvalidBarSpacing" };
  const advanceFactor = 1 - overlap / 100,
    groupFactor = 1 + (seriesCount - 1) * advanceFactor;
  const band = 1 / categoryCount / (groupFactor + gap / 100);
  const advance = advanceFactor * band,
    inset = (1 / categoryCount - groupFactor * band) / 2;
  return {
    state: "ready",
    gap_width: gap,
    overlap,
    gap_width_defaulted: gapDefaulted,
    overlap_defaulted: overlapDefaulted,
    band,
    advance,
    inset,
    warnings: [
      ...(gapDefaulted ? ["DefaultGapWidth"] : []),
      ...(overlapDefaulted ? ["PreviewDefaultOverlap"] : []),
    ],
  };
}
