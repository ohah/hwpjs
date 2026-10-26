import { paragraphLineAdvance } from './paragraph-geometry.mjs';

// Inline ink and the font's spacing basis have independent ownership.
export function inlineObjectLineAdvance(
  shape,
  inkHeight,
  glyphHeight,
  minimum,
  { terminal = false } = {},
) {
  return shape?.spacingFormat === 'hwpx'
    ? Math.max(
        inkHeight,
        terminal ? glyphHeight : paragraphLineAdvance(shape, glyphHeight, minimum),
      )
    : terminal
      ? inkHeight
      : paragraphLineAdvance(shape, inkHeight, Math.max(inkHeight, minimum), {
          spacingBasisHeight: glyphHeight,
        });
}
