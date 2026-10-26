// 공통 tracked 이벤트 fixture만 보완한다. 브라우저 레이아웃/Native/IME 증거가 아니다.
import {documentFixture as baseFixture,all,fire,type Element} from './formatting-dialog-test-dom.ts';
export {all,fire};
export function documentFixture(){
 const fixture=baseFixture(),{doc,root}=fixture;
 const events=new EventTarget();
 doc.addEventListener=events.addEventListener.bind(events);
 doc.removeEventListener=events.removeEventListener.bind(events);
 doc.dispatchEvent=events.dispatchEvent.bind(events);
 const decorate=(node:Element)=>{
  Object.defineProperty(node,'childElementCount',{get:()=>node.children.length});
  Object.assign(node,{
   removeAttribute(name:string){node.attributes.delete(name);},
   replaceChildren(...nodes:Element[]){for(const child of [...node.children])child.remove();node.textContent='';node.append(...nodes);},
  });
  return node;
 };
 const create=doc.createElement;
 doc.createElement=(tag:string)=>decorate(create(tag));
 decorate(root);
 return fixture;
}
