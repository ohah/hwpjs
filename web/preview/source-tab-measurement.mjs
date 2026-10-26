import { nextTabPlacement } from './tab-stop-geometry.mjs';
import { isHardLineBreak } from './hard-line-break.mjs';
import { validateTabSources } from '../../js/hwpx-tab-sources.mjs';
import { resolveTabDefinition } from './tab-definition-geometry.mjs';
import { createTextLineWidth } from './text-line-width.mjs';

/** Current source binding + caller-owned line frame; never reads cached inline width. */
export function measureSourceTab(paragraph, unit, context, measureUnit) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!context) return fail('MissingTabMeasurementContext');
  if (paragraph.clipped || (paragraph.textStartUnit ?? 0) !== 0 || paragraph.text[unit] !== '\t')
    return fail('UnsupportedTabDisplayWindow');
  try {
    validateTabSources({
      section: paragraph.section,
      paragraph: paragraph.paragraph + 1,
      rows: paragraph.tabSources,
    });
  } catch {
    return fail('MissingCurrentTabSource');
  }
  if (paragraph.tabSources.filter((row) => row.unit === unit).length !== 1)
    return fail('MissingCurrentTabSource');
  const definition = resolveTabDefinition(paragraph.tabDefinition, paragraph.tabDefinitionId);
  if (definition.state !== 'resolved') return definition;
  // Stops use the unaligned frame. Paragraph alignment shifts the completed
  // row once; feeding that shift back here would change the chosen grid.
  const { autoLeft, autoRight, stops } = definition;
  const options = {
    x: context.x,
    rightEdge: context.rightEdge,
    stops,
    constrainRightLeader: true,
    autoLeftPosition: autoLeft ? context.autoLeftPosition : null,
    autoRight,
    defaultInterval:
      paragraph.sectionTabInterval?.state === 'resolved'
        ? paragraph.sectionTabInterval.pixels
        : null,
    followingWidth: 0,
    decimalWidth: 0,
  };
  if (autoLeft && !Number.isFinite(context.autoLeftPosition))
    return fail('MissingAutomaticLeftTabPosition');
  const selected = nextTabPlacement(options);
  if (selected.state !== 'placed' || selected.type === 'LEFT') return selected;
  // UI decimal marker policy is explicit, not inferred from the cached tab type.
  const decimalCharacter = context.decimalCharacter ?? '.';
  if (typeof decimalCharacter !== 'string' || [...decimalCharacter].length !== 1)
    return fail('UnsupportedTabDecimalCharacter');
  const end = context.endUnit ?? paragraph.text.length;
  if (!Number.isInteger(end) || end < unit + 1 || end > paragraph.text.length)
    return fail('InvalidTabFollowingRange');
  let decimalWidth = 0,
    seenDecimal = false;
  const following = createTextLineWidth([{ unit: unit + 1, x: 0 }]);
  for (const part of new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(
    paragraph.text.slice(unit + 1, end),
  )) {
    if (part.segment === '\t' || isHardLineBreak(part.segment)) break;
    if (part.segment.includes('\ufffc')) return fail('UnsupportedTabFollowingObject');
    const measured = measureUnit(part.segment, unit + 1 + part.index);
    if (part.segment === decimalCharacter && !seenDecimal) {
      seenDecimal = true;
      decimalWidth = following.nextX();
    }
    try {
      following.add(measured, unit + 1 + part.index + part.segment.length);
    } catch {
      return fail('InvalidTabFollowingMeasurement');
    }
  }
  return nextTabPlacement({
    ...options,
    followingWidth: following.width(),
    decimalWidth: seenDecimal ? decimalWidth : following.width(),
  });
}
