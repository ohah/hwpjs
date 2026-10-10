import { drawingQuadGeometry } from "./drawing-quad-geometry.mjs";
import { layoutDrawingText } from "./drawing-text-layout.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// 원본 사각형에서 조판하고 이미 합성된 꼭짓점 변환을 행에 연결합니다.
export function layoutTransformedDrawingText(drawing, paragraphs, declaration, origin, measure, options) {
  const unavailable = error => ({ state: "unavailable", error });
  const source = drawing?.source, points = source?.rectangle?.points;
  if (!Array.isArray(points) || points.length !== 4 || !Array.from(points).every(p => Array.isArray(p) && p.length === 2 && Array.from(p).every(Number.isFinite))) return unavailable("MissingDrawingLocalRectangle");
  const [a, b, c, d] = points;
  if (a[0] !== 0 || a[1] !== 0 || b[1] !== 0 || d[0] !== 0 || b[0] !== c[0] || c[1] !== d[1] || b[0] <= 0 || d[1] <= 0) return unavailable("UnsupportedDrawingLocalRectangle");
  if (source.rendering?.reverse !== null || !Array.isArray(source.rendering?.flip) || source.rendering.flip.length !== 2 || !Array.from(source.rendering.flip).every(v => v === false)) return unavailable("UnsupportedDrawingTextFlip");
  const geometry = drawingQuadGeometry(source, origin);
  if (geometry.state !== "mapped") return unavailable(geometry.state);
  const width = hwpUnitPixels(b[0]), height = hwpUnitPixels(d[1]);
  const result = layoutDrawingText(drawing, paragraphs, declaration, { x: 0, y: 0, width, height }, measure, options);
  if (result.state !== "placed") return result;
  const [ma, mb, mc, md, me, mf] = geometry.matrix;
  const transform = [ma / width, mb / width, mc / height, md / height, me, mf];
  if (!transform.every(Number.isFinite)) return unavailable("InvalidDrawingTextTransform");
  return { ...result, rows: result.rows.map(row => ({ ...row, transform: [...transform] })), transform };
}
