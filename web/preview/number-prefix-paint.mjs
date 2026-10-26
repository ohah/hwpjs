import { rowLeft, rowTop, rowTextTop } from "./row-geometry.mjs";

// Stored prefix display uses its native owner's style, not a text code unit.
export function paintNumberPrefix(ctx, row, index, paragraph, fontAt, scrollTop) {
  if (!row.numberPrefix) return false;
  ctx.font = fontAt(paragraph, 0, "number-prefix");
  ctx.fillText(
    row.numberPrefix.text,
    rowLeft(row),
    rowTop(row, index) -
      scrollTop +
      rowTextTop(row) +
      (fontAt.script(paragraph, 0, "number-prefix")?.offset ?? 0),
  );
  return true;
}
