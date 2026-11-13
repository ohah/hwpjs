import type { HeadlessEditor } from '@hwpjs/core';
import { createChartDataPort } from './chart-data-port.ts';
import { createChartDataController } from './chart-data-controller.ts';
import { chartDataViewFactory } from './chart-data-view.ts';

export function createChartDataTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onPresentationChange?(): void;
  onClose(): void;
}) {
  return createChartDataController({
    ...options,
    port: createChartDataPort(options.editor),
    createView: chartDataViewFactory(options.root),
  });
}
