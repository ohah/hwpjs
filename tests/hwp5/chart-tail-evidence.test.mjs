import assert from 'node:assert/strict';import test from 'node:test';import {chartTailFixture as fixture} from './chart-tail-fixture.mjs';import {observeChartTail} from './chart-tail-evidence.mjs';import {observeListPrefix} from './chart-list-prefix-evidence.mjs';import {observeWindow} from './chart-window-evidence.mjs';import {incompleteChartTail} from './chart-tail-errors.mjs';
const read=(f,b=f.bytes)=>observeChartTail(b,f.offset,f.types,f.objects);
test('List raw26 Window preserve opaque words exact spans separate namespaces and prior scopes',()=>{
 for(const offset of [0,1,17,257])for(const mode of ['new','known','corpus'])for(const word of [0,1,2,65535])for(const typeIds of [[17,43,69,95],[0,65535,999,0xffffffff]]){
  const f=fixture(offset,mode,word,65535-word,typeIds),r=read(f);assert.equal(r.end,f.end);assert.equal(r.list.end,f.listEnd);assert.equal(r.window.start,f.windowStart);assert.equal(r.list.id,0);assert.equal(r.list.typeId,typeIds[0]);assert.equal(r.list.collection.typeId,typeIds[1]);assert.equal(r.list.collection.baseTypeId,typeIds[2]);assert.equal(r.list.collection.word,word);assert.equal(r.list.collection.wordOffset,f.listWordOffset);assert.equal(r.window.typeId,typeIds[3]);assert.equal(r.window.baseTypeId,typeIds[2]);assert.equal(r.window.rawWord,65535-word);assert.equal(r.window.wordOffset,f.windowWordOffset);assert.equal(r.raw26,f.raw26);assert.equal(r.types.size,4);assert.deepEqual(r.objects,new Set([999,0]));assert.equal(r.list.types.has(typeIds[3]),mode==='known');assert.deepEqual(f.objects,new Set([999]));assert.equal(f.types.size,mode==='new'?0:mode==='known'?4:2);
  assert.deepEqual(read(f,Buffer.concat([f.bytes,Buffer.alloc(91,255)])),r);assert.deepEqual(observeListPrefix(f.bytes.subarray(0,f.listEnd),f.offset,f.types,f.objects),r.list);assert.deepEqual(observeWindow(f.bytes,f.windowStart,r.list.types),r.window);
  f.bytes.fill(0);f.types.clear();f.objects.clear();assert.equal(r.raw26,f.raw26);assert.notEqual(r.raw26,'00'.repeat(26));
 }
});
test('List and Window all cuts ID collisions new declarations known versions and invalid offsets',()=>{
 for(const mode of ['new','known','corpus']){
  const f=fixture(17,mode),r=read(f);
  for(let cut=f.offset;cut<f.end;cut++)assert.throws(()=>read(f,f.bytes.subarray(0,cut)),incompleteChartTail);
  for(let cut=f.windowStart;cut<f.end;cut++)assert.throws(()=>observeWindow(f.bytes.subarray(0,cut),f.windowStart,r.list.types),e=>e.constructor===Error&&e.message==='IncompleteWindowObservation');
  for(const id of [0xffffffff,999]){const b=Buffer.from(f.bytes);b.writeUInt32LE(id,f.offset);assert.throws(()=>read(f,b),e=>e.constructor===Error&&e.message==='UnsupportedListPrefixObservationObject');}
  for(const d of f.declarations)for(const at of [d.nameOffset,d.versionOffset]){const b=Buffer.from(f.bytes);b[at]^=1;assert.throws(()=>read(f,b),e=>e.constructor===Error&&['UnsupportedListPrefixObservationType','UnsupportedWindowObservationType'].includes(e.message));}
  for(const d of f.declarations){const b=Buffer.from(f.bytes);b.writeUInt16LE(65535,d.nameOffset-2);assert.throws(()=>read(f,b),incompleteChartTail);}
  for(const [id,d] of f.types){const types=new Map(f.types);types.set(id,{...d,version:99});assert.throws(()=>observeChartTail(f.bytes,f.offset,types,f.objects),e=>e.constructor===Error&&['UnsupportedListPrefixObservationType','UnsupportedWindowObservationType'].includes(e.message));}
  assert.deepEqual(read(f),r);
  for(const offset of [-1,0.5,NaN,f.end+1]){assert.throws(()=>observeChartTail(f.bytes,offset,f.types,f.objects),RangeError);assert.throws(()=>observeWindow(f.bytes,offset,f.types),RangeError);}
 }
});
test('Tail incomplete classification rejects same-message host exceptions',()=>{
 assert(incompleteChartTail(Error('IncompleteWindowObservation')));for(const C of [WebAssembly.RuntimeError,TypeError,RangeError])assert(!incompleteChartTail(new C('IncompleteWindowObservation')));
});
