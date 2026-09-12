import assert from 'node:assert/strict';
import test from 'node:test';
import {observeLineItem as observe} from './chart-line-item-evidence.mjs';
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
const names=['VtCLineItem','VtObject'],types=new Map(names.map((name,i)=>[51+i*19,{name:name+'\0',version:1}]));
function fixture(offset,known,id=7){
 const type=i=>{const raw=Buffer.from(names[i]+'\0');return Buffer.concat([int(51+i*19),...(known?[]:[int(raw.length,2),raw,int(1,2)])]);};
 return Buffer.concat([Buffer.alloc(offset,0xa5),int(id),type(0),Buffer.from(Array.from({length:52},(_,i)=>(i*19+129)&255)),type(1)]);
}
const err=name=>e=>e.constructor===Error&&e.message===name;
test('line item new and known types sparse IDs offsets raw ownership and sequential scope',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const prior=known?new Map(types):new Map(),before=new Map(prior),objects=new Set([99]),b=fixture(offset,known),r=observe(b,offset,prior,objects);
  assert.equal(r.start,offset);assert.equal(r.objectId,7);assert.equal(r.typeId,51);assert.equal(r.baseTypeId,70);assert.equal(r.end,b.length);assert.equal(r.baseOffset-r.rawStart,52);
  assert.equal(r.raw52,Buffer.from(Array.from({length:52},(_,i)=>(i*19+129)&255)).toString('hex'));assert.equal(r.declarations.length,known?0:2);
  assert.deepEqual(prior,before);assert.deepEqual(objects,new Set([99]));assert.deepEqual(r.objects,new Set([99,7]));assert.deepEqual(r.types,types);
  const next=fixture(0,true,8),combined=Buffer.concat([b,next]),second=observe(combined,r.end,r.types,r.objects);
  assert.equal(second.end,combined.length);assert.equal(second.objectId,8);assert.equal(second.declarations.length,0);assert.deepEqual(r.objects,new Set([99,7]));
  assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(50,255)]),offset,prior,objects),r);
  b.fill(0);prior.clear();objects.clear();assert.equal(r.raw52.length,104);assert.equal(r.raw52.slice(0,2),'81');assert.equal(r.types.size,2);assert.equal(r.objects.size,2);
 }
 // Zero is a valid non-null object ID, not an absent-value sentinel.
 assert.equal(observe(fixture(0,true,0),0,types).objectId,0);
});
test('line item cuts type mismatches duplicate identities and invalid offsets reject explicitly',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const prior=known?new Map(types):new Map(),before=new Map(prior),objects=new Set([99]),b=fixture(offset,known),r=observe(b,offset,prior,objects);
  for(let cut=offset;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),offset,prior,objects),err('IncompleteLineItemObservation'));
  for(const d of r.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>observe(bad,offset,prior,objects),err('UnsupportedLineItemObservationType'));}
  if(known)for(const [id,d] of prior)for(const replacement of [{...d,version:2},{...d,name:'VtOther\0'}]){const wrong=new Map(prior);wrong.set(id,replacement);assert.throws(()=>observe(b,offset,wrong,objects),err('UnsupportedLineItemObservationType'));}
  for(const id of [0xffffffff,99]){const bad=Buffer.from(b);bad.writeUInt32LE(id,offset);assert.throws(()=>observe(bad,offset,prior,objects),err('UnsupportedLineItemObservationObject'));}
  assert.throws(()=>observe(b,offset,r.types,r.objects),err('UnsupportedLineItemObservationObject'));
  assert.deepEqual(prior,before);assert.deepEqual(objects,new Set([99]));assert.deepEqual(observe(b,offset,prior,objects),r);
 }
 const b=fixture(0,false);for(const at of [-1,0.5,NaN,Infinity,b.length+1])assert.throws(()=>observe(b,at,new Map()),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
});
