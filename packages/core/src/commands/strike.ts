import type { SetCharacterStrikePayload } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { validateFormattingTarget } from './formatting.ts';
export function strikeMessage(payload: SetCharacterStrikePayload, state: EditorState) {
  const range = validateFormattingTarget(payload.target, state, true, 'characterStrikeAvailable');
  if (typeof payload.enabled !== 'boolean') throw Error('InvalidCharacterStrikeEnabled');
  // 원본 비트/legacy 해석은 기존 Native와 facade의 책임입니다.
  return { kind: 'character-strike', ...range, enabled: payload.enabled };
}
