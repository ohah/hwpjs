import {uint, observationRows, observationSpans} from "./observation-structure.mjs";
import { snapUnit } from "./text-input.mjs";

export const isSourceCharacterSize = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

/** 현재 표시 구간의 원본 크기만 읽으며 미확인 값을 보정하지 않습니다. */
export function characterSizeState(content, paragraph, start, end, {isBoundary=(text,unit,last=false)=>snapUnit(text,unit,last)===unit}={}) {
  if (content?.characterPropertiesAvailable !== true || typeof paragraph?.text !== "string" || paragraph.clipped ||
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > paragraph.text.length ||
      !isBoundary(paragraph.text, start) || !isBoundary(paragraph.text, end, true)) return null;
  const shapes = observationRows(content.characterShapes);
  const spans = observationSpans(paragraph);
  if (!shapes || !spans) return null;
  let cursor = start, size, mixed = false;
  for (const span of spans) {
    const low = Math.max(start, span.start), high = Math.min(end, span.end);
    if (low >= high) continue;
    if (!uint(span.charShapeId)) return null;
    const current = shapes.get(span.charShapeId)?.height;
    if (low !== cursor || !isSourceCharacterSize(current)) return null;
    if (size === undefined) size = current;
    else if (size !== current) mixed = true;
    cursor = high;
  }
  return cursor === end && size !== undefined ? mixed ? "mixed" : size : null;
}

export function characterSizeRangesState(content, ranges) {
  if (!Array.isArray(ranges) || !ranges.length || !Array.isArray(content?.paragraphs) || content.paragraphs.some(row => !row || typeof row !== "object") || ranges.some(range => !range)) return null;
  let size;
  for (const range of ranges) {
    const row = content.paragraphs.find(paragraph => paragraph.section === range.section && paragraph.paragraph === range.paragraph);
    const state = characterSizeState(content, row, range.startUnit, range.endUnit);
    if (state === null) return null;
    if (size === undefined) size = state;
    else if (size !== state) size = "mixed";
  }
  return size;
}
