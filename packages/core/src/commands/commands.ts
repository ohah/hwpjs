import type { StateToken } from '../state/editor-state.ts';
export interface EditorCommand<T> {
  readonly name: string;
  readonly id: symbol;
  readonly __payload?: T;
}
export function createCommand<T>(name: string): EditorCommand<T> {
  if (!name) throw Error('InvalidCommand');
  return Object.freeze({ name, id: Symbol(name) });
}
export interface SelectionTarget extends StateToken {
  readonly coordinateSpace: 'display';
  readonly format: 'hwp5' | 'hwpx';
  readonly owner: string;
  readonly section: number;
  readonly paragraph: number;
  readonly startUnit: number;
  readonly endUnit: number;
  readonly affinity: 'forward' | 'backward';
}
export interface SpliceTextPayload {
  readonly target: SelectionTarget;
  readonly text: string;
  /** Optional exact selection observation fence for asynchronous clipboard operations. */ readonly selectionVersion?: number;
}
export interface HistoryPayload {
  readonly token: StateToken;
}
export const SPLICE_TEXT_COMMAND = createCommand<SpliceTextPayload>('splice-text');
export const UNDO_COMMAND = createCommand<HistoryPayload>('undo');
export const REDO_COMMAND = createCommand<HistoryPayload>('redo');

export interface CharacterProperties {
  readonly size?: number | null;
  readonly bold?: boolean | null;
  readonly italic?: boolean | null;
}
export interface SetCharacterPropertiesPayload {
  readonly target: SelectionTarget;
  readonly properties: CharacterProperties;
}
export interface SetParagraphAlignmentPayload {
  readonly target: SelectionTarget;
  readonly alignment: string;
}
export const SET_CHARACTER_PROPERTIES_COMMAND = createCommand<SetCharacterPropertiesPayload>(
  'set-character-properties',
);
export const SET_PARAGRAPH_ALIGNMENT_COMMAND =
  createCommand<SetParagraphAlignmentPayload>('set-paragraph-alignment');
export type CharacterUnderlineKind = 'none' | 'bottom' | 'center' | 'top';
export interface SetCharacterUnderlinePayload {
  readonly target: SelectionTarget;
  readonly kind: CharacterUnderlineKind;
}
export const SET_CHARACTER_UNDERLINE_COMMAND =
  createCommand<SetCharacterUnderlinePayload>('set-character-underline');

export interface SetCharacterStrikePayload {
  readonly target: SelectionTarget;
  readonly enabled: boolean;
}
export const SET_CHARACTER_STRIKE_COMMAND =
  createCommand<SetCharacterStrikePayload>('set-character-strike');

export interface SetCharacterTextColorPayload {
  readonly target: SelectionTarget;
  readonly color: string;
}
export const SET_CHARACTER_TEXT_COLOR_COMMAND = createCommand<SetCharacterTextColorPayload>(
  'set-character-text-color',
);
