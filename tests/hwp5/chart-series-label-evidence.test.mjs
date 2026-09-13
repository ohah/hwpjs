import assert from 'node:assert/strict';import test from 'node:test';
import {seriesLabelFixture as fixture} from './chart-series-label-fixture.mjs';import {observeSeriesLabelBody} from './chart-series-label-evidence.mjs';import {observeSeriesPoint} from './chart-series-point-evidence.mjs';
const incomplete=e=>e.constructor===Error&&['IncompleteSeriesBranchObservation','IncompleteAxisObservation','IncompleteSeriesPointObservation'].includes(e.message);
test('SeriesLabel shares TextBlock base and point consumes its own raw tail at varied offsets',()=>{
 for(const offset of [0,1,17,257])for(const kind of ['null','alias','fresh','empty'])for(const freshName of [false,true]){
  const f=fixture(offset,kind,freshName),r=observeSeriesPoint(f.bytes,offset,f.types,f.objects,f.strings);
  assert.equal(r.end,f.end);assert.equal(r.label.end,f.bodyEnd);assert.equal(r.label.text.blockId,null);assert.equal(r.prefix.point.id,0);assert.equal(r.prefix.label.id,10);assert.equal(r.raw20,'81'.repeat(20));
  assert.equal(r.label.text.fontId,11);assert.equal(r.label.text.fontName.introduced,freshName);assert.equal(r.label.text.text?.hex??null,kind==='null'?null:kind==='empty'?'':'ff80');
  assert.equal(r.objects.size,5+Number(freshName)+Number(kind==='fresh'||kind==='empty'));assert.equal(r.strings.size,1+Number(freshName)+Number(kind==='fresh'||kind==='empty'));
  assert.deepEqual(observeSeriesLabelBody(f.bytes,f.bodyStart,r.prefix.types,r.prefix.objects,r.prefix.strings),r.label);
  assert.deepEqual(observeSeriesPoint(Buffer.concat([f.bytes,Buffer.alloc(30,255)]),offset,f.types,f.objects,f.strings),r);
  assert.deepEqual(f.objects,new Set([99,999]));assert.equal(f.types.size,7);assert.equal(f.strings.size,1);
  f.bytes.fill(0);f.objects.clear();f.types.clear();f.strings.clear();assert.equal(r.raw20,'81'.repeat(20));assert.equal(r.label.text.fontName.hex,'ff80');
 }
});
test('SeriesPoint all cuts base mismatch and Label global object collisions fail explicitly',()=>{
 for(const offset of [0,1,17,257])for(const kind of ['null','alias','fresh','empty']){
  const f=fixture(offset,kind,true),read=b=>observeSeriesPoint(b,offset,f.types,f.objects,f.strings),r=read(f.bytes);
  for(let cut=offset;cut<f.end;cut++)assert.throws(()=>read(f.bytes.subarray(0,cut)),incomplete);
  const bad=Buffer.from(f.bytes);bad.writeUInt32LE(51,f.baseOffset);assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPointObservationType');
  const wrong=new Map(f.types);wrong.set(888,{name:'VtObject\0',version:99});bad.writeUInt32LE(888,f.baseOffset);assert.throws(()=>observeSeriesPoint(bad,offset,wrong,f.objects,f.strings),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPointObservationType');
  const duplicate=Buffer.from(f.bytes);duplicate.writeUInt32LE(999,f.fontOffset);assert.throws(()=>read(duplicate),e=>e.constructor===Error&&e.message==='UnsupportedSeriesLabelObservationObject');
  const own=Buffer.from(f.bytes);own.writeUInt32LE(0,f.fontOffset);assert.throws(()=>read(own),e=>e.constructor===Error&&e.message==='UnsupportedSeriesLabelObservationObject');
  assert.deepEqual(read(f.bytes),r);
 }
});
test('SeriesLabel propagates newly declared types and introduced strings without changing prior scope',()=>{
 const f=fixture(17,'fresh',true,true),read=b=>observeSeriesPoint(b,17,f.types,f.objects,f.strings),r=read(f.bytes);
 assert.equal(r.types.size,7);assert.equal(r.label.text.declarations.length,5);assert.equal(r.strings.size,3);assert.equal(r.objects.size,7);assert.equal(f.types.size,2);assert.equal(f.strings.size,1);assert.deepEqual(f.objects,new Set([99,999]));
 for(let cut=17;cut<f.end;cut++)assert.throws(()=>read(f.bytes.subarray(0,cut)),incomplete);
 assert.deepEqual(read(f.bytes),r);
});
