import { canvasDocumentPoint } from './canvas-pointer-coordinates.mjs';
export function createChartCanvasControls({ canvas, viewport, renderer, ready, select }) {
  let closed = false;
  const pointer = (event) => {
    if (
      closed ||
      !ready() ||
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const point = canvasDocumentPoint(
      event,
      canvas.getBoundingClientRect(),
      viewport.scrollTop,
      renderer.viewScale(),
      viewport.scrollLeft ?? 0,
    );
    const chart = renderer.chartAtLogicalPoint(point.x, point.y);
    if (!chart || !select(chart)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerdown', pointer, { capture: true });
  return {
    close() {
      closed = true;
      canvas.removeEventListener('pointerdown', pointer, { capture: true });
    },
  };
}
