import { equationPaintAt } from "./equation-render-content.mjs";
import { dutmalAt, dutmalPaintPlan } from "./dutmal-paint.mjs";
import { picturePositionKey } from "./picture-inline.mjs";
import { checkBoxPositionKey } from "./checkbox-inline-layout.mjs";
import { canvasGlyphGeometry } from "./canvas-glyph-geometry.mjs";

// Canvas와 진단이 같은 원자/글꼴 측정을 사용합니다. 빈 문자열은 글꼴 기준 조회입니다.
export function createPreviewTextMeasure(
  ctx,
  fontAt,
  { pictures = new Map(), charts = new Map(), checkBoxes = new Map(), forms = new Map() } = {},
) {
  return (text, paragraph, unit, kind) => {
    ctx.font = fontAt(paragraph, unit, kind);
    const atom = kind === "text" && text !== "";
    const equation = atom ? equationPaintAt(paragraph, unit) : null;
    if (equation)
      return {
        width: equation.layout.box.width,
        height: Math.max(
          fontAt.textHeight(paragraph, unit, kind),
          equation.layout.box.ascent + equation.layout.box.descent,
        ),
      };
    const dutmal = atom ? dutmalAt(paragraph, unit) : null;
    if (dutmal) {
      const plan = dutmalPaintPlan(
        dutmal,
        ctx.font,
        fontAt.textHeight(paragraph, unit, kind),
        (value, font) => {
          ctx.save();
          try {
            ctx.font = font;
            return ctx.measureText(value).width;
          } finally {
            ctx.restore();
          }
        },
      );
      if (plan) return { width: plan.width, height: plan.height };
    }
    const key = paragraph ? picturePositionKey(paragraph.section, paragraph.paragraph, unit) : null;
    const picture = atom ? pictures.get(key) : null;
    if (picture) return { width: picture.width, height: picture.height };
    const chart = atom ? charts.get(key) : null;
    if (chart) return { width: chart.width, height: chart.height };
    const checkBox =
      atom && paragraph
        ? checkBoxes.get(checkBoxPositionKey(paragraph.section, paragraph.paragraph, unit))
        : null;
    if (checkBox)
      return {
        width: checkBox.width,
        height: checkBox.affectLineSpacing
          ? checkBox.height
          : fontAt.textHeight(paragraph, unit, kind),
      };
    const form =
      atom && paragraph
        ? forms.get(checkBoxPositionKey(paragraph.section, paragraph.paragraph, unit))
        : null;
    if (form)
      return {
        width: form.width,
        height: form.affectLineSpacing ? form.height : fontAt.textHeight(paragraph, unit, kind),
      };
    const geometry = canvasGlyphGeometry(ctx, fontAt, paragraph, unit, kind, text),
      { metrics, width } = geometry;
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const advance =
      atom && fontAt.characterAdvance
        ? fontAt.characterAdvance(paragraph, unit, kind, width)
        : width;
    return {
      width,
      ...(advance !== width ? { advance } : {}),
      height: Math.max(
        fontAt.textHeight(paragraph, unit, kind),
        Number.isFinite(inkHeight) ? inkHeight : 0,
      ),
    };
  };
}
