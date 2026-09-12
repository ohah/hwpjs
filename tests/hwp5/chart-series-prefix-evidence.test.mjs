import assert from 'node:assert/strict';import test from 'node:test';
import {observeSeriesPrefix as observe} from './chart-series-prefix-evidence.mjs';
const names=['VtSeries','VtArray','VtCollection','VtObject'],types=new Map(names.map((name,i)=>[51+i*19,{name:name+'\0',version:i===0?2:1}]));
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;},raw=Buffer.from(Array.from({length:66},(_,i)=>(i*19+129)&255));
function fixture(offset,known,first,second,id=0){const type=i=>{const name=Buffer.from(names[i]+'\0');return Buffer.concat([int(51+i*19),...(known?[]:[int(name.length,2),name,int(i===0?2:1,2)])]);};return Buffer.concat([Buffer.alloc(offset,0xa5),int(id),type(0),raw,int(7),type(1),int(first,2),type(2),int(second,2),type(3)]);}
const err=name=>e=>e.constructor===Error&&e.message===name;
test('series prefix new known types offsets raw independent words and copied scopes',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true])for(const [first,second] of [[0,0],[1,1],[4,4],[5,0],[65535,65535]]){
  const prior=known?new Map(types):new Map(),before=new Map(prior),objects=new Set([99]),b=fixture(offset,known,first,second),r=observe(b,offset,prior,objects);
  assert.equal(r.end,b.length);assert.equal(r.objectId,0);assert.equal(r.array.id,7);assert.equal(r.array.first,first);assert.equal(r.array.second,second);assert.equal(r.raw66,raw.toString('hex'));assert.equal(r.array.start-r.rawStart,66);assert.equal(r.declarations.length,known?0:4);
  assert.deepEqual(r.types,types);assert.deepEqual(r.objects,new Set([99,0,7]));assert.deepEqual(prior,before);assert.deepEqual(objects,new Set([99]));assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(40,255)]),offset,prior,objects),r);
  b.fill(0);prior.clear();objects.clear();assert.equal(r.raw66,raw.toString('hex'));assert.equal(r.types.size,4);assert.equal(r.objects.size,3);
 }
});
test('series prefix all cuts each type null and duplicate objects and invalid offsets',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const prior=known?new Map(types):new Map(),before=new Map(prior),objects=new Set([99]),b=fixture(offset,known,4,4),r=observe(b,offset,prior,objects);
  for(let cut=offset;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),offset,prior,objects),err('IncompleteSeriesPrefixObservation'));
  for(const d of r.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>observe(bad,offset,prior,objects),err('UnsupportedSeriesPrefixObservationType'));}
  if(known)for(const [id,d] of types)for(const replacement of [{...d,name:'VtOther\0'},{...d,version:99}]){const wrong=new Map(prior);wrong.set(id,replacement);assert.throws(()=>observe(b,offset,wrong,objects),err('UnsupportedSeriesPrefixObservationType'));}
  for(const at of [offset,r.array.start])for(const id of [0xffffffff,99]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);assert.throws(()=>observe(bad,offset,prior,objects),err('UnsupportedSeriesPrefixObservationObject'));}
  const repeated=Buffer.from(b);repeated.writeUInt32LE(0,r.array.start);assert.throws(()=>observe(repeated,offset,prior,objects),err('UnsupportedSeriesPrefixObservationObject'));
  assert.deepEqual(prior,before);assert.deepEqual(objects,new Set([99]));assert.deepEqual(observe(b,offset,prior,objects),r);
 }
 const b=fixture(0,false,0,0);for(const at of [-1,0.5,NaN,Infinity,b.length+1])assert.throws(()=>observe(b,at,types,new Set()),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
});
