import './dialog-layer.css';
export interface DialogLayerOptions {role:string;title:string;mode:'modeless'|'modal';onDismiss:()=>void;}
/** Common window lifecycle. Modeless search never makes the document inert or traps focus. */
export function createDialogLayer(root:HTMLElement,options:DialogLayerOptions){
 const doc=root.ownerDocument,element=doc.createElement('dialog'),header=doc.createElement('header'),title=doc.createElement('h2'),dismiss=doc.createElement('button'),body=doc.createElement('div'),footer=doc.createElement('footer');
 element.className='hwp-dialog-layer';element.dataset.role=options.role;element.dataset.mode=options.mode;element.setAttribute('aria-label',options.title);element.setAttribute('aria-modal',String(options.mode==='modal'));
 header.className='hwp-dialog-header';header.dataset.role='dialog-titlebar';title.textContent=options.title;dismiss.type='button';dismiss.className='hwp-dialog-dismiss';dismiss.textContent='×';dismiss.setAttribute('aria-label','창 닫기');dismiss.dataset.role='dialog-dismiss';body.className='hwp-dialog-body';footer.className='hwp-dialog-footer';header.append(title,dismiss);element.append(header,body,footer);
 let disposed=false,drag:{id:number;x:number;y:number;left:number;top:number}|undefined;
 const removals:(()=>void)[]=[];
 const listen=(node:EventTarget,type:string,handler:(event:any)=>void)=>{node.addEventListener(type,handler);removals.push(()=>node.removeEventListener(type,handler));};
 const stopDrag=()=>{if(drag){if(header.hasPointerCapture?.(drag.id))header.releasePointerCapture(drag.id);drag=undefined;}};
 listen(dismiss,'click',()=>{if(!disposed)options.onDismiss();});
 listen(element,'cancel',(event:Event)=>{event.preventDefault();if(!disposed)options.onDismiss();});
 listen(element,'keydown',(event:KeyboardEvent)=>{
  if(event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();stopDrag();options.onDismiss();return;}
  if(options.mode!=='modal'||event.key!=='Tab')return;
  const items=[...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node=>!node.hidden&&node.getClientRects().length>0);
  if(!items.length){event.preventDefault();element.focus();return;}
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&(doc.activeElement===first||doc.activeElement===element)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
 });
 listen(header,'pointerdown',(event:PointerEvent)=>{
  if(disposed||event.button!==0||(event.target as Element)?.closest?.('button'))return;
  const rect=element.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};event.preventDefault();header.setPointerCapture?.(event.pointerId);
 });
 listen(header,'pointermove',(event:PointerEvent)=>{
  if(!drag||event.pointerId!==drag.id)return;
  const rect=element.getBoundingClientRect(),win=doc.defaultView;
  const left=Math.max(8,Math.min((win?.innerWidth??1024)-rect.width-8,drag.left+event.clientX-drag.x));
  const top=Math.max(8,Math.min((win?.innerHeight??768)-rect.height-8,drag.top+event.clientY-drag.y));
  element.style.inset='auto';element.style.margin='0';element.style.left=left+'px';element.style.top=top+'px';
 });
 listen(header,'pointerup',stopDrag);listen(header,'pointercancel',stopDrag);listen(header,'lostpointercapture',()=>{drag=undefined;});
 return {element,body,footer,setTitle(value:string){title.textContent=value;element.setAttribute('aria-label',value);},show(focus?:HTMLElement){if(disposed)return;if(!element.parentElement)root.append(element);if(!element.open){if(options.mode==='modal')element.showModal();else element.show();}focus?.focus();},destroy(){if(disposed)return;disposed=true;stopDrag();for(const remove of removals.splice(0))remove();if(element.open)element.close();element.remove();}};
}
