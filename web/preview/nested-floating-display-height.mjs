import { hwpUnitPixels } from "./hwp-units.mjs";
import { placeFloatingTable } from "./table-placement.mjs";

// Current measured display height; never rewrite the source table size.
export function nestedFloatingDisplayHeight({ table, measured }) {
  const source = table?.sourceGeometry,
    g = source?.geometry;
  if (!Number.isInteger(g?.height) || g.height <= 0 || g.height > 0xffffffff) return null;
  const declared = hwpUnitPixels(g.height);
  if (measured === undefined) return declared;
  if (
    measured?.state !== "measured" ||
    ![measured.grid?.width, measured.grid?.height].every((v) => Number.isFinite(v) && v > 0)
  )
    return null;
  if (measured.grid.height <= declared) return declared;
  // Only the existing absolute-size, paragraph-top block flow can grow without
  // recomputing a relative-size or CENTER/BOTTOM reference frame.
  if (
    g.treat_as_character !== false ||
    g.height_relative !== 2 ||
    g.width_relative !== 4 ||
    !Number.isInteger(g.width) ||
    g.width <= 0 ||
    g.width > 0xffffffff ||
    measured.grid.width > hwpUnitPixels(g.width) + 1e-8 ||
    source.text_wrap !== 1 ||
    source.vertical_relative !== 2 ||
    source.vertical_alignment !== 0 ||
    source.flow_with_text !== true ||
    source.allow_overlap !== false
  )
    return declared;
  return measured.grid.height;
}

export function placeMeasuredNestedFloatingTable(entry, references) {
  const placed = placeFloatingTable(entry.table, references);
  if (placed.state !== "placed") return placed;
  const height = nestedFloatingDisplayHeight(entry);
  if (height === null) return { state: "invalid_size" };
  if (
    height <= hwpUnitPixels(entry.table.sourceGeometry.geometry.height) ||
    height <= placed.rectangle.height
  )
    return placed;
  if (!Number.isFinite(placed.rectangle.y + height)) return { state: "invalid_bounds" };
  return { ...placed, rectangle: { ...placed.rectangle, height } };
}
