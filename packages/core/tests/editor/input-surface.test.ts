import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { SPLICE_TEXT_COMMAND } from '../../src/commands/commands.ts';
import type { EditorRuntime, RuntimeMessage } from '../../src/contracts.ts';
import type { InputSurfaceHooks } from '../../src/host-contracts.ts';

function deferred<T=void>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
async function bounded<T>(promise:Promise<T>):Promise<T>{let timeout:ReturnType<typeof setTimeout>;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('Deadlock')),1000);})]);}finally{clearTimeout(timeout!);}}
async function until(check:()=>boolean){for(let i=0;i<40;i++){if(check())return;await Promise.resolve();}assert.fail('operation did not start');}
function fixture(){
 let text='A\ufffcB',revision=0,closed=0;const messages:RuntimeMessage[]=[];let gate:Promise<void>|undefined;
 const snapshot=()=>({format:'hwp5',paragraphs:[{section:0,paragraph:0,text,editable:true,selectionOwner:'section:0:body',sourceOffsets:[{at:0,source:0},{at:2,source:9}]}]});
 const runtime:EditorRuntime={async request(message){messages.push(structuredClone(message));if(message.kind==='load'||message.kind==='enable')return {kind:message.kind,content:snapshot(),historyRevision:revision};
  if(['picture-bytes','table-background-bytes','chart-display','query-edit-range','query-split-range'].includes(message.kind))return {kind:message.kind,bytes:new Uint8Array([7]),requestId:message.requestId,allowed:true,meta:{application:'unapplied',changed:false}};
  if(message.kind==='save')return {kind:'save',bytes:new TextEncoder().encode(text)};
  if(message.kind==='splice'){text+='X';revision++;await gate;return {kind:'splice',content:snapshot(),historyRevision:revision,meta:{application:'applied',changed:true}};}
  if(message.kind==='undo'||message.kind==='redo'){revision++;return {kind:message.kind,content:snapshot(),historyRevision:revision,meta:{application:'applied',changed:true}};}
  return {kind:message.kind,error:'Unsupported',applied:false};
 },dispose(){closed++;}};
 return {runtime,messages,get closed(){return closed;},setGate(value:Promise<void>){gate=value;}};
}
async function opened(){const f=fixture();const e=createEditor({runtimeFactory:()=>f.runtime});await e.load(new Uint8Array([1]),{format:'hwp5'});return {e,f};}
const hooks=(overrides:Partial<InputSurfaceHooks>={}):InputSurfaceHooks=>({commitComposition:()=> 'unchanged',cancelComposition:()=>{},...overrides});
const raw=(e:ReturnType<typeof createEditor>)=>({token:e.getEditorState().token,coordinates:'legacy-native' as const});
const target=(e:ReturnType<typeof createEditor>)=>({...e.getEditorState().token,format:'hwp5' as const,coordinateSpace:'display' as const,owner:'section:0:body',section:0,paragraph:0,startUnit:2,endUnit:3,affinity:'forward' as const});

test('one lease per editor, release is idempotent and cannot release a successor or dispose an external editor',async()=>{
 const {e,f}=await opened();const reasons:string[]=[];const first=e.acquireInputSurface(hooks({cancelComposition:r=>reasons.push(r)}));
 assert.throws(()=>e.acquireInputSurface(hooks()),/InputSurfaceAlreadyAttached/);first.release();first.release();assert.deepEqual(reasons,['detach']);assert.equal(f.closed,0);
 const second=e.acquireInputSurface(hooks());assert.ok(second.generation>first.generation);first.release();assert.equal(second.isActive(),true);assert.equal(first.isActive(),false);
 await assert.rejects(first.request({kind:'splice',startUnit:9,endUnit:10,text:'X'},raw(e)),/InputSurfaceDetached/);assert.equal(f.messages.filter(m=>m.kind==='splice').length,0);
 await e.dispose();assert.equal(second.isActive(),false);assert.equal(f.closed,1);
});

test('queued detached lease never enters Native; late applied work preserves Core state but suppresses detached ack',async()=>{
 const {e,f}=await opened();const lease=e.acquireInputSurface(hooks());const gate=deferred();f.setGate(gate.promise);
 const first=lease.request({kind:'splice',section:0,paragraph:0,startUnit:9,endUnit:10,text:'X'},raw(e));const detached=assert.rejects(first,/InputSurfaceDetached/);
 await until(()=>f.messages.some(m=>m.kind==='splice'));const second=lease.request({kind:'splice',startUnit:0,endUnit:0,text:'Y'},raw(e));const dropped=assert.rejects(second,/InputSurfaceDetached/);
 const before=e.getEditorState().operationRevision;lease.release();const successor=e.acquireInputSurface(hooks());gate.resolve();await detached;await dropped;
 assert.ok(e.getEditorState().operationRevision>before);assert.equal(e.getEditorState().status,'ready');assert.equal(f.messages.filter(m=>m.kind==='splice').length,1);assert.equal(successor.isActive(),true);await e.dispose();
});

