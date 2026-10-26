// A display-only copy shared by existing and pending native HWP5 paragraphs.
export function hwp5ParagraphGeometry(shape) {
  return shape ? { ...shape, spacingFormat: 'hwp5' } : shape;
}
