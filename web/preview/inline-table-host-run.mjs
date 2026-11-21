// The table host projection already owns these units. Paint and pointer ink
// must skip the same host runs; other U+FFFC display glyphs stay ordinary ink.
export function isInlineTableHostUnit(row, unit) {
  return row.inlineTables?.some((table) => table.unit === unit) === true;
}

// Collect covering units once, then join the projected anchors in one pass.
// Unit membership also preserves paint's strict equality (NaN never matches).
export function inlineTableHostPoint(row, localX) {
  const point = { tableNodes: new Set(), hasHostInk: false };
  if (!Array.isArray(row.boundaries)) return point;
  const units = new Set();
  for (let index = 1; index < row.boundaries.length; index++) {
    const start = row.boundaries[index - 1],
      end = row.boundaries[index];
    if (localX >= start.x && localX < end.x) units.add(start.unit);
  }
  if (!units.size) return point;
  const tableUnits = new Set();
  for (const table of row.inlineTables ?? []) {
    const unit = table.unit;
    if (Number.isNaN(unit)) continue;
    tableUnits.add(unit);
    if (units.has(unit) && Number.isSafeInteger(table.tableNode) && table.tableNode >= 0)
      point.tableNodes.add(table.tableNode);
  }
  for (const unit of units) {
    if (!tableUnits.has(unit)) {
      point.hasHostInk = true;
      break;
    }
  }
  return point;
}
