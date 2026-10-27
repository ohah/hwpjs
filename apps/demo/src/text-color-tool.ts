import {
  getSelectionFormatting,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  type HeadlessEditor,
  type CommandResult,
} from '@hwpjs/core';
// @ts-ignore 기존 색 인수 검증의 단일 출처를 재사용합니다.
import { characterColorArg } from '../../../js/character-color-args.mjs';
import { createTextColorView, type TextColorView } from './text-color-view.ts';

export interface TextColorToolOptions {
  root: HTMLElement;
  editor: Pick<
    HeadlessEditor,
    'getEditorState' | 'dispatchCommand' | 'update' | 'registerStateListener'
  >;
  onStatus(message: string): void;
  onClose(): void;
  onPresentationChange(): void;
  onResult?(result: CommandResult): void;
  onUIError?(error: unknown): void;
  createView?: typeof createTextColorView;
}
export function createTextColorTool(options: TextColorToolOptions) {
  const { editor } = options;
  let closed = false,
    pending = false,
    view: TextColorView | undefined,
    captured: ReturnType<HeadlessEditor['getEditorState']> | undefined,
    formatting: ReturnType<typeof getSelectionFormatting> | undefined,
    draft = '',
    error: string | null = null;
  const notify = (fn: () => void) => {
    try {
      fn();
    } catch (failure) {
      try {
        options.onUIError?.(failure);
      } catch {
        /* 표시 오류를 편집 재시도로 바꾸지 않는다. */
      }
    }
  };
  const stale = () => captured !== undefined && editor.getEditorState() !== captured;
  const valid = () => {
    try {
      characterColorArg(draft);
      return true;
    } catch {
      return false;
    }
  };
  const changed = () => formatting?.textColor !== draft.toLowerCase();
  const refresh = () => {
    view?.update({
      value: formatting?.textColor ?? null,
      reason: formatting?.textColorAvailableReason ?? null,
      draft,
      pending,
      stale: stale(),
      error,
      canApply:
        !closed &&
        !pending &&
        !stale() &&
        formatting?.target != null &&
        formatting.textColorAvailableReason === null &&
        valid() &&
        changed(),
    });
  };
  const close = (restore: boolean) => {
    const before = captured;
    view?.dispose();
    view = undefined;
    captured = undefined;
    formatting = undefined;
    if (!closed) notify(options.onPresentationChange);
    const latest = editor.getEditorState();
    if (
      restore &&
      before &&
      latest.documentId === before.documentId &&
      latest.generation === before.generation &&
      latest.selection != null
    )
      notify(options.onClose);
  };
  const cancel = () => {
    if (closed || pending || view?.isComposing()) return;
    close(true);
  };
  const apply = async () => {
    if (closed || pending || !view || view.isComposing()) return;
    if (stale()) {
      error = 'StaleTextColorSelection';
      refresh();
      return;
    }
    try {
      characterColorArg(draft);
    } catch {
      error = 'InvalidCharacterColor';
      refresh();
      return;
    }
    if (!formatting?.target || formatting.textColorAvailableReason !== null || !changed()) {
      refresh();
      return;
    }
    const target = formatting.target,
      before = captured,
      color = draft.toLowerCase();
    pending = true;
    error = null;
    refresh();
    notify(options.onPresentationChange);
    try {
      await editor.update(() => {});
      if (closed) return;
      if (editor.getEditorState() !== before) {
        error = 'StaleTextColorSelection';
        return;
      }
      const result = await editor.dispatchCommand(SET_CHARACTER_TEXT_COLOR_COMMAND, {
        target,
        color,
      });
      if (closed) return;
      notify(() => options.onResult?.(result));
      if (result.error) {
        error = result.error;
        return;
      }
      if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
        notify(() => options.onStatus('글자색을 적용했습니다.'));
        close(true);
      } else if (result.status === 'committed-refresh-required') {
        error = '색은 반영됐지만 문서 상태를 다시 확인해야 합니다.';
      } else error = '글자색을 적용하지 못했습니다.';
    } catch (failure) {
      if (!closed) error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      pending = false;
      if (!closed) {
        refresh();
        notify(options.onPresentationChange);
      }
    }
  };
  const unsubscribe = editor.registerStateListener(() => {
    if (!closed) refresh();
  });
  return {
    presentation() {
      return {
        'text-color': {
          enabled: !closed && !pending && editor.getEditorState().status === 'ready',
          reason: pending ? 'TextColorPending' : undefined,
        },
      };
    },
    action(command: string) {
      if (command !== 'text-color') return false;
      if (closed || pending || editor.getEditorState().status !== 'ready') return true;
      if (view) {
        view.show();
        return true;
      }
      captured = editor.getEditorState();
      formatting = getSelectionFormatting(captured);
      draft =
        typeof formatting.textColor === 'string' && formatting.textColor !== 'mixed'
          ? formatting.textColor
          : '';
      error = null;
      view = (options.createView ?? createTextColorView)(options.root, {
        onInput(value) {
          draft = value;
          error = value && !valid() ? 'InvalidCharacterColor' : null;
          refresh();
        },
        onApply: () => {
          void apply();
        },
        onCancel: cancel,
      });
      refresh();
      view.show();
      notify(options.onPresentationChange);
      return true;
    },
    dispose() {
      if (closed) return;
      closed = true;
      unsubscribe();
      close(false);
    },
  };
}
