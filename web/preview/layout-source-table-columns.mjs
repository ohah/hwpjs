import { sourceTableColumns } from "./table-source-columns.mjs";

/** Explicit observed display profile; strict source constraints remain unchanged. */
export function layoutSourceTableColumns(table) {
  const strict = sourceTableColumns(table);
  if (strict.error !== "ConflictingSourceTableColumns") return strict;
  if (table.cells.some((cell) => cell.width === null)) return strict;
  const columns = Array(table.columns).fill(null);
  for (const cell of table.cells) {
    if (cell.columnSpan !== 1) continue;
    const previous = columns[cell.column];
    if (cell.width <= 0 || (previous !== null && previous !== cell.width)) return strict;
    columns[cell.column] = cell.width;
  }
  if (columns.some((width) => width === null)) return strict;
  const positions = [0];
  for (const width of columns) {
    const end = positions.at(-1) + width;
    if (!Number.isSafeInteger(end)) return strict;
    positions.push(end);
  }
  const width = positions.at(-1);
  if (table.sourceGeometry?.geometry?.width !== width) return strict;
  const deficits = [];
  for (const cell of table.cells) {
    const resolvedWidth = positions[cell.column + cell.columnSpan] - positions[cell.column];
    const deficit = resolvedWidth - cell.width;
    if (deficit !== 0 && (cell.columnSpan === 1 || deficit !== 1)) return strict;
    if (deficit)
      deficits.push({
        row: cell.row,
        column: cell.column,
        columnSpan: cell.columnSpan,
        sourceWidth: cell.width,
        resolvedWidth,
        deficit,
      });
  }
  if (!deficits.length) return strict;
  return {
    state: "resolved",
    columns,
    positions,
    width,
    evidence: { kind: "observed-merged-width-deficit", deficits },
  };
}