test('legacy-native splice is not display-mapped again; resources and permission queries are canonical reads',async()=>{
 const {e,f}=await opened();const lease=e.acquireInputSurface(hooks());const before=e.getEditorState().operationRevision;
 for(const kind of ['picture-bytes','table-background-bytes','chart-display','query-edit-range','query-split-range']){
 const r=await lease.request({kind,requestId:4,section:0,paragraph:0,startUnit:9,endUnit:10},raw(e));assert.equal('kind' in r?r.kind:null,kind);}
 assert.equal(e.getEditorState().operationRevision,before);
 await lease.request({kind:'splice',section:0,paragraph:0,startUnit:9,endUnit:10,text:'X'},raw(e));
 const message=f.messages.find(m=>m.kind==='splice')!;assert.equal(message.startUnit,9);assert.equal(message.endUnit,10);
 await assert.rejects(lease.request({kind:'query-not-a-real-operation'},raw(e)),/UnsupportedSurfaceOperation/);
 await assert.rejects(lease.request({kind:'load',bytes:new Uint8Array([1])},raw(e)),/UnsupportedSurfaceOperation/);
 await assert.rejects(lease.request({kind:'splice'},{...raw(e),coordinates:'display' as any}),/InvalidSurfaceCoordinates/);await e.dispose();
});

test('blocked composition rejects every external document operation without reaching Native',async()=>{
 const {e,f}=await opened();e.acquireInputSurface(hooks({commitComposition:()=> 'blocked'}));const before=f.messages.length;
 for(const operation of [()=>e.save(),()=>e.undo(),()=>e.redo(),()=>e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:target(e),text:'X'}),()=>e.load(new Uint8Array([2]),{format:'hwp5'}),()=>e.update(()=>{})])await assert.rejects(operation(),/CompositionBlocked/);
 assert.equal(f.messages.length,before);await e.dispose();
});

test('barrier is before Native queue: self input ack unlocks external save; implicit token captured after flush',async()=>{
 const {e,f}=await opened();let lease:ReturnType<typeof e.acquireInputSurface>;let flushed=false;
 lease=e.acquireInputSurface(hooks({commitComposition:async()=>{if(flushed)return 'unchanged' as const;flushed=true;await lease.request({kind:'splice',section:0,paragraph:0,startUnit:9,endUnit:10,text:'X'},raw(e));return 'committed' as const;}}));
 const original=e.getEditorState().operationRevision;const saved=await bounded(e.save());assert.ok(saved.operationRevision>original);assert.equal(saved.operationRevision,e.getEditorState().operationRevision);
 assert.deepEqual(f.messages.slice(2).map(m=>m.kind),['splice','save']);await e.dispose();
});

test('pending self ack can settle barrier; external FIFO survives blocked/slow admission and explicit stale tokens reject',async()=>{
 const {e,f}=await opened();const gate=deferred();f.setGate(gate.promise);let pending:Promise<unknown>|undefined;
 const lease=e.acquireInputSurface(hooks({commitComposition:async()=>{await pending;return 'committed' as const;}}));const stale=e.getEditorState().token;
 pending=lease.request({kind:'splice',section:0,paragraph:0,startUnit:9,endUnit:10,text:'X'},raw(e));await until(()=>f.messages.some(m=>m.kind==='splice'));
 const save=e.save(),undo=e.undo(),redo=e.redo();gate.resolve();await bounded(Promise.all([pending,save,undo,redo]));
 assert.deepEqual(f.messages.slice(2).map(m=>m.kind),['splice','save','undo','redo']);
 await assert.rejects(e.save({token:stale}),/StaleTarget/);const result=await e.undo(stale);assert.equal(result.status,'rejected-unapplied');assert.equal(result.error,'StaleTarget');await e.dispose();
});

test('detach rejects a pending barrier and old selection publication cannot clear the new lease selection',async()=>{
 const {e}=await opened();const never=deferred<'unchanged'>();const first=e.acquireInputSurface(hooks({commitComposition:()=>never.promise}));
 const save=e.save();const failed=assert.rejects(save,/InputSurfaceDetached/);await Promise.resolve();first.release();const second=e.acquireInputSurface(hooks());
 await second.publishSelection(target(e));const selected=e.getEditorState().selection;first.release();assert.equal(e.getEditorState().selection,selected);
 await assert.rejects(first.publishSelection(null),/InputSurfaceDetached/);await failed;never.resolve('unchanged');await e.dispose();
});

