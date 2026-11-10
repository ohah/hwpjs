import {
  captureSurfaceFormatting,
  type FormattingPresentation,
} from './surface-formatting-capture.ts';
import type { SurfaceFormattingHost } from './surface-formatting-port.ts';
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
  getSurfaceFormattingHost?: () => SurfaceFormattingHost | undefined;
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
  let surfaceBindingFailed = false;
  let preparing = false;
  let rangeConsumed = false;
  let rangeCapture: ReturnType<typeof captureSurfaceFormatting> = null;
  const stale = () =>
    captured !== undefined &&
    (surfaceBindingFailed ||
      editor.getEditorState() !== captured ||
      (rangeCapture !== null && !rangeCapture.current()));
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
      reason: preparing ? 'FormattingPreparing' : (formatting?.textColorAvailableReason ?? null),
      draft,
      pending,
      reopenRequired: rangeConsumed && !pending,
      stale: stale(),
      error,
      canApply:
        !closed &&
        !pending &&
        !rangeConsumed &&
        !preparing &&
        !stale() &&
        (formatting?.target != null || rangeCapture !== null) &&
        formatting?.textColorAvailableReason === null &&
        valid() &&
        changed(),
    });
  };
  const close = (restore: boolean, settledState?: ReturnType<HeadlessEditor['getEditorState']>) => {
    const before = captured;
    const completedRange = settledState !== undefined ? rangeCapture : null;
    const hadRange = rangeCapture !== null;
    view?.dispose();
    view = undefined;
    captured = undefined;
    formatting = undefined;
    rangeCapture = null;
    surfaceBindingFailed = false;
    rangeConsumed = false;
    preparing = false;
    if (!closed) notify(options.onPresentationChange);
    const latest = editor.getEditorState();
    if (
      restore &&
      !closed &&
      view === undefined &&
      before &&
      latest.documentId === before.documentId &&
      latest.generation === before.generation &&
      (settledState !== undefined
        ? latest === settledState &&
          completedRange?.settledCurrent() === true &&
          editor.getEditorState() === settledState &&
          !closed &&
          view === undefined
        : latest.selection != null || (hadRange && latest === before))
    )
      notify(options.onClose);
  };
  const cancel = () => {
    if (closed || pending || view?.isComposing()) return;
    close(true);
  };
  const apply = async () => {
    if (closed || pending || preparing || rangeConsumed || !view || view.isComposing()) return;
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
    if (
      !formatting ||
      (!formatting.target && !rangeCapture) ||
      formatting.textColorAvailableReason !== null ||
      !changed()
    ) {
      refresh();
      return;
    }
    const initialRange = rangeCapture;
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
      if (
        editor.getEditorState() !== before ||
        (initialRange !== null && !initialRange.current())
      ) {
        error = 'StaleTextColorSelection';
        return;
      }
      if (initialRange) {
        if (initialRange.mode !== 'typing' && !initialRange.hasSettlement) {
          error = 'SurfaceSettlementUnavailable';
          return;
        }
        if (
          !(await initialRange.prepare({ kind: 'text-color', color })) ||
          !initialRange.current()
        ) {
          error = 'StaleTextColorSelection';
          return;
        }
        rangeConsumed = true;
        if (!initialRange.request({ kind: 'text-color', color })) {
          error = 'StaleTextColorSelection';
          return;
        }
        if (initialRange.mode === 'typing') {
          const focusState = editor.getEditorState();
          notify(() => options.onStatus('다음 입력에 사용할 글자색을 설정했습니다.'));
          if (!closed && captured === before) close(true, focusState);
          return;
        }
        const settled = await initialRange.settle();
        if (closed || captured !== before) return;
        const result = settled.result;
        const focusState = settled.current ? editor.getEditorState() : undefined;
        if (!result) {
          error = 'SurfaceFormattingSettlementUnknown';
          return;
        }
        notify(() => options.onResult?.(result));
        if (closed || captured !== before) return;
        if (result.error) {
          error = result.error;
          return;
        }
        if (
          (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') &&
          settled.current
        ) {
          notify(() => options.onStatus('글자색을 적용했습니다.'));
          if (!closed && captured === before) close(true, focusState);
        } else
          error =
            result.status === 'committed-refresh-required' ||
            result.status === 'committed-with-snapshot' ||
            result.status === 'known-no-op'
              ? '색은 반영됐지만 문서 상태를 다시 확인해야 합니다.'
              : '글자색을 적용하지 못했습니다.';
        return;
      }
      if (!target) {
        error = 'MissingSelection';
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
    presentation(shared?: FormattingPresentation) {
      const state = editor.getEditorState();
      const surface = shared
        ? shared.state === state && shared.capture?.current()
          ? shared.capture
          : null
        : options.getSurfaceFormattingHost && state.status === 'ready'
          ? captureSurfaceFormatting(
              editor,
              options.getSurfaceFormattingHost,
              state,
              getSelectionFormatting(state),
            )
          : null;
      return {
        'text-color': {
          enabled:
            !closed &&
            !pending &&
            state.status === 'ready' &&
            (!surface || surface.observation.textColorAvailableReason === null),
          reason: pending
            ? 'TextColorPending'
            : (surface?.observation.textColorAvailableReason ?? undefined),
          surfaceSelection:
            surface !== null && surface.observation.textColorAvailableReason === null,
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
      rangeCapture = captureSurfaceFormatting(
        editor,
        options.getSurfaceFormattingHost,
        captured,
        formatting,
      );
      if (rangeCapture) formatting = rangeCapture.observation;
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
      if (
        rangeCapture &&
        (!view.getDialogElement || !rangeCapture.bindDialog(view.getDialogElement()))
      ) {
        surfaceBindingFailed = true;
        error = 'StaleTextColorSelection';
      }
      if (rangeCapture && !surfaceBindingFailed) {
        const initial = rangeCapture,
          owner = captured;
        preparing = true;
        void initial
          .prepare()
          .then((ready) => {
            if (closed || rangeCapture !== initial || captured !== owner) return;
            if (!ready || !initial.current()) {
              surfaceBindingFailed = true;
              error = 'StaleTextColorSelection';
            } else formatting = initial.observation;
          })
          .catch((failure) => {
            if (!closed && rangeCapture === initial)
              error = failure instanceof Error ? failure.message : String(failure);
          })
          .finally(() => {
            if (!closed && rangeCapture === initial && captured === owner) {
              preparing = false;
              notify(refresh);
              if (!closed && rangeCapture === initial && captured === owner)
                notify(options.onPresentationChange);
            }
          });
      }
      refresh();
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
