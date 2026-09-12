import assert from 'node:assert/strict';import test from 'node:test';import {observeSeriesBranch as observe} from './chart-series-branch-evidence.mjs';
const names=['VtString','VtValue','VtObject','VtSeriesPoint','VtSeriesLabel'],types=new Map(names.map((name,i)=>[51+19*i,{name:name+'\0',version:1}]));
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;},raw=Buffer.alloc(66,0x81),seedString={hex:'ff80',trailer:173};
function fixture(offset,known,branch,kind='fresh'){
 const type=i=>{const n=Buffer.from(names[i]+'\0');return Buffer.concat([int(51+19*i),...(known?[]:[int(n.length,2),n,int(1,2)])]);};
 const text=kind==='alias'?int(99):Buffer.concat([int(0),type(0),int(kind==='empty'?0:3,2),kind==='empty'?Buffer.alloc(0):Buffer.from([255,128,0]),int(201,1),type(1),type(2)]);
 return Buffer.concat([Buffer.alloc(offset,0xa5),...(branch==='tail'?[raw,text]:[int(0),type(3)]),int(7),type(4)]);
}
const err=name=>e=>e.constructor===Error&&e.message===name;
test('series branches preserve raw and fresh empty alias text and point identity scopes',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true])for(const branch of ['tail','point'])for(const kind of ['fresh','empty','alias']){
  const prior=known?new Map(types):new Map(),before=new Map(prior),objects=new Set([99]),strings=new Map([[99,{...seedString}]]),b=fixture(offset,known,branch,kind),r=observe(b,offset,branch,prior,objects,strings);
  assert.equal(r.end,b.length);assert.equal(r.label.id,7);assert.equal(r.label.end,r.end);assert.equal(r.point?.id??null,branch==='point'?0:null);
  assert.equal(r.raw66,branch==='tail'?raw.toString('hex'):null);assert.equal(r.text?.hex??null,branch==='tail'?(kind==='alias'?'ff80':kind==='empty'?'':'ff8000'):null);
  if(r.text){assert.equal(r.text.introduced,kind!=='alias');assert.equal(r.text.trailer,kind==='alias'?173:201);}
  assert.equal(r.objects.size,branch==='tail'&&kind==='alias'?2:3);assert.equal(r.strings.size,branch==='tail'&&kind!=='alias'?2:1);
  assert.deepEqual(prior,before);assert.deepEqual(objects,new Set([99]));assert.deepEqual(strings,new Map([[99,seedString]]));assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(30,255)]),offset,branch,prior,objects,strings),r);
  b.fill(0);prior.clear();objects.clear();strings.clear();assert.equal(r.objects.size,branch==='tail'&&kind==='alias'?2:3);assert.equal(r.strings.get(99).hex,'ff80');
 }
});
test('series branches all cuts each type null duplicate and invalid branch or offset',()=>{
 for(const known of [false,true])for(const branch of ['tail','point'])for(const kind of ['fresh','empty','alias']){
  const offset=17,prior=known?new Map(types):new Map(),before=new Map(prior),objects=new Set([99]),strings=new Map([[99,seedString]]),b=fixture(offset,known,branch,kind),r=observe(b,offset,branch,prior,objects,strings);
  for(let cut=offset;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),offset,branch,prior,objects,strings),err('IncompleteSeriesBranchObservation'));
  for(const d of r.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>observe(bad,offset,branch,prior,objects,strings),err('UnsupportedSeriesBranchObservationType'));}
  if(known)for(const id of new Set(r.references.map(at=>b.readUInt32LE(at)))){const wrong=new Map(prior);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observe(b,offset,branch,wrong,objects,strings),err('UnsupportedSeriesBranchObservationType'));}
  for(const at of r.objectOffsets)for(const id of [0xffffffff,7]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);if(at===r.label.start&&id===7)continue;assert.throws(()=>observe(bad,offset,branch,prior,objects,strings),err('UnsupportedSeriesBranchObservationObject'));}
  const duplicate=Buffer.from(b);duplicate.writeUInt32LE(99,r.label.start);assert.throws(()=>observe(duplicate,offset,branch,prior,objects,strings),err('UnsupportedSeriesBranchObservationObject'));
  if(branch==='tail'){const bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,offset+66);assert.throws(()=>observe(bad,offset,branch,prior,objects,strings),err('UnsupportedSeriesBranchObservationObject'));}
  assert.deepEqual(prior,before);assert.deepEqual(objects,new Set([99]));assert.deepEqual(strings,new Map([[99,seedString]]));assert.deepEqual(observe(b,offset,branch,prior,objects,strings),r);
 }
 const alias=fixture(0,true,'tail','alias');
 assert.throws(()=>observe(alias,0,'tail',types,new Set([99]),new Map()),err('UnsupportedSeriesBranchObservationObject'));
 assert.throws(()=>observe(alias,0,'tail',types,new Set(),new Map([[99,seedString]])),err('UnsupportedSeriesBranchObservationObject'));
 const nullAlias=Buffer.from(alias);nullAlias.writeUInt32LE(0xffffffff,66);
 assert.throws(()=>observe(nullAlias,0,'tail',types,new Set([0xffffffff]),new Map([[0xffffffff,seedString]])),err('UnsupportedSeriesBranchObservationObject'));
 const b=fixture(0,true,'tail');assert.throws(()=>observe(b,0,'other',types,new Set(),new Map()),err('UnsupportedSeriesBranch'));
 for(const at of [-1,0.5,NaN,Infinity,b.length+1])assert.throws(()=>observe(b,at,'tail',types,new Set(),new Map()),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
});