test('read-resource port does not flush composition or fake a mutation; classification cannot be overridden',async()=>{
 const {e,f}=await opened();let commits=0;e.acquireInputSurface(hooks({commitComposition:()=>{commits++;return 'blocked';}}));const revision=e.getEditorState().operationRevision;
 const reply=await e.readResource({kind:'picture-bytes',section:0,pictureNode:1});assert.equal(reply.kind,'picture-bytes');assert.equal(commits,0);assert.equal(e.getEditorState().operationRevision,revision);
 assert.throws(()=>e.requestExperimental({kind:'picture-bytes'},{mutation:true,token:e.getEditorState().token}),/OperationClassificationMismatch/);
 await assert.rejects(e.readResource({kind:'splice',text:'X'}),/UnsupportedReadOperation/);assert.equal(f.messages.filter(m=>m.kind==='splice').length,0);await e.dispose();
});

test('load cancels composition explicitly after settlement; dispose cancels and releases barriers without waiting on a hook forever',async()=>{
 const first=fixture(),second=fixture(),pool=[first,second];const e=createEditor({runtimeFactory:()=>pool.shift()!.runtime});await e.load(new Uint8Array([1]),{format:'hwp5'});const reasons:string[]=[];
 const lease=e.acquireInputSurface(hooks({cancelComposition:r=>reasons.push(r)}));await e.load(new Uint8Array([2]),{format:'hwp5'});assert.deepEqual(reasons,['load']);assert.equal(lease.isActive(),true);
 lease.release();const never=deferred<'unchanged'>();e.acquireInputSurface(hooks({commitComposition:()=>never.promise,cancelComposition:r=>reasons.push(r)}));
 const save=e.save();const failed=assert.rejects(save,/EditorDisposed/);await Promise.resolve();await bounded(e.dispose());await failed;assert.equal(reasons.at(-1),'dispose');never.resolve('unchanged');
});

test('lease rejects stale document/revision/view tokens and snapshots messages immediately',async()=>{
 const {e,f}=await opened();const lease=e.acquireInputSurface(hooks());const start=f.messages.length;
 for(const patch of [{editorId:'foreign'},{documentId:'other'},{generation:99},{operationRevision:99},{viewRevision:99}])await assert.rejects(lease.request({kind:'splice',text:'X'},{...raw(e),token:{...e.getEditorState().token,...patch}}),/StaleTarget/);
 assert.equal(f.messages.length,start);
 const message={kind:'splice',section:0,paragraph:0,startUnit:9,endUnit:10,text:'X'};const options=raw(e);const pending=lease.request(message,options);message.startUnit=999;options.token={...options.token,generation:999};
 await pending;assert.equal(f.messages.at(-1)!.startUnit,9);await e.dispose();
});

test('canonical table/list owner is shared by published selection and typed splice; unknown nested owners have no fallback',async()=>{
 const f=fixture();const original=f.runtime.request;
 f.runtime.request=async(m,c)=>{const reply=await original(m,c);if(reply.content){reply.content={format:'hwp5',paragraphs:[{section:0,paragraph:0,text:'cell',editable:true,selectionOwner:'section:0:body',tableCell:{tableNode:7,listNode:8},currentReference:{id:17}},{section:0,paragraph:1,text:'header',editable:true,selectionOwner:null,headerFooter:{sourceNode:5}}]};}return reply;};
 const e=createEditor({runtimeFactory:()=>f.runtime});await e.load(new Uint8Array([1]),{format:'hwp5'});const lease=e.acquireInputSurface(hooks());const cell={...target(e),owner:'section:0:table:7:list:8',startUnit:0,endUnit:1};
 await lease.publishSelection(cell);assert.equal((e.getEditorState().selection as any).owner,cell.owner);
 const bad=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:{...cell,owner:'section:0:body'},text:'X'});assert.equal(bad.status,'rejected-unapplied');
 const result=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:cell,text:'X'});assert.equal(result.status,'committed-with-snapshot');assert.deepEqual(f.messages.at(-1)!.reference,{id:17});
 const count=f.messages.length;const header={...target(e),paragraph:1,owner:'section:0:header:5',startUnit:0,endUnit:1};
 await assert.rejects(lease.publishSelection(header),/InvalidSelectionOwner/);assert.equal((await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:header,text:'X'})).status,'rejected-unapplied');assert.equal(f.messages.length,count);await e.dispose();
});

