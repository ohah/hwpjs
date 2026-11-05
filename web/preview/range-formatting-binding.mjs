// 한 요청의 현재 범위 비교 자료다. 과거 범위를 재설정하거나 Core 대상을 만들지 않는다.
import { paragraphSelectionRanges, paragraphSelectionOwner } from './paragraph-selection.mjs';
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const samePoint = (a, b) =>
  a?.section === b?.section && a?.paragraph === b?.paragraph && a?.unit === b?.unit;
const original = (format, row) =>
  format !== 'hwp5' ||
  (row.currentReference?.kind === 'original' &&
    row.currentReference.section === row.section &&
    typeof row.currentReference.id === 'string' &&
    row.currentReference.id.length <= 10 &&
    /^(0|[1-9][0-9]*)$/.test(row.currentReference.id) &&
    BigInt(row.currentReference.id) <= 0xffffffffn);
function rowsByPosition(content) {
  if (!Array.isArray(content?.paragraphs)) return null;
  const map = new Map();
  for (const row of content.paragraphs) {
    if (!row || !uint(row.section) || !uint(row.paragraph)) return null;
    let section = map.get(row.section);
    if (!section) map.set(row.section, (section = new Map()));
    if (section.has(row.paragraph)) return null;
    section.set(row.paragraph, row);
  }
  return map;
}
function offsets(value) {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value)) throw Error('InvalidFormattingOffsets');
  let previous;
  return Object.freeze(
    value.map((row) => {
      if (
        !row ||
        !uint(row.at) ||
        !uint(row.source) ||
        (previous && (row.at <= previous.at || row.source <= previous.source))
      )
        throw Error('InvalidFormattingOffsets');
      const copy = Object.freeze({ at: row.at, source: row.source });
      previous = copy;
      return copy;
    }),
  );
}
const sameOffsets = (a, b) =>
  a === b ||
  (Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((row, index) => row.at === b[index]?.at && row.source === b[index]?.source));
export function captureFormattingRangeBinding(state, selection) {
  const content = state?.content;
  if (
    state?.status !== 'ready' ||
    state.selection != null ||
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content.limited === true ||
    !selection?.anchor ||
    !selection?.focus
  )
    return null;
  const { anchor, focus } = selection;
  if (
    anchor.createdCell ||
    focus.createdCell ||
    anchor.pageArea !== undefined ||
    focus.pageArea !== undefined
  )
    return null;
  const display = paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
    sourcePositions: false,
    includeEmpty: true,
  });
  const source = paragraphSelectionRanges(content.paragraphs, anchor, focus, undefined, {
    includeEmpty: true,
  });
  const indexed = rowsByPosition(content);
  if (!display || !source || !indexed) return null;
  const members = [];
  for (let index = 0; index < display.length; index++) {
    const range = display[index],
      row = indexed.get(range.section)?.get(range.paragraph);
    if (
      !row ||
      row.createdCell ||
      row.clipped ||
      row.editable !== true ||
      !original(content.format, row)
    )
      return null;
    const owner = paragraphSelectionOwner(row);
    if (typeof owner !== 'string' || !owner) return null;
    const ref = row.currentReference;
    members.push(
      Object.freeze({
        section: range.section,
        paragraph: range.paragraph,
        owner,
        text: row.text,
        offsets: offsets(row.sourceOffsets),
        original:
          content.format === 'hwp5'
            ? Object.freeze({ kind: ref.kind, section: ref.section, id: ref.id })
            : undefined,
        display: Object.freeze({ ...range }),
        source: Object.freeze({ ...source[index] }),
      }),
    );
  }
  return Object.freeze({
    documentId: state.documentId,
    generation: state.generation,
    format: content.format,
    anchor: Object.freeze({
      section: anchor.section,
      paragraph: anchor.paragraph,
      unit: anchor.unit,
    }),
    focus: Object.freeze({ section: focus.section, paragraph: focus.paragraph, unit: focus.unit }),
    members: Object.freeze(members),
  });
}
export function formattingRangeBindingMatches(binding, state, selection) {
  if (
    !binding ||
    !samePoint(binding.anchor, selection?.anchor) ||
    !samePoint(binding.focus, selection?.focus) ||
    state?.documentId !== binding.documentId ||
    state.generation !== binding.generation ||
    state.content?.format !== binding.format
  )
    return false;
  const current = captureFormattingRangeBinding(state, selection);
  return Boolean(
    current &&
    current.members.length === binding.members.length &&
    current.members.every((row, index) => {
      const before = binding.members[index];
      return (
        row.section === before.section &&
        row.paragraph === before.paragraph &&
        row.owner === before.owner &&
        row.text === before.text &&
        sameOffsets(row.offsets, before.offsets) &&
        (binding.format !== 'hwp5' ||
          (row.original.kind === before.original.kind &&
            row.original.section === before.original.section &&
            row.original.id === before.original.id)) &&
        row.display.startUnit === before.display.startUnit &&
        row.display.endUnit === before.display.endUnit &&
        row.source.startUnit === before.source.startUnit &&
        row.source.endUnit === before.source.endUnit
      );
    }),
  );
}
export function formattingRangeSelectors(binding, character) {
  if (!binding) throw Error('UnsupportedFormattingSelection');
  return Object.freeze(
    binding.members.flatMap((row) => {
      if (character && row.display.startUnit === row.display.endUnit) return [];
      if (
        character &&
        row.source.endUnit - row.source.startUnit !== row.display.endUnit - row.display.startUnit
      )
        throw Error('ProtectedAnchorRange');
      return [
        Object.freeze({
          kind: 'original-paragraph',
          section: row.section,
          paragraph: row.paragraph,
          ...(character
            ? {
                ranges: Object.freeze([
                  Object.freeze({ startUnit: row.source.startUnit, endUnit: row.source.endUnit }),
                ]),
              }
            : {}),
        }),
      ];
    }),
  );
}
