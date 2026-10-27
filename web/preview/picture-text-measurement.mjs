import { withParagraphFlowReuse } from './paragraph-flow-reuse.mjs';
import { pictureMeasureDependency } from './picture-measure-dependency.mjs';
import { picturePositionKey } from './picture-inline.mjs';
import { textMeasurement } from './text-measurement.mjs';

export function pictureTextMeasure(inlineIndex, floatingPictures, measure) {
  const floating = new Set(
    floatingPictures.map((p) => picturePositionKey(p.section, p.paragraph, p.anchorUnit)),
  );
  return withParagraphFlowReuse(
    measure,
    (text, paragraph, unit, kind) => {
      const key = picturePositionKey(paragraph.section, paragraph.paragraph, unit);
      const item = kind === 'text' && text !== '' && inlineIndex.get(key);
      if (item)
        return {
          width: item.width,
          height: item.height,
          spacingBasisHeight: textMeasurement(measure('', paragraph, unit, kind)).height,
        };
      if (kind === 'text' && floating.has(key))
        return { width: 0, height: textMeasurement(measure('', paragraph, unit, kind)).height };
      return measure(text, paragraph, unit, kind);
    },
    () =>
      inlineIndex.size + floating.size > 256
        ? Symbol('PictureFlowDependencyBudget')
        : pictureMeasureDependency(inlineIndex, floating),
  );
}