test('read-only canonical selection can publish but cannot enter typed mutation',async()=>{
 const f=fixture();const original=f.runtime.request;f.runtime.request=async(m,c)=>{const reply=await original(m,c);if(reply.content)(reply.content as any).paragraphs[0].editable=false;return reply;};
 const e=createEditor({runtimeFactory:()=>f.runtime});await e.load(new Uint8Array([1]),{format:'hwp5'});const lease=e.acquireInputSurface(hooks());await lease.publishSelection(target(e));
 const result=await e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:target(e),text:'X'});assert.equal(result.error,'SelectionNotEditable');assert.equal(f.messages.filter(m=>m.kind==='splice').length,0);await e.dispose();
});

test('cancelLoad interrupts admission before any candidate Native entry and does not detach input',async()=>{
 const {e,f}=await opened();const blocked=deferred<'unchanged'>();const lease=e.acquireInputSurface(hooks({commitComposition:()=>blocked.promise}));
 const count=f.messages.length;const load=e.load(new Uint8Array([2]),{format:'hwp5'});const cancelled=assert.rejects(load,/LoadCancelled/);await Promise.resolve();await bounded(e.cancelLoad());await cancelled;
 assert.equal(f.messages.length,count);assert.equal(lease.isActive(),true);blocked.resolve('unchanged');await e.dispose();
});

test('view operations refresh the observation epoch without a mutation revision or mutation listener',async()=>{
 const {e,f}=await opened();const original=f.runtime.request;f.runtime.request=async(m,c)=>m.kind==='set-edit-window'?{kind:m.kind,content:{format:'hwp5',window:{offset:0,count:1},paragraphs:[]},meta:{application:'unapplied',changed:false}}:original(m,c);
 const lease=e.acquireInputSurface(hooks());const old=e.getEditorState();let updates=0;e.registerUpdateListener(()=>{updates++;});
 await lease.request({kind:'set-edit-window',offset:0,count:1},raw(e));assert.equal(e.getEditorState().operationRevision,old.operationRevision);assert.ok(e.getEditorState().viewRevision>old.viewRevision);assert.equal(updates,0);
 const calls=f.messages.length;await assert.rejects(lease.request({kind:'picture-bytes'},{coordinates:'legacy-native',token:old.token}),/StaleTarget/);assert.equal(f.messages.length,calls);await e.dispose();
});

test('hook rejection does not poison external FIFO; explicit typed targets cannot be rebased by a composing flush',async()=>{
 const {e,f}=await opened();let first=true,committed=false;let lease:ReturnType<typeof e.acquireInputSurface>;
 lease=e.acquireInputSurface(hooks({commitComposition:async()=>{if(first){first=false;throw Error('HookFailure');}if(!committed){committed=true;await lease.request({kind:'splice',section:0,paragraph:0,startUnit:9,endUnit:10,text:'X'},raw(e));return 'committed' as const;}return 'unchanged' as const;}}));
 const before=f.messages.length;const rejected=assert.rejects(e.save(),/HookFailure/);const explicit=target(e);const typed=e.dispatchCommand(SPLICE_TEXT_COMMAND,{target:explicit,text:'Y'});
 await rejected;const answer=await bounded(typed);assert.equal(answer.status,'rejected-unapplied');assert.equal(answer.error,'StaleTarget');assert.deepEqual(f.messages.slice(before).map(m=>m.kind),['splice']);
 await bounded(e.save());assert.equal(f.messages.at(-1)!.kind,'save');await e.dispose();
});

test('replace cancellation hook failure rejects load with no candidate factory/Native execution',async()=>{
 const {e,f}=await opened();const before=f.messages.length;e.acquireInputSurface(hooks({cancelComposition:reason=>{if(reason==='load')throw Error('CannotCancel');}}));
 await assert.rejects(e.load(new Uint8Array([2]),{format:'hwp5'}),/CannotCancel/);assert.equal(f.messages.length,before);assert.equal(e.getEditorState().status,'ready');await e.dispose();
});

test('readonly resources in-flight do not acknowledge after Core disposal',async()=>{
 const {e,f}=await opened();const original=f.runtime.request;const gate=deferred(),entered=deferred();f.runtime.request=async(m,c)=>{const reply=await original(m,c);if(m.kind==='picture-bytes'){entered.resolve();await gate.promise;}return reply;};
 const pending=e.readResource({kind:'picture-bytes'},{token:e.getEditorState().token});const denied=assert.rejects(pending,/EditorDisposed/);await entered.promise;const closing=e.dispose();assert.equal(f.closed,0);gate.resolve();await denied;await bounded(closing);assert.equal(f.closed,1);
});
