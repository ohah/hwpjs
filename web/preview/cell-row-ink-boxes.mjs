import { displayRunText } from './text-measurement.mjs';
import { rowTextTop } from './row-geometry.mjs';
import { boundaryGlyphWidth } from './text-line-width.mjs';

// Advance widths include tabs/spaces and hidden floating controls, not ink.
export function cellRowInkBoxes(row, paragraph, hiddenUnits = new Set(), inlineObjects = []) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    row?.kind !== 'text' ||
    typeof paragraph?.text !== 'string' ||
    !Array.isArray(row.boundaries) ||
    !Number.isSafeInteger(row.startUnit) ||
    !Number.isSafeInteger(row.endUnit) ||
    row.startUnit < 0 ||
    row.endUnit < row.startUnit ||
    row.endUnit > paragraph.text.length ||
    row.boundaries[0]?.unit !== row.startUnit ||
    row.boundaries.at(-1)?.unit !== row.endUnit ||
    row.text !== paragraph.text.slice(row.startUnit, row.endUnit) ||
    !(hiddenUnits instanceof Set) ||
    !Array.isArray(inlineObjects) ||
    [...hiddenUnits].some(
      (unit) => !Number.isSafeInteger(unit) || unit < 0 || paragraph.text[unit] !== '\ufffc',
    ) ||
    new Set(inlineObjects.map((item) => item?.unit)).size !== inlineObjects.length ||
    inlineObjects.some(
      (item) =>
        !Number.isSafeInteger(item?.unit) ||
        item.unit < 0 ||
        paragraph.text[item.unit] !== '\ufffc' ||
        hiddenUnits.has(item.unit) ||
        ![item.width, item.height].every((v) => Number.isFinite(v) && v > 0),
    )
  )
    return fail('InvalidCellFloatingDrawingTextBounds');
  const x = (row.x ?? 0) + (row.paragraphX ?? 0),
    y = row.y + rowTextTop(row),
    boxes = [];
  if (row.numberPrefix?.width > 0)
    boxes.push({ x, y, width: row.numberPrefix.width, height: row.textHeight });
  for (let i = 0; i + 1 < row.boundaries.length; i++) {
    const start = row.boundaries[i],
      end = row.boundaries[i + 1];
    if (
      ![start.x, end.x].every(Number.isFinite) ||
      end.x < start.x ||
      !Number.isSafeInteger(start.unit) ||
      !Number.isSafeInteger(end.unit) ||
      end.unit <= start.unit ||
      start.unit < row.startUnit ||
      end.unit > row.endUnit
    )
      return fail('InvalidCellFloatingDrawingTextBounds');
    const text = paragraph.text.slice(start.unit, end.unit);
    const display = displayRunText(text, paragraph, start.unit, 'text');
    if (hiddenUnits.has(start.unit) || !display.trim()) continue;
    const object = inlineObjects.find((item) => item.unit === start.unit);
    if (text === '\ufffc' && display === '◇' && !object)
      return fail('UnsupportedCellFloatingDrawingInlineObject');
    const width = object?.width ?? boundaryGlyphWidth(start, end),
      height = object?.height ?? row.textHeight;
    if (width === null) return fail('InvalidCellFloatingDrawingTextBounds');
    if (width === 0) continue;
    const box = { x: x + start.x, y, width, height };
    if (
      ![box.x, box.y, box.width, box.height, box.x + width, box.y + height].every(
        Number.isFinite,
      ) ||
      width < 0 ||
      height <= 0
    )
      return fail('InvalidCellFloatingDrawingTextBounds');
    boxes.push(box);
  }
  return { state: 'measured', boxes };
}
