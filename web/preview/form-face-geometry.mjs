// Existing Canvas face dimensions shared with AutoSize; not Hancom padding constants.
export const FORM_TEXT_LEFT = 3;
export const FORM_TEXT_CLIP = 2;
export const FORM_TEXT_WRAP_SIDES = 6;
export const FORM_COMBO_TEXT_CUT = 18;
export const FORM_CHOICE_SIZE = 16;
export const FORM_CHOICE_GAP = 4;

// Wrap from the actual text origin to the existing right clip boundary.
// Keep the ordinary field's minimum wrap inset for the default origin.
export function formTextWrapWidth(width, kind, textOffset = FORM_TEXT_LEFT) {
  const inset =
    kind === 'combo_box'
      ? textOffset + FORM_COMBO_TEXT_CUT - FORM_TEXT_CLIP
      : Math.max(FORM_TEXT_WRAP_SIDES, textOffset + FORM_TEXT_CLIP);
  return Math.max(0, width - inset);
}
