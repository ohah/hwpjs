import assert from 'node:assert/strict';
import test from 'node:test';
import {observeSurfacePrefix as observe} from './chart-surface-evidence.mjs';
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
const names=['VtSurfaceDesc','VtArray','VtCollection','VtObject'];
const types=new Map(names.map((name,i)=>[51+i*19,{name:name+'\0',version:1}]));
function fixture(offset,known){
 const type=i=>{const raw=Buffer.from(names[i]+'\0');return Buffer.concat([int(51+i*19),...(known?[]:[int(raw.length,2),raw,int(1,2)])]);};
 return Buffer.concat([Buffer.alloc(offset,0xa5),Buffer.alloc(30,0x81),int(7),type(0),Buffer.alloc(46,0xff),int(9),type(1),int(0,2),type(2),int(0,2),type(3)]);
}
const err=name=>e=>e.constructor===Error&&e.message===name;
test('surface selected raw spans offsets sparse declarations known types and copied ownership',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const prior=known?new Map(types):new Map(),before=new Map(prior),b=fixture(offset,known),r=observe(b,offset,prior);
  assert.equal(r.start,offset);assert.equal(r.surfaceStart,offset+30);assert.equal(r.objectId,7);assert.equal(r.array.id,9);
  assert.equal(r.raw30,'81'.repeat(30));assert.equal(r.raw46,'ff'.repeat(46));assert.equal(r.end,b.length);
  assert.equal(r.declarations.length,known?0:4);assert.deepEqual(prior,before);
  assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(50,255)]),offset,prior),r);
  b.fill(0);prior.clear();assert.equal(r.raw30,'81'.repeat(30));assert.equal(r.raw46,'ff'.repeat(46));
 }
});
test('surface cuts classes versions array values null duplicate IDs and invalid offsets',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const prior=known?new Map(types):new Map(),before=new Map(prior),b=fixture(offset,known),r=observe(b,offset,prior);
  for(let cut=offset;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),offset,prior),err('IncompleteSurfaceObservation'));
  for(const d of r.declarations){for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>observe(bad,offset,prior),err('UnsupportedSurfaceObservationType'));}}
  if(known)for(const [id,d] of prior){const wrong=new Map(prior);wrong.set(id,{...d,version:2});assert.throws(()=>observe(b,offset,wrong),err('UnsupportedSurfaceObservationType'));}
  for(const at of [r.surfaceStart,r.array.start]){const bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,at);assert.throws(()=>observe(bad,offset,prior),err('UnsupportedSurfaceObservationObject'));}
  const duplicate=Buffer.from(b);duplicate.writeUInt32LE(7,r.array.start);assert.throws(()=>observe(duplicate,offset,prior),err('UnsupportedSurfaceObservationObject'));
  // Known type references make both word positions independent fixture offsets.
  if(known)for(const at of [r.array.start+8,r.array.start+14]){const bad=Buffer.from(b);bad.writeUInt16LE(1,at);assert.throws(()=>observe(bad,offset,prior),err('UnsupportedSurfaceObservationArray'));}
  assert.deepEqual(prior,before);assert.deepEqual(observe(b,offset,prior),r);
 }
 const b=fixture(0,false);for(const at of [-1,0.5,NaN,Infinity,b.length+1])assert.throws(()=>observe(b,at,new Map()),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
});
