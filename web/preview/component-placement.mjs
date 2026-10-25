import { placeFloatingPicture } from "./picture-placement.mjs";

// Native shape source mapping is shared; callers establish transform/host policy.
export function placeFloatingComponentSource(source, boxes, options) {
  const geometry = source?.geometry;
  if (!geometry) return { state: "missing_geometry" };
  return placeFloatingPicture({
    geometry: {
      width: geometry.width, height: geometry.height,
      widthRelative: geometry.width_relative, heightRelative: geometry.height_relative,
      treatAsCharacter: geometry.treat_as_character,
      horizontalOffset: geometry.horizontal_offset, verticalOffset: geometry.vertical_offset,
    },
    position: source.position,
  }, boxes, options);
}
