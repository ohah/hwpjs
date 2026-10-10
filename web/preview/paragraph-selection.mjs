/** 여러 문단 선택을 원본 위치의 서식 구간으로 투영합니다. */
import { sourceTextChange } from "./text-offsets.mjs";

/** 원본 문단 번호 순서에서 선택의 시작 또는 끝을 반환합니다. */
export function paragraphSelectionEdge(anchor, focus, end = false) {
  if (!anchor || !focus || anchor.section !== focus.section) return null;
  const forward = anchor.paragraph < focus.paragraph || (anchor.paragraph === focus.paragraph && anchor.unit <= focus.unit);
  return end === forward ? focus : anchor;
}

export function paragraphSelectionOwner(paragraph) {
  const cell = paragraph?.tableCell;
  if (cell) {
    if (![paragraph.section, cell.tableNode, cell.listNode].every(value => Number.isInteger(value) && value >= 0)) return null;
    return `section:${paragraph.section}:table:${cell.tableNode}:list:${cell.listNode}`;
  }
  return paragraph?.selectionOwner ?? null;
}

/** 호출자가 지정한 동일 소유권 범위만 선택하며 편집 모델을 소유하지 않습니다. */
export function paragraphSelectionRanges(paragraphs, anchor, focus, ownerOf = paragraphSelectionOwner, { sourcePositions = true, includeEmpty = false } = {}) {
  if (!anchor || !focus || anchor.section !== focus.section || typeof ownerOf !== "function" || !Array.isArray(paragraphs)) return null;
  const identities = new Set();
  for (const paragraph of paragraphs) {
    if (!paragraph || !Number.isSafeInteger(paragraph.section) || paragraph.section < 0
      || !Number.isSafeInteger(paragraph.paragraph) || paragraph.paragraph < 0 || typeof paragraph.text !== "string") return null;
    const identity = `${paragraph.section}:${paragraph.paragraph}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
  }
  const find = point => paragraphs.findIndex(row => row.section === point.section && row.paragraph === point.paragraph);
  const ai = find(anchor), fi = find(focus);
  if (ai < 0 || fi < 0) return null;
  const backward = ai > fi || (ai === fi && anchor.unit > focus.unit);
  const start = backward ? focus : anchor, end = backward ? anchor : focus;
  const low = Math.min(ai, fi), high = Math.max(ai, fi);
  const owner = ownerOf(paragraphs[low]);
  if (owner === null || owner === undefined) return null;
  const ranges = [];
  for (let i = low; i <= high; i++) {
    const row = paragraphs[i];
    if (row.section !== start.section || row.clipped || ownerOf(row) !== owner) return null;
    const from = i === low ? start.unit : 0, to = i === high ? end.unit : row.text.length;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > row.text.length) return null;
    const boundary = unit => unit === 0 || unit === row.text.length || !(row.text.charCodeAt(unit - 1) >= 0xd800 && row.text.charCodeAt(unit - 1) <= 0xdbff && row.text.charCodeAt(unit) >= 0xdc00 && row.text.charCodeAt(unit) <= 0xdfff);
    if (!boundary(from) || !boundary(to)) return null;
    if (from === to && !includeEmpty) continue;
    const mapped = sourcePositions ? sourceTextChange({ startUnit: from, endUnit: to, text: "" }, row.sourceOffsets) : { startUnit: from, endUnit: to };
    ranges.push({ section: row.section, paragraph: row.paragraph, startUnit: mapped.startUnit, endUnit: mapped.endUnit });
  }
  return ranges;
}

/** 빈 문단과 끝점의 문단 경계도 줄바꿈으로 보존합니다. */
export function paragraphSelectionText(paragraphs, anchor, focus, ownerOf = paragraphSelectionOwner) {
  const ranges = paragraphSelectionRanges(paragraphs, anchor, focus, ownerOf, { sourcePositions: false, includeEmpty: true });
  if (ranges === null) return null;
  const text = new Map(paragraphs.map(row => [`${row.section}:${row.paragraph}`, row.text]));
  return ranges.map(range => text.get(`${range.section}:${range.paragraph}`).slice(range.startUnit, range.endUnit)).join("\n");
}
