import {SPLICE_TEXT_COMMAND,findTextMatch,selectionMatchesText,getDocumentTextStatistics,type HeadlessEditor,type SelectionTarget} from '@hwpjs/core';
import type {DemoAction,DemoCommand,ActionAvailability} from './shell-contract.ts';
import {createTextToolsDialog,type SearchDraft,type SearchDirection} from './text-tools-dialog.ts';
import {createDialogLayer} from './dialog-layer.ts';
import {replacementCaret} from './replacement-selection.ts';

export function createTextToolsBridge({editor,root,onStatus,onClose,resolveShortcut}:{editor:HeadlessEditor;root:HTMLElement;onStatus:(message:string)=>void;onClose?:()=>void;resolveShortcut?:(event:KeyboardEvent)=>string|undefined}){
 let view:ReturnType<typeof createTextToolsDialog>|undefined,statistics:ReturnType<typeof createDialogLayer>|undefined,closed=false,pending=false,epoch=0;
 let draft:SearchDraft={query:'',replacement:'',direction:'down'},replaceMode=false,continuation:{version:number;query:string;mode:string}|undefined;
 let documentId=editor.getEditorState().documentId,generation=editor.getEditorState().generation;
 const current=()=>view?.getDraft()??draft;
 const clearContinuation=()=>{continuation=undefined;view?.continueFromEnd();};
 const close=(restoreFocus=false,clearDraft=false)=>{epoch++;if(view){draft=view.getDraft();view.destroy();view=undefined;}statistics?.destroy();statistics=undefined;clearContinuation();if(clearDraft)draft={query:'',replacement:'',direction:'down'};if(restoreFocus&&!closed&&editor.getEditorState().status==='ready')onClose?.();};
 const unsubscribe=editor.registerStateListener(state=>{if(state.documentId!==documentId||state.generation!==generation||state.status!=='ready')close(false,true);else if(statistics)close();documentId=state.documentId;generation=state.generation;});
 const presentation=():Partial<Record<DemoCommand,ActionAvailability>>=>{const state=editor.getEditorState(),reason=closed?'종료된 데모입니다.':pending?'찾기·바꾸기 작업이 진행 중입니다.':state.status!=='ready'?'문서를 먼저 열어주세요.':undefined,value={enabled:reason===undefined,reason};return{find:value,replace:value,'word-count':value};};
 const report=(error:unknown)=>{if(closed)return;const message=error instanceof Error?error.message:String(error);onStatus(message);view?.setStatus(['StaleSearchSelection','StaleSelectionObservation','StaleSearchQuery'].includes(message)?'선택이나 검색 조건이 바뀌었습니다. 다시 찾아주세요.':message);};
 const run=async(operation:(active:()=>boolean)=>Promise<void>)=>{if(closed||pending)return;const capturedEpoch=epoch,active=()=>!closed&&epoch===capturedEpoch;pending=true;view?.setBusy(true);try{await operation(active);}catch(error){if(active())report(error);}finally{pending=false;view?.setBusy(false);}};
 const status=(message:string)=>{if(view)view.setStatus(message);else onStatus(message);};
 const find=(continuing=false,override?:SearchDirection)=>run(async active=>{
  const values=current(),text=values.query,requestedMode=override??values.direction;
  if(!text){status('찾을 내용을 입력하세요.');return;}
  const captured=editor.getEditorState();
  if(continuing&&(!continuation||continuation.version!==captured.stateVersion||continuation.query!==text||continuation.mode!==requestedMode)){clearContinuation();status('선택이나 검색 조건이 바뀌었습니다. 다시 찾아주세요.');return;}
  clearContinuation();await editor.update(()=>{});if(!active())return;
  if(editor.getEditorState().stateVersion!==captured.stateVersion)throw Error('StaleSearchSelection');
  if(current().query!==text||current().direction!==values.direction)throw Error('StaleSearchQuery');
  const direction=requestedMode==='up'?'backward':'forward',target=findTextMatch(captured,text,{direction,wrap:requestedMode==='all'||continuing});
  if(!target){if(!continuing&&requestedMode!=='all'&&findTextMatch(captured,text,{direction,wrap:true})){
   continuation={version:captured.stateVersion,query:text,mode:requestedMode};view?.continueFromEnd(requestedMode==='up'?'끝부터 계속 찾기':'처음부터 계속 찾기');status(requestedMode==='up'?'처음까지 찾았습니다. 끝부분에서 이어서 찾을까요?':'끝까지 찾았습니다. 앞부분에서 이어서 찾을까요?');
  }else status('불러온 내용에서 찾지 못했습니다.');return;}
  await editor.setSelection(target,{stateVersion:captured.stateVersion});if(active())status('일치하는 내용을 선택했습니다.');
 });
 const replaceSelection=()=>run(async active=>{
  const values=current(),state=editor.getEditorState();if(!selectionMatchesText(state,values.query)){status('먼저 다음 찾기로 바꿀 내용을 선택하세요.');return;}
  const text=values.replacement;await editor.update(()=>{});if(!active())return;if(editor.getEditorState().stateVersion!==state.stateVersion)throw Error('StaleSearchSelection');
  const result=await editor.dispatchCommand(SPLICE_TEXT_COMMAND,{target:state.selection as SelectionTarget,text,selectionVersion:state.stateVersion});if(!active())return;if(result.error)throw Error(result.error);if(!result.status.startsWith('committed'))throw Error('선택한 내용을 바꿀 수 없습니다.');const latest=editor.getEditorState();let restored=false;if(result.status==='committed-with-snapshot'&&latest===result.state){const caret=replacementCaret(state,latest,state.selection as SelectionTarget,text);if(caret){await editor.setSelection(caret,{stateVersion:latest.stateVersion});if(!active())return;restored=true;}}status(restored?'선택한 내용을 바꿨습니다.':'내용을 바꿨습니다. 새 위치를 확인하지 못해 문서에서 다시 선택해주세요.');clearContinuation();
 });
 const open=(replace:boolean)=>{
  if(view){replaceMode=replace;view.setMode(replace);view.focus();return;}
  close();const openingEpoch=epoch;replaceMode=replace;view=createTextToolsDialog(root,{replace,draft,onDismiss:()=>close(true),onChange:clearContinuation,onFind:continuing=>{if(epoch===openingEpoch&&view)void find(continuing);},onReplace:()=>{if(epoch===openingEpoch&&view)void replaceSelection();},onMode:mode=>{if(!pending){replaceMode=mode;view?.setMode(mode);}}});view.show();
 };
 const keyboard=(event:KeyboardEvent)=>{
  if(closed||event.defaultPrevented||event.isComposing||event.keyCode===229)return;
  if(statistics?.element.open||root.ownerDocument.querySelector?.('dialog:modal'))return;
  const target=event.target as Element|null,inside=view?.element.contains(target);
  if(inside){const command=resolveShortcut?.(event);if(command==='find'||command==='replace'){event.preventDefault();event.stopPropagation();if(!pending)open(command==='replace');return;}}
  if(event.code!=='F3'||event.ctrlKey||event.metaKey||event.altKey||(!inside&&target?.closest?.('input,textarea,select,[contenteditable]')&&!target.closest('[data-hwpjs-document-input]')))return;
  event.preventDefault();event.stopPropagation();if(event.repeat||pending||editor.getEditorState().status!=='ready')return;
  if(!current().query){open(replaceMode);return;}
  void find(false,event.shiftKey?'up':current().direction);
 };
 root.addEventListener('keydown',keyboard,true);
 return{presentation,async action(action:DemoAction):Promise<boolean>{
  if(!['find','replace','word-count'].includes(action.command))return false;if(closed)return true;const available=presentation()[action.command];if(!available?.enabled){onStatus(available?.reason??'문서를 먼저 열어주세요.');return true;}
  if(action.command!=='word-count'){open(action.command==='replace');return true;}
  close();const stats=getDocumentTextStatistics(editor.getEditorState()),doc=root.ownerDocument;statistics=createDialogLayer(root,{role:'document-statistics',title:'문서 통계',mode:'modal',onDismiss:()=>close(true)});
  const text=doc.createElement('p'),button=doc.createElement('button');text.textContent=`${stats.complete?'문서':'불러온 부분'} 통계: 문단 ${stats.paragraphs}개 · 글자 ${stats.characters}개(공백 포함), ${stats.charactersWithoutWhitespace}개(공백 제외) · 어절 ${stats.words}개(공백 기준)`;button.type='button';button.textContent='닫기';button.dataset.role='close-text-tool';button.addEventListener('click',()=>close(true));statistics.body.append(text);statistics.footer.append(button);statistics.show(button);return true;
 },dispose(){if(closed)return;closed=true;root.removeEventListener('keydown',keyboard,true);try{unsubscribe();}finally{close(false,true);}}};
}
