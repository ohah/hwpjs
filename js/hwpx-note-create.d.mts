import type { NativeEditOutcome, NativeEditMemory } from './native-edit-outcome.mjs';
import type {
  NoteFormat,
  NotePolicyShape,
  NoteInsertOptions,
  NoteCaret,
  NoteInsertRequest,
} from '../packages/core/src/commands/note-insert-dto.ts';
export type {
  NoteFormat,
  NotePolicyShape,
  NoteInsertOptions,
  NoteCaret,
  NoteInsertRequest,
} from '../packages/core/src/commands/note-insert-dto.ts';
export function checkedNoteInsertOptions(input: unknown): Required<NoteInsertOptions>;
export type NoteInsertOutcome = NativeEditOutcome & { readonly noteCaret?: NoteCaret };
export function checkedNoteInsertRequest(input: unknown): NoteInsertRequest;
export function checkedNoteCaret(input: unknown): NoteCaret;
export function createHwpxNoteCreateApi(input: {
  wasm: Readonly<Record<string, unknown>>;
  memory: NativeEditMemory & { copy(pointer: number, length: number): Uint8Array };
  check(): void;
}): {
  supportsNoteCreationAbi(): boolean;
  insertNote(input: unknown): NoteInsertOutcome;
  insertFootnote(input: unknown): NoteInsertOutcome;
  insertEndnote(input: unknown): NoteInsertOutcome;
};
