import { drawingPathPoints } from './drawing-path-points.mjs';

// Use the same logical path as Canvas clipping; the bounding box is not the fill.
export function drawingFillOccluder(item) {
  const source = item?.drawing?.source;
  if (source?.rendering_polygon !== undefined) {
    const points = drawingPathPoints(source, item.origin, 0);
    return points?.length >= 3
      ? { ...item.rectangle, paintPlan: { state: 'polygon', points } }
      : null;
  }
  return { ...item.rectangle, paintPlan: { state: 'plain' } };
}
