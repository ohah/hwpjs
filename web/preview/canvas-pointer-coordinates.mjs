// CSS client/scroll units to logical document units. Device pixel ratio is not zoom.
export function canvasDocumentPoint(event, bounds, scrollTop, scale = 1, scrollLeft = 0) {
  if (!Number.isFinite(scale) || scale <= 0) return { x: NaN, y: NaN };
  return { x: (event.clientX - bounds.left + scrollLeft) / scale, y: (event.clientY - bounds.top + scrollTop) / scale };
}
// Captured drags retain their logical handle origin despite canvas movement.
export function canvasDragPoint(event, origin, logical, scale = 1) {
  if (!Number.isFinite(scale) || scale <= 0) return { x: NaN, y: NaN };
  return { x: logical.x + (event.clientX - origin.clientX) / scale, y: logical.y + (event.clientY - origin.clientY) / scale };
}

// An absolutely positioned IME target uses CSS document coordinates; its scroll
// offset is applied by the viewport, not subtracted a second time here.
export function canvasDocumentBounds(bounds, scale = 1) {
  if (!Number.isFinite(scale) || scale <= 0 ||
      ![bounds.x, bounds.y, bounds.height].every(Number.isFinite) || bounds.height < 0) return null;
  const result = { x: bounds.x * scale, y: bounds.y * scale, height: bounds.height * scale };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

// Reveal the two-CSS-pixel input target without moving an already visible caret.
export function canvasCaretScrollLeft(x, scrollLeft, width) {
  if (![x, scrollLeft, width].every(Number.isFinite) || scrollLeft < 0 || width <= 0) return null;
  if (x < scrollLeft) return Math.max(0, x);
  if (x + 2 > scrollLeft + width) return Math.max(0, x + 2 - width);
  return scrollLeft;
}
