import assert from 'node:assert/strict';import test from 'node:test';import {seriesCollectionFixture as fixture} from './chart-series-collection-fixture.mjs';import {observeSeriesCollection} from './chart-series-collection-evidence.mjs';
import {incompleteSeriesCollection} from './chart-series-collection-errors.mjs';
const read=(f,b=f.bytes,count=f.count)=>observeSeriesCollection(b,f.offset,f.types,f.objects,f.strings,count);
test('Series collection preserves ordered scope raw106 nullable fields and exact Title header boundary',()=>{
 for(const offset of [0,1,17,257])for(const count of [0,1,2])for(const points of [0,1,4])for(const newTitle of [false,true]){
  const f=fixture(offset,count,points,newTitle),r=read(f);assert.equal(r.end,f.end);assert.equal(r.series.length,count);assert.equal(r.title.start,f.titleStart);assert.equal(r.title.id,f.nextId-1);assert.equal(r.objects.size,f.nextId+1);assert.equal(r.types.size,13);assert.equal(f.types.size,newTitle?12:13);assert.deepEqual(f.objects,new Set([999]));assert.equal(f.strings.size,1);
  for(const [i,s] of r.series.entries()){assert.equal(s.start,f.rows[i].start);assert.equal(s.end,f.rows[i].end);assert.equal(s.trailerStart,f.rows[i].trailerStart);assert.equal(s.raw106,f.bytes.subarray(s.trailerStart,s.end).toString('hex'));assert.equal(s.section.points.length,points);assert.equal(s.types.has(279),!newTitle);if(i)assert(!r.series[i-1].objects.has(s.prefix.objectId));}
  assert.deepEqual(read(f,Buffer.concat([f.bytes,Buffer.alloc(53,255)])),r);f.bytes.fill(0);f.types.clear();f.objects.clear();f.strings.clear();if(count)assert.notEqual(r.series[0].raw106,'00'.repeat(106));
 }
});
test('Series collection all cuts count mismatch cross-series IDs and Title class/version errors',()=>{
 for(const points of [0,1,4])for(const newTitle of [false,true]){
  const f=fixture(17,2,points,newTitle),r=read(f);
  for(let cut=f.offset;cut<f.end;cut++)assert.throws(()=>read(f,f.bytes.subarray(0,cut)),incompleteSeriesCollection);
  assert.throws(()=>read(f,f.bytes,1),e=>e.constructor===Error&&e.message==='UnsupportedChartTitleHeaderObservationType');assert.throws(()=>read(f,f.bytes,3),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPrefixObservationType');
  const duplicate=Buffer.from(f.bytes);duplicate.writeUInt32LE(r.series[0].prefix.objectId,f.rows[1].start);assert.throws(()=>read(f,duplicate),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPrefixObservationObject');
  for(const id of [0xffffffff,r.series[0].prefix.objectId]){const b=Buffer.from(f.bytes);b.writeUInt32LE(id,f.titleStart);assert.throws(()=>read(f,b),e=>e.constructor===Error&&e.message==='UnsupportedChartTitleHeaderObservationObject');}
  if(newTitle)for(const at of [f.nameOffset,f.versionOffset]){const b=Buffer.from(f.bytes);b[at]^=1;assert.throws(()=>read(f,b),e=>e.constructor===Error&&e.message==='UnsupportedChartTitleHeaderObservationType');}
  else{const types=new Map(f.types);types.set(279,{name:'VtChartTitle\0',version:99});assert.throws(()=>observeSeriesCollection(f.bytes,f.offset,types,f.objects,f.strings,2),e=>e.constructor===Error&&e.message==='UnsupportedChartTitleHeaderObservationType');}
  assert.deepEqual(read(f),r);
 }
 const f=fixture();for(const n of [-1,0.5,NaN,17])assert.throws(()=>read(f,f.bytes,n),RangeError);
});
test('Series collection incomplete classifier does not hide host exceptions',()=>{
 assert(incompleteSeriesCollection(Error('IncompleteSeriesTrailerObservation')));
 for(const C of [WebAssembly.RuntimeError,TypeError,RangeError])assert(!incompleteSeriesCollection(new C('IncompleteSeriesTrailerObservation')));
 assert(!incompleteSeriesCollection(Error('UnsupportedChartTitleHeaderObservationType')));
});
