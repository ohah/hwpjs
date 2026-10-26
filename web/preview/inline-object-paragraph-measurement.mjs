import { createNativeGraphemeSegmenter } from './text-boundary-platform.mjs';
import { layoutContent } from './layout.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { inlineObjectLineAdvance } from './inline-object-line-advance.mjs';
import { DEFAULT_ROW_HEIGHT, TEXT_TOP } from './row-geometry.mjs';
import { inlineObjectIdentity } from './inline-object-identity.mjs';
import { compactTerminalTextFlow } from './terminal-text-flow.mjs';
import { terminalTextLine } from './terminal-text-flow.mjs';
import { pageRowFitHeight } from './page-row-extents.mjs';

// 현재 UTF-16 위치와 주입된 인라인 개체 크기를 측정합니다.
export function measureInlineObjectParagraph(
  paragraph,
  entries,
  width,
  measure,
  {
    maxRows = 20000,
    allowLineOverflow = false,
    compactLines = false,
    includeTerminalAfter = true,
    zeroWidthUnits = [],
    textAnchorUnits = [],
    pictureFlow = null,
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !paragraph ||
    typeof paragraph.text !== 'string' ||
    !Array.isArray(entries) ||
    !entries.length ||
    typeof measure !== 'function' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidInlineObjectMeasurement');
  if (
    pictureFlow !== null &&
    (typeof pictureFlow !== 'object' ||
      Array.isArray(pictureFlow) ||
      !Array.isArray(pictureFlow.pictures) ||
      !Array.isArray(pictureFlow.placedPictures) ||
      !pictureFlow.pictureFlowContext ||
      typeof pictureFlow.pictureFlowContext !== 'object')
  )
    return unavailable('InvalidInlineObjectMeasurement');
  const sourceStart = paragraph.textStartUnit ?? 0;
  if (
    !Number.isSafeInteger(sourceStart) ||
    sourceStart < 0 ||
    !Number.isSafeInteger(sourceStart + paragraph.text.length)
  )
    return unavailable('InvalidInlineObjectMeasurement');
  const units = [];
  for (let unit = 0; unit < paragraph.text.length; unit++)
    if (paragraph.text[unit] === '\ufffc') units.push(sourceStart + unit);
  const objectUnits = new Set(units);
  if (
    !Array.isArray(zeroWidthUnits) ||
    !zeroWidthUnits.every((unit) => Number.isSafeInteger(unit) && objectUnits.has(unit)) ||
    new Set(zeroWidthUnits).size !== zeroWidthUnits.length
  )
    return unavailable('InvalidInlineObjectAnchorPosition');
  const overlays = new Set(zeroWidthUnits);
  if (
    !Array.isArray(textAnchorUnits) ||
    !textAnchorUnits.every(
      (unit) => Number.isSafeInteger(unit) && objectUnits.has(unit) && !overlays.has(unit),
    ) ||
    new Set(textAnchorUnits).size !== textAnchorUnits.length
  )
    return unavailable('InvalidInlineObjectAnchorPosition');
  const textAnchors = new Set(textAnchorUnits);
  if (units.length !== entries.length + overlays.size + textAnchors.size)
    return unavailable('AmbiguousInlineObjectAnchors');
  for (const part of createNativeGraphemeSegmenter().segment(paragraph.text)) {
    if (part.segment.includes('\ufffc') && part.segment.length !== 1)
      return unavailable('UnsupportedInlineObjectGrapheme');
  }
  const byUnit = new Map(),
    ids = new Set(),
    unitSet = new Set(units.filter((unit) => !overlays.has(unit) && !textAnchors.has(unit)));
  const inlineUnits = [...unitSet];
  const explicit = entries.some((entry) => entry && Object.hasOwn(entry, 'unit'));
  for (const [index, entry] of entries.entries()) {
    const identity = inlineObjectIdentity(entry);
    if (
      identity === null ||
      ids.has(identity) ||
      ![entry.width, entry.height].every((value) => Number.isFinite(value) && value > 0) ||
      pageRowFitHeight(entry) === null
    )
      return unavailable('InvalidInlineObjectMeasurement');
    const unit = explicit ? entry.unit : inlineUnits[index];
    if (!Number.isSafeInteger(unit) || !unitSet.has(unit) || byUnit.has(unit))
      return unavailable('InvalidInlineObjectAnchorPosition');
    ids.add(identity);
    byUnit.set(unit, entry);
  }
  const currentMeasure = (text, current, unit, kind) =>
    kind === 'text' && text !== '' && overlays.has(unit)
      ? { ...textMeasurement(measure('', current, unit, kind)), width: 0 }
      : measure(text, current, unit, kind);
  const anchorUnits = [...byUnit.keys()];
  let flow = layoutContent(
    {
      ...pictureFlow,
      paragraphs: [{ ...paragraph, label: paragraph.label ?? '' }],
      limited: false,
    },
    width,
    (text, current, unit, kind) =>
      kind === 'text' && text !== '' && byUnit.has(unit)
        ? {
            width: byUnit.get(unit).width,
            height: byUnit.get(unit).height,
            ...(pictureFlow
              ? { spacingBasisHeight: textMeasurement(measure('', current, unit, kind)).height }
              : {}),
          }
        : currentMeasure(text, current, unit, kind),
    maxRows,
    { documentBody: true, compactLines: pictureFlow ? false : compactLines, includeTerminalAfter },
  );
  if (pictureFlow && !flow.spatialRows) return unavailable('UnsupportedInlinePictureFlow');
  if (pictureFlow && compactLines) {
    const originalRows = flow.rows;
    const occupiedRows = flow.rows.map((row) => {
      const ink = [...byUnit]
        .filter(([unit]) => row.kind === 'text' && row.startUnit <= unit && unit < row.endUnit)
        .map(([, entry]) => entry.height);
      return ink.length ? { ...row, textHeight: Math.max(row.textHeight, ...ink) } : row;
    });
    flow = compactTerminalTextFlow({ ...flow, rows: occupiedRows });
    flow.rows = flow.rows.map((row, index) => ({
      ...row,
      textHeight: originalRows[index].textHeight,
    }));
  }
  if (flow.limited) return unavailable('InlineObjectMeasurementLimit');
  let y = 0;
  const terminalLine = compactLines ? terminalTextLine(flow.rows) : null;
  const rows = flow.rows.map((row, index) => {
    if (pictureFlow && flow.spatialRows) return row;
    let current = { ...row, y };
    if (
      row.kind === 'text' &&
      anchorUnits.some((unit) => row.startUnit <= unit && row.endUnit > unit)
    ) {
      let glyphHeight = textMeasurement(measure('', paragraph, row.startUnit, 'text')).height;
      for (const part of createNativeGraphemeSegmenter().segment(row.text)) {
        const unit = row.startUnit + part.index;
        if (!byUnit.has(unit))
          glyphHeight = Math.max(
            glyphHeight,
            textMeasurement(currentMeasure(part.segment, paragraph, unit, 'text')).height,
          );
      }
      const minimum = compactLines
        ? glyphHeight
        : Math.max(DEFAULT_ROW_HEIGHT, glyphHeight + TEXT_TOP);
      const terminal =
        terminalLine !== null && index >= terminalLine.first && index <= terminalLine.last;
      const pitch = inlineObjectLineAdvance(
        paragraph.paragraphShape,
        row.textHeight,
        glyphHeight,
        minimum,
        { terminal },
      );
      current = { ...current, textHeight: glyphHeight, height: pitch };
      const rowObjects = [...byUnit]
        .filter(([unit]) => row.startUnit <= unit && row.endUnit > unit)
        .map(([, entry]) => entry);
      if (
        paragraph.paragraphShape?.spacingFormat === 'hwp5' ||
        rowObjects.some((entry) => Object.hasOwn(entry, 'pageFitHeight'))
      ) {
        const fitInk = Math.max(glyphHeight, ...rowObjects.map(pageRowFitHeight));
        // HWP5 trailing line spacing moves the cursor, not the object ink.
        const fitPitch =
          paragraph.paragraphShape?.spacingFormat === 'hwp5'
            ? fitInk
            : inlineObjectLineAdvance(paragraph.paragraphShape, fitInk, glyphHeight, minimum, {
                terminal,
              });
        if (fitPitch < pitch) current.pageFitHeight = fitPitch;
      }
    }
    y += current.height;
    return current;
  });
  const anchors = [];
  for (const [unit, entry] of byUnit) {
    const rowIndex = rows.findIndex(
      (row) => row.kind === 'text' && row.startUnit <= unit && row.endUnit > unit,
    );
    const row = rows[rowIndex],
      boundary = row?.boundaries.find((boundary) => boundary.unit === unit);
    if (!row || !boundary || (!allowLineOverflow && entry.width > row.width + 1e-8))
      return {
        ...unavailable('InlineObjectLineWidthOverflow'),
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        objectWidth: entry.width,
        availableWidth: row?.width,
        overflowStage: 'inline-object',
      };
    anchors.push({
      ...(Object.hasOwn(entry, 'createdTableIdentity')
        ? { createdTableIdentity: entry.createdTableIdentity }
        : { objectNode: entry.objectNode }),
      unit,
      rowIndex,
      x: (row.x ?? 0) + (row.paragraphX ?? 0) + boundary.x,
      y: row.y,
      width: entry.width,
      height: entry.height,
    });
  }
  return {
    state: 'measured',
    ...flow,
    rows,
    height: pictureFlow && flow.spatialRows ? flow.height : y,
    anchors,
  };
}
