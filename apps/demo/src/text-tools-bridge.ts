import { SPLICE_TEXT_COMMAND,findTextMatch,selectionMatchesText,getDocumentTextStatistics, type HeadlessEditor, type SelectionTarget } from '@hwpjs/core';
import type { DemoAction, DemoCommand, ActionAvailability } from './shell-contract.ts';

let searchInstance=0;

export function createTextToolsBridge({editor,root,onStatus,onClose}:{editor:HeadlessEditor;root:HTMLElement;onStatus:(message:string)=>void;onClose?:()=>void}) {
  let dialog:HTMLDialogElement|undefined,closed=false,pending=false,epoch=0;
  let documentId=editor.getEditorState().documentId;
  let generation=editor.getEditorState().generation;
  // Define teardown before subscribing: registration may synchronously publish.
  const close=(restoreFocus=false)=>{epoch++;if(dialog){dialog.close();dialog.remove();dialog=undefined;
    if(restoreFocus&&!closed&&editor.getEditorState().status==='ready')onClose?.();
  }};
  const unsubscribe=editor.registerStateListener(state=>{
    if(state.documentId!==documentId||state.generation!==generation||state.status!=='ready'||dialog?.dataset.role==='document-statistics')close();
    documentId=state.documentId;generation=state.generation;
  });
  const presentation=():Partial<Record<DemoCommand,ActionAvailability>>=>{
    const state=editor.getEditorState();
    const reason=closed?'종료된 데모입니다.':pending?'찾기·바꾸기 작업이 진행 중입니다.':state.status!=='ready'?'문서를 먼저 열어주세요.':undefined;
    const value={enabled:reason===undefined,reason};
    return {find:value,replace:value,'word-count':value};
  };
  const report=(error:unknown)=>{if(!closed)onStatus(error instanceof Error?error.message:String(error));};
  const button=(text:string,role:string,action:()=>void|Promise<void>)=>{
    const node=root.ownerDocument.createElement('button');node.type='button';node.textContent=text;node.dataset.role=role;
    node.addEventListener('click',()=>{if(closed)return;Promise.resolve().then(()=>{if(!closed)return action();}).catch(report);});return node;
  };
  const open=(replace:boolean)=>{
    close();const doc=root.ownerDocument;dialog=doc.createElement('dialog');dialog.dataset.role='text-search';dialog.setAttribute('aria-label',replace?'찾아 바꾸기':'찾기');
    const ownedDialog=dialog,ownedEpoch=epoch;
    const active=()=>!closed&&dialog===ownedDialog&&epoch===ownedEpoch;
    const run=async(operation:()=>Promise<void>)=>{
      if(!active()||pending)return;
      pending=true;
      try{await operation();}catch(error){if(active())report(error);}finally{pending=false;}
    };
    const heading=doc.createElement('h2');heading.textContent=replace?'찾아 바꾸기':'찾기';
    const query=doc.createElement('input');query.type='text';query.setAttribute('aria-label','찾을 내용');query.dataset.role='search-query';
    const replacement=doc.createElement('input');replacement.type='text';replacement.setAttribute('aria-label','바꿀 내용');replacement.dataset.role='search-replacement';
    const message=doc.createElement('p');message.dataset.role='search-status';message.setAttribute('role','status');message.textContent='현재 불러온 내용에서 찾습니다.';
    const directions=doc.createElement('fieldset'),legend=doc.createElement('legend');legend.textContent='찾을 방향';directions.append(legend);
    let mode:'down'|'up'|'all'='down',continuation:{version:number;query:string;mode:string}|undefined;
    let continueSearch:HTMLButtonElement;
    const clearContinuation=()=>{continuation=undefined;if(continueSearch)continueSearch.hidden=true;};
    const directionName=`hwpjs-search-direction-${++searchInstance}`;
    for(const [value,label] of [['down','아래로'],['up','위로'],['all','문서 전체']] as const){
      const row=doc.createElement('label'),radio=doc.createElement('input');radio.type='radio';radio.name=directionName;radio.value=value;
      radio.dataset.role=`search-direction-${value}`;radio.checked=value==='down';
      radio.addEventListener('change',()=>{if(radio.checked){mode=value;clearContinuation();}});row.append(radio,doc.createTextNode(label));directions.append(row);
    }
    query.addEventListener('input',clearContinuation);
    const find=(continuing=false)=>run(async()=>{
      const text=query.value;
      if(!text){message.textContent='찾을 내용을 입력하세요.';return;}
      const captured=editor.getEditorState(),requestedMode=mode;
      if(continuing&&(!continuation||continuation.version!==captured.stateVersion||continuation.query!==text||continuation.mode!==mode)){
        clearContinuation();message.textContent='선택이나 검색 조건이 바뀌었습니다. 다시 찾아주세요.';return;
      }
      clearContinuation();
      await editor.update(()=>{});
      if(!active())return;
      if(editor.getEditorState().stateVersion!==captured.stateVersion)throw Error('StaleSearchSelection');
      if(query.value!==text||mode!==requestedMode)throw Error('StaleSearchQuery');
      const direction=requestedMode==='up'?'backward':'forward';
      const target=findTextMatch(captured,text,{direction,wrap:requestedMode==='all'||continuing});
      if(!target){
        if(!continuing&&requestedMode!=='all'&&findTextMatch(captured,text,{direction,wrap:true})){
          continuation={version:captured.stateVersion,query:text,mode:requestedMode};
          continueSearch.textContent=requestedMode==='up'?'끝부터 계속 찾기':'처음부터 계속 찾기';continueSearch.hidden=false;
          message.textContent=requestedMode==='up'?'처음까지 찾았습니다. 끝부분에서 이어서 찾을까요?':'끝까지 찾았습니다. 앞부분에서 이어서 찾을까요?';
        }else message.textContent='불러온 내용에서 찾지 못했습니다.';
        return;
      }
      await editor.setSelection(target,{stateVersion:captured.stateVersion});
      if(active())message.textContent=query.value===text&&mode===requestedMode?'일치하는 내용을 선택했습니다.':'검색 조건이 바뀌었습니다. 다시 찾아주세요.';
    });
    dialog.append(heading,query);if(replace)dialog.append(replacement);
    continueSearch=button('계속 찾기','continue-search',()=>find(true));continueSearch.hidden=true;
    dialog.append(directions,button('다음 찾기','find-next',()=>find()),continueSearch);
    if(replace)dialog.append(button('선택 바꾸기','replace-selection',()=>run(async()=>{
      const state=editor.getEditorState();
      if(!selectionMatchesText(state,query.value)){message.textContent='먼저 다음 찾기로 바꿀 내용을 선택하세요.';return;}
      const text=replacement.value;
      await editor.update(()=>{});
      if(!active())return;
      if(editor.getEditorState().stateVersion!==state.stateVersion)throw Error('StaleSearchSelection');
      const result=await editor.dispatchCommand(SPLICE_TEXT_COMMAND,{target:state.selection as SelectionTarget,text,selectionVersion:state.stateVersion});
      if(!active())return;
      if(result.error)throw Error(result.error);
      if(!result.status.startsWith('committed'))throw Error('선택한 내용을 바꿀 수 없습니다.');
      message.textContent='선택한 내용을 바꿨습니다.';
    })));
    query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void find();}});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}});
    dialog.append(message,button('닫기','close-text-tool',()=>close(true)));dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
    root.append(dialog);dialog.show();query.focus();
  };
  return {presentation,async action(action:DemoAction):Promise<boolean>{
    if(!['find','replace','word-count'].includes(action.command))return false;
    if(closed)return true;
    if(!presentation()[action.command]?.enabled){onStatus(presentation()[action.command]?.reason??'문서를 먼저 열어주세요.');return true;}
    if(action.command!=='word-count'){open(action.command==='replace');return true;}
    close();const stats=getDocumentTextStatistics(editor.getEditorState()),doc=root.ownerDocument;dialog=doc.createElement('dialog');dialog.dataset.role='document-statistics';dialog.setAttribute('aria-label','문서 통계');
    const content=doc.createElement('p');content.textContent=`${stats.complete?'문서':'불러온 부분'} 통계: 문단 ${stats.paragraphs}개 · 글자 ${stats.characters}개(공백 포함), ${stats.charactersWithoutWhitespace}개(공백 제외) · 어절 ${stats.words}개(공백 기준)`;
    dialog.append(content,button('닫기','close-text-tool',()=>close(true)));dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});root.append(dialog);dialog.showModal();
    return true;
  },dispose(){if(closed)return;closed=true;try{unsubscribe();}finally{close();}}};
}
