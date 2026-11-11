import * as core from '@hwpjs/core';
import type { HeadlessEditor } from '@hwpjs/core';
// @ts-ignore Browser samples are also packaged directly as static JavaScript.
import { mountApiPlayground } from './api-playground.mjs';

/** 문서 열기는 데모 셸이 소유하며, 이 예제에는 문서를 연 ready editor를 주입합니다. */
export function mountHeadlessPanel(
  root: HTMLElement,
  editor: HeadlessEditor,
  onStatus: (text: string) => void,
) {
  const panel = mountApiPlayground(root, {
    editor,
    spliceCommand: core.SPLICE_TEXT_COMMAND,
    getHistoryAvailability: core.getHistoryAvailability,
    createParagraphSelection: core.createParagraphSelection,
    planReplaceAll: core.planReplaceAll,
    replaceAllCommand: core.REPLACE_ALL_COMMAND,
    editParagraphBulletDefinitionCommand: core.EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
    listParagraphBulletDefinitions: (options: core.ParagraphBulletDefinitionsOptions) =>
      editor.listParagraphBulletDefinitions(options),
    operations: [
      'read',
      'getPageSettings',
      'listParagraphBulletDefinitions',
      'editParagraphBulletDefinition',
      'select',
      'splice',
      'getReplaceAllCapabilities',
      'planReplaceAll',
      'replaceAll',
      'undo',
      'redo',
      'save',
      'reopen',
    ],
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
