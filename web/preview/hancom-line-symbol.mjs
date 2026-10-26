import { createCharacterFontSource } from './character-font-display.mjs';
import { canvasFontSize } from './canvas-font-size.mjs';
// One observed Hancom line symbol; model text and UTF-16 units stay untouched.
export function createHancomLineSymbol(content) {
  const sourceAt = createCharacterFontSource(content);
  return (resolveShape, resolveFont, paragraph, unit, kind, text) => {
    if (
      !['hwp5', 'hwpx'].includes(content.format) ||
      kind !== 'text' ||
      typeof paragraph?.text !== 'string' ||
      !Number.isSafeInteger(unit) ||
      unit < 0 ||
      unit >= paragraph.text.length
    )
      return null;
    const code = paragraph.text.codePointAt(unit);
    if (code !== 0xf080f || text !== String.fromCodePoint(code)) return null;
    const shape = resolveShape(paragraph, unit, kind);
    if (
      shape?.bold !== false ||
      shape?.italic !== false ||
      !Number.isInteger(shape.height) ||
      shape.height <= 0
    )
      return null;
    const source = sourceAt(shape.id, paragraph.text, unit),
      metadata = source?.metadata;
    if (!['한컴바탕', 'Haansoft Batang'].includes(source?.name) || metadata?.substitute !== null)
      return null;
    const selected =
      content.format === 'hwp5'
        ? Number.isInteger(metadata.attributes) &&
          metadata.attributes >= 0 &&
          metadata.attributes <= 255 &&
          (metadata.attributes & 0x9f) === 1
        : metadata.format === 'hwpx' &&
          metadata.font?.face === source.name &&
          metadata.font.type === 'TTF' &&
          ['0', 'false'].includes(metadata.font.isEmbedded) &&
          metadata.font.binaryItemIDRef === null;
    if (!selected) return null;
    const size = canvasFontSize(resolveFont(paragraph, unit, kind));
    return size ? { text: '━', width: size.pixels / 2 } : null;
  };
}
