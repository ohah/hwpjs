// Bounded prototype spacing projection; glyphs keep their original font size.
export function squeezeCaptionRow(row) {
  if (row.kind !== "text") return row;
  const boundaries = row.boundaries;
  if (!Number.isFinite(row.width) || row.width <= 0 || !Array.isArray(boundaries) || boundaries.length < 1) return null;
  let previous = 0;
  for (const boundary of boundaries) {
    if (!Number.isFinite(boundary.x) || boundary.x < previous) return null;
    previous = boundary.x;
  }
  const natural = boundaries.at(-1).x;
  if (natural <= row.width) return row;
  if (boundaries.length < 3) return null;
  for (let i = 1; i < boundaries.length; i++) if (boundaries[i].x - boundaries[i - 1].x > row.width) return null;
  const lastAdvance = natural - boundaries.at(-2).x;
  const available = row.width - lastAdvance, preceding = natural - lastAdvance;
  if (available <= 0 || preceding <= 0) return null;
  let ratio = available / preceding;
  for (let i = 1; i < boundaries.length - 1; i++) {
    const advance = boundaries[i + 1].x - boundaries[i].x;
    if (boundaries[i].x > 0) ratio = Math.min(ratio, (row.width - advance) / boundaries[i].x);
  }
  if (ratio <= 0 || !Number.isFinite(ratio)) return null;
  return { ...row, boundaries: boundaries.map((boundary, index) => ({ ...boundary, x: index === boundaries.length - 1 ? row.width : boundary.x * ratio })) };
}
