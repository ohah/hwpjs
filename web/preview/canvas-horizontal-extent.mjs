// Current paper bounds determine scroll width; source caches are not consulted.
export function canvasHorizontalExtent(pages, minimumWidth, padding = 0, scale = 1) {
  if (![minimumWidth, padding].every(value => Number.isFinite(value) && value >= 0) || !Number.isFinite(scale) || scale <= 0) return null;
  if (pages === undefined) return minimumWidth;
  if (!Array.isArray(pages)) return null;
  let width = minimumWidth;
  for (const page of pages) {
    const paper = page?.paper;
    if (![paper?.x, paper?.width].every(value => Number.isFinite(value) && value >= 0)) return null;
    const right = (paper.x + paper.width + padding) * scale;
    if (!Number.isFinite(right)) return null;
    width = Math.max(width, right);
  }
  return width;
}
