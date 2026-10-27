import type { SetCharacterFontNamePayload } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { validateFormattingTarget } from './formatting.ts';
import { validateSelection } from './selection.ts';
import { characterFontNameObservations } from '../state/font-name-state.ts';
// @ts-ignore Canonical byte/language validator. Native retains font ID ownership.
import { characterFontNameArgs } from '../../../../js/character-font-name-args.mjs';

export function fontNameMessage(payload: SetCharacterFontNamePayload, state: EditorState) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    ['target', 'language', 'name'].some((key) => !Object.hasOwn(payload, key)) ||
    Object.keys(payload).some((key) => !['target', 'language', 'name'].includes(key)) ||
    Object.values(Object.getOwnPropertyDescriptors(payload)).some((d) => d.get || d.set)
  ) {
    throw Error('InvalidCharacterFontNamePayload');
  }
  const range = validateFormattingTarget(payload.target, state, true, 'characterFontNameAvailable');
  if (typeof globalThis.TextEncoder !== 'function') throw Error('FontNameEncodingUnavailable');
  characterFontNameArgs(payload.language, payload.name);
  const row = validateSelection(payload.target, state);
  const observed = characterFontNameObservations(
    state.content,
    row,
    payload.target.startUnit,
    payload.target.endUnit,
  );
  if (!observed[payload.language]?.bindingValid) throw Error('UnknownCharacterFontName');
  return { kind: 'character-font-name', ...range, language: payload.language, name: payload.name };
}
