import {
  FORM_TEXT_CLIP,
  FORM_TEXT_LEFT,
  FORM_COMBO_TEXT_CUT,
  formTextWrapWidth,
} from './form-face-geometry.mjs';

// Supported describes the DOM geometry assignment, not font/line-break parity.
export function formTextDraftEditorGeometry(frame) {
  if (
    frame?.basis !== 'current-autosize-measurement' ||
    !['edit', 'edit_box', 'combo_box'].includes(frame.kind) ||
    typeof frame.font !== 'string' ||
    !frame.font ||
    ![frame.width, frame.height, frame.lineHeight].every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(frame.textOffset) ||
    frame.textOffset < 0
  )
    return { kind: 'unsupported', reason: 'FormTextDraftMeasurementUnavailable' };
  const right =
    frame.kind === 'combo_box'
      ? FORM_COMBO_TEXT_CUT - FORM_TEXT_CLIP
      : frame.width -
        frame.textOffset -
        formTextWrapWidth(frame.width, frame.kind, frame.textOffset);
  if (right < 0 || frame.width - frame.textOffset - right <= 0)
    return { kind: 'unsupported', reason: 'FormTextDraftContentWidthUnavailable' };
  return {
    kind: 'supported',
    style: {
      minWidth: '',
      overflowX: '',
      font: frame.font,
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      lineHeight: `${frame.lineHeight}px`,
      padding: `0 ${right}px 0 ${frame.textOffset}px`,
      border: '0',
    },
  };
}

// Fallback consumes only already-painted/source geometry. It is not a receipt
// for the draft text and does not imply supported AutoSize recalculation.
export function paintedFormTextEditorGeometry(target) {
  const form = target?.form;
  if (
    !form ||
    !['edit', 'edit_box', 'combo_box'].includes(form.form?.source?.kind) ||
    ![target.x, target.y].every(Number.isFinite) ||
    ![target.width, target.height].every((v) => Number.isFinite(v) && v > 0) ||
    typeof form.font !== 'string' ||
    !form.font
  )
    return null;
  const offset = form.textOffset ?? FORM_TEXT_LEFT;
  if (!Number.isFinite(offset) || offset < 0) return null;
  const kind = form.form.source.kind;
  const right =
    kind === 'combo_box'
      ? FORM_COMBO_TEXT_CUT - FORM_TEXT_CLIP
      : Math.max(
          FORM_TEXT_CLIP,
          target.width - offset - formTextWrapWidth(target.width, kind, offset),
        );
  const narrow = target.width <= offset + right;
  return {
    // Editor-only overflow policy: reserve one CSS character of typing space.
    // This never resizes the painted/source frame or certifies font parity.
    minWidth: narrow ? `calc(${offset + right}px + 1ch)` : '',
    overflowX: narrow ? 'auto' : '',
    font: form.font,
    width: narrow ? `calc(${offset + right}px + 1ch)` : `${target.width}px`,
    height: `${target.height}px`,
    padding: `0 ${right}px 0 ${offset}px`,
    border: '0',
    // Do not infer a missing line height from dimensions or font strings.
    lineHeight:
      Number.isFinite(form.lineHeight) && form.lineHeight > 0 ? `${form.lineHeight}px` : '',
  };
}
