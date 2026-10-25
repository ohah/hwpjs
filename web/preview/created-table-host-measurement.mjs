import { projectCreatedTableHost } from "./created-table-host-projection.mjs";
import { measureInlineObjectParagraph } from "./inline-object-paragraph-measurement.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { storedAutomaticNumberText } from "./automatic-number-text.mjs";
import { projectCreatedHostTextAnchors } from "./created-host-text-anchors.mjs";
import { displayRunText } from "./text-measurement.mjs";

// Measured dimensions are derived from native cell values by the caller.
export function measureCreatedTableHost(source, entries, width, measure, { maxRows = 20000, sourceTextAnchorUnits = [], sourceZeroWidthAnchorUnits = [], sourceTables = [],sourcePictures=[],sourceObjects=[], allowSourceTableOverflow = false, includeTerminalAfter = true } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(entries) || !Array.isArray(sourceTables) || !Array.isArray(sourcePictures) || !Array.isArray(sourceObjects) || !entries.length && !sourceTables.length && !sourcePictures.length && !sourceObjects.length || !Number.isSafeInteger(maxRows) || maxRows < 1 || typeof measure !== "function") return unavailable("InvalidCreatedTableHostMeasurement");
  if (typeof allowSourceTableOverflow !== "boolean") return unavailable("InvalidCreatedTableHostMeasurement");
  if(sourceObjects.some(object=>!object||!Number.isSafeInteger(object.objectNode)||object.objectNode<0||!Number.isSafeInteger(object.unit)||object.unit<0
    ||![object.width,object.height].every(value=>Number.isFinite(value)&&value>0)||object.tableNode!==undefined||object.pictureNode!==undefined||object.createdTableIdentity!==undefined))return unavailable("InvalidCreatedTableHostMeasurement");
  const sourceUnits=[...sourceTables,...sourcePictures,...sourceObjects].map(object=>object?.unit);
  let projection;
  try { projection = projectCreatedTableHost(source, entries.map(entry => entry?.table)); }
  catch (error) {
    if (error.message === "InvalidCreatedTableHostProjection") return unavailable(error.message);
    throw error;
  }
  let retained;
  try { retained = projectCreatedHostTextAnchors(source, projection, sourceTextAnchorUnits, sourceUnits, sourceZeroWidthAnchorUnits); }
  catch (error) { if (error.message === "UnsupportedCreatedTableHostControls") return unavailable(error.message); throw error; }
  if (source.automaticNumberPrefixes?.length && (source.automaticNumberPrefixes.length !== 1 || storedAutomaticNumberText(source.automaticNumberPrefixes[0].source) === null)) return unavailable("UnsupportedCreatedTableHostNumberPrefix");
  const byIdentity = new Map(entries.map(entry => [entry.table.identity, entry]));
  const objects = projection.anchors.map(anchor => ({ createdTableIdentity: anchor.createdTableIdentity, unit: anchor.unit,
    width: byIdentity.get(anchor.createdTableIdentity).width, height: byIdentity.get(anchor.createdTableIdentity).height }));
  objects.push(...sourceTables.map(table => ({ ...table, unit: projection.viewUnitForSource(table.unit, "after") })));
  objects.push(...sourcePictures.map(picture=>({...picture,unit:projection.viewUnitForSource(picture.unit,"after")})));
  objects.push(...sourceObjects.map(object=>({...object,unit:projection.viewUnitForSource(object.unit,"after")})));
  const first = source.textStartUnit ?? 0;
  const sourceObjectUnits = new Map(sourceTables.map(table => [table.unit, table.tableNode]));
  const virtual = { ...source, text: projection.text, textStartUnit: 0, characterRanges: [],
    automaticNumbers: retained.automaticNumbers, structuralAnchors: retained.structuralAnchors, pageControls: retained.pageControls,
    ...(first ? { automaticNumberPrefixes: [] } : {}) };
  const measuredObjects = measureInlineObjectParagraph(virtual, objects.map(object=>object.createdTableIdentity===undefined?{...object,objectNode:object.tableNode??object.pictureNode??object.objectNode}:object), width,
    (text, _paragraph, unit, kind) => {
      const original = projection.sourceUnitForView(unit);
      return measure(displayRunText(text, source, original, kind), source, original, kind);
    }, { maxRows, includeTerminalAfter, textAnchorUnits: retained.textAnchorUnits, zeroWidthUnits: retained.zeroWidthUnits,
      allowLineOverflow: allowSourceTableOverflow && entries.length === 0 && sourceTables.length > 0 && sourcePictures.length === 0 && sourceObjects.length === 0 });
  if (measuredObjects.state !== "measured") return {...measuredObjects,error:measuredObjects.error.replace("InlineObject","InlineTable")};
  const nonTableNodes=new Set([...sourcePictures.map(picture=>picture.pictureNode),...sourceObjects.map(object=>object.objectNode)]);
  const measured={...measuredObjects,anchors:measuredObjects.anchors.filter(anchor=>anchor.createdTableIdentity!==undefined||!nonTableNodes.has(anchor.objectNode)).map(({objectNode,...anchor})=>anchor.createdTableIdentity===undefined?{...anchor,tableNode:objectNode}:anchor)};
  const prefixOverflow = measured.rows.find(row => row.numberPrefix && row.boundaries.at(-1).x > row.width + 1e-8);
  if (prefixOverflow) return { ...unavailable("InlineTableLineWidthOverflow"), section: source.section, paragraph: source.paragraph,
    availableWidth: prefixOverflow.width, measuredWidth: prefixOverflow.boundaries.at(-1).x, overflowStage: "number-prefix" };
  const numberPrefixes = measured.rows.flatMap((row, lineOrdinal) => row.numberPrefix ? [{ section: source.section, paragraph: source.paragraph, lineOrdinal,
    x: (row.x ?? 20) + (row.paragraphX ?? 0), y: row.y, height: row.height, textTop: row.textTop,
    numberPrefix: row.numberPrefix }] : []);
  const rows = [];
  const projectRun = (row, run, lineOrdinal) => {
    const points = row.boundaries.filter(point => point.unit >= run.viewStart && point.unit <= run.viewEnd);
    if (points[0]?.unit !== run.viewStart || points.at(-1)?.unit !== run.viewEnd) return false;
    const left = points[0].x, right = points.at(-1).x;
    const { numberPrefix: _prefix, ...textRow } = row;
    rows.push({ ...textRow, lineOrdinal, text: run.text, startUnit: run.sourceStart, endUnit: run.sourceEnd,
      ...(run.sourceEnd === run.sourceStart + 1 && sourceObjectUnits.has(run.sourceStart)
        ? { sourceObjectAnchor: true, inlineTables: [{ tableNode: sourceObjectUnits.get(run.sourceStart), unit: run.sourceStart }] } : {}),
      x: (row.x ?? 20) + (row.paragraphX ?? 0) + left, paragraphX: 0, width: Math.max(1, right - left),
      boundaries: points.map(point => ({ ...point, unit: projection.sourceUnitForView(point.unit), x: point.x - left })) });
    return true;
  };
  for (const [lineOrdinal, row] of measured.rows.entries()) {
    if (row.kind !== "text") { rows.push({ ...row, lineOrdinal }); continue; }
    const runs = projection.sourceRunsForViewRange(row.startUnit, row.endUnit);
    for (const run of runs) {
      const cuts = new Set([run.viewStart, run.viewEnd]);
      for (const unit of sourceUnits) {
        const at = projection.viewUnitForSource(unit, "after");
        if (at >= run.viewStart && at < run.viewEnd) { cuts.add(at); cuts.add(at + 1); }
      }
      const points = [...cuts].sort((a, b) => a - b);
      for (let index = 0; index + 1 < points.length; index++) {
        const start = points[index], end = points[index + 1], offset = start - run.viewStart;
        if (!projectRun(row, { viewStart: start, viewEnd: end, sourceStart: run.sourceStart + offset,
          sourceEnd: run.sourceStart + end - run.viewStart, text: run.text.slice(offset, end - run.viewStart) }, lineOrdinal)) return unavailable("InvalidCreatedTableHostBoundaries");
      }
    }
    if (row.startUnit === row.endUnit || source.text === "" && lineOrdinal === measured.rows.length - 1) {
      const unit = projection.sourceUnitForView(row.endUnit);
      if (!projectRun(row, { viewStart: row.endUnit, viewEnd: row.endUnit, sourceStart: unit, sourceEnd: unit, text: "" }, lineOrdinal)) return unavailable("InvalidCreatedTableHostBoundaries");
    }
  }
  if (rows.length + numberPrefixes.length > maxRows) return unavailable("CreatedTableHostProjectionLimit");
  const covered = rows.filter(row => row.kind !== "text" || source.text === "" || row.startUnit < row.endUnit)
    .map(row => ({ ...row, startUnit: row.startUnit - first, endUnit: row.endUnit - first }));
  const coverage = pageParagraphCoverage([source], covered);
  if (coverage.state !== "complete") return coverage;
  return { state: "measured", rows, numberPrefixes, height: measured.height, spatialRows: true,
    lines: measured.rows.map((row, lineOrdinal) => ({ lineOrdinal, y: row.y, height: row.height })),
    anchors: measured.anchors.map(({ unit, rowIndex, ...anchor }) => ({ ...anchor, unit: projection.sourceUnitForView(unit), lineOrdinal: rowIndex })),
    limited: false };
}
