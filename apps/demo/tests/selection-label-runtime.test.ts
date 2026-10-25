import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createEditor,type HeadlessEditor,type SelectionTarget} from '@hwpjs/core';
import {createReaderRuntimeFactory} from '@hwpjs/core/runtime';

const root=fileURLToPath(new URL('../../../',import.meta.url));
let compiled:Promise<WebAssembly.Module>|undefined;
async function setup(t:TestContext){
 const wasmPath=process.env.HWPJS_TEST_WASM;
 if(!wasmPath){t.skip('명시적 HWPJS_TEST_WASM 필요');return;}
 let wasm:Uint8Array,fixture:Uint8Array;
 try{wasm=await readFile(wasmPath);fixture=await readFile(root+'legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('지정 WASM 또는 기존 charshape.hwpx fixture가 checkout에 없음');return;}throw error;}
 if(process.env.HWPJS_TEST_WASM_SHA256)assert.equal(createHash('sha256').update(wasm).digest('hex'),process.env.HWPJS_TEST_WASM_SHA256);
 compiled??=WebAssembly.compile(wasm);
 // fixture 부재로 skip할 때 앱 실행 모듈을 요구하지 않습니다. Native 응답을 모사하지 않습니다.
 const {selectionStatusLabel}=await import('../src/demo-controller.ts');
 const editor=createEditor({runtimeFactory:createReaderRuntimeFactory({wasmModule:await compiled})});
 return {editor,fixture,label:()=>selectionStatusLabel(editor.getEditorState())};
}
function target(editor:HeadlessEditor,start=0,end=1):SelectionTarget{
 const state=editor.getEditorState();
 const content=state.content as {paragraphs:{section:number;paragraph:number;selectionOwner:string}[]};
 const row=content.paragraphs.find(p=>p.section===0&&p.paragraph===2);assert(row);
 return {...state.token,format:'hwpx',coordinateSpace:'display',owner:row.selectionOwner,section:0,paragraph:2,startUnit:start,endUnit:end,affinity:'forward'};
}

test('공개 선택이 없으면 문서를 열기 전후 모두 선택 없음',async t=>{
 const s=await setup(t);if(!s)return;try{
  assert.equal(s.label(),'선택 없음');await s.editor.load(s.fixture,{format:'hwpx',editable:true});assert.equal(s.editor.getEditorState().selection,undefined);assert.equal(s.label(),'선택 없음');
 }finally{await s.editor.dispose();}
});
test('실제 caret 선택을 커서 위치로 표시',async t=>{
 const s=await setup(t);if(!s)return;try{
  await s.editor.load(s.fixture,{format:'hwpx',editable:true});await s.editor.setSelection(target(s.editor,0,0));assert(s.editor.getEditorState().selection);assert.equal(s.label(),'커서 위치');
 }finally{await s.editor.dispose();}
});
test('실제 범위 선택을 표시하고 선택 해제를 즉시 반영',async t=>{
 const s=await setup(t);if(!s)return;try{
  await s.editor.load(s.fixture,{format:'hwpx',editable:true});await s.editor.setSelection(target(s.editor));assert.equal(s.label(),'텍스트 선택');await s.editor.setSelection(null);assert.equal(s.label(),'선택 없음');
 }finally{await s.editor.dispose();}
});
test('readonly 문서의 실제 범위 선택도 선택 존재로 표시',async t=>{
 const s=await setup(t);if(!s)return;try{
  await s.editor.load(s.fixture,{format:'hwpx',editable:false});assert.equal((s.editor.getEditorState().content as {readOnly:boolean}).readOnly,true);await s.editor.setSelection(target(s.editor));assert.equal(s.label(),'텍스트 선택');
 }finally{await s.editor.dispose();}
});
test('실제 문서 교체 시 이전 선택을 표시하거나 재사용하지 않음',async t=>{
 const s=await setup(t);if(!s)return;try{
  await s.editor.load(s.fixture,{format:'hwpx',editable:true});const oldTarget=target(s.editor);await s.editor.setSelection(oldTarget);const oldDocument=s.editor.getEditorState().documentId;assert.equal(s.label(),'텍스트 선택');
  await s.editor.load(s.fixture,{format:'hwpx',editable:true});assert.notEqual(s.editor.getEditorState().documentId,oldDocument);assert.equal(s.editor.getEditorState().selection,undefined);assert.equal(s.label(),'선택 없음');await assert.rejects(s.editor.setSelection(oldTarget),/StaleTarget/);assert.equal(s.label(),'선택 없음');
 }finally{await s.editor.dispose();}
});
