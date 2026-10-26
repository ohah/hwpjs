import { DEFAULT_ROW_HEIGHT, DEFAULT_TEXT_HEIGHT, TEXT_TOP } from './row-geometry.mjs';
import { paragraphLineGeometry, paragraphLineAdvance } from './paragraph-geometry.mjs';
import { measureDisplayRun, textMeasurement } from './text-measurement.mjs';
import { measureAutomaticNumberPrefix } from './automatic-number-prefix.mjs';
import { isHardLineBreak } from './hard-line-break.mjs';
import { alignTextRow } from './line-alignment.mjs';
import { tabLineContext } from './tab-line-context.mjs';
import { createTabRowState } from './tab-row-state.mjs';
import { createTextLineWidth } from './text-line-width.mjs';
import { inlineObjectLineAdvance } from './inline-object-line-advance.mjs';
import { trailingSpaceStart, hangsTrailingSpace } from './trailing-space-flow.mjs';

/** One measured line from a source UTF-16 boundary, independent of page state. */
export function nextTextRow(
  paragraph,
  startUnit,
  width,
  measure,
  { minimumTextHeight = DEFAULT_TEXT_HEIGHT, endUnit = paragraph.text.length } = {},
) {
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isInteger(startUnit) ||
    startUnit < 0 ||
    startUnit > paragraph.text.length
  )
    throw new RangeError('InvalidLayoutBounds');
  const segments = new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(paragraph.text);
  if (!Number.isInteger(endUnit) || endUnit < startUnit || endUnit > paragraph.text.length)
    throw new RangeError('InvalidLayoutBounds');
  if (startUnit < paragraph.text.length && segments.containing(startUnit)?.index !== startUnit)
    throw new RangeError('InvalidTextBoundary');
  if (endUnit < paragraph.text.length && segments.containing(endUnit)?.index !== endUnit)
    throw new RangeError('InvalidTextBoundary');
  const numberPrefix = measureAutomaticNumberPrefix(paragraph, startUnit, measure);
  if (!Number.isFinite(minimumTextHeight) || minimumTextHeight < 0)
    throw new RangeError('InvalidLayoutBounds');
  const emptyHeight =
    minimumTextHeight === 0
      ? textMeasurement(measure('', paragraph, startUnit, 'text')).height
      : minimumTextHeight;
  let text = '',
    textHeight = Math.max(emptyHeight, numberPrefix?.height ?? 0);
  let spacingBasisHeight = textHeight,
    hasInlineSpacing = false;
  let hasContent = Boolean(numberPrefix?.text?.trim());
  const trailingStart = trailingSpaceStart(paragraph.text);
  const boundaries = [{ unit: startUnit, x: numberPrefix?.width ?? 0 }];
  const lineWidth = createTextLineWidth(boundaries, numberPrefix?.width ?? 0);
  const tabs = createTabRowState();
  for (const part of segments) {
    if (part.index < startUnit) continue;
    if (part.index >= endUnit) break;
    if (isHardLineBreak(part.segment)) {
      const breakHeight = textMeasurement(measure('', paragraph, part.index, 'text')).height;
      textHeight = Math.max(textHeight, breakHeight);
      spacingBasisHeight = Math.max(spacingBasisHeight, breakHeight);
      text += part.segment;
      lineWidth.hardBreak(part.index + part.segment.length);
      break;
    }
    const measurement = measureDisplayRun(
      part.segment,
      paragraph,
      part.index,
      'text',
      measure,
      part.segment === '\t'
        ? tabLineContext(paragraph, width, lineWidth.nextX(), startUnit, {
            endUnit,
            naturalX: tabs.naturalX(),
          })
        : undefined,
    );
    const geometry = paragraphLineGeometry(
      paragraph.paragraphShape,
      width,
      lineWidth.width(),
      startUnit === 0,
    );
    if (
      text &&
      lineWidth.probe(measurement) > geometry.width &&
      !hangsTrailingSpace(part.segment, part.index, trailingStart, hasContent)
    )
      break;
    tabs.add(measurement, part.index, lineWidth.nextX());
    text += part.segment;
    textHeight = Math.max(textHeight, measurement.height);
    spacingBasisHeight = Math.max(
      spacingBasisHeight,
      measurement.spacingBasisHeight ?? measurement.height,
    );
    hasInlineSpacing ||= measurement.spacingBasisHeight !== undefined;
    hasContent ||= part.segment.trim().length > 0;
    lineWidth.add(measurement, part.index + part.segment.length);
  }
  const geometry = paragraphLineGeometry(
    paragraph.paragraphShape,
    width,
    lineWidth.width(),
    startUnit === 0,
  );
  return alignTextRow(
    {
      kind: 'text',
      section: paragraph.section,
      paragraph: paragraph.paragraph,
      text,
      startUnit,
      endUnit: startUnit + text.length,
      boundaries,
      textHeight,
      ...(hasInlineSpacing ? { spacingBasisHeight } : {}),
      height: hasInlineSpacing
        ? inlineObjectLineAdvance(
            paragraph.paragraphShape,
            textHeight,
            spacingBasisHeight,
            Math.max(DEFAULT_ROW_HEIGHT, textHeight + TEXT_TOP),
          )
        : paragraphLineAdvance(
            paragraph.paragraphShape,
            textHeight,
            Math.max(DEFAULT_ROW_HEIGHT, textHeight + TEXT_TOP),
          ),
      paragraphShape: paragraph.paragraphShape,
      paragraphX: geometry.x,
      width: geometry.width,
      ...(numberPrefix ? { numberPrefix } : {}),
      ...tabs.fields(),
      editable: paragraph.editable,
      selectable: !paragraph.clipped && (paragraph.editable || paragraph.selectable),
    },
    { lastLine: startUnit + text.length === paragraph.text.length, paragraph },
  );
}
