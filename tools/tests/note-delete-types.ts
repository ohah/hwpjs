import type { EditorState } from '../../packages/core/src/state/editor-state.ts';
import {
  captureNoteDeletePayload,
  noteDeleteMessage,
} from '../../packages/core/src/commands/note-delete.ts';
import type {
  NoteDeleteMessage,
  NoteDeleteRequest,
} from '../../packages/core/src/commands/note-delete-dto.ts';
import { checkedNoteDeleteRequest } from '../../js/hwpx-note-delete.mjs';
export function noteDeleteTypes(input: unknown, state: EditorState): NoteDeleteMessage {
  const p = captureNoteDeletePayload(input);
  const message: NoteDeleteMessage = noteDeleteMessage(p, state);
  const request: NoteDeleteRequest = checkedNoteDeleteRequest(message.request);
  return { kind: message.kind, request };
}
