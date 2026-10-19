import { isPositionedBodySource } from "./positioned-row-fragments.mjs";
import { measurePicturePageTextLine } from "./picture-page-text-line.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { DEFAULT_ROW_HEIGHT } from "./row-geometry.mjs";
import { graphemeUnits } from "./text-input.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";

// 표 행은 호출자가 별도로 배치합니다. 여기서는 본문 한 줄과 수직 전진만 계산합니다.
export function measureReservedBodyRow(source, context, reservations, measure) {
  const fail = error => ({ state: "unavailable", error });
  const p = source?.paragraphSource, end = source?.endUnit ?? p?.text?.length;
  if (!isPositionedBodySource(source) || typeof p?.text !== "string" || p.section !== source.section || p.paragraph !== source.paragraph
    || !Number.isSafeInteger(source.startUnit) || !Number.isSafeInteger(end) || source.startUnit < 0 || end < source.startUnit || end > p.text.length
    || !context || !Number.isFinite(context.y) || !Array.isArray(reservations) || typeof measure !== "function") return fail("InvalidReservedBodyRow");
  const bounds = new Set(graphemeUnits(p.text));
  if (!bounds.has(source.startUnit) || !bounds.has(end)
    || (source.startUnit === end && (end !== p.text.length || (end > 0 && !isHardLineBreak(p.text.slice(-1)))))) return fail("InvalidReservedBodyRow");
  const view = end === p.text.length ? p : { ...p, text: p.text.slice(0, end) };
  let y = context.y;
  for (let attempt = 0; attempt <= reservations.length; attempt++) {
    const line = measurePicturePageTextLine(view, source.startUnit, { ...context.column, y, height: DEFAULT_ROW_HEIGHT }, context.pageOrdinal,
      reservations, (text, _p, unit, kind) => measure(text, p, unit, kind), { paragraphEndUnit: p.text.length });
    if (line.state !== "available") return fail(line.error ?? line.state);
    if (line.rows.length) {
      const horizontal = paragraphLineGeometry({ ...p.paragraphShape, alignment: 0 }, context.column.width, 0, source.startUnit === 0);
      const positionedFragments = line.rows.map(({ x, y: _y, paragraphX: _paragraphX, ...row }) => ({ ...row, paragraphX: x - context.column.x, paragraphReferenceX: x - context.column.x }));
      return { state: "measured", y, row: { ...source, endUnit: line.endUnit, height: line.height, positionedFragments,
        flowParagraphBox: { x: context.column.x + horizontal.x, width: horizontal.width } } };
    }
    if (!Number.isFinite(line.nextY) || line.nextY <= y) return fail("NoFittingReservedBodyRegion");
    y = line.nextY;
  }
  return fail("ReservedBodyRowAdvanceLimit");
}
