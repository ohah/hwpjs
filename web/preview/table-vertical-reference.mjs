import { alignedReferenceCoordinate } from "./picture-placement.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

/** Resolve declared physical coordinates only; body-flow policy stays separate. */
export function tableVerticalReference(source, bounds) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    !bounds ||
    ![0, 1].includes(source?.vertical_relative) ||
    ![0, 1, 2].includes(source?.vertical_alignment) ||
    source.geometry?.treat_as_character !== false
  )
    return fail("UnsupportedTableVerticalReference");
  const offset = signedInt32(source.geometry.vertical_offset);
  const top = source.vertical_relative === 0 ? bounds.paperTop : bounds.pageTop;
  const bottom = source.vertical_relative === 0 ? bounds.paperBottom : bounds.pageBottom;
  if (
    offset === null ||
    ![top, bottom, bounds.height, bounds.pageTop, bounds.pageBottom].every(Number.isFinite) ||
    bottom <= top ||
    bounds.height <= 0 ||
    bounds.pageBottom <= bounds.pageTop ||
    !Number.isFinite(bottom - top)
  )
    return fail("InvalidTableVerticalReference");
  const y = alignedReferenceCoordinate(
    top,
    bottom - top,
    bounds.height,
    hwpUnitPixels(offset),
    source.vertical_alignment,
  );
  if (![y, y + bounds.height].every(Number.isFinite)) return fail("InvalidTableVerticalReference");
  return {
    state: "resolved",
    y,
    bottom: y + bounds.height,
    referenceTop: top,
    referenceBottom: bottom,
    outsideBody: y < bounds.pageTop || y + bounds.height > bounds.pageBottom,
  };
}
