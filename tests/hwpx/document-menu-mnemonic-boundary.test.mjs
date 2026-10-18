import test from "node:test";
import assert from "node:assert/strict";
import {documentMenuMnemonic} from "../../web/preview/document-menu-mnemonic.mjs";
import {createDocumentMenuControls} from "../../web/preview/document-menu-controls.mjs";

test("menu mnemonic scopes nested focus and never intercepts select or editable input",()=>{
  const summary={},child={},popup={open:true,querySelector:()=>summary};
  const button={getAttribute:()=>"a",contains:target=>target===child||target?.tagName==="SELECT"||target?.isContentEditable};
  const key=target=>({key:"a",target});
  assert.equal(documentMenuMnemonic(key(child),popup,[button]),button);
  assert.equal(documentMenuMnemonic(key(summary),popup,[button]),button);
  for(const target of [{tagName:"SELECT"},{isContentEditable:true},{}])assert.equal(documentMenuMnemonic(key(target),popup,[button]),null);
  popup.open=false;assert.equal(documentMenuMnemonic(key(child),popup,[button]),null);
});

test("menu mnemonic accessibility metadata follows the same live data attribute",()=>{
  const attrs=new Map([["data-menu-key","a"]]),summary=new EventTarget();
  const popup=Object.assign(new EventTarget(),{open:true,querySelector:()=>summary});
  const button=Object.assign(new EventTarget(),{id:"menu-a",textContent:"실행",closest:()=>popup,
    getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)});
  let calls=0;
  const target={disabled:false,click:()=>calls++};
  const controller=createDocumentMenuControls([{button,target}]);
  const press=key=>{const event=Object.assign(new Event("keydown",{cancelable:true}),{key});Object.defineProperty(event,"target",{value:summary});popup.dispatchEvent(event);return event;};
  try{
    assert.equal(attrs.get("aria-keyshortcuts"),"A");
    attrs.set("data-menu-key","b");controller.refresh();assert.equal(attrs.get("aria-keyshortcuts"),"B");
    assert.equal(press("a").defaultPrevented,false);assert.equal(calls,0);
    assert.equal(press("b").defaultPrevented,true);assert.equal(calls,1);assert.equal(popup.open,false);
    for(const invalid of ["", "ab", " ", "한", "Control+b"]){
      popup.open=true;attrs.set("data-menu-key",invalid);controller.refresh();
      assert.equal(attrs.has("aria-keyshortcuts"),false);assert.equal(press("b").defaultPrevented,false);assert.equal(calls,1);
    }
    attrs.delete("data-menu-key");controller.refresh();assert.equal(attrs.has("aria-keyshortcuts"),false);
    target.disabled=true;attrs.set("data-menu-key","b");controller.refresh();
    assert.equal(press("b").defaultPrevented,false);assert.equal(calls,1);
  }finally{controller.close();}
});
