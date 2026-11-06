import { createTableCellToolController } from './table-cell-tool-controller.ts';
import type { HeadlessEditor } from '@hwpjs/core';
import type { TableCellCore } from './table-cell-properties-port.ts';
import {
  createTableCellBackgroundPort,
  tableCellBackgroundReason,
  type TableCellBackgroundPort,
  type TableCellBackgroundCapture,
  type TableCellBackgroundDraft,
} from './table-cell-background-port.ts';
import { createTableCellBackgroundView } from './table-cell-background-view.ts';

export function createTableCellBackgroundController(options: {
  root: HTMLElement;
  port: TableCellBackgroundPort;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
  createView?: typeof createTableCellBackgroundView;
}) {
  return createTableCellToolController<TableCellBackgroundCapture, TableCellBackgroundDraft>({
    ...options,
    createView: options.createView ?? createTableCellBackgroundView,
    reason: tableCellBackgroundReason,
    messages: {
      applied: '셀 배경을 적용했습니다.',
      refresh: '배경은 반영됐지만 표시 확인이 필요합니다. 다시 적용하지 마세요.',
      failed: '셀 배경을 적용하지 못했습니다.',
      uncertain: '접수된 셀 배경 변경 결과가 불확실합니다. 문서를 확인하고 다시 적용하지 마세요.',
    },
  });
}
export function createTableCellBackgroundTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: Partial<TableCellCore>;
  onStatus: (value: string) => void;
  onClose: () => void;
  onPresentationChange?: () => void;
}) {
  return createTableCellBackgroundController({
    ...options,
    port: createTableCellBackgroundPort(options.editor, options.core),
  });
}
