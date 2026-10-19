import { graphemeUnits } from "./text-input.mjs";

const tableFields = ["bandOrdinal", "tableIndex", "tableNode", "tableVerticalSource", "inlineTableFit", "inlineTableAnchor", "inlineTableAnchors", "inlineTables"];
const placedFields = ["x", "y", "pageOrdinal", "columnOrdinal", "referenceBoxes", "transform", "pageClip"];

export function isPositionedBodySource(row) {
  return Boolean(row && row.kind === "text" && tableFields.every(field => row[field] === undefined));
}

export function positionedRowOwnerMatches(source, row) {
  return Boolean(source && row && row.kind === source.kind && row.section === source.section && row.paragraph === source.paragraph
    && tableFields.every(field => row[field] === source[field]));
}

// 물리 줄의 조각은 원본 한 구간을 정확히 소비하며 표 식별자를 복제하지 않습니다.
export function positionedRowFragments(source, row, remaining) {
  const fail = error => ({ state: "unavailable", error });
  const fragments = row?.positionedFragments, paragraph = source?.paragraphSource;
  if (!Array.isArray(fragments) || !fragments.length || source?.kind !== "text" || row.kind !== "text" || typeof paragraph?.text !== "string"
    || source.section !== row.section || source.paragraph !== row.paragraph || paragraph.section !== source.section || paragraph.paragraph !== source.paragraph
    || !Number.isFinite(row.height) || row.height <= 0
    || !Number.isSafeInteger(source.startUnit) || row.startUnit !== source.startUnit || !Number.isSafeInteger(row.endUnit)) return fail("InvalidPositionedRowFragments");
  if (!Number.isSafeInteger(remaining) || remaining < fragments.length) return fail("PositionedRowFragmentLimit");
  if ([source, row].some(item => tableFields.some(field => item[field] !== undefined))) return fail("UnsupportedPositionedTableFragments");
  const boundaryUnits = graphemeUnits(paragraph.text), boundaries = new Set(boundaryUnits);
  const boundaryIndex = new Map(boundaryUnits.map((unit, index) => [unit, index]));
  const end = source.endUnit ?? paragraph.text.length;
  if (!Number.isSafeInteger(end) || end > paragraph.text.length || row.endUnit > end || row.endUnit < source.startUnit
    || !boundaries.has(source.startUnit) || !boundaries.has(row.endUnit)) return fail("InvalidPositionedRowFragments");
  const result = [];
  let unit = source.startUnit;
  for (const fragment of fragments) {
    if (!fragment || fragment.kind !== "text" || fragment.section !== source.section || fragment.paragraph !== source.paragraph
      || fragment.startUnit !== unit || !Number.isSafeInteger(fragment.endUnit) || fragment.endUnit < unit || fragment.endUnit > row.endUnit
      || !boundaries.has(fragment.endUnit) || fragment.text !== paragraph.text.slice(unit, fragment.endUnit)
      || fragment.height !== row.height || !Number.isFinite(fragment.textHeight) || fragment.textHeight <= 0
      || !Number.isFinite(fragment.width) || fragment.width <= 0 || !Number.isFinite(fragment.paragraphX ?? 0)
      || !Number.isFinite((fragment.paragraphX ?? 0) + fragment.width)
      || placedFields.some(field => fragment[field] !== undefined) || tableFields.some(field => fragment[field] !== undefined) || fragment.positionedFragments !== undefined
      || !Array.isArray(fragment.boundaries) || fragment.boundaries.length !== boundaryIndex.get(fragment.endUnit) - boundaryIndex.get(unit) + 1) return fail("InvalidPositionedRowFragments");
    let previousUnit = unit - 1, previousX = -Infinity;
    for (const boundary of fragment.boundaries) {
      if (!boundary || !boundaries.has(boundary.unit) || boundary.unit < unit || boundary.unit > fragment.endUnit || boundary.unit <= previousUnit
        || !Number.isFinite(boundary.x) || boundary.x < 0 || boundary.x < previousX || boundary.x > fragment.width + 1e-8) return fail("InvalidPositionedRowFragments");
      previousUnit = boundary.unit; previousX = boundary.x;
    }
    if (fragment.boundaries[0].unit !== unit || fragment.boundaries.at(-1).unit !== fragment.endUnit
      || (fragment.endUnit === unit && (fragments.length !== 1 || row.endUnit !== source.startUnit || unit !== paragraph.text.length))) return fail("InvalidPositionedRowFragments");
    const { positionedFragments: _, ...carrier } = row;
    result.push({ ...carrier, ...fragment });
    unit = fragment.endUnit;
  }
  return unit === row.endUnit ? { state: "expanded", rows: result } : fail("InvalidPositionedRowFragments");
}
