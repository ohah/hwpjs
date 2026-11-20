import {
  captureNoteInsertPayload,
  noteInsertMessage,
} from '../../packages/core/src/commands/note-insert.ts';
import type {
  NoteInsertMessage,
  NoteInsertOptions,
  NoteInsertRequest,
} from '../../packages/core/src/commands/note-insert-dto.ts';
import type { EditorState } from '../../packages/core/src/state/editor-state.ts';
import { checkedNoteInsertOptions, checkedNoteInsertRequest } from '../../js/hwpx-note-create.mjs';

// Compile the real validators and Core DTOs together without widening or casts.
export function noteCreateTypeContract(input: unknown, state: EditorState): NoteInsertMessage {
  const payload = captureNoteInsertPayload(input);
  const message: NoteInsertMessage = noteInsertMessage(payload, state, 'foot');
  const request: NoteInsertRequest = checkedNoteInsertRequest(message.request);
  const options: Required<NoteInsertOptions> = checkedNoteInsertOptions(payload.options);
  return { kind: message.kind, request: { ...request, ...options } };
}
