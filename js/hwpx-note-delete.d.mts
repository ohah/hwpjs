import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';
import type { NoteDeleteRequest } from '../packages/core/src/commands/note-delete-dto.ts';
export function checkedNoteDeleteRequest(input: unknown): NoteDeleteRequest;
export function createHwpxNoteDeleteApi(input: {
  wasm: Readonly<Record<string, unknown>>;
  memory: NativeEditMemory;
  check(): void;
}): { supportsNoteDeletionAbi(): boolean; deleteNote(input: unknown): NativeEditOutcome };
