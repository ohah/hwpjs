import type { HeadlessEditor } from '@hwpjs/core';
import type { TableCellCore } from './table-cell-properties-port.ts';
import { createTableCellToolController } from './table-cell-tool-controller.ts';
import {
  createTableCellBorderPort,
  tableCellBorderReason,
  type TableCellBorderPort,
  type TableCellBorderCapture,
  type TableCellBorderDraft,
} from './table-cell-border-port.ts';
import { createTableCellBorderView } from './table-cell-border-view.ts';
export function createTableCellBorderController(options: {
  root: HTMLElement;
  port: TableCellBorderPort;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
  createView?: typeof createTableCellBorderView;
}) {
  return createTableCellToolController<TableCellBorderCapture, TableCellBorderDraft>({
    ...options,
    createView: options.createView ?? createTableCellBorderView,
    reason: tableCellBorderReason,
    messages: {
      applied: '셀 테두리를 적용했습니다.',
      refresh: '테두리는 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.',
      failed: '셀 테두리를 적용하지 못했습니다.',
      uncertain: '접수된 셀 테두리 변경 결과가 불확실합니다. 문서를 확인하고 다시 적용하지 마세요.',
    },
  });
}
export function createTableCellBorderTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<TableCellCore>;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  return createTableCellBorderController({
    ...options,
    port: createTableCellBorderPort(options.editor, options.core),
  });
}
