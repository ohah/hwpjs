import { paragraphLineGeometry, paragraphMarginPixels } from "./paragraph-geometry.mjs";
/** Same unaligned column frame as ordinary paragraph wrapping. */
export function tabLineContext(paragraph, width, size, startUnit, { endUnit = paragraph.text.length, naturalX } = {}) {
  const frame = paragraphLineGeometry({ ...paragraph.paragraphShape, alignment: 0 }, width, 0, startUnit === 0);
  return { x: naturalX ?? frame.x + size, rightEdge: frame.x + frame.width,
    autoLeftPosition: paragraphMarginPixels(paragraph.paragraphShape?.left), endUnit };
}
