// 같은 줄의 분리된 영역을 순서대로 소비합니다.
import { isHardLineBreak } from './hard-line-break.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { createTabRowState } from './tab-row-state.mjs';
import { createTextLineWidth } from './text-line-width.mjs';
import { trailingSpaceStart, hangsTrailingSpace } from './trailing-space-flow.mjs';
export function regionTextFragments(
  text,
  startUnit,
  regions,
  measure,
  {
    numberPrefix = null,
    allowFirstOverflow = false,
    minimumTextHeight = 20,
    hangingRightEdge,
  } = {},
) {
  if (!Number.isFinite(minimumTextHeight) || minimumTextHeight < 0)
    throw new RangeError('InvalidTextMeasurement');
  if (
    typeof text !== 'string' ||
    !Number.isInteger(startUnit) ||
    startUnit < 0 ||
    startUnit > text.length
  )
    throw new RangeError('InvalidFragmentStart');
  const segments = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  if (
    startUnit !== text.length &&
    segments.segment(text).containing(startUnit)?.index !== startUnit
  )
    throw new RangeError('InvalidFragmentStart');
  let previousEnd = -Infinity;
  for (const region of regions) {
    if (
      ![region.x, region.width, region.x + region.width].every(Number.isFinite) ||
      region.width < 0 ||
      region.x < previousEnd
    )
      throw new RangeError('InvalidFragmentRegions');
    previousEnd = region.x + region.width;
  }
  const pending = segments.segment(text.slice(startUnit))[Symbol.iterator]();
  let current = pending.next();
  const fragments = [];
  let unit = startUnit;
  if (
    numberPrefix !== null &&
    (typeof numberPrefix.text !== 'string' ||
      !Number.isFinite(numberPrefix.width) ||
      numberPrefix.width < 0 ||
      !Number.isFinite(numberPrefix.height) ||
      numberPrefix.height <= 0)
  )
    throw new RangeError('InvalidTextMeasurement');
  let pendingPrefix = startUnit === 0 ? numberPrefix : null;
  const trailingStart = trailingSpaceStart(text);
  for (const region of regions) {
    const prefix = pendingPrefix;
    if (prefix && prefix.width > region.width) continue;
    let value = '',
      textHeight = prefix?.height ?? 0,
      spacingBasisHeight = prefix?.height ?? 0,
      inlineSpacing = false;
    let hasContent = Boolean(prefix?.text?.trim());
    let fragmentWidth = region.width;
    const boundaries = [{ unit, x: prefix?.width ?? 0 }],
      begin = unit;
    const lineWidth = createTextLineWidth(boundaries, prefix?.width ?? 0);
    const tabs = createTabRowState();
    const fragment = () => ({
      x: region.x,
      width: fragmentWidth,
      text: value,
      startUnit: begin,
      endUnit: unit,
      boundaries,
      textHeight,
      ...(prefix ? { numberPrefix: prefix } : {}),
      ...(inlineSpacing ? { spacingBasisHeight } : {}),
      ...tabs.fields(),
    });
    while (!current.done) {
      if (isHardLineBreak(current.value.segment)) {
        const emptyHeight = textMeasurement(measure('', unit)).height;
        textHeight = Math.max(textHeight, emptyHeight);
        spacingBasisHeight = Math.max(spacingBasisHeight, emptyHeight);
        value += current.value.segment;
        unit += current.value.segment.length;
        lineWidth.hardBreak(unit);
        fragments.push({ ...fragment(), textHeight: Math.max(minimumTextHeight, textHeight) });
        return { fragments, endUnit: unit, complete: false, hardBreak: true };
      }
      const segment = current.value.segment,
        measured = measure(segment, unit);
      const width = typeof measured === 'number' ? measured : measured?.width;
      const height = typeof measured === 'number' ? 20 : measured?.height;
      if (!Number.isFinite(width) || width < 0) throw new RangeError('InvalidTextMeasurement');
      if (!Number.isFinite(height) || height <= 0) throw new RangeError('InvalidTextMeasurement');
      const basis =
        measured?.spacingBasisHeight === undefined ? height : measured.spacingBasisHeight;
      if (!Number.isFinite(basis) || basis <= 0) throw new RangeError('InvalidTextMeasurement');
      const occupied = lineWidth.probe(measured);
      const hanging =
        region.x + region.width === hangingRightEdge &&
        hangsTrailingSpace(segment, unit, trailingStart, hasContent);
      if (occupied > region.width && !hanging) {
        if (!allowFirstOverflow || value || unit !== startUnit) break;
        fragmentWidth = occupied;
      }
      tabs.add(measured, unit, lineWidth.nextX());
      value += segment;
      unit += segment.length;
      current = pending.next();
      hasContent ||= segment.trim().length > 0;
      textHeight = Math.max(textHeight, height);
      spacingBasisHeight = Math.max(spacingBasisHeight, basis);
      inlineSpacing ||= measured?.spacingBasisHeight !== undefined;
      lineWidth.add(measured, unit);
    }
    if (value || (prefix && current.done && region.width > 0)) {
      fragments.push(fragment());
      pendingPrefix = null;
    }
    if (current.done) break;
  }
  return { fragments, endUnit: unit, complete: unit === text.length };
}
