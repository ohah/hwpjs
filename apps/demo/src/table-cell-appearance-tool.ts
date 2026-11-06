import type { HeadlessEditor } from '@hwpjs/core';
import { createTableCellToolController } from './table-cell-tool-controller.ts';
import type { TableCellCore } from './table-cell-properties-port.ts';
import {
  createTableCellAppearancePort,
  tableCellAppearanceReason,
  type TableCellAppearancePort,
  type TableCellAppearanceCapture,
  type TableCellAppearanceDraft,
} from './table-cell-appearance-port.ts';
import { createTableCellAppearanceView } from './table-cell-appearance-view.ts';

export function createTableCellAppearanceController(options: {
  root: HTMLElement;
  port: TableCellAppearancePort;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
  createView?: typeof createTableCellAppearanceView;
}) {
  return createTableCellToolController<TableCellAppearanceCapture, TableCellAppearanceDraft>({
    ...options,
    createView: options.createView ?? createTableCellAppearanceView,
    reason: tableCellAppearanceReason,
    messages: {
      applied: '셀 테두리/배경을 적용했습니다.',
      refresh: '테두리/배경은 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.',
      failed: '셀 테두리/배경을 적용하지 못했습니다.',
      uncertain: '접수된 변경 결과가 불확실합니다. 문서를 확인하고 다시 적용하지 마세요.',
    },
  });
}
export function createTableCellAppearanceTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<TableCellCore>;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  return createTableCellAppearanceController({
    ...options,
    port: createTableCellAppearancePort(options.editor, options.core),
  });
}
