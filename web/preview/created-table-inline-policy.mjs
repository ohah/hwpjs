import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";

// New HWPX tables have a fixed native authoring policy. HWP5 is explicit.
export function createdTableInlinePolicy(table, format) {
  if (format === "hwpx") return true;
  if (format !== "hwp5") return false;
  const { common, table: policy, cell } = table?.hwp5Policy ?? {};
  if (!common || !policy || !cell) return false;
  let flags;
  try {
    flags = hwp5ObjectFlags(common.flags);
  } catch {
    return false;
  }
  const zeroInsets = (values) =>
    Array.isArray(values) && values.length === 4 && values.every((value) => value === 0);
  return (
    flags.treat_as_character &&
    flags.width_relative === 4 &&
    flags.height_relative === 2 &&
    !flags.has_caption &&
    common.offset_x === 0 &&
    common.offset_y === 0 &&
    common.z_order === 0 &&
    common.prevent_page_break === false &&
    zeroInsets(common.margins) &&
    [0, 1, 2].includes(policy.page_break) &&
    policy.repeat_header === false &&
    policy.cell_spacing === 0 &&
    zeroInsets(policy.margins) &&
    cell.attributes === 0 &&
    zeroInsets(cell.margins) &&
    ((cell.layout === "observed8" && cell.unknown === 0) ||
      (cell.layout === "spec6" && cell.unknown === null))
  );
}
