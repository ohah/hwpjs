import {getSelectionClipboard,SPLICE_TEXT_COMMAND,type HeadlessEditor,type CommandResult,type SelectionClipboard} from '@hwpjs/core';
import type {DemoAction,DemoCommand,DemoShellState,ActionAvailability} from './shell-contract.ts';

export interface PlainTextClipboard {
 readText?:()=>Promise<string>;
 writeText?:(text:string)=>Promise<void>;
}
export interface ClipboardBridgeOptions {
 readonly editor:Pick<HeadlessEditor,'getEditorState'|'dispatchCommand'|'update'>;
 /** Injectable platform port. null explicitly disables clipboard access. */
 readonly clipboard?:PlainTextClipboard|null;
 readonly onStatus:(message:string)=>void;
 readonly onResult?:(result:CommandResult)=>void;
 readonly onReadDenied?:()=>void;
}
/** Framework-neutral plain-text bridge. No DOM selection, runtime port or Native facade. */
export function createClipboardBridge(options:ClipboardBridgeOptions) {
 const {editor,onStatus,onResult}=options;
 let pending=false,closed=false;
 const platform=()=>options.clipboard===undefined?globalThis.navigator?.clipboard:options.clipboard;
 const supported=(command:string):command is 'copy'|'cut'|'paste'=>['copy','cut','paste'].includes(command);
 function reason(command:'copy'|'cut'|'paste',selection:SelectionClipboard,ownedPending=false):string|null {
  if(closed)return 'ClipboardDisposed';
  if(pending&&!ownedPending)return 'ClipboardPending';
  const selectionReason=command==='copy'?selection.copyReason:command==='cut'?selection.copyReason??selection.editReason:selection.editReason;
  if(selectionReason)return selectionReason;
  if(!selection.target)return 'MissingSelection';
  if(typeof platform()?.[command==='paste'?'readText':'writeText']!=='function')return command==='paste'?'ClipboardReadUnavailable':'ClipboardWriteUnavailable';
  return null;
 }
 function getPresentation():Pick<DemoShellState,'actions'> {
  const selection=getSelectionClipboard(editor.getEditorState());
  const actions:Partial<Record<DemoCommand,ActionAvailability>>={};
  for(const command of ['copy','cut','paste'] as const){const why=reason(command,selection);actions[command]=Object.freeze({enabled:why===null,reason:why??undefined});}
  return Object.freeze({actions:Object.freeze(actions)});
 }
 function fresh(captured:SelectionClipboard):boolean {
  const current=getSelectionClipboard(editor.getEditorState());
  return !closed&&current.stateVersion===captured.stateVersion&&current.target!==null;
 }
 async function action(action:DemoAction):Promise<boolean> {
  if(!supported(action.command))return false;
  const command=action.command;
  const initial=reason(command,getSelectionClipboard(editor.getEditorState()));
  if(initial){if(!closed)onStatus(initial);return true;}
  pending=true;
  let phase:'read'|'write'|'editor'='editor';
  try{
   // Public admission settles composition and queued input, without a synthetic edit.
   await editor.update(()=>{});
   if(closed)return true;
   const captured=getSelectionClipboard(editor.getEditorState());
   // Revalidate after composition while keeping duplicate actions fenced.
   const why=reason(command,captured,true);
   if(why)throw Error(why);
   const clipboard=platform()!;
   let text='';
   if(command==='paste'){
    phase='read';text=await clipboard.readText!();
    phase='editor';
    if(!fresh(captured))throw Error('StaleClipboardSelection');
    if(typeof text!=='string')throw Error('InvalidClipboardText');
    if(!text.length)throw Error('ClipboardEmpty');
   }else{
    phase='write';await clipboard.writeText!(captured.text!);
    phase='editor';
    if(!fresh(captured))throw Error('ClipboardWrittenSelectionChanged');
    if(command==='copy'){onStatus('Copied');return true;}
   }
   if(closed)return true;
   const result=await editor.dispatchCommand(SPLICE_TEXT_COMMAND,{target:captured.target!,text,selectionVersion:captured.stateVersion});
   if(closed)return true;
   onStatus(result.error?`${result.status}: ${result.error}`:result.status);
   onResult?.(result);
  }catch(error){
   if(!closed){
    const name=error instanceof Error?error.name:'';
    const message=error instanceof Error?error.message:String(error);
    const denied=(name==='NotAllowedError'||name==='SecurityError')&&phase!=='editor';
    onStatus(denied?`Clipboard${phase==='read'?'Read':'Write'}PermissionDenied`:message);
    if(denied&&phase==='read')options.onReadDenied?.();
   }
  }finally{pending=false;}
  return true;
 }
 return Object.freeze({action,getPresentation,dispose(){closed=true;}});
}
