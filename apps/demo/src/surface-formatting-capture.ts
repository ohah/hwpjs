import { getSelectionFormatting } from '@hwpjs/core';
import type { HeadlessEditor, SelectionFormatting } from '@hwpjs/core';
import type { SurfaceFormattingHost, SurfaceFormattingIntent } from './surface-formatting-port.ts';

/** UI가 소유 범위 캡처를 소비할 뿐 Core target/Native 권한을 만들지 않는다. */
export function captureSurfaceFormatting(
  editor: Pick<HeadlessEditor, 'getEditorState'>,
  getHost: (() => SurfaceFormattingHost | undefined) | undefined,
  state: ReturnType<HeadlessEditor['getEditorState']>,
  core: SelectionFormatting,
) {
  if (
    !getHost ||
    state.status !== 'ready' ||
    state.selection != null ||
    core.target !== null ||
    core.characterAvailableReason !== 'MissingSelection'
  )
    return null;
  try {
    const host = getHost();
    const capture = host?.captureSelectionFormatting?.();
    if (!capture || capture.state !== state) return null;
    const currentCall = capture.current.bind(capture);
    const requestCall = capture.request.bind(capture);
    const bindDialogCall = capture.bindDialog?.bind(capture);
    const settledCurrentCall = capture.settledCurrent?.bind(capture);
    const settleCall = capture.settle?.bind(capture);
    const prepareCall = capture.prepare?.bind(capture);
    let reasons = capture.reasons;
    let observation = { ...core, ...capture.observation, ...reasons, target: null };
    if (observation.strike === null && observation.strikeAvailableReason === null)
      observation.strikeAvailableReason = 'UnknownCharacterFormatting';
    const current = () => {
      try {
        return (
          getHost() === host &&
          editor.getEditorState() === state &&
          currentCall() === true &&
          getHost() === host &&
          editor.getEditorState() === state
        );
      } catch {
        return false;
      }
    };
    if (!current()) return null;
    let used = false;
    return Object.freeze({
      get observation() {
        return observation;
      },
      get fontNamesAvailableReason() {
        return (
          reasons.fontNamesAvailableReason ??
          (reasons.fontNamesAvailableReason === null ? null : 'AtomicFontNamesUnavailable')
        );
      },
      current,
      async prepare(intent?: SurfaceFormattingIntent): Promise<boolean> {
        if (used || !current()) return false;
        const ready = prepareCall ? await prepareCall(intent) : current();
        if (!ready || !current()) return false;
        const nextReasons = capture.reasons;
        const next = { ...core, ...capture.observation, ...nextReasons, target: null };
        if (!current()) return false;
        if (next.strike === null && next.strikeAvailableReason === null)
          next.strikeAvailableReason = 'UnknownCharacterFormatting';
        reasons = nextReasons;
        observation = next;
        return true;
      },
      settledCurrent() {
        try {
          return (
            used && getHost() === host && settledCurrentCall?.() === true && getHost() === host
          );
        } catch {
          return false;
        }
      },
      hasSettlement: typeof settleCall === 'function',
      async settle() {
        if (!used || !settleCall) return { result: null, current: false };
        return await settleCall();
      },
      bindDialog(element: HTMLDialogElement): boolean {
        try {
          return (
            !used &&
            getHost() === host &&
            editor.getEditorState() === state &&
            typeof bindDialogCall === 'function' &&
            bindDialogCall(element) === true &&
            current()
          );
        } catch {
          return false;
        }
      },
      request(intent: SurfaceFormattingIntent): boolean {
        if (used) return false;
        used = true;
        return current() && requestCall(intent) === true;
      },
    });
  } catch {
    return null;
  }
}

/** 한 번의 controller 표시 호출에서만 공유한다. action/open 권한 캡처로 보관하지 않는다. */
export function captureFormattingPresentation(
  editor: Pick<HeadlessEditor, 'getEditorState'>,
  getHost?: () => SurfaceFormattingHost | undefined,
) {
  const state = editor.getEditorState();
  const formatting = getSelectionFormatting(state);
  const capture = captureSurfaceFormatting(editor, getHost, state, formatting);
  return { state, formatting, capture };
}
export type FormattingPresentation = ReturnType<typeof captureFormattingPresentation>;
