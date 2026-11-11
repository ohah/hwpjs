import { rowLeft, rowTop, rowTextTop } from './row-geometry.mjs';

// Stored prefix display uses its native owner's style, not a text code unit.
export function paintNumberPrefix(ctx, row, index, paragraph, fontAt, scrollTop) {
  if (!row.numberPrefix) return false;
  const marker = row.numberPrefix;
  if (marker.kind === 'paragraph-marker') {
    ctx.save();
    try {
      ctx.font = fontAt(paragraph, marker.unit, marker.kind);
      ctx.fillStyle = fontAt.color?.(paragraph, marker.unit, marker.kind) ?? ctx.fillStyle;
      ctx.fillText(
        marker.text,
        rowLeft(row) + marker.offset,
        rowTop(row, index) - scrollTop + rowTextTop(row),
      );
    } finally {
      ctx.restore();
    }
    return true;
  }
  ctx.font = fontAt(paragraph, 0, 'number-prefix');
  ctx.fillText(
    row.numberPrefix.text,
    rowLeft(row),
    rowTop(row, index) -
      scrollTop +
      rowTextTop(row) +
      (fontAt.script(paragraph, 0, 'number-prefix')?.offset ?? 0),
  );
  return true;
}
