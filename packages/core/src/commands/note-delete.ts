import { createCommand } from './commands.ts';
import {
  captureInlineObjectCreateTarget,
  admitInlineObjectCreateTarget,
  type InlineObjectCreateTarget,
} from './inline-object-owner.ts';
import { inlineInsertRecord } from '../../../../js/hwpx-inline-object-record.mjs';
import { checkedNoteDeleteRequest } from '../../../../js/hwpx-note-delete.mjs';
import type { EditorState } from '../state/editor-state.ts';
import type { NoteDeleteMessage } from './note-delete-dto.ts';
export interface DeleteNotePayload {
  readonly target: InlineObjectCreateTarget;
  readonly selectionVersion: number;
}
export const DELETE_NOTE_COMMAND = createCommand<DeleteNotePayload>('delete-note');
export function captureNoteDeletePayload(input: unknown): DeleteNotePayload {
  const p = inlineInsertRecord(input, ['target', 'selectionVersion']);
  if (
    typeof p.selectionVersion !== 'number' ||
    !Number.isSafeInteger(p.selectionVersion) ||
    p.selectionVersion < 0 ||
    Object.is(p.selectionVersion, -0)
  )
    throw Error('InvalidNoteSelectionVersion');
  const target = captureInlineObjectCreateTarget(p.target);
  checkedNoteDeleteRequest({ target: target.address });
  return { target, selectionVersion: p.selectionVersion };
}
export function getNoteDeleteAvailability(state: EditorState): {
  enabled: boolean;
  reason?: string;
} {
  const c = state.content as Record<string, unknown> | undefined;
  if (state.status !== 'ready') return { enabled: false, reason: 'EditorNotReady' };
  if (state.historyRecoveryRequired) return { enabled: false, reason: 'HistoryRecoveryRequired' };
  if (c?.readOnly || (state.capabilities as Record<string, unknown>)?.readOnly)
    return { enabled: false, reason: 'ReadOnlyDocument' };
  if (
    c?.format !== 'hwpx' ||
    c?.noteDeletionAvailable !== true ||
    c?.inlineObjectPlacementVersion !== 1
  )
    return { enabled: false, reason: 'NoteDeletionUnavailable' };
  if (c?.limited || c?.window) return { enabled: false, reason: 'NoteRequiresFullDocument' };
  if (
    state.nativeHistoryStats?.protocolVersion !== 2 ||
    !Number.isSafeInteger(state.nativeHistoryRevision)
  )
    return { enabled: false, reason: 'HistoryV2Required' };
  return { enabled: true };
}
export function noteDeleteMessage(p: DeleteNotePayload, state: EditorState): NoteDeleteMessage {
  const available = getNoteDeleteAvailability(state);
  if (!available.enabled) throw Error(available.reason);
  const target = admitInlineObjectCreateTarget(state, p.target, p.selectionVersion);
  return { kind: 'delete-note', request: checkedNoteDeleteRequest({ target }) };
}
