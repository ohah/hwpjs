import { isPositionedBodySource } from './positioned-row-fragments.mjs';
import { graphemeUnits } from './text-input.mjs';
import { isHardLineBreak } from './hard-line-break.mjs';

// 기존 줄 나눔만 합칩니다. 표·간격·단 선언과 원본에서 빠진 구간은 합성하지 않습니다.
export function bodyRowSources(rows, paragraphs, { maxRows = 20000 } = {}) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(rows) ||
    !Array.isArray(paragraphs) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail('InvalidBodyRowSources');
  if (rows.length > maxRows) return fail('BodyRowSourceLimit');
  const owners = new Map(),
    bounds = new Map(),
    ends = new Map(),
    terminal = new Set(),
    result = [];
  for (const p of paragraphs) {
    if (
      !p ||
      !Number.isSafeInteger(p.section) ||
      p.section < 0 ||
      !Number.isSafeInteger(p.paragraph) ||
      p.paragraph < 0 ||
      typeof p.text !== 'string'
    )
      return fail('InvalidBodyRowSources');
    const key = `${p.section}:${p.paragraph}`;
    if (owners.has(key)) return fail('AmbiguousBodyRowOwner');
    owners.set(key, p);
  }
  for (const row of rows) {
    const key = `${row?.section}:${row?.paragraph}`,
      p = owners.get(key);
    if (
      !row ||
      !p ||
      !['text', 'gap', 'anchor'].includes(row.kind) ||
      ['pageOrdinal', 'columnOrdinal', 'referenceBoxes', 'transform', 'pageClip'].some(
        (field) => row[field] !== undefined,
      )
    )
      return fail('InvalidBodyRowSources');
    if (!isPositionedBodySource(row)) {
      result.push(row);
      continue;
    }
    if (
      p.clipped ||
      p.tableCell ||
      p.tableCaption ||
      p.drawingText ||
      p.drawingCaption ||
      (p.textStartUnit ?? 0) !== 0
    )
      return fail('UnsupportedBodyRowOwner');
    let boundary = bounds.get(key);
    if (!boundary) {
      boundary = new Set(graphemeUnits(p.text));
      bounds.set(key, boundary);
    }
    if (
      !Number.isSafeInteger(row.startUnit) ||
      !Number.isSafeInteger(row.endUnit) ||
      row.endUnit < row.startUnit ||
      !boundary.has(row.startUnit) ||
      !boundary.has(row.endUnit) ||
      row.text !== p.text.slice(row.startUnit, row.endUnit) ||
      !Number.isFinite(row.height) ||
      row.height <= 0 ||
      row.startUnit < (ends.get(key) ?? 0)
    )
      return fail('InvalidBodyRowSourceRange');
    const empty = row.startUnit === row.endUnit;
    const last = result.at(-1);
    if (empty) {
      if (
        terminal.has(key) ||
        row.endUnit !== p.text.length ||
        (p.text.length && !isHardLineBreak(p.text.slice(-1)))
      )
        return fail('InvalidBodyRowSourceRange');
      terminal.add(key);
      if (
        last?.paragraphSource === p &&
        last.endUnit === row.startUnit &&
        last.startUnit < last.endUnit &&
        last.columnDeclaration === row.columnDeclaration &&
        last.keepNextHeight === row.keepNextHeight
      )
        continue;
      if (p.text.length) return fail('UnsupportedBodySourceInsertion');
    }
    ends.set(key, row.endUnit);
    if (
      last?.paragraphSource === p &&
      last.endUnit === row.startUnit &&
      last.columnDeclaration === row.columnDeclaration &&
      last.keepNextHeight === row.keepNextHeight
    ) {
      last.endUnit = row.endUnit;
      last.text = p.text.slice(last.startUnit, last.endUnit);
      continue;
    }
    const carrier = { ...row, paragraphSource: p, paragraphShape: p.paragraphShape };
    for (const field of [
      'x',
      'y',
      'boundaries',
      'paragraphX',
      'paragraphReferenceX',
      'width',
      'textHeight',
      'textTop',
      'numberPrefix',
      'flowAnchorY',
      'flowParagraphBox',
    ])
      delete carrier[field];
    result.push(carrier);
  }
  return { state: 'prepared', rows: result };
}
