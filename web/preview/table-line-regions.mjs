import { pictureLineRegions } from "./picture-line-regions.mjs";

/** Tables have a rectangular outline: tight wrapping excludes that rectangle. */
export function tableLineRegions(line, rectangle, table) {
  const source = table?.sourceGeometry;
  if (!source || source.geometry?.treat_as_character !== false) return { state: "unsupported_table_wrap" };
  if (![0, 1, 4].includes(source.text_wrap)) return { state: "unsupported_table_wrap" };
  if (![0, 1, 2, 3].includes(source.text_flow)) return { state: "unsupported_table_flow" };
  if (!Array.isArray(source.out_margin) || source.out_margin.length !== 4 || !source.out_margin.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0x7fffffff)) return { state: "invalid_table_margins" };
  // This selects the rectangle exclusion primitive, not a new source wrap value.
  const flow = { textWrap: source.text_wrap === 1 ? 1 : 0, textFlow: source.text_flow, outsideMargins: source.out_margin };
  const result = pictureLineRegions(line, rectangle, flow);
  return { ...result, sourceWrap: source.text_wrap };
}
