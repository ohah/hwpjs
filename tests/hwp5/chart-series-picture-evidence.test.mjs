import assert from 'node:assert/strict';import test from 'node:test';import {seriesPictureFixture as fixture} from './chart-series-picture-fixture.mjs';import {observeSeriesPicture} from './chart-series-picture-evidence.mjs';
const parse=(f,b=f.bytes)=>observeSeriesPicture(b,f.offset,f.types,f.objects),error=name=>e=>e.constructor===Error&&e.message===name;
test('Series picture new known types varied offsets exact scope and opaque raw ownership',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const f=fixture(offset,known),r=parse(f);assert.equal(r.end,f.end);assert.equal(r.pictureStart,f.pictureStart);assert.equal(r.pictureEnd,f.pictureEnd);assert.equal(r.picture.id,0);assert.equal(r.types.size,2);assert.deepEqual(r.objects,new Set([999,0]));assert.deepEqual(r.references,f.references);assert.deepEqual(r.rawFields,f.rawFields);assert.equal(r.raw40,f.rawFields[0].hex);assert.equal(r.picture.raw4,f.rawFields[1].hex);
  assert.deepEqual(parse(f,Buffer.concat([f.bytes,Buffer.alloc(31,255)])),r);assert.equal(f.types.size,known?2:0);assert.deepEqual(f.objects,new Set([999]));
  const raw=Buffer.from(f.bytes);for(const x of f.rawFields)raw.fill(255,x.start,x.start+x.n);assert.deepEqual(parse(f,raw),{...r,raw40:'ff'.repeat(40),picture:{...r.picture,raw4:'ff'.repeat(4)},rawFields:r.rawFields.map(x=>({...x,hex:'ff'.repeat(x.n)}))});
  f.bytes.fill(0);f.types.clear();f.objects.clear();assert.equal(r.raw40,f.rawFields[0].hex);assert.equal(r.picture.raw4,f.rawFields[1].hex);
 }
});
test('Series picture all cuts unknown data classes versions IDs and invalid offsets reject explicitly',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true]){
  const f=fixture(offset,known),r=parse(f);
  for(let cut=offset;cut<f.end;cut++)assert.throws(()=>parse(f,f.bytes.subarray(0,cut)),error('IncompleteSeriesPictureObservation'));
  for(const id of [0xffffffff,999]){const b=Buffer.from(f.bytes);b.writeUInt32LE(id,f.pictureStart);assert.throws(()=>parse(f,b),error('UnsupportedSeriesPictureObservationObject'));}
  for(const id of [0,1,999,0xfffffffe]){const b=Buffer.from(f.bytes);b.writeUInt32LE(id,f.dataOffset);assert.throws(()=>parse(f,b),error('UnsupportedSeriesPictureObservationData'));}
  if(known){for(const id of [51,97]){const wrong=new Map(f.types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observeSeriesPicture(f.bytes,offset,wrong,f.objects),error('UnsupportedSeriesPictureObservationType'));}
   for(const at of f.references){const b=Buffer.from(f.bytes);b.writeUInt32LE(b.readUInt32LE(at)===51?97:51,at);assert.throws(()=>parse(f,b),error('UnsupportedSeriesPictureObservationType'));}
  }else for(const d of f.declarations)for(const at of [d.nameOffset,d.versionOffset]){const b=Buffer.from(f.bytes);b[at]^=1;assert.throws(()=>parse(f,b),error('UnsupportedSeriesPictureObservationType'));}
  const final=Buffer.from(f.bytes);final.writeUInt32LE(51,f.references[1]);assert.throws(()=>parse(f,final),error('UnsupportedSeriesPictureObservationType'));assert.deepEqual(parse(f),r);
 }
 const f=fixture();for(const offset of [-1,0.5,NaN,f.end+1])assert.throws(()=>observeSeriesPicture(f.bytes,offset,f.types,f.objects),RangeError);
});
