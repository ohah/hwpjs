import { pictureFlowLine } from "./picture-flow-line.mjs";
import { paragraphLineGeometry } from "./paragraph-geometry.mjs";
import { displayRunText } from "./text-measurement.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";
import { alignPictureFragment } from "./picture-fragment-alignment.mjs";

// 기존 그림 영역/문자 분할을 페이지 소속과 현재 문단에 연결합니다.
export function measurePicturePageTextLine(paragraph, startUnit, line, pageOrdinal, reservations, measure, { paragraphEndUnit = paragraph?.text?.length } = {}) {
  if (!paragraph || typeof paragraph.text !== "string" || !Number.isSafeInteger(pageOrdinal) || pageOrdinal < 0 || !Array.isArray(reservations) || typeof measure !== "function") return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  if (!line || ![line.x, line.y, line.width, line.height, line.x + line.width, line.y + line.height].every(Number.isFinite) || line.width <= 0 || line.height <= 0) return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  if (!Number.isSafeInteger(paragraphEndUnit) || paragraphEndUnit < paragraph.text.length) return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  for (const item of reservations) {
    if (!item || !Number.isSafeInteger(item.pageOrdinal) || item.pageOrdinal < 0) return { state: "unavailable", error: "InvalidPicturePageTextLine" };
  }
  if (startUnit === 0 && paragraph.automaticNumberPrefixes?.length) return { state: "unavailable", error: "UnsupportedPictureLineNumberPrefix" };
  const horizontal = paragraphLineGeometry({ ...paragraph.paragraphShape, alignment: 0 }, line.width, 0, startUnit === 0);
  const result = pictureFlowLine(paragraph.text, startUnit, { ...line, x: line.x + horizontal.x, width: horizontal.width }, reservations.filter(item => item.pageOrdinal === pageOrdinal),
    (text, unit) => measure(displayRunText(text, paragraph, unit, "text"), paragraph, unit, "text"), paragraph.paragraphShape);
  if (result.state !== "available") return result;
  const terminal = startUnit === paragraph.text.length && (!paragraph.text.length || isHardLineBreak(paragraph.text.slice(-1)));
  const fragments = terminal && result.regions.some(region => region.width > 0)
    ? [{ ...result.regions.find(region => region.width > 0), text: "", startUnit, endUnit: startUnit, boundaries: [{ unit: startUnit, x: 0 }], textHeight: result.textHeight }]
    : result.fragments;
  return { ...result, rows: fragments.map(fragment => {
    return { ...alignPictureFragment(fragment, paragraph.paragraphShape, fragment.endUnit === paragraphEndUnit), kind: "text", section: paragraph.section, paragraph: paragraph.paragraph,
      paragraphX: 0, y: line.y, height: result.height,
      editable: paragraph.editable, selectable: !paragraph.clipped && (paragraph.editable || paragraph.selectable) };
  }) };
}
