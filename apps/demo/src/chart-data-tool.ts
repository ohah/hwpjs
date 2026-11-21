import { createHwp5ChartDataTool } from './hwp5-chart-data-tool.ts';
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
  const hwpx = createChartDataController({
    ...options,
    port: createChartDataPort(options.editor),
    createView: chartDataViewFactory(options.root),
  });
  const hwp5 = createHwp5ChartDataTool(options);
  const isHwp5 = () =>
    (options.editor.getEditorState().content as { format?: string } | undefined)?.format === 'hwp5';
  return {
    presentation: () => (isHwp5() ? hwp5.presentation() : hwpx.presentation()),
    canEditHwp5: (target: { section: number; controlNode: number }) => hwp5.canEdit(target),
    open(target?: { section: number; wrapper: number } | { section: number; controlNode: number }) {
      if (isHwp5()) {
        if (target && !('controlNode' in target)) {
          options.onStatus('선택한 차트가 바뀌었습니다. 다시 선택하세요.');
          return;
        }
        void hwp5.open(target);
        return;
      }
      if (target && !('wrapper' in target)) {
        options.onStatus('선택한 차트가 바뀌었습니다. 다시 선택하세요.');
        return;
      }
      hwpx.open(target);
    },
    dispose() {
      hwpx.dispose();
      hwp5.dispose();
    },
  };
}
