import { placeFloatingPicture } from "./picture-placement.mjs";

/** Source table rectangle; caller supplies real page/column/paragraph boxes. */
export function placeFloatingTable(table, boxes, options) {
  const source = table?.sourceGeometry, geometry = source?.geometry;
  if (!geometry) return { state: "missing_geometry" };
  return placeFloatingPicture({
    geometry: {
      width: geometry.width, height: geometry.height,
      widthRelative: geometry.width_relative, heightRelative: geometry.height_relative,
      treatAsCharacter: geometry.treat_as_character,
      horizontalOffset: geometry.horizontal_offset, verticalOffset: geometry.vertical_offset,
    },
    position: { relations: [source.vertical_relative, source.horizontal_relative, source.vertical_alignment, source.horizontal_alignment] },
  }, boxes, options);
}
