import { validateCreatedTables } from "./hwpx-created-tables.mjs";
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const keys = (v, names) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((k) => Object.hasOwn(v, k));
const integer = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
const margins = (v) =>
  Array.isArray(v) && v.length === 4 && v.every((n) => integer(n, -32768, 32767));
export function decodeHwp5CreatedTables(bytes) {
  const fail = () => {
    throw new Error("InvalidHwp5CreatedTables");
  };
  const rows = JSON.parse(decoder.decode(bytes));
  if (
    !Array.isArray(rows) ||
    rows.length > 100000 ||
    rows.some((r) => !keys(r, ["table", "options"]))
  )
    fail();
  validateCreatedTables(
    rows.map((row) => row.table),
    { hostBase: 0 },
  );
  for (const row of rows) {
    const o = row.options;
    if (!keys(o, ["common", "table", "cell"])) fail();
    const c = o.common,
      t = o.table,
      l = o.cell;
    if (
      !keys(c, [
        "flags",
        "offset_y",
        "offset_x",
        "z_order",
        "margins",
        "prevent_page_break",
        "description",
      ]) ||
      !integer(c.flags, 0, 0xffffffff) ||
      ![c.offset_y, c.offset_x, c.z_order].every((n) => integer(n, -2147483648, 2147483647)) ||
      !margins(c.margins) ||
      typeof c.prevent_page_break !== "boolean" ||
      typeof c.description !== "string" ||
      !c.description.isWellFormed()
    )
      fail();
    if (
      !keys(t, ["page_break", "repeat_header", "cell_spacing", "margins"]) ||
      !integer(t.page_break, 0, 2) ||
      typeof t.repeat_header !== "boolean" ||
      !integer(t.cell_spacing, -32768, 32767) ||
      !margins(t.margins)
    )
      fail();
    if (
      !keys(l, ["layout", "unknown", "attributes", "margins"]) ||
      !integer(l.attributes, 0, 0xffffffff) ||
      !margins(l.margins) ||
      !(
        (l.layout === "spec6" && l.unknown === null) ||
        (l.layout === "observed8" && integer(l.unknown, 0, 65535))
      )
    )
      fail();
  }
  return rows;
}
