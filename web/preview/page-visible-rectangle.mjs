// 표시 교집합만 계산합니다. 원본 사각형과 저장 데이터는 변경하지 않습니다.
const validBox = (box) =>
  box &&
  [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
    Number.isFinite,
  ) &&
  box.width >= 0 &&
  box.height >= 0;
export function pageContainsPoint(page, x, y) {
  return Boolean(
    validBox(page) &&
    page.width > 0 &&
    page.height > 0 &&
    [x, y].every(Number.isFinite) &&
    x >= page.x &&
    y >= page.y &&
    x <= page.x + page.width &&
    y <= page.y + page.height,
  );
}
export function pageVisibleRectangle(rectangle, page) {
  if (!validBox(rectangle) || !validBox(page) || page.width <= 0 || page.height <= 0)
    return { state: 'invalid_page_clip' };
  const x = Math.max(rectangle.x, page.x),
    y = Math.max(rectangle.y, page.y);
  const right = Math.min(rectangle.x + rectangle.width, page.x + page.width);
  const bottom = Math.min(rectangle.y + rectangle.height, page.y + page.height);
  if (right <= x || bottom <= y) return { state: 'hidden', rectangle: null };
  return {
    state: 'visible',
    rectangle: { x, y, width: right - x, height: bottom - y },
    clipped:
      x !== rectangle.x ||
      y !== rectangle.y ||
      right !== rectangle.x + rectangle.width ||
      bottom !== rectangle.y + rectangle.height,
  };
}
