import { pictureLineRegions } from "./picture-line-regions.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Tables have a rectangular outline: tight wrapping excludes that rectangle. */
export function tableLineRegions(
  line,
  rectangle,
  table,
  { footprint, fragmentOrdinal, fragmentCount } = {},
) {
  const source = table?.sourceGeometry;
  if (!source || source.geometry?.treat_as_character !== false)
    return { state: "unsupported_table_wrap" };
  if (![0, 1, 4].includes(source.text_wrap)) return { state: "unsupported_table_wrap" };
  if (![0, 1, 2, 3].includes(source.text_flow)) return { state: "unsupported_table_flow" };
  if (
    !Array.isArray(source.out_margin) ||
    source.out_margin.length !== 4 ||
    !source.out_margin.every(
      (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff,
    )
  )
    return { state: "invalid_table_margins" };
  const fragmented = fragmentOrdinal !== undefined || fragmentCount !== undefined;
  if (
    fragmented &&
    (!Number.isSafeInteger(fragmentOrdinal) ||
      !Number.isSafeInteger(fragmentCount) ||
      fragmentCount < 1 ||
      fragmentOrdinal < 0 ||
      fragmentOrdinal >= fragmentCount)
  )
    return { state: "invalid_table_footprint" };
  const effectiveMargins = source.out_margin.map((value, index) =>
    (index === 2 && fragmented && fragmentOrdinal > 0) ||
    (index === 3 && fragmented && fragmentOrdinal < fragmentCount - 1)
      ? 0
      : value,
  );
  if (
    footprint !== undefined &&
    (!footprint ||
      ![
        footprint.x,
        footprint.y,
        footprint.width,
        footprint.height,
        footprint.x + footprint.width,
        footprint.y + footprint.height,
      ].every(Number.isFinite) ||
      footprint.width <= 0 ||
      footprint.height <= 0)
  )
    return { state: "invalid_table_footprint" };
  if (footprint !== undefined) {
    if (
      !rectangle ||
      ![
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
        rectangle.x + rectangle.width,
        rectangle.y + rectangle.height,
      ].every(Number.isFinite) ||
      rectangle.width <= 0 ||
      rectangle.height <= 0
    )
      return { state: "invalid_table_footprint" };
    const [left, right, top, bottom] = effectiveMargins.map(hwpUnitPixels);
    if (
      footprint.x > rectangle.x - left + 1e-8 ||
      footprint.y > rectangle.y - top + 1e-8 ||
      footprint.x + footprint.width < rectangle.x + rectangle.width + right - 1e-8 ||
      footprint.y + footprint.height < rectangle.y + rectangle.height + bottom - 1e-8
    )
      return { state: "invalid_table_footprint" };
  }
  // This selects the rectangle exclusion primitive, not a new source wrap value.
  const flow = {
    textWrap: source.text_wrap === 1 ? 1 : 0,
    textFlow: source.text_flow,
    outsideMargins: footprint === undefined ? effectiveMargins : [0, 0, 0, 0],
  };
  const result = pictureLineRegions(line, footprint ?? rectangle, flow);
  return { ...result, sourceWrap: source.text_wrap };
}
