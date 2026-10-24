import type { EditorState } from './editor-state.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
import { validateFormattingTarget } from '../commands/formatting.ts';
// @ts-ignore Canonical readonly display projection, not native writer rules.
import { characterSelectionState } from '../../../../web/preview/character-property-selection.mjs';
// @ts-ignore Canonical readonly source size projection.
import { characterSizeState } from '../../../../web/preview/character-size-selection.mjs';
// @ts-ignore Canonical display enum; no duplicated ordinal table.
import { paragraphAlignmentKey } from '../../../../web/preview/paragraph-alignments.mjs';

export type FormattingValue<T> = T|'mixed'|null;
export interface SelectionFormatting {
 readonly target:SelectionTarget|null;
 /** null means the command target is available; unknown observations remain null below. */
 readonly characterAvailableReason:string|null;
 readonly paragraphAvailableReason:string|null;
 readonly bold:FormattingValue<boolean>;
 readonly italic:FormattingValue<boolean>;
 /** Source units (1/100 point), never rounded for display here. */
 readonly size:FormattingValue<number>;
 readonly align:FormattingValue<string>;
}
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
/** Pure owned projection. It does not rebase stale selections or manufacture a cursor. */
export function getSelectionFormatting(state:EditorState):SelectionFormatting {
 const unavailable=(reason:string):SelectionFormatting=>Object.freeze({target:null,characterAvailableReason:reason,paragraphAvailableReason:reason,bold:null,italic:null,size:null,align:null});
 if(state.status!=='ready')return unavailable(state.status==='refresh-required'?'RefreshRequired':'EditorNotReady');
 const selection=state.selection;
 if(selection==null)return unavailable('MissingSelection');
 let target:SelectionTarget,row:ReturnType<typeof validateSelection>;
 try{
  const selected=selection as SelectionTarget;
  row=validateSelection(selected,state);
  target=Object.freeze({editorId:selected.editorId,documentId:selected.documentId,generation:selected.generation,operationRevision:selected.operationRevision,viewRevision:selected.viewRevision,coordinateSpace:selected.coordinateSpace,format:selected.format,owner:selected.owner,section:selected.section,paragraph:selected.paragraph,startUnit:selected.startUnit,endUnit:selected.endUnit,affinity:selected.affinity});
 }catch(error){return unavailable(message(error));}
 const reason=(character:boolean)=>{try{validateFormattingTarget(target,state,character);return null;}catch(error){return message(error);}};
 const characterAvailableReason=reason(true),paragraphAvailableReason=reason(false);
 const content=state.content;
 // Helpers deliberately consume display offsets, not the mapped native offsets.
 const bold=characterAvailableReason===null?characterSelectionState(content,row,target.startUnit,target.endUnit,'bold'):null;
 const italic=characterAvailableReason===null?characterSelectionState(content,row,target.startUnit,target.endUnit,'italic'):null;
 const size=characterAvailableReason===null?characterSizeState(content,row,target.startUnit,target.endUnit):null;
 const align=paragraphAvailableReason===null?paragraphAlignmentKey((row as typeof row&{paragraphShape?:{alignment?:number}}).paragraphShape?.alignment):null;
 return Object.freeze({target,characterAvailableReason,paragraphAvailableReason,bold,italic,size,align});
}
