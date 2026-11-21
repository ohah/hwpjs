import { createCommand, type SelectionTarget } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { currentInlineObjectInsertCaret } from './inline-object-insert.ts';
import {
  captureInlineObjectCreateTarget,
  admitInlineObjectCreateTarget,
  type InlineObjectCreateTarget,
} from './inline-object-owner.ts';
import { selectionMessage } from './selection.ts';
import { checkedImageInsertOptions } from '../../../../js/live-image-insertion.mjs';
import { inlineInsertRecord } from '../../../../js/hwpx-inline-object-record.mjs';
export interface ImageInsertOptions {
  readonly imageBytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}
export interface InsertImagePayload {
  readonly target: SelectionTarget | InlineObjectCreateTarget;
  readonly selectionVersion: number;
  readonly options: ImageInsertOptions;
}
export const INSERT_IMAGE_COMMAND = createCommand<InsertImagePayload>('insert-image');
export function captureImageInsertPayload(input: unknown): InsertImagePayload {
  const p = inlineInsertRecord(input, ['target', 'selectionVersion', 'options']);
  if (
    typeof p.selectionVersion !== 'number' ||
    !Number.isSafeInteger(p.selectionVersion) ||
    p.selectionVersion < 0
  )
    throw Error('InvalidImageSelectionVersion');
  const target =
    Object.getOwnPropertyDescriptor(p.target ?? {}, 'coordinateSpace')?.value === 'inline-object'
      ? captureInlineObjectCreateTarget(p.target)
      : inlineInsertRecord(p.target, [
          'editorId',
          'documentId',
          'generation',
          'operationRevision',
          'viewRevision',
          'coordinateSpace',
          'format',
          'owner',
          'section',
          'paragraph',
          'startUnit',
          'endUnit',
          'affinity',
        ]);
  return {
    target: target as SelectionTarget | InlineObjectCreateTarget,
    selectionVersion: p.selectionVersion,
    options: checkedImageInsertOptions(p.options) as ImageInsertOptions,
  };
}
export function imageInsertMessage(payload: InsertImagePayload, state: EditorState) {
  inlineInsertRecord(payload, ['target', 'selectionVersion', 'options']);
  const content = state.content as Record<string, unknown> | undefined;
  if (state.status !== 'ready') throw Error('EditorNotReady');
  if (state.historyRecoveryRequired) throw Error('HistoryRecoveryRequired');
  if (content?.readOnly || (state.capabilities as { readOnly?: boolean })?.readOnly)
    throw Error('ReadOnlyDocument');
  if (content?.limited || content?.window) throw Error('ImageInsertionRequiresFullDocument');
  if (
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    !Number.isSafeInteger(state.nativeHistoryRevision) ||
    state.nativeHistoryRevision! < 0 ||
    state.nativeHistoryRevision! >= 0xffffffff
  )
    throw Error('HistoryV2Required');
  if (content?.imageInsertionAvailable !== true) throw Error('ImageInsertionUnavailable');
  const t = payload.target;
  const options = checkedImageInsertOptions(payload.options) as ImageInsertOptions;
  if (t.coordinateSpace === 'inline-object') {
    if (t.format !== 'hwpx') throw Error('UnsupportedPictureInsertionHost');
    const target = admitInlineObjectCreateTarget(state, t, payload.selectionVersion);
    if (target.owner?.kind !== 'body') throw Error('UnsupportedPictureInsertionHost');
    return { kind: 'insert-image' as const, request: { target, ...options } };
  }
  currentInlineObjectInsertCaret(state, t, payload.selectionVersion);
  // HWPX requires Native-issued owner proof; no guessed physical paragraph.
  if (t.format !== 'hwp5') throw Error('ImageInsertionOwnerRequired');
  const mapped = selectionMessage(t, state);
  if (!mapped.reference) throw Error('InvalidCurrentImageReference');
  return {
    kind: 'insert-image' as const,
    request: { reference: mapped.reference, start: mapped.startUnit, ...options },
  };
}
