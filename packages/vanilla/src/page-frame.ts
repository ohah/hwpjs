// @ts-ignore Canonical paper extent and padding; no second layout model.
import { canvasHorizontalExtent } from '../../../web/preview/canvas-horizontal-extent.mjs';
// @ts-ignore Shared renderer geometry constant.
import { TEXT_LEFT } from '../../../web/preview/row-geometry.mjs';

interface PageLayout {
  state?: string;
  pages?: readonly { paper?: { x: number; width: number } }[];
  memoPaneRight?: number;
}

/** Position the document stage inside a full-width scroll viewport. */
export function canvasSurfacePageFrame(
  layout: PageLayout | undefined,
  available: number,
  scale = 1,
  scrollbarWidth = 0,
) {
  if (
    !Number.isFinite(available) ||
    available <= 0 ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(scrollbarWidth) ||
    scrollbarWidth < 0 ||
    scrollbarWidth >= available ||
    layout?.state !== 'paginated' ||
    !Array.isArray(layout.pages) ||
    !layout.pages.length
  )
    return null;
  let left = Infinity,
    right = -Infinity;
  for (const page of layout.pages) {
    const paper = page?.paper;
    if (
      !paper ||
      ![paper.x, paper.width, paper.x + paper.width].every(Number.isFinite) ||
      paper.x < 0 ||
      paper.width <= 0
    )
      return null;
    left = Math.min(left, paper.x);
    right = Math.max(right, paper.x + paper.width);
  }
  let extent = canvasHorizontalExtent(layout.pages, 0, TEXT_LEFT, scale);
  if (extent === null) return null;
  if (layout.memoPaneRight !== undefined) {
    if (!Number.isFinite(layout.memoPaneRight) || layout.memoPaneRight < 0) return null;
    extent = Math.max(extent, (layout.memoPaneRight + TEXT_LEFT) * scale);
  }
  if (!Number.isFinite(extent) || extent <= 0) return null;
  const width = Math.min(available, extent + scrollbarWidth);
  const marginLeft = Math.max(
    0,
    Math.min(available - width, (available - (left + right) * scale) / 2),
  );
  return { width, marginLeft, contentWidth: extent };
}
