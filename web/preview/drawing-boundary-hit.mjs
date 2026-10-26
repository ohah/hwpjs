/** 이미 배치된 글상자 테두리만 호스트의 보호 객체 앞/뒤 커서로 연결합니다. */
export function hitDrawingBoundary(layout, x, y, target = null) {
  if (![x, y].every(Number.isFinite)) return null;
  for (const drawing of (layout.placedDrawings ?? []).toReversed()) {
    if (
      target &&
      (drawing.section !== target.section || drawing.hostParagraph !== target.paragraph)
    )
      continue;
    const box = drawing.rectangle;
    if (
      !box ||
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0 ||
      !Number.isInteger(drawing.anchorUnit) ||
      drawing.anchorUnit < 0
    )
      continue;
    if (
      !layout.rows.some(
        (row) =>
          row.kind === 'text' &&
          row.section === drawing.section &&
          row.paragraph === drawing.hostParagraph &&
          row.editable === true,
      )
    )
      continue;
    const right = box.x + box.width,
      bottom = box.y + box.height;
    if (x < box.x - 4 || x > right + 4 || y < box.y - 4 || y > bottom + 4) continue;
    if (
      Math.min(
        Math.abs(x - box.x),
        Math.abs(x - right),
        Math.abs(y - box.y),
        Math.abs(y - bottom),
      ) > 4
    )
      continue;
    const after = x >= box.x + box.width / 2;
    return {
      section: drawing.section,
      paragraph: drawing.hostParagraph,
      unit: drawing.anchorUnit + Number(after),
      affinity: after ? 'backward' : 'forward',
      drawingNode: drawing.drawingNode,
    };
  }
  return null;
}
