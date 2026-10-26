/** Glyph size policy; nominal row metrics remain independent. */
import { createFontLanguageResolver } from './font-language-context.mjs';
import { usesDocumentFontMetrics } from './font-layout-policy.mjs';
import { roundedMulDiv } from './integer-mul-div.mjs';
export function createCharacterFontMetricDisplay(content) {
  const languageAt = createFontLanguageResolver();
  const values = new Map((content.characterFontMetrics ?? []).map((row) => [row.id, row.values]));
  const value = (field, id, text, unit) => {
    if (
      !usesDocumentFontMetrics(content.format) ||
      typeof text !== 'string' ||
      !Number.isInteger(unit) ||
      unit < 0 ||
      unit >= text.length ||
      text[unit] === '\ufffc'
    )
      return null;
    return values.get(id)?.[field]?.[languageAt(text, unit)];
  };
  return {
    relativeHeight(id, text, unit, height) {
      const relative = value('relativeSize', id, text, unit);
      if (!Number.isInteger(relative) || relative < 10 || relative > 250 || relative === 100)
        return height;
      return roundedMulDiv(height, relative, 100) ?? height;
    },
    horizontalScale(id, text, unit) {
      const ratio = value('ratio', id, text, unit);
      return Number.isInteger(ratio) && ratio >= 50 && ratio <= 200 ? ratio / 100 : 1;
    },
    characterAdvance(id, text, unit, width) {
      if (!Number.isFinite(width) || width < 0) throw new RangeError('InvalidTextMeasurement');
      const percent = value('spacing', id, text, unit);
      if (
        !Number.isInteger(percent) ||
        percent < -50 ||
        percent > 50 ||
        /[\t\r\n\ufffc]/u.test(text?.[unit] ?? '')
      )
        return width;
      // This is the current Canvas advance, not a recovered native font metric.
      const advance = width * (1 + percent / 100);
      if (!Number.isFinite(advance)) throw new RangeError('InvalidTextMeasurement');
      return advance;
    },
  };
}
export function createRelativeFontSize(content) {
  const metrics = createCharacterFontMetricDisplay(content);
  return (id, text, unit, points) => {
    const height = Math.round(points * 100),
      adjusted = metrics.relativeHeight(id, text, unit, height);
    return adjusted === height ? points : adjusted / 100;
  };
}
