import {
  SPLICE_TEXT_COMMAND,
  getHistoryAvailability,
  findTextMatch,
  type HeadlessEditor,
} from '@hwpjs/core';
// @ts-ignore Browser samples are also packaged directly as static JavaScript.
import { mountApiPlayground } from './api-playground.mjs';

/** The demo shell owns file loading; these samples use its actual editor instance. */
export function mountHeadlessPanel(
  root: HTMLElement,
  editor: HeadlessEditor,
  onStatus: (text: string) => void,
) {
  const panel = mountApiPlayground(root, {
    editor,
    spliceCommand: SPLICE_TEXT_COMMAND,
    getHistoryAvailability,
    findTextMatch,
    operations: ['read', 'select', 'splice', 'undo', 'redo', 'save', 'reopen'],
  });
  onStatus(
    '실제 Headless API 함수를 선택해 실행하세요. 문서 열기는 위 파일·예제 메뉴를 사용합니다.',
  );
  return {
    dispose() {
      panel.dispose();
    },
  };
}
