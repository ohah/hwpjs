import { paragraphCharacterRange } from './projection-measure-memo.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { createTextStyle } from './text-style.mjs';
import { FONT } from './layout.mjs';
import { validShapeLayoutValues } from '../../js/hwpx-shape-layout-values.mjs';
export const checkBoxPositionKey = (section, paragraph, unit) => `${section}:${paragraph}:${unit}`;
export function inlineCheckBoxIndex(content, { allowFormTextWrap = false } = {}) {
  const result = new Map(),
    fontAt = createTextStyle(content, FONT);
  result.unavailable = [];
  result.blocked = new Set();
  const sourceRows = content.checkBoxes ?? [];
  const rows = Array.isArray(sourceRows) ? sourceRows : [...sourceRows];
  if (rows.length === 0) return result;
  // Borrow only requested Native paragraph owners, retaining the first match.
  // Stop once all owners are found; unrelated tail paragraphs stay lazy.
  const paragraphs = new Map();
  let remaining = 0;
  for (const row of rows) {
    if (Number.isNaN(row.section) || Number.isNaN(row.paragraph)) continue;
    let section = paragraphs.get(row.section);
    if (!section) paragraphs.set(row.section, (section = new Map()));
    if (!section.has(row.paragraph)) {
      section.set(row.paragraph, null);
      remaining++;
    }
  }
  if (remaining !== 0) {
    for (const paragraph of content.paragraphs ?? []) {
      const section = paragraphs.get(paragraph.section);
      if (
        !section ||
        !section.has(paragraph.paragraph) ||
        section.get(paragraph.paragraph) !== null
      )
        continue;
      section.set(paragraph.paragraph, paragraph);
      if (--remaining === 0) break;
    }
  }
  for (const row of rows) {
    const source = row.sourceLayout,
      g = source?.geometry,
      p = source?.position,
      c = source?.character;
    const paragraph = paragraphs.get(row.section)?.get(row.paragraph);
    const fail = (reason) => {
      result.unavailable.push({ section: row.section, formNode: row.formNode, reason });
    };
    if (row.siteState !== 'located' || paragraph?.text[row.anchorUnit] !== '\ufffc') {
      fail('MissingFormDisplayAnchor');
      continue;
    }
    if (
      !g ||
      g.treat_as_character !== true ||
      g.width_relative !== 4 ||
      g.height_relative !== 2 ||
      ![g.width, g.height].every((n) => Number.isInteger(n) && n > 0 && n <= 0xffffffff)
    ) {
      fail('UnsupportedFormDimensions');
      continue;
    }
    if (!validShapeLayoutValues(source)) {
      fail('InvalidFormLayoutSnapshot');
      continue;
    }
    if (p.relations.some((value, index) => value !== [2, 2, 0, 0][index])) {
      fail('UnsupportedFormPlacement');
      continue;
    }
    if (
      !p ||
      p.flags[0] === null ||
      ![g.horizontal_offset, g.vertical_offset].every((n) => n === 0) ||
      source.flow.outside_margins.some((n) => n !== 0)
    ) {
      fail('UnsupportedFormPlacement');
      continue;
    }
    const wraps =
      allowFormTextWrap &&
      row.kind === 'edit_box' &&
      row.sourceAttrs?.booleans?.multiLine === true &&
      typeof c?.word_wrap === 'boolean';
    if (
      !c ||
      c.auto_size !== false ||
      (!wraps && c.word_wrap !== false) ||
      typeof row.caption !== 'string'
    ) {
      fail('UnsupportedFormCaptionLayout');
      continue;
    }
    if (
      ![row.foreColor, row.backColor].every(
        (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
      ) ||
      !['OPAQUE', 'TRANSPARENT'].includes(row.backStyle)
    ) {
      fail('UnsupportedFormColor');
      continue;
    }
    let font, fontHeight;
    if (c.follow_context === true) {
      const id = paragraphCharacterRange(paragraph, row.anchorUnit)?.charShapeId;
      if (
        !content.characterShapes?.some(
          (shape) => shape.id === id && Number.isInteger(shape.height) && shape.height > 0,
        )
      ) {
        fail('MissingFormCharacterStyle');
        continue;
      }
      const sampled = {
        ...paragraph,
        text: row.caption || ' ',
        characterRanges: [{ start: 0, end: Math.max(1, row.caption.length), charShapeId: id }],
      };
      font = fontAt(sampled, 0);
      fontHeight = fontAt.fontHeight(sampled, 0);
    } else if (
      c.follow_context === false &&
      content.characterShapes?.some(
        (shape) => shape.id === c.id && Number.isInteger(shape.height) && shape.height > 0,
      )
    ) {
      const styled = {
        text: row.caption,
        characterRanges: [{ start: 0, end: Math.max(1, row.caption.length), charShapeId: c.id }],
      };
      font = fontAt(styled, 0);
      fontHeight = fontAt.fontHeight(styled, 0);
    } else {
      fail('MissingFormCharacterStyle');
      continue;
    }
    const key = checkBoxPositionKey(row.section, row.paragraph, row.anchorUnit);
    if (result.has(key)) {
      result.set(key, null);
      result.blocked.add(key);
      fail('AmbiguousFormDisplayAnchor');
      continue;
    }
    result.set(key, {
      width: hwpUnitPixels(g.width),
      height: hwpUnitPixels(g.height),
      affectLineSpacing: p.flags[0],
      font,
      fontHeight,
      checkBox: row,
    });
  }
  return result;
}
