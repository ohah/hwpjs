import { colorrefCss } from "./colorref-css.mjs";
import { tableBorderStrokeParts } from "./table-border-stroke.mjs";

// HWP5 width codes are source enums. The common painter consumes pixel strokes.
const widths = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1, 1.5, 2, 3, 4, 5];
export function hwp5TableBorderPaintPlan(style) {
  let fill;
  const fail = error => ({ state: "unavailable", error, ...(fill ? { fill } : {}) });
  if (!style?.fill_known || style.unknown_fill_bytes !== null || style.extra_bytes !== 0 || style.additional_bytes !== 0) return fail("UnsupportedHwp5TableFill");
  if (style.fill_flags === 1) {
    const p = style.pattern;
    if (!p || p.kind !== -1 || style.gradient !== null || style.image !== null
      || style.alpha !== null && (style.alpha?.pattern !== 0 || style.alpha.gradient !== null || style.alpha.image !== null)) return fail("UnsupportedHwp5TableFill");
    if (p.background !== 0xffffffff) {
      const color = colorrefCss(p.background);
      if (!color) return fail("UnsupportedHwp5TableFillColor");
      fill = { state: "solid", color };
    }
  } else if (style.fill_flags !== 0) return fail("UnsupportedHwp5TableFill");
  if (style.attributes !== 0 || !Array.isArray(style.borders) || style.borders.length !== 5) return fail("UnsupportedHwp5TableBorder");
  const strokes = [];
  for (const [edge, border] of style.borders.slice(0, 4).entries()) {
    if (border?.kind === 0) continue;
    const color = colorrefCss(border?.color), width = Number.isInteger(border?.width) ? widths[border.width] : undefined;
    // BORDER_FILL kind8 is admitted independently of drawing LineType raw8.
    if (![1, 8].includes(border?.kind) || !color || !Number.isFinite(width)) return fail("UnsupportedHwp5TableBorder");
    const stroke = { edge, width: width * 96 / 25.4, color, ...(border.kind === 8 ? { compound: "DOUBLE_SLIM" } : {}) };
    if (!tableBorderStrokeParts(stroke)) return fail("UnsupportedHwp5TableBorder");
    strokes.push(stroke);
  }
  return { state: strokes.length ? "strokes" : "none", ...(strokes.length ? { strokes } : {}), ...(fill ? { fill } : {}) };
}

export function hwp5TableBorderPaintIndex(content) {
  const index = { available: true, cells: new Map() }, styles = new Map(content.hwp5BorderFillSources.map(style => [style.id, style]));
  const duplicateStyles = styles.size !== content.hwp5BorderFillSources.length;
  for (const table of content.tables ?? []) for (const cell of table.cells ?? []) {
    const key = `${table.section}:${table.tableNode}:${cell.listNode}`, source = cell.layoutSource;
    const style = source && styles.get(source.border_fill_id);
    const plan = index.cells.has(key) || duplicateStyles ? { state: "unavailable", error: "AmbiguousHwp5TableBorderSource" }
      : !style || source.table_record_node !== table.tableNode || source.list_node !== cell.listNode
        ? { state: "unavailable", error: "MissingHwp5TableBorderSource" } : hwp5TableBorderPaintPlan(style);
    index.cells.set(key, plan);
  }
  return index;
}
