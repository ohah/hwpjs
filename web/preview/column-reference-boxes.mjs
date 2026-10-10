import { hwpUnitPixels } from "./hwp-units.mjs";

/** Source column geometry, independent of shaping and pagination. */
export function columnReferenceBoxes(body, declaration, maxColumns = 1024) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!body || ![body.x, body.y, body.width, body.height, body.x + body.width, body.y + body.height].every(Number.isFinite) || body.width <= 0 || body.height <= 0) return unavailable("InvalidColumnBody");
  if (!Number.isSafeInteger(maxColumns) || maxColumns < 1 || !declaration || declaration.ambiguous !== false || !Number.isInteger(declaration.count) || declaration.count < 1 || declaration.count > maxColumns) return unavailable("InvalidColumnDeclaration");
  if (![true, false].includes(declaration.same_size) || declaration.kind !== "newspaper" || !["left", "right"].includes(declaration.direction)) return unavailable("UnsupportedColumnLayout");
  if (declaration.same_size === false) {
    const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
    if (!Array.isArray(declaration.sizes) || declaration.sizes.length !== declaration.count || declaration.sizes.some(size => !size || !uint(size.width) || size.width === 0 || !uint(size.gap))) return unavailable("InvalidColumnSizes");
    let cursor = body.x;
    const boxes = declaration.sizes.map(size => {
      const box = { x: cursor, y: body.y, width: hwpUnitPixels(size.width), height: body.height };
      cursor += box.width + hwpUnitPixels(size.gap);
      return box;
    });
    if (!Number.isFinite(cursor)) return unavailable("InvalidColumnWidth");
    if (declaration.direction === "right") boxes.reverse();
    return { state: "placed", boxes };
  }
  if (!Number.isInteger(declaration.gap) || declaration.gap < 0 || declaration.gap > 0xffffffff) return unavailable("MissingColumnGap");
  const gap = hwpUnitPixels(declaration.gap), count = declaration.count;
  const width = (body.width - gap * (count - 1)) / count;
  if (!Number.isFinite(width) || width <= 0) return unavailable("InvalidColumnWidth");
  const boxes = Array.from({ length: count }, (_, index) => ({ x: body.x + index * (width + gap), y: body.y, width, height: body.height }));
  if (declaration.direction === "right") boxes.reverse();
  return { state: "placed", boxes };
}
