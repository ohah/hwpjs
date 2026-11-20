import { renderHwp5ChartCreatePreview } from '../../../web/preview/hwp5-chart-create-preview.mjs';

/** Real browser Canvas host. UI preview PNGs are never final create inputs;
 * the SDK may reuse createCanvas to perform its own fresh final repaint. */
export function createHwp5ChartCanvasProvider(document) {
  if (!document || typeof document.createElement !== 'function')
    throw Error('ChartCreatePreviewRendererUnavailable');
  const createCanvas = () => {
    const canvas = document.createElement('canvas');
    const Canvas = document.defaultView?.HTMLCanvasElement;
    if (!Canvas || !(canvas instanceof Canvas) || canvas.ownerDocument !== document)
      throw Error('ChartCreatePreviewRendererUnavailable');
    return canvas;
  };
  return Object.freeze({
    createCanvas,
    render(wire, pixels, current) {
      return renderHwp5ChartCreatePreview(wire, pixels, { current, createCanvas });
    },
  });
}
