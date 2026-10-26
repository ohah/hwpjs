import { hwpUnitPixels } from './hwp-units.mjs';
import { createTextStyle } from './text-style.mjs';
import { FONT } from './layout.mjs';
import { validShapeLayoutValues } from '../../js/hwpx-shape-layout-values.mjs';
export const checkBoxPositionKey = (section, paragraph, unit) => `${section}:${paragraph}:${unit}`;
export function inlineCheckBoxIndex(content) {
  const result = new Map(),
    fontAt = createTextStyle(content, FONT);
  result.unavailable = [];
  result.blocked = new Set();
  for (const row of content.checkBoxes ?? []) {
    const source = row.sourceLayout,
      g = source?.geometry,
      p = source?.position,
      c = source?.character;
    const paragraph = content.paragraphs.find(
      (value) => value.section === row.section && value.paragraph === row.paragraph,
    );
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
    if (!c || c.auto_size !== false || c.word_wrap !== false || typeof row.caption !== 'string') {
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
    let font;
    if (c.follow_context === true) font = fontAt(paragraph, row.anchorUnit);
    else if (
      c.follow_context === false &&
      content.characterShapes?.some(
        (shape) => shape.id === c.id && Number.isInteger(shape.height) && shape.height > 0,
      )
    )
      font = fontAt(
        {
          text: row.caption,
          characterRanges: [{ start: 0, end: Math.max(1, row.caption.length), charShapeId: c.id }],
        },
        0,
      );
    else {
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
      checkBox: row,
    });
  }
  return result;
}
