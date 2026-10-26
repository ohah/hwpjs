import { measureCreatedBodyFlow } from "./created-body-flow-measurement.mjs";
import { prepareCreatedCellSourceTables } from "./created-cell-source-tables.mjs";
import { MAX_NESTED_TABLE_DEPTH } from "./nested-table-measurement.mjs";
import { measureCreatedCellPictures } from "./created-source-cell-pictures.mjs";

// Borrow source text for measurement; generated cells keep their own identity.
export function measureCreatedSourceCell(content, groups, prepared, input, depth = 0) {
  const keys = input.paragraphs.map((p) => `${p.section}:${p.paragraph}`);
  const tables = keys.flatMap((key) => groups.get(key) ?? []);
  if (!tables.length) return null;
  const unavailable = (error) => ({ state: "unavailable", error });
  if (!Number.isSafeInteger(depth) || depth < 0 || depth >= MAX_NESTED_TABLE_DEPTH)
    return unavailable("NestedTableMeasurementLimit");
  if (input.columnContext?.declaration?.count > 1)
    return unavailable("UnsupportedCreatedSourceCellObjects");
  if (keys.some((key) => groups.has(key) && prepared.has(key)))
    return unavailable("DuplicateCreatedTablePageHost");
  const paragraphs = input.paragraphs.map(({ tableCell: _owner, ...p }) => p);
  const source = prepareCreatedCellSourceTables(content, input, {
    measureCellFlow: (child) =>
      measureCreatedSourceCell(content, groups, prepared, child, depth + 1),
    maxDepth: MAX_NESTED_TABLE_DEPTH - depth,
  });
  if (source.state !== "measured") return source;
  const pictures = measureCreatedCellPictures(input);
  if (pictures.state !== "measured") return pictures;
  const measured = measureCreatedBodyFlow(
    { ...content, paragraphs, tables: [], createdTables: tables },
    input.width,
    input.measure,
    input.maxRows,
    { ...source, pictures: pictures.hosts },
    { compactLines: true, minimumRowHeight: 0, includeTerminalAfter: false },
  );
  if (measured.state !== "measured") return measured;
  let height = 0;
  const rows = measured.rows.map((row) => {
    const placed = { ...row, y: height };
    height += row.height;
    return placed;
  });
  const coverageRows = rows.flatMap((row) =>
    row.createdHost === undefined ? [row] : row.referenceRows,
  );
  for (const key of keys) if (groups.has(key)) prepared.set(key, measured);
  return { ...measured, rows, height, coverageRows };
}
