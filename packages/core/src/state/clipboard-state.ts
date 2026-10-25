import type {EditorState} from './editor-state.ts';
import type {SelectionTarget} from '../commands/commands.ts';
import {validateSelection,selectionMessage} from '../commands/selection.ts';

export interface SelectionClipboard {
 readonly target:SelectionTarget|null;
 readonly text:string|null;
 readonly copyReason:string|null;
 readonly editReason:string|null;
 readonly stateVersion:number;
}
/** Plain text from a validated public selection; Native still owns mutation permission. */
export function getSelectionClipboard(state:EditorState):SelectionClipboard {
 const unavailable=(reason:string):SelectionClipboard=>Object.freeze({target:null,text:null,copyReason:reason,editReason:reason,stateVersion:state.stateVersion});
 if(!state.documentId||state.status==='empty')return unavailable('NoDocument');
 if(state.status!=='ready')return unavailable(state.status==='refresh-required'?'RefreshRequired':'EditorNotReady');
 if(state.selection==null)return unavailable('MissingSelection');
 try{
  const selected=state.selection as SelectionTarget;
  const row=validateSelection(selected,state);
  const target:SelectionTarget=Object.freeze({...state.token,coordinateSpace:selected.coordinateSpace,format:selected.format,owner:selected.owner,section:selected.section,paragraph:selected.paragraph,startUnit:selected.startUnit,endUnit:selected.endUnit,affinity:selected.affinity});
  const text=row.text.slice(target.startUnit,target.endUnit);
  if(text.includes('\ufffc'))return unavailable('ClipboardObjectSelectionUnsupported');
  let editReason:string|null=null;
  try{selectionMessage(target,state);}catch(error){editReason=error instanceof Error?error.message:String(error);}
  return Object.freeze({target,text,copyReason:text.length?null:'EmptyClipboardSelection',editReason,stateVersion:state.stateVersion});
 }catch(error){return unavailable(error instanceof Error?error.message:String(error));}
}
