import { createCommand } from './commands.ts';
import {
  captureInlineObjectCreateTarget,
  admitInlineObjectCreateTarget,
  type InlineObjectCreateTarget,
} from './inline-object-owner.ts';
import type { EditorState } from '../state/editor-state.ts';
import { inlineInsertRecord } from '../../../../js/hwpx-inline-object-record.mjs';
import { checkedNoteInsertOptions } from '../../../../js/hwpx-note-create.mjs';
import type { NoteInsertOptions, NoteKind, NoteInsertMessage } from './note-insert-dto.ts';
export type {
  NoteInsertOptions,
  NoteFormat,
  NotePolicyShape,
  NoteKind,
} from './note-insert-dto.ts';
export interface InsertNotePayload {
  readonly target: InlineObjectCreateTarget;
  readonly selectionVersion: number;
  readonly options: NoteInsertOptions;
}
export const INSERT_FOOTNOTE_COMMAND = createCommand<InsertNotePayload>('insert-footnote');
export const INSERT_ENDNOTE_COMMAND = createCommand<InsertNotePayload>('insert-endnote');
export function captureNoteInsertPayload(input: unknown): InsertNotePayload {
  const p = inlineInsertRecord(input, ['target', 'selectionVersion', 'options']);
  if (
    typeof p.selectionVersion !== 'number' ||
    !Number.isSafeInteger(p.selectionVersion) ||
    p.selectionVersion < 0
  )
    throw Error('InvalidNoteSelectionVersion');
  return {
    target: captureInlineObjectCreateTarget(p.target),
    selectionVersion: p.selectionVersion,
    options: checkedNoteInsertOptions(p.options),
  };
}
export function getNoteInsertAvailability(state: EditorState): {
  enabled: boolean;
  reason?: string;
} {
  const c = state.content as any;
  if (state.status !== 'ready') return { enabled: false, reason: 'EditorNotReady' };
  if (state.historyRecoveryRequired) return { enabled: false, reason: 'HistoryRecoveryRequired' };
  if (c?.readOnly || (state.capabilities as any)?.readOnly)
    return { enabled: false, reason: 'ReadOnlyDocument' };
  if (
    c?.format !== 'hwpx' ||
    c?.noteCreationAvailable !== true ||
    c?.inlineObjectPlacementVersion !== 1
  )
    return { enabled: false, reason: 'NoteCreationUnavailable' };
  if (c?.limited || c?.window) return { enabled: false, reason: 'NoteRequiresFullDocument' };
  if (
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    !Number.isSafeInteger(state.nativeHistoryRevision)
  )
    return { enabled: false, reason: 'HistoryV2Required' };
  return { enabled: true };
}
export function noteInsertMessage(
  p: InsertNotePayload,
  state: EditorState,
  kind: NoteKind,
): NoteInsertMessage {
  const available = getNoteInsertAvailability(state);
  if (!available.enabled) throw Error(available.reason);
  const target = admitInlineObjectCreateTarget(state, p.target, p.selectionVersion);
  return {
    kind: kind === 'foot' ? 'insert-footnote' : 'insert-endnote',
    request: { target, kind, ...checkedNoteInsertOptions(p.options) },
  };
}
