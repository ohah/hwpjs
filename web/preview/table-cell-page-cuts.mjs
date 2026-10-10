// Plan vertical CELL fragments without cutting through any measured text row.
// Coordinates are table-local; placement and repeated headers remain separate.
export function planCellPageCuts(height, textBands, capacity, { maxPages = 2000, firstCapacity = capacity } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (![height, capacity].every(value => Number.isFinite(value) && value > 0) || !Array.isArray(textBands) || !Number.isSafeInteger(maxPages) || maxPages < 1) return unavailable("InvalidTableCellCuts");
  if (!Number.isFinite(firstCapacity) || firstCapacity < 0 || firstCapacity > capacity) return unavailable("InvalidTableCellCuts");
  const bands = [];
  for (const band of textBands) {
    if (!band || ![band.start, band.end].every(Number.isFinite) || band.start < 0 || band.end <= band.start || band.end > height) return unavailable("InvalidTableCellCuts");
    if (band.end - band.start > capacity) return unavailable("TableCellLineTooTall");
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
  const fragments = [];
  let start = 0, interval = 0, firstPageSkipped = false;
  while (start < height) {
    if (fragments.length + Number(firstPageSkipped) >= maxPages) return unavailable("TableCellPageLimit");
    const available = fragments.length === 0 && !firstPageSkipped ? firstCapacity : capacity;
    let end = Math.min(height, start + available);
    while (interval < intervals.length && intervals[interval].end <= end) interval++;
    const crossing = intervals[interval];
    if (crossing && crossing.start < end && crossing.end > end) end = crossing.start;
    if (end <= start) {
      if (fragments.length === 0 && !firstPageSkipped && firstCapacity < capacity) { firstPageSkipped = true; continue; }
      return unavailable("TableCellLineTooTall");
    }
    fragments.push({ start, end, height: end - start });
    start = end;
  }
  return { state: "planned", fragments, ...(firstPageSkipped ? { firstPageSkipped: true } : {}) };
}
