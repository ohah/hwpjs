import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {createEditor,getSelectionFormatting,SET_CHARACTER_TEXT_COLOR_COMMAND,type HeadlessEditor,type SelectionTarget} from '../src/index.ts';
import {createReaderRuntimeFactory} from '../src/runtime.ts';
// @ts-ignore Existing independent raw CFB source expectation, not product decoding.
import {verifyCharacterProperties} from '../../../tests/hwp5/style-preservation/character-property-oracle.mjs';

type Format='hwp5'|'hwpx';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
let compiled:Promise<WebAssembly.Module>|undefined;
// Tests require an explicit engine. Missing inputs are reported as skips, never positive evidence.
async function setup(t:TestContext,format:Format){
 const path=process.env.HWPJS_TEST_WASM;
 if(!path){t.skip('명시적 HWPJS_TEST_WASM 필요: 실제 Native 검증 미실행');return;}
 let wasm:Uint8Array,bytes:Uint8Array;
 try{wasm=await readFile(path);bytes=await readFile(root+'legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.'+(format==='hwp5'?'hwp':'hwpx'));}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('지정 WASM 또는 기존 strikethrough fixture 없음: 실제 Native 검증 미실행');return;}throw error;}
 if(process.env.HWPJS_TEST_WASM_SHA256)assert.equal(hash(wasm),process.env.HWPJS_TEST_WASM_SHA256);
 compiled??=WebAssembly.compile(wasm);
 const trace:string[]=[],factory=createReaderRuntimeFactory({wasmModule:await compiled});
 const editor=createEditor({runtimeFactory:async()=>{const runtime=await factory();return{request:(m,c)=>{trace.push(m.kind);return runtime.request(m,c);},dispose:()=>runtime.dispose()};}});
 return {editor,trace,bytes,wasm};
}
function target(e:HeadlessEditor,start=0,end=2):SelectionTarget{
 const s=e.getEditorState(),c=s.content as {format:Format;paragraphs:{section:number;paragraph:number;selectionOwner:string}[]};
 const row=c.paragraphs.find(p=>p.section===0&&p.paragraph===1);assert(row);
 return {...s.token,format:c.format,coordinateSpace:'display',owner:row.selectionOwner,section:0,paragraph:1,startUnit:start,endUnit:end,affinity:'forward'};
}
async function select(e:HeadlessEditor,start=0,end=2){await e.setSelection(target(e,start,end));return getSelectionFormatting(e.getEditorState());}
async function save(e:HeadlessEditor){return (await e.save({allowStaleLayout:true})).bytes;}
async function apply(e:HeadlessEditor,color:string,start=0,end=2){return e.dispatchCommand(SET_CHARACTER_TEXT_COLOR_COMMAND,{target:target(e,start,end),color});}
function oracle(t:TestContext,before:Uint8Array,after:Uint8Array,format:Format,start=0,end=2){
 // This proves the engine intent/raw-byte contract, not Office/Hangul displayed-color equivalence.
 if(format==='hwp5'){assert(verifyCharacterProperties(before,after,{section:0,paragraph:1,startUnit:start,endUnit:end,properties:{textColor:0x123456}}));return;}
 const request={before:Buffer.from(before).toString('base64'),after:Buffer.from(after).toString('base64'),section:0,localParagraph:1,startUnit:start,endUnit:end,properties:{textColor:0x123456}};
 for(const flags of [[],['-O']]){
  const p=spawnSync('python3',[...flags,root+'tools/hwpx-character-property-oracle.py'],{input:JSON.stringify(request),encoding:'utf8'});
  if(p.error&&(p.error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('독립 HWPX XML oracle에 Python3 필요: oracle 검증 미실행');return;}
  assert.equal(p.status,0,p.stderr||p.stdout);
 }
}
async function unknownInput(t:TestContext,wasm:Uint8Array,bytes:Uint8Array,format:Format):Promise<Uint8Array|undefined>{
 if(format==='hwp5'){
  // Control input only: mutate the documented raw source color slot; no writer policy is duplicated.
  // @ts-ignore Existing CFB container adapter.
  const {createCfbReader}=await import('../../../js/cfb.mjs');
  // @ts-ignore Existing independent record-boundary oracle.
  const {records}=await import('../../../tests/hwp5/style-preservation/text-record-oracle.mjs');
  const cfb=await createCfbReader(wasm);
  try{cfb.parse(bytes,{strict:true});const nodes=cfb.document().nodes,entry=nodes.find((n:any)=>n.parent===0&&n.name==='DocInfo');assert(entry);const info=inflateRawSync(entry.content);for(const row of records(info).filter((r:any)=>r.tag===21))info.writeUInt32LE(0xffffffff,row.start+row.raw.length-row.payload.length+52);return cfb.write({nodes:nodes.map((n:any)=>n===entry?{...n,content:deflateRawSync(info)}:n)});}finally{cfb.close();}
 }
 const p=spawnSync('python3',['-c',`import io,re,sys,zipfile
src=io.BytesIO(sys.stdin.buffer.read());dst=io.BytesIO()
with zipfile.ZipFile(src) as a,zipfile.ZipFile(dst,'w') as b:
 for n in a.infolist():
  data=a.read(n.filename)
  if n.filename=='Contents/header.xml':data=re.sub(rb'textColor="[^"]*"',b'textColor="UNSUPPORTED"',data)
  b.writestr(n,data)
sys.stdout.buffer.write(dst.getvalue())`],{input:bytes,maxBuffer:8*1024*1024});
 if(p.error&&(p.error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('unknown HWPX 제어 입력에 Python3 필요: 실제 Native 검증 미실행');return;}
 assert.equal(p.status,0,p.stderr.toString());return p.stdout;
}
for(const format of ['hwp5','hwpx'] as const){
 test(`${format}: typed 글자색·독립 저장·history·새 load 재열기`,async t=>{
  const s=await setup(t,format);if(!s)return;const {editor:e,bytes}=s;
  try{await e.load(bytes,{format,editable:true});assert.equal((await select(e)).textColor,'#000000');const before=await save(e);assert.equal((await apply(e,'#123456')).status,'committed-with-snapshot');assert.equal(getSelectionFormatting(e.getEditorState()).textColor,'#123456');const after=await save(e);oracle(t,before,after,format);await e.undo();assert.equal(hash(await save(e)),hash(before));await e.redo();assert.equal(hash(await save(e)),hash(after));await e.load(after,{format,editable:true});assert.equal((await select(e)).textColor,'#123456');}finally{await e.dispose();}
 });
 test(`${format}: 유효 unknown 원본색은 null 조회·명시 색 교체·이력 허용`,async t=>{
  const s=await setup(t,format);if(!s)return;const {editor:e,bytes,wasm,trace}=s;
  try{const input=await unknownInput(t,wasm,bytes,format);if(!input)return;await e.load(input,{format,editable:true});const f=await select(e);assert.equal(f.textColor,null);assert.equal(f.textColorAvailableReason,null);const before=await save(e);assert.equal((await apply(e,'#123456')).status,'committed-with-snapshot');const after=await save(e);oracle(t,before,after,format);assert.equal(trace.filter(k=>k==='character-text-color').length,1);await e.undo();assert.equal(hash(await save(e)),hash(before));assert.equal((await select(e)).textColor,null);await e.redo();assert.equal(hash(await save(e)),hash(after));await e.load(after,{format,editable:true});assert.equal((await select(e)).textColor,'#123456');}finally{await e.dispose();}
 });
 test(`${format}: readonly 색 명령은 Native 요청 없이 거부`,async t=>{
  const s=await setup(t,format);if(!s)return;const {editor:e,trace,bytes}=s;
  try{await e.load(bytes,{format,editable:false});assert.equal((await select(e)).textColorAvailableReason,'SelectionNotEditable');const revision=e.getEditorState().operationRevision,count=trace.filter(k=>k==='character-text-color').length;const r=await apply(e,'#123456');assert.equal(r.status,'rejected-unapplied');assert.equal(r.error,'ReadOnlyDocument');assert.equal(e.getEditorState().operationRevision,revision);assert.equal(trace.filter(k=>k==='character-text-color').length,count);}finally{await e.dispose();}
 });
 test(`${format}: invalid 새 색·stale target 거부와 기존 redo 보존`,async t=>{
  const s=await setup(t,format);if(!s)return;const {editor:e,trace,bytes}=s;
  try{await e.load(bytes,{format,editable:true});await select(e);const before=await save(e);for(const value of ['', 'red','#fff','#12345678',0,null,undefined]){const r=await apply(e,value as unknown as string);assert.equal(r.error,'InvalidCharacterColor');assert.equal(r.status,'rejected-unapplied');}assert.equal(trace.filter(k=>k==='character-text-color').length,0);assert.equal(hash(await save(e)),hash(before));const stale=target(e);await apply(e,'#123456');const after=await save(e),count=trace.filter(k=>k==='character-text-color').length;const rejected=await e.dispatchCommand(SET_CHARACTER_TEXT_COLOR_COMMAND,{target:stale,color:'#654321'});assert.equal(rejected.error,'StaleTarget');assert.equal(trace.filter(k=>k==='character-text-color').length,count);await e.undo();await select(e);assert.equal((await apply(e,'')).error,'InvalidCharacterColor');await e.redo();assert.equal(hash(await save(e)),hash(after));}finally{await e.dispose();}
 });
 test(`${format}: known 혼합 조회와 unknown 혼합 조회를 구분`,async t=>{
  const s=await setup(t,format);if(!s)return;const {editor:e,bytes,wasm}=s;
  try{for(const unknown of [false,true]){const input=unknown?await unknownInput(t,wasm,bytes,format):bytes;if(!input)return;await e.load(input,{format,editable:true});await select(e,0,1);assert.equal((await apply(e,'#123456',0,1)).status,'committed-with-snapshot');const after=await save(e);oracle(t,input,after,format,0,1);const f=await select(e);assert.equal(f.textColor,unknown?null:'mixed');assert.equal(f.textColorAvailableReason,null);await e.load(after,{format,editable:true});assert.equal((await select(e)).textColor,unknown?null:'mixed');}}finally{await e.dispose();}
 });
}
