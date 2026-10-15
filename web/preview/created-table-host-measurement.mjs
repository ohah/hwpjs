import { projectCreatedTableHost } from "./created-table-host-projection.mjs";
import { measureInlineTableParagraph } from "./inline-table-paragraph-measurement.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

// Measured dimensions are derived from native cell values by the caller.
export function measureCreatedTableHost(source, entries, width, measure, { maxRows = 20000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(entries) || !entries.length || !Number.isSafeInteger(maxRows) || maxRows < 1 || typeof measure !== "function") return unavailable("InvalidCreatedTableHostMeasurement");
  let projection;
  try { projection = projectCreatedTableHost(source, entries.map(entry => entry?.table)); }
  catch (error) {
    if (error.message === "InvalidCreatedTableHostProjection") return unavailable(error.message);
    throw error;
  }
  // Existing source objects need their own geometry; never guess zero-size boxes.
  if (source.text.includes("\ufffc")) return unavailable("UnsupportedCreatedTableHostControls");
  if (source.automaticNumberPrefixes?.length) return unavailable("UnsupportedCreatedTableHostNumberPrefix");
  const byIdentity = new Map(entries.map(entry => [entry.table.identity, entry]));
  const objects = projection.anchors.map(anchor => ({ createdTableIdentity: anchor.createdTableIdentity, unit: anchor.unit,
    width: byIdentity.get(anchor.createdTableIdentity).width, height: byIdentity.get(anchor.createdTableIdentity).height }));
  const first = source.textStartUnit ?? 0;
  const virtual = { ...source, text: projection.text, textStartUnit: 0, characterRanges: [],
    ...(first ? { automaticNumberPrefixes: [] } : {}) };
  const measured = measureInlineTableParagraph(virtual, objects, width,
    (text, _paragraph, unit, kind) => measure(text, source, projection.sourceUnitForView(unit), kind), { maxRows });
  if (measured.state !== "measured") return measured;
  const rows = [];
  const projectRun = (row, run, lineOrdinal) => {
    const points = row.boundaries.filter(point => point.unit >= run.viewStart && point.unit <= run.viewEnd);
    if (points[0]?.unit !== run.viewStart || points.at(-1)?.unit !== run.viewEnd) return false;
    const left = points[0].x, right = points.at(-1).x;
    rows.push({ ...row, lineOrdinal, text: run.text, startUnit: run.sourceStart, endUnit: run.sourceEnd,
      x: (row.x ?? 20) + (row.paragraphX ?? 0) + left, paragraphX: 0, width: Math.max(1, right - left),
      boundaries: points.map(point => ({ ...point, unit: projection.sourceUnitForView(point.unit), x: point.x - left })) });
    return true;
  };
  for (const [lineOrdinal, row] of measured.rows.entries()) {
    if (row.kind !== "text") { rows.push({ ...row, lineOrdinal }); continue; }
    const runs = projection.sourceRunsForViewRange(row.startUnit, row.endUnit);
    for (const run of runs) if (!projectRun(row, run, lineOrdinal)) return unavailable("InvalidCreatedTableHostBoundaries");
    if (row.startUnit === row.endUnit || source.text === "" && lineOrdinal === measured.rows.length - 1) {
      const unit = projection.sourceUnitForView(row.endUnit);
      if (!projectRun(row, { viewStart: row.endUnit, viewEnd: row.endUnit, sourceStart: unit, sourceEnd: unit, text: "" }, lineOrdinal)) return unavailable("InvalidCreatedTableHostBoundaries");
    }
  }
  if (rows.length > maxRows) return unavailable("CreatedTableHostProjectionLimit");
  const covered = rows.filter(row => row.kind !== "text" || source.text === "" || row.startUnit < row.endUnit)
    .map(row => ({ ...row, startUnit: row.startUnit - first, endUnit: row.endUnit - first }));
  const coverage = pageParagraphCoverage([source], covered);
  if (coverage.state !== "complete") return coverage;
  return { state: "measured", rows, height: measured.height, spatialRows: true,
    lines: measured.rows.map((row, lineOrdinal) => ({ lineOrdinal, y: row.y, height: row.height })),
    anchors: measured.anchors.map(({ unit, rowIndex, ...anchor }) => ({ ...anchor, unit: projection.sourceUnitForView(unit), lineOrdinal: rowIndex })),
    limited: false };
}
