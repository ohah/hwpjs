import { HFT_HANGUL_METRICS } from './hft-hangul-metrics.mjs';
import { createCharacterFontSource } from './character-font-display.mjs';
import { HFT_ASCII_METRICS } from './hft-ascii-metrics.mjs';
import { canvasFontSize } from './canvas-font-size.mjs';

export function createMeasuredFontWidth(content) {
  const sourceAt = createCharacterFontSource(content);
  return (shape, paragraph, unit, kind, text, cssFont) => {
    if (
      !['hwp5', 'hwpx'].includes(content.format) ||
      kind !== 'text' ||
      typeof text !== 'string' ||
      text.length !== 1 ||
      text !== paragraph?.text?.[unit] ||
      !Number.isInteger(shape?.height) ||
      shape.height <= 0 ||
      typeof shape.bold !== 'boolean' ||
      shape.italic !== false
    )
      return null;
    const code = text.charCodeAt(0);
    const hangul = content.format === 'hwp5' && code >= 0xac00 && code <= 0xd7a3;
    if (!hangul && (code < 0x20 || code > 0x7e)) return null;
    // 굵은체의 직접 advance 근거는 숫자/소수점 범위입니다. 공백/라틴 전체로 확대하지 않습니다.
    if (shape.bold && !((code >= 0x30 && code <= 0x39) || code === 0x2e)) return null;
    const source = sourceAt(shape.id, paragraph.text, unit),
      metadata = source?.metadata;
    const selected =
      content.format === 'hwpx'
        ? metadata?.format === 'hwpx' &&
          metadata.font?.type === 'HFT' &&
          metadata.font.face === source.name &&
          ['0', 'false'].includes(metadata.font.isEmbedded) &&
          metadata.substitute == null
        : Number.isInteger(metadata?.attributes) &&
          metadata.attributes >= 0 &&
          metadata.attributes <= 255 &&
          (metadata.attributes & 0x9f) === 2 &&
          metadata.substitute === null &&
          Array.isArray(metadata.typeInfo) &&
          metadata.typeInfo.length === 10;
    const metrics = hangul ? HFT_HANGUL_METRICS : HFT_ASCII_METRICS;
    if (!selected || !Object.hasOwn(metrics, source.name)) return null;
    // 적용 대상이 아닌 글꼴에는 CSS 스타일을 다시 계산하지 않습니다.
    const table = metrics[source.name],
      size = canvasFontSize(typeof cssFont === 'function' ? cssFont() : cssFont);
    if (!table || !size || !(size.pixels > 0)) return null;
    return hangul
      ? (table.width * size.pixels) / table.em
      : (table.widths[code - table.first] * size.pixels) / table.em;
  };
}
