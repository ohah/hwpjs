// Source adapters own raw styles; only validated SOLID strokes reach this painter.
export function tableDiagonalPaintPlan(direction, stroke) {
  if (direction === 'none') return {};
  if (direction === null)
    return {
      diagonalDiagnostic: { state: 'unsupported', reason: 'UnsupportedTableDiagonalShape' },
    };
  if (!['rising', 'falling', 'cross'].includes(direction) || !stroke)
    return {
      diagonalDiagnostic: { state: 'unsupported', reason: 'UnsupportedTableDiagonalStroke' },
    };
  if (stroke.none) return {};
  const directions = direction === 'cross' ? ['rising', 'falling'] : [direction];
  const diagonals = directions.map((direction) => ({ ...stroke, direction }));
  return validTableDiagonals(diagonals)
    ? { diagonals }
    : { diagonalDiagnostic: { state: 'unsupported', reason: 'UnsupportedTableDiagonalStroke' } };
}

export function validTableDiagonals(diagonals) {
  return (
    Array.isArray(diagonals) &&
    diagonals.length <= 2 &&
    new Set(diagonals.map((s) => s?.direction)).size === diagonals.length &&
    Array.from(diagonals).every(
      (s) =>
        s &&
        ['rising', 'falling'].includes(s.direction) &&
        Number.isFinite(s.width) &&
        s.width > 0 &&
        typeof s.color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(s.color) &&
        s.compound === undefined &&
        s.edge === undefined,
    )
  );
}

export function paintTableDiagonals(ctx, box, diagonals, scrollTop) {
  if (
    !validTableDiagonals(diagonals) ||
    !box ||
    ![
      box.x,
      box.y,
      box.width,
      box.height,
      scrollTop,
      box.x + box.width,
      box.y - scrollTop,
      box.y - scrollTop + box.height,
    ].every(Number.isFinite) ||
    box.width <= 0 ||
    box.height <= 0
  )
    return false;
  if (!diagonals.length) return true;
  const x = box.x,
    y = box.y - scrollTop,
    right = x + box.width,
    bottom = y + box.height;
  // This clip intersects the caller's row/scroll clip in its current transform.
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, box.width, box.height);
    ctx.clip();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    for (const stroke of diagonals) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      ctx.moveTo(x, stroke.direction === 'rising' ? bottom : y);
      ctx.lineTo(right, stroke.direction === 'rising' ? y : bottom);
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
  return true;
}
