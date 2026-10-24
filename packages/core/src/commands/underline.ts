import type {SetCharacterUnderlinePayload} from './commands.ts';
import type {EditorState} from '../state/editor-state.ts';
import {validateFormattingTarget} from './formatting.ts';
// @ts-ignore Canonical facade enum validation; no second underline ordinal table.
import {characterUnderlineArg} from '../../../../js/character-underline-args.mjs';
export function underlineMessage(payload:SetCharacterUnderlinePayload,state:EditorState) {
 const range=validateFormattingTarget(payload.target,state,true,'characterUnderlineAvailable');
 characterUnderlineArg(payload.kind);
 return {kind:'character-underline',...range,underlineKind:payload.kind};
}
