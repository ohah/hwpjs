import type { ChartRasterPayload, ChartRasterPixels } from './hwp5-chart-create-input-lane.ts';
export interface Hwp5ChartCanvasProvider {
  createCanvas(): HTMLCanvasElement;
  render(
    wire: Uint8Array,
    pixels: ChartRasterPixels,
    current: () => boolean,
  ): Promise<ChartRasterPayload>;
}
export function createHwp5ChartCanvasProvider(
  document: Document,
): Readonly<Hwp5ChartCanvasProvider>;
