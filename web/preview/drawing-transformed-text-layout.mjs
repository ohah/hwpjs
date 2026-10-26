import { layoutDrawingText } from './drawing-text-layout.mjs';
import { drawingTextTransform } from './drawing-text-transform.mjs';

// 원본 사각형에서 조판하고 이미 합성된 꼭짓점 변환을 행에 연결합니다.
export function layoutTransformedDrawingText(
  drawing,
  paragraphs,
  declaration,
  origin,
  measure,
  options,
) {
  const geometry = drawingTextTransform(drawing?.source, origin);
  if (geometry.state !== 'mapped') return geometry;
  const { width, height, transform } = geometry;
  const result = layoutDrawingText(
    drawing,
    paragraphs,
    declaration,
    { x: 0, y: 0, width, height },
    measure,
    options,
  );
  if (result.state !== 'placed') return result;
  return {
    ...result,
    rows: result.rows.map((row) => ({ ...row, transform: [...transform] })),
    transform,
  };
}
