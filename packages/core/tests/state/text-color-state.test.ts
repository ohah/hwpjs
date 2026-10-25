import test from 'node:test';import assert from 'node:assert/strict';
import {characterTextColorState,characterTextColorObservation} from '../../src/state/text-color-state.ts';
const row=()=>({section:0,paragraph:1,text:'a😀b',characterRanges:[{start:0,end:4,charShapeId:0}]});
function run(colors:unknown=[{id:0,color:0}],p:any=row(),start=0,end=4){return characterTextColorState({paragraphs:[p],characterTextColorAvailable:true,characterTextColors:colors},p,start,end)}
test('missing/fractional/out-of-range resource IDs remain unknown',()=>{
 for(const id of [undefined,null,-1,.5,0x100000000,NaN])assert.equal(run([{id,color:0}],{...row(),characterRanges:[{start:0,end:4,charShapeId:id}]}),null);
 assert.equal(run([{color:0}],{...row(),characterRanges:[{start:0,end:4}]}),null);
 assert.equal(run([{id:0,color:0},{id:0,color:0}]),null);
});
test('malformed rows and non-arrays do not throw or manufacture black',()=>{
 for(const colors of [{},null,[null],[0],[{}],[{id:0}],[{id:0,color:undefined}],[{id:0,color:'black'}]])assert.equal(run(colors),null);
 for(const ranges of [{},null,[null],[{start:0,end:4}],[{start:0,end:4,charShapeId:.5}]])assert.equal(run(undefined,{...row(),characterRanges:ranges}),null);
});
test('incomplete/overlapping/invalid coverage remains unknown',()=>{
 for(const characterRanges of [[{start:1,end:4,charShapeId:0}],[{start:0,end:3,charShapeId:0}],[{start:0,end:4,charShapeId:0},{start:1,end:4,charShapeId:0}],[{start:-1,end:4,charShapeId:0}],[{start:0,end:5,charShapeId:0}],[{start:0,end:1.5,charShapeId:0}]])assert.equal(run(undefined,{...row(),characterRanges}),null);
});
test('surrogate boundaries/empty/clipped targets are not valid selections',()=>{
 assert.equal(run(undefined,row(),1,2),null);assert.equal(run(undefined,row(),2,3),null);assert.equal(run(undefined,row(),0,0),null);assert.equal(run(undefined,{...row(),clipped:true}),null);
 assert.equal(run(undefined,row(),1,3),'#000000');
});
test('real RGB black/white/mixed differ from unknown and missing capability',()=>{
 assert.equal(run(),'#000000');assert.equal(run([{id:0,color:0xffffff}]),'#ffffff');
 assert.equal(run([{id:0,color:null}]),null);assert.equal(run([{id:0,color:0xffffffff}]),null);
 assert.equal(run([{id:0,color:0},{id:1,color:0x12a4e7}],{...row(),characterRanges:[{start:0,end:1,charShapeId:0},{start:1,end:4,charShapeId:1}]}),'mixed');
 assert.equal(characterTextColorState({paragraphs:[row()],characterTextColors:[{id:0,color:0}]},row(),0,4),null);
});

test('typed color accepts scalar boundaries inside combining/Jamo graphemes and style spans',()=>{
 for(const text of ['A\u0301B','한X']){
  const p={section:0,paragraph:1,text,characterRanges:[{start:0,end:1,charShapeId:0},{start:1,end:2,charShapeId:1},{start:2,end:text.length,charShapeId:0}]};
  assert.equal(run([{id:0,color:0},{id:1,color:0x12a4e7}],p,1,2),'#12a4e7');
  assert.equal(run([{id:0,color:0},{id:1,color:0x12a4e7}],p,0,text.length),'mixed');
 }
});

test('valid unknown source value is readable as null and supports explicit replacement binding',()=>{
 const p=row(),c={paragraphs:[p],characterTextColorAvailable:true,characterTextColors:[{id:0,color:null}]};
 assert.deepEqual(characterTextColorObservation(c,p,0,4),{value:null,bindingValid:true});
 assert.equal(characterTextColorState(c,p,0,4),null);
 const mixed={...p,characterRanges:[{start:0,end:1,charShapeId:0},{start:1,end:4,charShapeId:1}]};
 assert.deepEqual(characterTextColorObservation({...c,paragraphs:[mixed],characterTextColors:[{id:0,color:0},{id:1,color:null}]},mixed,0,4),{value:null,bindingValid:true});
});
test('missing resource binding stays distinct from valid unknown value',()=>{
 const p=row(),base={paragraphs:[p],characterTextColorAvailable:true};
 for(const characterTextColors of [[],[{color:null}],[{id:.5,color:null}],[null],[{id:0}],[{id:0,color:0xffffffff}],[{id:0,color:null},{id:0,color:0}]])assert.deepEqual(characterTextColorObservation({...base,characterTextColors},p,0,4),{value:null,bindingValid:false});
});
