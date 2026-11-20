import type { InlineObjectOwnedAddress } from './inline-object-placement-dto.ts';

export interface NoteFormat {
  number_type: string;
  user_char: string;
  prefix_char: string;
  suffix_char: string;
  superscript: boolean;
}
export interface NotePolicyShape {
  format: NoteFormat;
  line_length: number;
  line_type: string;
  line_width: string;
  line_color: string;
  between_notes: number;
  below_line: number;
  above_line: number;
  start: number;
  place: string;
  beneath_text: boolean;
}
export interface NoteInsertOptions {
  resources: { paragraph: number; character: number; style: number };
  format: NoteFormat;
  body: string;
  initial_policies?: readonly { section: number; shape: NotePolicyShape }[];
}
export interface NoteCaret {
  section: number;
  paragraph: number;
  unit: number;
  coordinateSpace: 'plain';
}
export type NoteKind = 'foot' | 'end';
export type NoteInsertRequest = Required<NoteInsertOptions> & {
  target: InlineObjectOwnedAddress & { unit: number; expected_text: string };
  kind: NoteKind;
};
export type NoteInsertMessage = {
  kind: 'insert-footnote' | 'insert-endnote';
  request: NoteInsertRequest;
};
