import {createDialogLayer} from './dialog-layer.ts';
import {characterSizeFromPoints,type FormattingDialogObservation} from './formatting-bridge.ts';
// @ts-ignore Shared display enum, never a second Native ordinal table.
import {paragraphAlignments} from '../../../web/preview/paragraph-alignments.mjs';
import './formatting-dialog.css';
export type FormattingDialogField='size'|'bold'|'italic'|'alignment';
export interface FormattingDialogViewOptions {
 readonly observation:FormattingDialogObservation;
 readonly onField:(field:FormattingDialogField,value:number|boolean|string|undefined)=>void;
 readonly onApply:()=>void;
 readonly onDismiss:()=>void;
}
/** Shared DOM only: no editor, runtime, resource, selection writer or document model. */
export function createFormattingDialogView(root:HTMLElement,options:FormattingDialogViewOptions){
 const doc=root.ownerDocument,character=options.observation.kind==='character';
 let pending=false,stale=false,composing=false,sizeError:string|undefined;
 const dismiss=()=>{if(!composing)options.onDismiss();};
 const layer=createDialogLayer(root,{role:'formatting-dialog',title:character?'글자 모양':'문단 모양',mode:'modal',onDismiss:dismiss});
 layer.element.classList.add('hwp-format-modal');layer.element.dataset.kind=options.observation.kind;
 const controls:{node:HTMLInputElement|HTMLSelectElement;enabled:boolean}[]=[];
 const status=doc.createElement('p');status.dataset.role='format-dialog-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const body=doc.createElement('div');body.className='hwp-format-fields';
 const reasonLabel=(reason:string|null)=>!reason?'':reason==='EmptyCharacterSelection'?'글자 범위를 선택해주세요.':reason==='SelectionNotEditable'||reason==='ReadOnlyDocument'?'읽기 전용이거나 변경할 수 없는 선택입니다.':'현재 상태에서는 변경할 수 없습니다.';
 const valueLabel=(value:unknown)=>value==='mixed'?'혼합':value===null?'미확인':typeof value==='boolean'?value?'켜짐':'꺼짐':String(value);
 const row=(label:string)=>{const wrap=doc.createElement('label');wrap.className='hwp-format-field';const name=doc.createElement('span');name.textContent=label;wrap.append(name);body.append(wrap);return wrap;};
 const unsupported=(parent:HTMLElement,entries:readonly string[],reason:string)=>{const group=doc.createElement('section');group.className='hwp-format-unavailable';const title=doc.createElement('h3');title.textContent='아직 이 창에서 적용하지 않는 항목';group.append(title);const list=doc.createElement('ul');for(const label of entries){const item=doc.createElement('li');item.textContent=label;list.append(item);}const note=doc.createElement('p');note.textContent=reason;group.append(list,note);parent.append(group);};
 let initial:HTMLInputElement|HTMLSelectElement|undefined;
 if(character){
  const tabs=doc.createElement('div'),basic=doc.createElement('div'),extension=doc.createElement('div');tabs.className='hwp-format-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','글자 모양 탭');
  const buttons=[doc.createElement('button'),doc.createElement('button')];const panels=[basic,extension];
  const selectTab=(index:number)=>{buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});};
  buttons.forEach((button,index)=>{button.type='button';button.textContent=index===0?'기본':'확장';button.setAttribute('role','tab');button.dataset.role=index===0?'format-tab-basic':'format-tab-extension';button.addEventListener('click',()=>selectTab(index));button.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229||composing)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=1-index;selectTab(next);buttons[next].focus();}});tabs.append(button);});
  layer.body.append(tabs,basic,extension);basic.append(body);selectTab(0);
  const size=doc.createElement('input'),sizeCap=options.observation.fields.size;size.type='text';size.inputMode='decimal';size.dataset.role='format-size';size.setAttribute('aria-label','기준 크기 pt');size.value=typeof sizeCap.value==='number'?String(sizeCap.value/100):'';size.placeholder=valueLabel(sizeCap.value);
  const wrap=row('기준 크기 (pt)');wrap.append(size);const current=doc.createElement('small');current.textContent=`현재: ${typeof sizeCap.value==='number'?String(sizeCap.value/100)+'pt':valueLabel(sizeCap.value)}${sizeCap.reason?' · '+reasonLabel(sizeCap.reason):''}`;wrap.append(current);controls.push({node:size,enabled:sizeCap.enabled});initial=size;
  size.addEventListener('input',()=>{sizeError=undefined;if(!size.value.trim()){options.onField('size',undefined);return;}try{options.onField('size',characterSizeFromPoints(Number(size.value)));}catch(error){sizeError=error instanceof Error?error.message:String(error);status.textContent=sizeError;}});
  for(const [field,label]of [['bold','굵게'],['italic','기울임']] as const){const select=doc.createElement('select'),cap=options.observation.fields[field];select.dataset.role='format-'+field;select.setAttribute('aria-label',label);for(const [value,text]of [['','유지'],['true','켜기'],['false','끄기']]){const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option);}const wrap=row(label);wrap.append(select);const source=doc.createElement('small');source.textContent=`현재: ${valueLabel(cap.value)}${cap.reason?' · '+reasonLabel(cap.reason):''}`;wrap.append(source);controls.push({node:select,enabled:cap.enabled});select.addEventListener('change',()=>options.onField(field,select.value===''?undefined:select.value==='true'));}
  unsupported(basic,['언어·글꼴','상대 크기·장평·자간·글자 위치','글자 색·음영 색'],'이 창에서는 크기·굵게·기울임을 변경할 수 있습니다. 나머지 항목은 준비 중입니다.');
  unsupported(extension,['밑줄 위치·모양·색','취소선 모양·색','양각·음각·위/아래첨자·외곽선','테두리 종류·굵기·색','배경 면·무늬 색·무늬 모양'],'밑줄·취소선은 도구 모음에서 사용할 수 있습니다. 이 창의 나머지 항목은 준비 중입니다.');
 }else{
  layer.body.append(body);const select=doc.createElement('select'),cap=options.observation.fields.alignment;select.dataset.role='format-alignment';select.setAttribute('aria-label','문단 정렬');const keep=doc.createElement('option');keep.value='';keep.textContent='유지';select.append(keep);for(const item of paragraphAlignments){const option=doc.createElement('option');option.value=item.key;option.textContent=item.label;select.append(option);}const wrap=row('정렬');wrap.append(select);const current=doc.createElement('small');current.textContent=`현재: ${valueLabel(cap.value)}${cap.reason?' · '+reasonLabel(cap.reason):''}`;wrap.append(current);controls.push({node:select,enabled:cap.enabled});initial=select;select.addEventListener('change',()=>options.onField('alignment',select.value||undefined));
  unsupported(body,['왼쪽·오른쪽 여백','첫 줄 보통·들여쓰기·내어쓰기','줄 간격·문단 위/아래 간격','편집 용지 줄 격자','문단 테두리 연결·테두리·배경'],'이 창에서는 문단 정렬을 변경할 수 있습니다. 여백·간격 등은 준비 중입니다.');
 }
 layer.body.append(status);const scope=doc.createElement('p');scope.className='hwp-format-scope';scope.textContent=character?'크기·굵게·기울임 외 항목은 준비 중입니다.':'정렬 외 항목은 준비 중입니다.';layer.body.append(scope);
 const apply=doc.createElement('button'),cancel=doc.createElement('button');apply.type=cancel.type='button';apply.textContent='확인';cancel.textContent='취소';apply.dataset.role='format-confirm';cancel.dataset.role='format-cancel';layer.footer.append(apply,cancel);
 const canApply=()=>!pending&&!stale&&!composing&&(character?['size','bold','italic'].some(key=>options.observation.fields[key as 'size'|'bold'|'italic'].enabled):options.observation.fields.alignment.enabled);
 const confirm=()=>{if(!canApply())return;if(sizeError){status.textContent=sizeError;return;}options.onApply();};
 apply.addEventListener('click',confirm);cancel.addEventListener('click',dismiss);
 const refresh=()=>{for(const item of controls)item.node.disabled=pending||stale||!item.enabled;apply.disabled=!canApply();cancel.disabled=pending;const dismiss=layer.element.querySelector<HTMLButtonElement>('[data-role=dialog-dismiss]');if(dismiss)dismiss.disabled=pending;};
 layer.element.addEventListener('compositionstart',()=>{composing=true;refresh();});layer.element.addEventListener('compositionend',()=>{composing=false;refresh();});
 layer.element.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229||composing)return;if(event.key==='Enter'&&(event.target as Element).tagName!=='BUTTON'){event.preventDefault();confirm();}});
 refresh();return{element:layer.element,show(){layer.show(initial&&!initial.disabled?initial:cancel);},focus(){(initial&&!initial.disabled?initial:cancel).focus();},isComposing:()=>composing,setPending(value:boolean){pending=value;refresh();},setStale(reason:string){stale=true;status.textContent=reason;refresh();},setStatus(message:string){status.textContent=message;},destroy(){layer.destroy();}};
}
