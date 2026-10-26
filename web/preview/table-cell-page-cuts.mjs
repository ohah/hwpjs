// Plan vertical CELL fragments without cutting through any measured text row.
// Coordinates are table-local; placement and repeated headers remain separate.
export function planCellPageCuts(
  height,
  textBands,
  capacity,
  {
    maxPages = 2000,
    firstCapacity = capacity,
    mandatoryCuts = [],
    pageCapacities,
    fragmentCapacity,
  } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (
    ![height, capacity].every((value) => Number.isFinite(value) && value > 0) ||
    !Array.isArray(textBands) ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1
  )
    return unavailable("InvalidTableCellCuts");
  if (!Number.isFinite(firstCapacity) || firstCapacity < 0 || firstCapacity > capacity)
    return unavailable("InvalidTableCellCuts");
  if (fragmentCapacity !== undefined && typeof fragmentCapacity !== "function")
    return unavailable("InvalidTablePageCapacities");
  const variable = pageCapacities !== undefined || fragmentCapacity !== undefined;
  if (
    pageCapacities !== undefined &&
    (!Array.isArray(pageCapacities) ||
      !pageCapacities.length ||
      pageCapacities.length > maxPages ||
      Array.from(pageCapacities).some(
        (value) => !Number.isFinite(value) || value < 0 || value > capacity,
      ))
  )
    return unavailable("InvalidTablePageCapacities");
  const maximum =
    pageCapacities === undefined
      ? capacity
      : pageCapacities.reduce(
          (max, value, index) =>
            Math.max(max, index === 0 ? Math.min(value, firstCapacity) : value),
          0,
        );
  if (!Array.isArray(mandatoryCuts)) return unavailable("InvalidTableCellPageBreak");
  const required = new Set();
  for (const cut of mandatoryCuts) {
    if (!Number.isFinite(cut) || cut < 0 || cut >= height)
      return unavailable("InvalidTableCellPageBreak");
    required.add(cut);
    if (required.size > maxPages) return unavailable("TableCellPageLimit");
  }
  const cuts = [...required].sort((a, b) => a - b);
  const bands = [];
  for (const band of textBands) {
    if (
      !band ||
      ![band.start, band.end].every(Number.isFinite) ||
      band.start < 0 ||
      band.end <= band.start ||
      band.end > height
    )
      return unavailable("InvalidTableCellCuts");
    if (band.end - band.start > maximum)
      return {
        ...unavailable("TableCellLineTooTall"),
        cellBandStart: band.start,
        cellBandEnd: band.end,
        cellCapacity: maximum,
      };
    bands.push({ start: band.start, end: band.end });
  }
  bands.sort((a, b) => a.start - b.start || a.end - b.end);
  // Overlapping lines in different cells form one indivisible interval.
  const intervals = [];
  for (const band of bands) {
    const last = intervals.at(-1);
    if (last && band.start < last.end) last.end = Math.max(last.end, band.end);
    else intervals.push(band);
  }
  if (pageCapacities !== undefined)
    for (const band of intervals) {
      if (band.end - band.start > maximum)
        return {
          ...unavailable("TableCellLineTooTall"),
          cellBandStart: band.start,
          cellBandEnd: band.end,
          cellCapacity: maximum,
        };
    }
  let cutBand = 0;
  for (const cut of cuts) {
    while (cutBand < intervals.length && intervals[cutBand].end <= cut) cutBand++;
    if (intervals[cutBand]?.start < cut && cut < intervals[cutBand].end)
      return {
        ...unavailable("TableCellPageBreakIntersectsContent"),
        cellCut: cut,
        cellBandStart: intervals[cutBand].start,
        cellBandEnd: intervals[cutBand].end,
        cellCapacity: capacity,
      };
  }
  const fragments = [];
  const containingBand = (point) => {
    let low = 0,
      high = intervals.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (intervals[middle].end <= point) low = middle + 1;
      else high = middle;
    }
    const band = intervals[low];
    return band && band.start < point && point < band.end ? band : null;
  };
  let start = 0,
    interval = 0,
    nextCut = 0,
    firstPageSkipped = cuts[0] === 0 && firstCapacity < capacity;
  let pageIndex = Number(firstPageSkipped);
  const pageOffsets = [];
  while (start < height) {
    if ((variable ? pageIndex : fragments.length + Number(firstPageSkipped)) >= maxPages)
      return unavailable("TableCellPageLimit");
    if (pageCapacities !== undefined && pageIndex >= pageCapacities.length)
      return unavailable("IncompleteTablePageCapacities");
    let available = pageCapacities === undefined ? capacity : pageCapacities[pageIndex];
    if (variable ? pageIndex === 0 : fragments.length === 0 && !firstPageSkipped)
      available = Math.min(available, firstCapacity);
    while (nextCut < cuts.length && cuts[nextCut] <= start) nextCut++;
    let end = Math.min(height, start + available, cuts[nextCut] ?? height);
    while (interval < intervals.length && intervals[interval].end <= end) interval++;
    const crossing = intervals[interval];
    if (crossing && crossing.start < end && crossing.end > end) end = crossing.start;
    if (fragmentCapacity !== undefined) {
      // Capacity may decrease when a whole reference band enters the fragment.
      // Test exclusion boundaries as well as the upper bound: shrink-only
      // iteration would retain reservations for notes moved to the next page.
      const upper = end;
      let best = start;
      const probes = [
        upper,
        ...intervals.filter((b) => b.start > start && b.start < upper).map((b) => b.start),
      ];
      for (const probe of probes) {
        const reduced = fragmentCapacity({ start, end: probe, pageIndex, available });
        if (!Number.isFinite(reduced) || reduced < 0 || reduced > available)
          return unavailable("InvalidTablePageCapacities");
        let candidate = Math.min(probe, start + reduced);
        const band = containingBand(candidate);
        if (band) candidate = band.start;
        if (candidate <= best) continue;
        const final = fragmentCapacity({ start, end: candidate, pageIndex, available });
        if (!Number.isFinite(final) || final < 0 || final > available)
          return unavailable("InvalidTablePageCapacities");
        if (candidate - start <= final) best = candidate;
      }
      end = best;
      // The ordinary forward cursor may have passed bands excluded above.
      interval = 0;
    }
    if (end <= start) {
      if (variable) {
        pageIndex++;
        continue;
      }
      if (fragments.length === 0 && !firstPageSkipped && firstCapacity < capacity) {
        firstPageSkipped = true;
        continue;
      }
      return unavailable("TableCellLineTooTall");
    }
    fragments.push({ start, end, height: end - start });
    if (variable) pageOffsets.push(pageIndex++);
    start = end;
  }
  return {
    state: "planned",
    fragments,
    ...(variable
      ? { pageOffsets, pageCount: pageIndex }
      : firstPageSkipped
        ? { firstPageSkipped: true }
        : {}),
    ...(cuts.length ? { mandatoryCuts: cuts } : {}),
  };
}
