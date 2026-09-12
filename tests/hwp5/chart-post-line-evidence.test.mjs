import assert from 'node:assert/strict';
import test from 'node:test';
import {observePostLine as observe} from './chart-post-line-evidence.mjs';
const types=new Map([[51,{name:'VtObject\0',version:1}],[97,{name:'VtArray\0',version:1}],[133,{name:'VtCollection\0',version:1}]]);
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
const raw=Buffer.from(Array.from({length:194},(_,i)=>(i*19+129)&255));
const fixture=(offset,first,second,id=7)=>Buffer.concat([Buffer.alloc(offset,0xa5),raw,int(51),int(id),int(97),int(first,2),int(133),int(second,2),int(51)]);
const err=name=>e=>e.constructor===Error&&e.message===name;
test('post-line raw span preserves unequal words sparse types zero ID offsets and ownership',()=>{
 for(const offset of [0,1,17,257])for(const [first,second] of [[0,0],[3,3],[5,5],[5,0],[65535,65535]]){
  const prior=new Map(types),objects=new Set([99]),b=fixture(offset,first,second),r=observe(b,offset,prior,objects);
  assert.equal(r.end,b.length);assert.equal(r.end-offset,218);assert.equal(r.baseOffset,offset+194);assert.equal(r.array.start,offset+198);assert.equal(r.array.id,7);
  assert.equal(r.raw194,raw.toString('hex'));assert.equal(r.array.first,first);assert.equal(r.array.second,second);assert.deepEqual(r.objects,new Set([99,7]));
  assert.deepEqual(prior,types);assert.deepEqual(objects,new Set([99]));assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(30,255)]),offset,prior,objects),r);
  b.fill(0);prior.clear();objects.clear();assert.equal(r.raw194,raw.toString('hex'));assert.equal(r.types.size,3);assert.equal(r.objects.size,2);
 }
 assert.equal(observe(fixture(0,0,0,0),0,types,new Set()).array.id,0);
});
test('post-line all cuts unknown classes versions null and duplicate IDs reject explicitly',()=>{
 for(const offset of [0,1,17,257]){
  const prior=new Map(types),objects=new Set([99]),b=fixture(offset,3,3),r=observe(b,offset,prior,objects);
  for(let cut=offset;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),offset,prior,objects),err('IncompletePostLineObservation'));
  for(const [id,d] of types)for(const replacement of [null,{...d,name:'VtOther\0'},{...d,version:2}]){const wrong=new Map(types);if(replacement)wrong.set(id,replacement);else wrong.delete(id);assert.throws(()=>observe(b,offset,wrong,objects),err('UnsupportedPostLineObservationType'));}
  for(const id of [0xffffffff,99]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.array.start);assert.throws(()=>observe(bad,offset,prior,objects),err('UnsupportedPostLineObservationObject'));}
  assert.throws(()=>observe(b,offset,prior,r.objects),err('UnsupportedPostLineObservationObject'));
  assert.deepEqual(prior,types);assert.deepEqual(objects,new Set([99]));assert.deepEqual(observe(b,offset,prior,objects),r);
 }
 const b=fixture(0,0,0);for(const offset of [-1,0.5,NaN,Infinity,b.length+1])assert.throws(()=>observe(b,offset,types,new Set()),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
});
