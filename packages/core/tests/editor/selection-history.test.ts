import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createEditor} from '../../src/editor/create-editor.ts';
import {SPLICE_TEXT_COMMAND,type SelectionTarget} from '../../src/commands/commands.ts';
import {EditorState} from '../../src/state/editor-state.ts';
import {SelectionHistory} from '../../src/state/selection-history.ts';
import {createReaderRuntimeFactory} from '../../src/runtime.ts';
function setup(){
 let revision=0,clock=0,cursor=0,history=[{revision:0,text:'AB'}];
 let inventory=true,clipped=false,owner='section:0:body';
 const e=createEditor({runtimeFactory:()=>({async request(m:any){
  if(m.kind==='load'){revision=0;clock=0;cursor=0;history=[{revision:0,text:'AB'}];}
  if(m.kind==='splice'){const text=history[cursor].text;history=history.slice(0,cursor+1);history.push({revision:++clock,text:text.slice(0,m.startUnit)+m.text+text.slice(m.endUnit)});cursor++;}
  if(m.kind==='undo')cursor=Math.max(0,cursor-1);
  if(m.kind==='redo')cursor=Math.min(history.length-1,cursor+1);
  revision=history[cursor].revision;
  return {kind:m.kind,content:{format:'hwpx',paragraphs:[{section:0,paragraph:0,text:history[cursor].text,editable:true,clipped,selectionOwner:owner}]},historyRevision:revision,...(inventory?{historyRevisions:[revision,...history.filter(row=>row.revision!==revision).map(row=>row.revision)]}:{}),meta:{application:'applied' as const,changed:true}};
 },dispose(){}})});
 const target=(start=0,end=start):SelectionTarget=>({...e.getEditorState().token,coordinateSpace:'display',format:'hwpx',owner:'section:0:body',section:0,paragraph:0,startUnit:start,endUnit:end,affinity:'forward'});
 const select=async(start=0)=>e.setSelection(target(start));
 const splice=async(text='X')=>{const result=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:e.getEditorState().selection as SelectionTarget,text});expect(result.status).toBe('committed-with-snapshot');};
 return {e,target,select,splice,open:()=>e.load(new Uint8Array([1]),{format:'hwpx'}),inventory:(value:boolean)=>{inventory=value;},clip:()=>{clipped=true;},foreignOwner:()=>{owner='foreign';}};
}
const unit=(e:ReturnType<typeof createEditor>)=>(e.getEditorState().selection as SelectionTarget|null|undefined)?.startUnit;
test('public undo/redo restores per-revision locations with fresh tokens; general mutation still clears',async()=>{
 const f=setup();try{await f.open();await f.select(0);const old=f.e.getEditorState().selection as SelectionTarget;
 await f.splice();expect(f.e.getEditorState().selection).toBeUndefined();await f.select(1);await f.splice('Y');await f.select(2);
 const revision=f.e.getEditorState().operationRevision;
 await f.e.undo();expect(unit(f.e)).toBe(1);expect(f.e.getEditorState().operationRevision).toBeGreaterThan(revision);
 await f.e.undo();expect(unit(f.e)).toBe(0);expect((f.e.getEditorState().selection as SelectionTarget).operationRevision).not.toBe(old.operationRevision);
 await expect(f.e.setSelection(old)).rejects.toThrow('StaleTarget');
 await f.e.redo();expect(unit(f.e)).toBe(1);await f.e.redo();expect(unit(f.e)).toBe(2);
 }finally{await f.e.dispose();}
});
test('undefined does not overwrite a known location; explicit null clears exactly that revision',async()=>{
 const f=setup();try{await f.open();await f.select(0);await f.splice();await f.select(1);await f.e.undo();expect(unit(f.e)).toBe(0);
 await f.e.redo();expect(unit(f.e)).toBe(1);await f.e.setSelection(null);await f.e.undo();await f.e.redo();expect(f.e.getEditorState().selection).toBeNull();
 }finally{await f.e.dispose();}
});
test('surface selection publication records canonical caret without storing a document model',async()=>{
 const f=setup();const lease=f.e.acquireInputSurface({commitComposition:()=> 'unchanged',cancelComposition(){}});
 try{await f.open();await lease.publishSelection(f.target(0));await f.splice();await lease.publishSelection(f.target(1));
 await f.e.undo();expect(unit(f.e)).toBe(0);await f.e.redo();expect(unit(f.e)).toBe(1);
 }finally{lease.release();await f.e.dispose();}
});
test('missing inventory and restored clipped/foreign-owner snapshots never guess a selection',async()=>{
 for(const failure of ['inventory','clipped','owner']){
 const f=setup();try{await f.open();await f.select(0);await f.splice();await f.select(1);
 if(failure==='inventory')f.inventory(false);else if(failure==='clipped')f.clip();else f.foreignOwner();
 await f.e.undo();expect(f.e.getEditorState().selection).toBeUndefined();
 }finally{await f.e.dispose();}}
});
test('new document/generation and editor instances do not inherit another revision zero selection',async()=>{
 const a=setup(),b=setup();try{await a.open();await a.select(1);await b.open();await b.select(0);await b.splice();await b.e.undo();expect(unit(b.e)).toBe(0);
 await a.open();
 // Do not publish any new selection: a cached revision zero from the old
 // document would otherwise be concealed by a replacement selection.
 const result=await a.e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:a.target(0),text:'X'});expect(result.status).toBe('committed-with-snapshot');
 await a.e.undo();expect(a.e.getEditorState().selection).toBeUndefined();
 }finally{await a.e.dispose();await b.e.dispose();}
});
function snapshot(revision:number,list:unknown,selection:unknown=undefined,patch:Record<string,unknown>={}){
 return new EditorState({editorId:'e',documentId:'d',generation:1,operationRevision:revision+1,viewRevision:revision+1,stateVersion:revision+1,status:'ready',nativeHistoryRevision:revision,nativeHistoryRevisions:list as number[],content:{format:'hwpx',paragraphs:[{section:0,paragraph:0,text:'AB',selectionOwner:'section:0:body'}]},selection,...patch});
}
function location(state:EditorState){return {...state.token,coordinateSpace:'display',format:'hwpx',owner:'section:0:body',section:0,paragraph:0,startUnit:1,endUnit:1,affinity:'forward'};}
test('pruning/branch eviction permanently forget removed locations; malformed inventories fail closed',()=>{
 const h=new SelectionHistory(),zero=snapshot(0,[0]);h.observe(snapshot(0,[0],location(zero)));h.observe(snapshot(1,[1,0]));
 expect(h.restore(snapshot(0,[0,1]))?.startUnit).toBe(1);
 expect(Object.keys(h.restore(snapshot(0,[0,1]))!).sort()).toEqual(['affinity','coordinateSpace','documentId','editorId','endUnit','format','generation','operationRevision','owner','paragraph','section','startUnit','viewRevision'].sort());
 h.observe(snapshot(2,[2,1]));expect(h.restore(snapshot(0,[0,1,2]))).toBeUndefined();
 for(const list of [undefined,[0,0],[0,-1],[0,'invalid'],[0,1.5],[0,0xffffffff],[1,0],[],[1]]){
 const h=new SelectionHistory();h.observe(snapshot(0,[0],location(zero)));h.observe(snapshot(0,list));expect(h.restore(snapshot(0,[0]))).toBeUndefined();
 }
 expect(()=>snapshot(0,[0,NaN])).toThrow('InvalidNumber');
 h.clear();expect(h.restore(snapshot(1,[1,2]))).toBeUndefined();
 const clean=new SelectionHistory();clean.observe(snapshot(0,[0],location(zero)));clean.observe(snapshot(0,[0],undefined,{status:'disposed'}));expect(clean.restore(zero)).toBeUndefined();
});
test('strict validation rejects out-of-range/scalar-split/foreign selections and revalidates restored text',()=>{
 for(const patch of [{endUnit:9},{owner:'foreign'},{format:'hwp5'},{operationRevision:999}]){
 const h=new SelectionHistory(),s=snapshot(0,[0]);h.observe(snapshot(0,[0],{...location(s),...patch}));expect(h.restore(s)).toBeUndefined();
 }
 const h=new SelectionHistory(),s=snapshot(0,[0]);h.observe(snapshot(0,[0],location(s)));
 expect(h.restore(snapshot(0,[0],undefined,{content:{format:'hwpx',paragraphs:[{section:0,paragraph:0,text:'',selectionOwner:'section:0:body'}]}}))).toBeUndefined();
 const emoji=snapshot(0,[0],undefined,{content:{format:'hwpx',paragraphs:[{section:0,paragraph:0,text:'😀',selectionOwner:'section:0:body'}]}});
 h.observe(snapshot(0,[0],location(emoji),{content:emoji.content}));expect(h.restore(emoji)).toBeUndefined();
});
const wasmPath=process.env.HWPJS_TEST_WASM;
for(const format of ['hwp5','hwpx'] as const)test.skipIf(!wasmPath)(`actual ${format} Native revisions restore public and surface selections across undo/redo, branch and bounded eviction`,async()=>{
 const wasm=readFileSync(wasmPath!),factory=createReaderRuntimeFactory({wasmModule:await WebAssembly.compile(wasm)}),e=createEditor({runtimeFactory:factory});
 console.log(JSON.stringify({selectionHistoryFixture:format,wasmSha256:createHash('sha256').update(wasm).digest('hex')}));
 const lease=e.acquireInputSurface({commitComposition:()=> 'unchanged',cancelComposition(){}});
 try{await e.load(readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format==='hwp5'?'hwp':'hwpx'}`),{format});
 const row=(e.getEditorState().content as any).paragraphs.find((r:any)=>r.editable&&r.text==='기울임진하게');expect(row).toBeDefined();
 const target=(at:number):SelectionTarget=>({...e.getEditorState().token,coordinateSpace:'display',format,owner:row.selectionOwner,section:row.section,paragraph:row.paragraph,startUnit:at,endUnit:at,affinity:'forward'});
 await e.setSelection(target(0));const initial=e.getEditorState().nativeHistoryRevision;
 const splice=async(text:string)=>{const r=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:e.getEditorState().selection as SelectionTarget,text});expect(r.status).toBe('committed-with-snapshot');expect(e.getEditorState().selection).toBeUndefined();};
 await splice('X');const first=e.getEditorState().nativeHistoryRevision;await lease.publishSelection(target(1));await splice('Y');const discarded=e.getEditorState().nativeHistoryRevision;await lease.publishSelection(target(2));
 await e.undo();expect(e.getEditorState().nativeHistoryRevision).toBe(first);expect(unit(e)).toBe(1);
 await e.undo();expect(e.getEditorState().nativeHistoryRevision).toBe(initial);expect(unit(e)).toBe(0);
 await e.redo();expect(unit(e)).toBe(1);await e.redo();expect(unit(e)).toBe(2);
 await e.undo();await splice('Z');expect(e.getEditorState().nativeHistoryRevisions).not.toContain(discarded);await lease.publishSelection(target(2));
 await e.undo();expect(unit(e)).toBe(1);await e.redo();expect(unit(e)).toBe(2);
 expect(e.getEditorState().nativeHistoryRevisions).not.toContain(discarded);
 // Existing reader runtime retains 16 checkpoints plus the current revision.
 // Exceed that real limit rather than simulating an eviction reply or changing policy.
 for(let i=0;i<18;i++){await lease.publishSelection(target(2));await splice('Q');}
 await lease.publishSelection(target(2));
 const reachable=e.getEditorState().nativeHistoryRevisions!;
 expect(reachable.length).toBeLessThanOrEqual(17);expect(reachable).not.toContain(initial);expect(reachable).not.toContain(discarded);
 for(let i=1;i<reachable.length;i++){await e.undo();expect(unit(e)).toBe(2);expect(e.getEditorState().nativeHistoryRevisions).not.toContain(initial);}
 const oldest=e.getEditorState().nativeHistoryRevision;await e.undo();expect(e.getEditorState().nativeHistoryRevision).toBe(oldest);expect(unit(e)).toBe(2);
 }finally{lease.release();await e.dispose();}
});
