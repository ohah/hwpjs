import { hwpUnitPixels } from "./hwp-units.mjs";
import { arrowReferenceDimensions } from "./arrow-reference-dimensions.mjs";
// Explicit reference-rendering plan, independent of document editing rights.
export function decoratedLinePlan(geometry, source) {
  const attr = source?.attributes;
  const fail = (error) => ({ state: "unavailable", error });
  if (!geometry || !source || source.sourceOnly !== true || geometry.node !== source.node || !attr)
    return fail("LineSourceBindingMismatch");
  if (
    attr.style !== "SOLID" ||
    attr.endCap !== "FLAT" ||
    attr.outlineStyle !== "NORMAL" ||
    attr.alpha !== "0"
  )
    return fail("UnsupportedDecoratedLineStyle");
  if (
    typeof attr.color !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(attr.color) ||
    typeof attr.width !== "string" ||
    !/^\+?[0-9]+$/.test(attr.width.trim())
  )
    return fail("InvalidDecoratedLineStroke");
  const rawWidth = Number(attr.width);
  if (!Number.isSafeInteger(rawWidth) || rawWidth <= 0 || rawWidth > 0xffffffff)
    return fail("UnsupportedDecoratedLineWidth");
  if (
    !Array.isArray(geometry.endpoints) ||
    geometry.endpoints.length !== 2 ||
    !geometry.endpoints.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
  )
    return fail("InvalidDecoratedLineEndpoints");
  const endpoints = geometry.endpoints.map((p) => p.map(hwpUnitPixels));
  const length = Math.hypot(endpoints[1][0] - endpoints[0][0], endpoints[1][1] - endpoints[0][1]);
  if (!Number.isFinite(length) || length <= 0) return fail("DegenerateDecoratedLine");
  const width = hwpUnitPixels(rawWidth),
    arrows = [];
  for (const [side, index] of [
    ["head", 0],
    ["tail", 1],
  ]) {
    const style = attr[`${side}Style`];
    if (style === "NORMAL") continue;
    if (!["ARROW", "SPEAR"].includes(style)) return fail("UnsupportedArrowStyle");
    const rawFill = attr[`${side}fill`];
    if (!["0", "1", "false", "true"].includes(rawFill)) return fail("UnsupportedArrowFill");
    const dimensions = arrowReferenceDimensions(width, length, attr[`${side}Sz`]);
    if (!dimensions) return fail("UnsupportedArrowSize");
    arrows.push({
      style,
      tip: endpoints[index],
      direction: [
        endpoints[index][0] - endpoints[1 - index][0],
        endpoints[index][1] - endpoints[1 - index][1],
      ],
      length: dimensions.length,
      width: dimensions.width,
      fill: rawFill === "1" || rawFill === "true",
    });
  }
  return {
    state: "planned",
    policy: "rhwp_reference",
    endpoints,
    color: parseInt(attr.color.slice(1), 16),
    strokeWidth: width,
    arrows,
  };
}
