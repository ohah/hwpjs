import type { InlineObjectOwnedAddress } from './inline-object-placement-dto.ts';
export type NoteDeleteRequest = {
  readonly target: InlineObjectOwnedAddress & {
    readonly unit: number;
    readonly expected_text: string;
  };
};
export type NoteDeleteMessage = {
  readonly kind: 'delete-note';
  readonly request: NoteDeleteRequest;
};
