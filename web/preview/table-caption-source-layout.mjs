import { tableCaptionWidth } from "./table-caption-width.mjs";
import { layoutTableCaption } from "./table-caption-layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Resolve current source policy without assigning absent defaults. */
export function layoutSourceTableCaption(
  table,
  paragraphs,
  rectangle,
  measure,
  { maxRows = 20000 } = {},
) {
  const source = table?.sourceCaption;
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!source) return unavailable("MissingTableCaptionSource");
  if (source.text_direction !== 0) return unavailable("UnsupportedTableCaptionTextDirection");
  if (![0, 1].includes(source.line_wrap)) return unavailable("UnsupportedTableCaptionLineWrap");
  const resolved = tableCaptionWidth(table, rectangle);
  if (
    !resolved ||
    !Number.isSafeInteger(source.gap) ||
    source.gap < -0x80000000 ||
    source.gap > 0x7fffffff
  )
    return unavailable("InvalidTableCaptionSourceGeometry");
  const result = layoutTableCaption(table, paragraphs, rectangle, measure, {
    width: resolved.width,
    side: source.side,
    gap: hwpUnitPixels(source.gap),
    verticalAlignment: source.vertical_alignment,
    maxRows,
    squeeze: source.line_wrap === 1,
  });
  if (result.state !== "positioned" || resolved.offsetX === 0) return result;
  const x = result.captionRectangle.x + resolved.offsetX;
  const right = x + result.captionRectangle.width;
  const left = Math.min(rectangle.x, x);
  const width = Math.max(rectangle.x + rectangle.width, right) - left;
  if (![x, right, left, width].every(Number.isFinite))
    return unavailable("InvalidTableCaptionPosition");
  return {
    ...result,
    captionRectangle: { ...result.captionRectangle, x },
    bounds: { ...result.bounds, x: left, width },
    rows: result.rows.map((row) => ({ ...row, x: row.x + resolved.offsetX })),
  };
}
