import type { Hwp5ChartCreateProfile } from '../../../packages/core/src/commands/hwp5-chart-create-dto.ts';
import type { ChartRasterPayload, ChartRasterPixels } from './hwp5-chart-create-input-lane.ts';
export interface Hwp5ChartCanvasProvider {
  createCanvas(): HTMLCanvasElement;
  render(
    wire: Uint8Array,
    pixels: ChartRasterPixels,
    current: () => boolean,
    profile?: Hwp5ChartCreateProfile,
  ): Promise<ChartRasterPayload>;
}
export function createHwp5ChartCanvasProvider(
  document: Document,
): Readonly<Hwp5ChartCanvasProvider>;
