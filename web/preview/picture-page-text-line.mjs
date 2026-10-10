import { pictureFlowLine } from "./picture-flow-line.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { displayRunText } from "./text-measurement.mjs";

// 기존 그림 영역/문자 분할을 페이지 소속과 현재 문단에 연결합니다.
export function measurePicturePageTextLine(paragraph, startUnit, line, pageOrdinal, reservations, measure) {
  if (!paragraph || typeof paragraph.text !== "string" || !Number.isSafeInteger(pageOrdinal) || pageOrdinal < 0 || !Array.isArray(reservations) || typeof measure !== "function") return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  if (!line || ![line.x, line.y, line.width, line.height, line.x + line.width, line.y + line.height].every(Number.isFinite) || line.width <= 0 || line.height <= 0) return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  for (const item of reservations) {
    if (!item || !Number.isSafeInteger(item.pageOrdinal) || item.pageOrdinal < 0) return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  }
  if (startUnit === 0 && paragraph.automaticNumberPrefixes?.length) return { state: "unavailable", error: "UnsupportedPictureLineNumberPrefix" };
  const horizontal = paragraphLineGeometry({ ...paragraph.paragraphShape, alignment: 0 }, line.width, 0, startUnit === 0);
  const result = pictureFlowLine(paragraph.text, startUnit, { ...line, x: line.x + horizontal.x, width: horizontal.width }, reservations.filter(item => item.pageOrdinal === pageOrdinal),
    (text, unit) => measure(displayRunText(text, paragraph, unit, "text"), paragraph, unit, "text"), paragraph.paragraphShape);
  if (result.state !== "available") return result;
  const fragments = !paragraph.text.length && result.regions.some(region => region.width > 0)
    ? [{ ...result.regions.find(region => region.width > 0), text: "", startUnit: 0, endUnit: 0, boundaries: [{ unit: 0, x: 0 }], textHeight: 20 }]
    : result.fragments;
  return { ...result, rows: fragments.map(fragment => {
    const measuredWidth = fragment.boundaries.at(-1).x;
    const offset = paragraphLineGeometry({ alignment: paragraph.paragraphShape?.alignment }, fragment.width, measuredWidth, false).x;
    return { ...fragment, kind: "text", section: paragraph.section, paragraph: paragraph.paragraph,
      x: fragment.x + offset, width: fragment.width - offset, paragraphX: 0, y: line.y, height: result.height,
      editable: paragraph.editable, selectable: !paragraph.clipped && (paragraph.editable || paragraph.selectable) };
  }) };
}
