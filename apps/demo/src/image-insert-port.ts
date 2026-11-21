import type {
  HeadlessEditor,
  EditorState,
  EditorCommand,
  SelectionTarget,
  CommandResult,
} from '@hwpjs/core';
import { validateCurrentCaret } from '../../../packages/core/src/commands/current-caret.ts';
import {
  captureInlineObjectCreateTarget,
  admitInlineObjectCreateTarget,
  type InlineObjectCreateTarget,
} from '../../../packages/core/src/commands/inline-object-owner.ts';
import type { InlineObjectCaretCapture } from './inline-object-insert-port.ts';
import {
  checkedInsertImageBytes,
  checkedInsertImageSize,
  imageInsertError,
} from './image-insert-input.ts';
export interface DemoImageInsertPayload {
  readonly target: SelectionTarget | InlineObjectCreateTarget;
  readonly selectionVersion: number;
  readonly options: {
    readonly imageBytes: Uint8Array;
    readonly width: number;
    readonly height: number;
  };
}
export interface ImageInsertCore {
  INSERT_IMAGE_COMMAND?: EditorCommand<DemoImageInsertPayload>;
}
type Editor = Pick<
  HeadlessEditor,
  'getEditorState' | 'dispatchCommand' | 'registerStateListener' | 'getInlineObjectInsertTarget'
>;
export interface ImageInsertCapture {
  readonly state: EditorState;
  readonly target: SelectionTarget | InlineObjectCreateTarget;
  readonly caret: InlineObjectCaretCapture;
}
export function createImageInsertPort(
  editor: Editor,
  core: ImageInsertCore,
  captureCaret: () => InlineObjectCaretCapture | null,
) {
  let busy = false;
  const captures = new WeakSet<ImageInsertCapture>();
  function admission(state: EditorState) {
    const content = state.content as Record<string, unknown> | undefined;
    if (state.status !== 'ready') throw Error('EditorNotReady');
    if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
    if (content?.readOnly || (state.capabilities as any)?.readOnly) throw Error('ReadOnlyDocument');
    if (content?.limited || content?.window) throw Error('ImageInsertionRequiresFullDocument');
    if (
      state.nativeHistoryStats?.protocolVersion !== 2 ||
      !Number.isSafeInteger(state.nativeHistoryRevision) ||
      state.nativeHistoryRevision! < 0 ||
      state.nativeHistoryRevision! >= 0xffffffff
    )
      throw Error('HistoryV2Required');
    if (!core.INSERT_IMAGE_COMMAND || content?.imageInsertionAvailable !== true)
      throw Error('ImageInsertionUnavailable');
    if (!['hwp5', 'hwpx'].includes(String(content.format)))
      throw Error('UnsupportedPictureInsertionHost');
    return content;
  }
  function presentation() {
    try {
      if (busy) return { enabled: false, reason: '그림을 삽입하고 있습니다.' };
      const state = editor.getEditorState(),
        content = admission(state),
        caret = captureCaret();
      if (!caret || caret.state !== state || !caret.current() || editor.getEditorState() !== state)
        throw Error('CompositionBlocked');
      if (content.format === 'hwp5') {
        const target = state.selection as SelectionTarget;
        validateCurrentCaret(state, target, state.stateVersion);
        if (target.owner !== `section:${target.section}:body`)
          throw Error('UnsupportedPictureInsertionHost');
      } else if (
        content.inlineObjectPlacementVersion !== 1 ||
        typeof editor.getInlineObjectInsertTarget !== 'function'
      )
        throw Error('ImageInsertionUnavailable');
      return { enabled: true, surfaceSelection: true };
    } catch (error) {
      return { enabled: false, reason: imageInsertError(error) };
    }
  }
  const current = (capture: ImageInsertCapture) => {
    try {
      if (
        !captures.has(capture) ||
        editor.getEditorState() !== capture.state ||
        !capture.caret.current()
      )
        return false;
      admission(capture.state);
      return editor.getEditorState() === capture.state;
    } catch {
      return false;
    }
  };
  return {
    presentation,
    subscribe: (listener: () => void) => editor.registerStateListener(listener),
    current,
    async capture(): Promise<ImageInsertCapture> {
      if (busy) throw Error('StaleImageInsert');
      const state = editor.getEditorState(),
        content = admission(state),
        caret = captureCaret();
      if (!caret || caret.state !== state || !caret.current()) throw Error('CompositionBlocked');
      let target: SelectionTarget | InlineObjectCreateTarget;
      if (content.format === 'hwpx') {
        if (
          content.inlineObjectPlacementVersion !== 1 ||
          typeof editor.getInlineObjectInsertTarget !== 'function'
        )
          throw Error('ImageInsertionUnavailable');
        target = captureInlineObjectCreateTarget(
          await editor.getInlineObjectInsertTarget(caret.selector, caret.unit, {
            affinity: caret.affinity ?? 'forward',
          }),
        );
        if (target.address.owner?.kind !== 'body') throw Error('UnsupportedPictureInsertionHost');
        if (
          target.address.expected_text !== caret.expected_text ||
          target.address.unit !== caret.unit ||
          (target.address.affinity ?? 'forward') !== (caret.affinity ?? 'forward')
        )
          throw Error('StaleImageInsert');
        admitInlineObjectCreateTarget(state, target, state.stateVersion);
      } else {
        target = state.selection as SelectionTarget;
        validateCurrentCaret(state, target, state.stateVersion);
        if (target.owner !== `section:${target.section}:body`)
          throw Error('UnsupportedPictureInsertionHost');
      }
      if (
        editor.getEditorState() !== state ||
        !caret.current() ||
        editor.getEditorState() !== state
      )
        throw Error('StaleImageInsert');
      const capture = Object.freeze({ state, target, caret });
      captures.add(capture);
      return capture;
    },
    async insert(
      capture: ImageInsertCapture,
      options: DemoImageInsertPayload['options'],
    ): Promise<CommandResult> {
      if (busy || !current(capture)) throw Error('StaleImageInsert');
      const size = checkedInsertImageSize(options),
        imageBytes = checkedInsertImageBytes(options.imageBytes);
      if (!current(capture)) throw Error('StaleImageInsert');
      captures.delete(capture);
      busy = true;
      try {
        return await editor.dispatchCommand(core.INSERT_IMAGE_COMMAND!, {
          target: capture.target,
          selectionVersion: capture.state.stateVersion,
          options: { ...size, imageBytes },
        });
      } finally {
        busy = false;
      }
    },
  };
}
