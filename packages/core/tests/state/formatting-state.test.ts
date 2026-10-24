import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../src/state/editor-state.ts';
import {getSelectionFormatting} from '../../src/state/formatting-state.ts';
const token={editorId:'e',documentId:'d',generation:1,operationRevision:2,viewRevision:3};
const target={...token,format:'hwp5',coordinateSpace:'display',owner:'section:0:body',section:0,paragraph:0,startUnit:0,endUnit:2,affinity:'forward'};
function snapshot(selection:any=target,row:any={},content:any={},extra:any={}){
 return new EditorState({...token,status:'ready',stateVersion:1,selection,content:{format:'hwp5',characterPropertiesAvailable:true,paragraphAlignmentAvailable:true,characterShapes:[{id:0,bold:true,italic:false,height:1000},{id:1,bold:false,italic:false,height:2000}],paragraphs:[{section:0,paragraph:0,text:'AB',editable:true,selectionOwner:'section:0:body',currentReference:{kind:'original',section:0,id:'99'},characterRanges:[{start:0,end:1,charShapeId:0},{start:1,end:2,charShapeId:1}],paragraphShape:{alignment:3},...row}],...content},...extra});
}
test('canonical mixed values, immutable owned target and no write/readback dependencies',()=>{
 const s=snapshot();const f=getSelectionFormatting(s);
 assert.equal(f.bold,'mixed');assert.equal(f.italic,false);assert.equal(f.size,'mixed');assert.equal(f.align,'CENTER');
 assert.equal(f.characterAvailableReason,null);assert.equal(f.paragraphAvailableReason,null);
 assert(Object.isFrozen(f));assert(Object.isFrozen(f.target));assert.notEqual(f.target,target);
 assert.equal(getSelectionFormatting(snapshot({...target,endUnit:1})).size,1000);
});
test('missing, dangling and stale selection never synthesize targets',()=>{
 for(const [selection,reason] of [[null,'MissingSelection'],[{...target,paragraph:99},'InvalidSelectionOwner'],[{...target,operationRevision:1},'StaleTarget'],[{...target,viewRevision:1},'StaleTarget']]){
 const f=getSelectionFormatting(snapshot(selection));assert.equal(f.target,null);assert.equal(f.characterAvailableReason,reason);assert.equal(f.paragraphAvailableReason,reason);
 }
 assert.equal(getSelectionFormatting(snapshot(target,{}, {},{status:'refresh-required'})).characterAvailableReason,'RefreshRequired');
});
test('collapsed, created, unknown binding/capability and missing shape have explicit observations',()=>{
 const collapsed=getSelectionFormatting(snapshot({...target,endUnit:0}));assert.equal(collapsed.characterAvailableReason,'EmptyCharacterSelection');assert.equal(collapsed.paragraphAvailableReason,null);assert.equal(collapsed.align,'CENTER');
 for(const [row,reason] of [[{createdCell:{}},'CreatedCellRequiresSurfacePort'],[{currentReference:undefined},'UnsupportedFormattingReference'],[{currentReference:{kind:'generated',section:0,id:'1'}},'UnsupportedFormattingReference']]){
 const f=getSelectionFormatting(snapshot(target,row));assert.equal(f.characterAvailableReason,reason);assert.equal(f.paragraphAvailableReason,reason);
 }
 const unknown=getSelectionFormatting(snapshot(target,{}, {characterPropertiesAvailable:'true',paragraphAlignmentAvailable:undefined}));assert.equal(unknown.characterAvailableReason,'FormattingCapabilityUnavailable');assert.equal(unknown.paragraphAvailableReason,'FormattingCapabilityUnavailable');
 const missing=getSelectionFormatting(snapshot(target,{paragraphShape:{alignment:99}}, {characterShapes:[]}));assert.equal(missing.bold,null);assert.equal(missing.size,null);assert.equal(missing.align,null);
});
test('paragraph selection may include protected anchors, character may not',()=>{
 const f=getSelectionFormatting(snapshot(target,{sourceOffsets:[{at:0,source:0},{at:1,source:8}]}));
 assert.equal(f.characterAvailableReason,'ProtectedAnchorRange');assert.equal(f.bold,null);assert.equal(f.paragraphAvailableReason,null);assert.equal(f.align,'CENTER');
});
test('original table cells use their canonical list owner; stale and foreign owners stay unavailable',()=>{
 const cell={selectionOwner:null,tableCell:{tableNode:7,listNode:8,row:0,column:0}};
 const selected={...target,owner:'section:0:table:7:list:8'};
 const observed=getSelectionFormatting(snapshot(selected,cell));
 assert.equal(observed.characterAvailableReason,null);assert.equal(observed.paragraphAvailableReason,null);
 assert.equal(observed.bold,'mixed');assert.equal(observed.align,'CENTER');
 for(const owner of ['section:0:body','section:0:table:7:list:9','section:0:table:9:list:8']){
  const denied=getSelectionFormatting(snapshot({...selected,owner},cell));
  assert.equal(denied.characterAvailableReason,'InvalidSelectionOwner');assert.equal(denied.paragraphAvailableReason,'InvalidSelectionOwner');
 }
 assert.equal(getSelectionFormatting(snapshot({...selected,viewRevision:2},cell)).characterAvailableReason,'StaleTarget');
 assert.equal(getSelectionFormatting(snapshot(selected,{...cell,createdCell:{}})).characterAvailableReason,'CreatedCellRequiresSurfacePort');
 assert.equal(getSelectionFormatting(snapshot(selected,{...cell,currentReference:{kind:'generated',section:0,id:'1'}})).characterAvailableReason,'UnsupportedFormattingReference');
});
