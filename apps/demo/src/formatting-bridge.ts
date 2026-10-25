// Public core entry only; no runtime protocol, native facade or private selection helpers.
import {getSelectionFormatting,SET_CHARACTER_STRIKE_COMMAND,SET_CHARACTER_UNDERLINE_COMMAND,SET_CHARACTER_PROPERTIES_COMMAND,SET_PARAGRAPH_ALIGNMENT_COMMAND,
 type HeadlessEditor,type CommandResult,type SelectionFormatting} from '@hwpjs/core';
import type {DemoAction,DemoCommand,DemoShellState,ActionAvailability} from './shell-contract.ts';

export interface FormattingBridgeOptions {
 readonly editor:Pick<HeadlessEditor,'getEditorState'|'dispatchCommand'>;
 readonly onStatus:(message:string)=>void;
 readonly onResult?:(result:CommandResult)=>void;
}
/** A partial shell API: caller composes this with file/history/zoom actions. */
export function createFormattingBridge({editor,onStatus,onResult}:FormattingBridgeOptions) {
 const alignments={ 'align-left':'LEFT','align-center':'CENTER','align-right':'RIGHT','align-justify':'JUSTIFY' } as const;
 const supported=(command:string)=>command==='bold'||command==='italic'||command==='underline'||command==='strike'||command==='set-font-size'||Object.hasOwn(alignments,command);
 let pending=false;
 function presentation(state:SelectionFormatting):Pick<DemoShellState,'actions'|'fontSizePoints'> {
  const availability=(reason:string|null,pressed?:boolean|'mixed'):ActionAvailability=>Object.freeze({enabled:!pending&&reason===null,reason:pending?'FormattingPending':reason??undefined,pressed});
  const actions:Partial<Record<DemoCommand,ActionAvailability>>={
   bold:availability(state.characterAvailableReason??(state.bold===null?'UnknownCharacterFormatting':null),state.bold??undefined),
   italic:availability(state.characterAvailableReason??(state.italic===null?'UnknownCharacterFormatting':null),state.italic??undefined),
   underline:availability(state.underlineAvailableReason??(state.underline===null?'UnknownCharacterFormatting':null),state.underline??undefined),
   strike:availability(state.strikeAvailableReason,state.strike??undefined),
   'set-font-size':availability(state.characterAvailableReason),
  };
  for(const [command,alignment] of Object.entries(alignments))actions[command as DemoCommand]=availability(state.paragraphAvailableReason,state.align==='mixed'?'mixed':state.align===alignment);
  return Object.freeze({actions:Object.freeze(actions),fontSizePoints:typeof state.size==='number'?state.size/100:undefined});
 }
 /** Returns false only for commands belonging to another bridge. */
 async function action(action:DemoAction):Promise<boolean> {
  if(!supported(action.command))return false;
  // Fresh selection/target at invocation; never retain the presentation's token.
  const formatting=getSelectionFormatting(editor.getEditorState());
  const availability=presentation(formatting).actions?.[action.command];
  if(!availability?.enabled||!formatting.target){onStatus(availability?.reason??'MissingSelection');return true;}
  const target=formatting.target;
  pending=true;
  try{
   let result:CommandResult;
   if(action.command==='bold'||action.command==='italic'){
    const property=action.command;
    result=await editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND,{target,properties:{[property]:formatting[property]!==true}});
   }else if(action.command==='strike'){
    result=await editor.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND,{target,enabled:formatting.strike!==true});
   }else if(action.command==='underline'){
    result=await editor.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND,{target,kind:formatting.underline===true?'none':'bottom'});
   }else if(action.command==='set-font-size'){
    const size=Math.round(action.points*100);
    if(!Number.isFinite(action.points)||action.points<=0||action.points>4096||Math.abs(size/100-action.points)>1e-9){onStatus('InvalidCharacterSize');return true;}
    result=await editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND,{target,properties:{size}});
   }else{
    result=await editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND,{target,alignment:alignments[action.command as keyof typeof alignments]});
   }
   onStatus(result.error?`${result.status}: ${result.error}`:result.status);
   onResult?.(result);
  }catch(error){onStatus(error instanceof Error?error.message:String(error));}
  finally{pending=false;}
  return true;
 }
 const getPresentation=()=>presentation(getSelectionFormatting(editor.getEditorState()));
 return Object.freeze({action,getPresentation});
}
