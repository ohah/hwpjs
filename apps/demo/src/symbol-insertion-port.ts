import { SPLICE_TEXT_COMMAND, type HeadlessEditor, type SelectionTarget } from '@hwpjs/core';
import type { SymbolInsertionPort } from './symbol-dialog-controller.ts';
import { replacementCaret } from './replacement-selection.ts';

/** 호스트 연결 제안이다. 큐·대상 발급·이력은 기존 core 계약만 사용한다. */
export function createSymbolInsertionPort(editor: HeadlessEditor): SymbolInsertionPort {
  return {
    capture() {
      const state = editor.getEditorState();
      const content = state.content as { readOnly?: boolean } | undefined;
      return {
        state,
        target: state.selection as SelectionTarget | null,
        reason:
          state.status !== 'ready'
            ? '문서를 먼저 열어주세요.'
            : content?.readOnly
              ? '읽기 전용 문서입니다.'
              : !state.selection
                ? '문서에서 넣을 위치를 선택하세요.'
                : null,
      };
    },
    subscribe: (listener) => editor.registerStateListener(listener),
    async insert(captured, text) {
      if (!captured.target) throw Error('MissingSelection');
      const update = await editor.update((collector) => {
        collector.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target: captured.target!,
          text,
          selectionVersion: captured.state.stateVersion,
        });
      });
      const result = update.results[0];
      if (!result || update.results.length !== 1) throw Error('UnexpectedSymbolCommandResult');
      const latest = editor.getEditorState();
      if (result.status === 'committed-with-snapshot' && latest === result.state) {
        const caret = replacementCaret(captured.state, latest, captured.target, text);
        if (!caret) return { ...result, caretRestored: false };
        try {
          await editor.setSelection(caret, { stateVersion: latest.stateVersion });
          return { ...result, caretRestored: true };
        } catch (error) {
          // 삽입 commit은 유지하며 후속 선택 관측의 실패만 별도로 알린다.
          return {
            ...result,
            caretRestored: false,
            caretError: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return result.status === 'committed-with-snapshot'
        ? { ...result, caretRestored: false }
        : result;
    },
  };
}
