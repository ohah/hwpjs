import { validateHwp5PageSettings } from "../../js/hwp5-page-settings.mjs";
/** Explicit HWP5 flags -> common reference contract, not an enum cast. */
export function hwp5PageGeometry(source) {
  if (
    !source ||
    !Number.isInteger(source.section) ||
    source.section < 0 ||
    source.section > 0xffffffff
  )
    throw new Error("InvalidHwp5PageSection");
  // Validate all raw fields/flags before constructing any geometry.
  validateHwp5PageSettings(source);
  if ((source.flags & ~7) !== 0 || source.extra_bytes !== 0)
    throw new Error("UnsupportedHwp5PageExtension");
  return {
    section_ordinal: source.section,
    element_index: source.source_node,
    width: source.width,
    height: source.height,
    // Common reference 'narrowly' swaps the dimensions; HWP5 bit0=1 does so.
    orientation: source.orientation === "widely" ? "narrowly" : "widely",
    gutter_type: { one_side: "left_only", facing: "left_right", top: "top_bottom" }[source.binding],
    margin: Object.fromEntries(
      ["header", "footer", "gutter", "left", "right", "top", "bottom"].map((name) => [
        name,
        source[name],
      ]),
    ),
    duplicate_margins: 0,
  };
}
