import { hwpUnitPixels } from './hwp-units.mjs';
import { formTextLayout } from './form-text-layout.mjs';
import {
  FORM_TEXT_LEFT,
  FORM_TEXT_CLIP,
  formTextWrapWidth,
  FORM_COMBO_TEXT_CUT,
  FORM_CHOICE_SIZE,
  FORM_CHOICE_GAP,
} from './form-face-geometry.mjs';
const kinds = new Set([
  'edit',
  'edit_box',
  'combo_box',
  'push_button',
  'button',
  'check_box',
  'check_button',
  'radio_button',
]);
/** Product content-fit policy: current full-string Canvas shaping + existing face geometry.
 * This is not a reconstructed Hancom sizing formula or a persisted Native frame edit.
 */
export function createCanvasFormAutoSizer(ctx) {
  return ({ context: c, commit }) => {
    if (
      !kinds.has(c.kind) ||
      typeof ctx?.measureText !== 'function' ||
      !Number.isFinite(c.fontHeight) ||
      c.fontHeight <= 0
    )
      throw Error('UnsupportedFormAutoSizeMetric');
    // Empty Text uses Name for sizing only. The raw value and painted label stay unchanged.
    if (c.label === '' && typeof c.name !== 'string') throw Error('UnknownFormAutoSizeName');
    const label = c.label === '' ? c.name : c.label;
    const choice = ['check_box', 'check_button', 'radio_button'].includes(c.kind),
      button = ['button', 'push_button'].includes(c.kind),
      combo = c.kind === 'combo_box';
    ctx.save();
    try {
      ctx.font = '1px serif';
      ctx.font = c.font;
      const firstFont = ctx.font;
      ctx.font = '2px serif';
      ctx.font = c.font;
      if (ctx.font !== firstFont) throw Error('UnsupportedFormAutoSizeFont');
      ctx.textBaseline = 'middle';
      ctx.textAlign = button ? 'center' : 'left';
      const measure = (text) => {
        const m = ctx.measureText(text);
        const fields = [
          'width',
          'actualBoundingBoxLeft',
          'actualBoundingBoxRight',
          'actualBoundingBoxAscent',
          'actualBoundingBoxDescent',
          'fontBoundingBoxAscent',
          'fontBoundingBoxDescent',
        ];
        if (!fields.every((k) => Number.isFinite(m[k])) || m.width < 0)
          throw Error('UnsupportedFormAutoSizeMetric');
        return m;
      };
      const multiline = c.multiline === true,
        wrap = multiline && c.wordWrap === true;
      const rows = formTextLayout(label, {
        width: formTextWrapWidth(c.storedFrame.width, c.kind),
        wrap,
        measure: (s) => measure(s).width,
      });
      if (rows.clipped) throw Error('FormAutoSizeBudgetExceeded');
      let halfHeight = 0,
        span = 0,
        leftOverhang = 0;
      for (const row of rows.rows) {
        const m = measure(row.text);
        halfHeight = Math.max(
          halfHeight,
          Math.abs(m.fontBoundingBoxAscent),
          Math.abs(m.fontBoundingBoxDescent),
          Math.abs(m.actualBoundingBoxAscent),
          Math.abs(m.actualBoundingBoxDescent),
        );
        span = Math.max(
          span,
          button
            ? 2 * Math.max(m.width / 2, m.actualBoundingBoxLeft, m.actualBoundingBoxRight)
            : Math.max(m.width, m.actualBoundingBoxRight),
        );
        leftOverhang = Math.max(leftOverhang, m.actualBoundingBoxLeft);
      }
      const lineHeight = 2 * halfHeight;
      if (!Number.isFinite(lineHeight) || lineHeight <= 0)
        throw Error('UnsupportedFormAutoSizeMetric');
      const textOffset =
        FORM_TEXT_LEFT + Math.max(0, leftOverhang - (FORM_TEXT_LEFT - FORM_TEXT_CLIP));
      let width = choice
        ? FORM_CHOICE_SIZE + FORM_CHOICE_GAP + span
        : button
          ? span + 2 * FORM_TEXT_CLIP
          : textOffset + span + (combo ? FORM_COMBO_TEXT_CUT - FORM_TEXT_CLIP : FORM_TEXT_CLIP);
      if (wrap) width = Math.max(width, c.storedFrame.width);
      const height = Math.max(
        choice ? FORM_CHOICE_SIZE : 0,
        lineHeight * (multiline ? rows.rows.length : 1),
      );
      if (width > hwpUnitPixels(0xffffffff) || height > hwpUnitPixels(0xffffffff))
        throw Error('FormAutoSizeBudgetExceeded');
      commit({ width, height, units: 'document-css-px', scale: 1, lineHeight, textOffset });
    } finally {
      ctx.restore();
    }
  };
}
