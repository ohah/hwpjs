import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from '../../src/editor/create-editor.ts';
import {SET_CHARACTER_PROPERTIES_COMMAND as CHAR,SET_PARAGRAPH_ALIGNMENT_COMMAND as ALIGN} from '../../src/commands/commands.ts';
async function setup(patch:any={},rowPatch:any={},failure=false){
 const calls:any[]=[];
 const content={format:'hwp5',characterPropertiesAvailable:true,paragraphAlignmentAvailable:true,paragraphs:[{section:0,paragraph:0,text:'A😀B',editable:true,selectionOwner:'section:0:body',currentReference:{kind:'original',section:0,id:'99'},...rowPatch}],...patch};
 const e=createEditor({runtimeFactory:()=>({async request(m:any){calls.push(m);return m.kind==='load'||m.kind==='enable'||m.kind==='refresh'?{kind:m.kind,content}:failure?{kind:m.kind,error:'SnapshotFailure',applied:true}:{kind:m.kind,content,meta:{application:'applied',changed:true}};},dispose(){}})});
 await e.load(new Uint8Array([1]),{format:'hwp5'});
 const target={...e.getEditorState().token,coordinateSpace:'display' as const,format:'hwp5' as const,section:0,paragraph:0,owner:'section:0:body',startUnit:0,endUnit:1,affinity:'forward' as const};
 return {e,calls,target};
}
test('typed formatting rejects invalid target, unknown capabilities and properties before runtime',async()=>{
 const cases:any[]=[ [{characterPropertiesAvailable:undefined},{},{},'FormattingCapabilityUnavailable'],[{characterPropertiesAvailable:'true'},{},{},'FormattingCapabilityUnavailable'],[{}, {currentReference:{kind:'generated',section:0,id:'1'}},{},'UnsupportedFormattingReference'],[{}, {currentReference:undefined},{},'UnsupportedFormattingReference'],[{}, {},{owner:'other'},'InvalidSelectionOwner'],[{}, {},{startUnit:2,endUnit:3},'InvalidScalarBoundary'],[{}, {},{endUnit:0},'EmptyCharacterSelection'],[{}, {},{viewRevision:999},'StaleTarget'],[{}, {},{paragraph:-1},'InvalidTextPosition'] ];
 for(const [patch,row,change,error] of cases){const {e,calls,target}=await setup(patch,row);try{const count=calls.length;const r=await e.dispatchCommand(CHAR,{target:{...target,...change},properties:{bold:true}});assert.equal(r.error,error);assert.equal(r.status,'rejected-unapplied');assert.equal(calls.length,count);}finally{await e.dispose();}}
 const {e,calls,target}=await setup();try{
 const n=calls.length;
 assert.equal((await e.dispatchCommand(CHAR,{target,properties:{unknown:true} as any})).error,'InvalidCharacterProperties');
 assert.equal((await e.dispatchCommand(ALIGN,{target,alignment:'UNKNOWN'})).error,'InvalidParagraphAlignment');assert.equal(calls.length,n);
 }finally{await e.dispose();}
});
test('paragraph collapsed allowed; source ordinal is preserved, applied failure fences both commands',async()=>{
 for(const character of [true,false]){const {e,calls,target}=await setup({}, {},true);try{
 const r=character?await e.dispatchCommand(CHAR,{target,properties:{bold:true}}):await e.dispatchCommand(ALIGN,{target:{...target,endUnit:0},alignment:'CENTER'});
 assert.equal(r.status,'committed-refresh-required');assert.equal(calls.at(-1).paragraph,0);assert.equal(calls.at(-1).reference,undefined);
 assert(r.state.operationRevision>target.operationRevision);
 const again=await e.dispatchCommand(ALIGN,{target:{...target,...r.state.token},alignment:'LEFT'});assert.equal(again.error,'RefreshRequired');
 const revision=r.state.operationRevision;await e.refresh();assert.equal(e.getEditorState().operationRevision,revision);
 }finally{await e.dispose();}}
});

test('paragraph permits anchor-spanning selection while character rejects protected mapping',async()=>{
 const {e,target}=await setup({}, {text:'AB',sourceOffsets:[{at:0,source:0},{at:1,source:8}]});
 try{
 const range={...target,endUnit:2};
 assert.equal((await e.dispatchCommand(CHAR,{target:range,properties:{bold:true}})).error,'ProtectedAnchorRange');
 assert.equal((await e.dispatchCommand(ALIGN,{target:range,alignment:'CENTER'})).status,'committed-with-snapshot');
 }finally{await e.dispose();}
});
