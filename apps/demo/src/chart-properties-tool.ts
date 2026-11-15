import type { HeadlessEditor } from '@hwpjs/core';
import {
  createChartPropertiesPort,
  type ChartDataEditAvailability,
  type ChartPropertiesTarget,
} from './chart-properties-port.ts';
import { createChartPropertiesController } from './chart-properties-controller.ts';
import { chartPropertiesViewFactory } from './chart-properties-view.ts';

export function createChartPropertiesTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onClose(): void;
  onEditData(target: ChartPropertiesTarget): void;
  getDataEditAvailability?(): ChartDataEditAvailability;
}): { open(target: ChartPropertiesTarget): void; dispose(): void } {
  return createChartPropertiesController({
    ...options,
    port: createChartPropertiesPort(options.editor),
    createView: chartPropertiesViewFactory(options.root),
  });
}
