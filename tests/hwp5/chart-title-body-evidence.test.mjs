import assert from 'node:assert/strict';import test from 'node:test';import {titleBodyFixture as fixture} from './chart-title-body-fixture.mjs';import {observeChartTitleBody} from './chart-title-body-evidence.mjs';import {observeChartSection} from './chart-section-evidence.mjs';import {incompleteTitleBody} from './chart-title-body-errors.mjs';
const read=(f,b=f.bytes)=>observeChartTitleBody(b,f.offset,f.types,f.objects,f.strings);
test('Title ChartText inline TextBlock Section offsets scope null empty aliases fresh and auxiliary Backdrop',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true])for(const text of ['null','empty','alias','fresh','font'])for(const freshName of [false,true])for(const background of [false,true]){
  const f=fixture(offset,known,text,freshName,background),r=read(f);assert.equal(r.end,f.end);assert.equal(r.blockId,0);assert.equal(r.body.end,f.sectionStart);assert.equal(r.body.text.start,f.bodyStart);assert.equal(r.objects.size,f.nextId+2);assert.equal(r.types.size,known?10:f.seen.size);assert.equal(r.section.section.suffix,0xa55a);assert.equal(r.body.text.text===null,text==='null');if(text==='empty')assert.equal(r.body.text.text.hex,'');if(text==='font')assert.equal(r.body.text.text.id,f.fontName);assert.equal(Boolean(r.body.text.background),background);
  const sectionRaw=f.rawFields.filter(x=>x.start>=f.sectionStart);assert.deepEqual(r.section.rawFields,sectionRaw);for(const v of sectionRaw)assert.equal(r.section.section['raw'+v.n],v.hex);assert.equal(r.body.objects.size+3,r.objects.size);for(const id of r.section.section.ids)assert(!r.body.objects.has(id));if(!known)assert(!r.body.types.has(31+37*6));
  assert.deepEqual(read(f,Buffer.concat([f.bytes,Buffer.alloc(71,255)])),r);assert.deepEqual(f.objects,new Set([997,999]));assert.equal(f.types.size,known?10:0);assert.equal(f.strings.size,1);
  const saved=r.section.section.raw26;f.bytes.fill(0);f.types.clear();f.objects.clear();f.strings.clear();assert.equal(r.section.section.raw26,saved);assert.notEqual(saved,'00'.repeat(26));
 }
});
test('Title and standalone Section every cut exact errors late types global duplicates and nonempty Picture',()=>{
 for(const known of [false,true])for(const background of [false,true]){
  const f=fixture(17,known,'fresh',true,background),r=read(f);
  for(let cut=f.offset;cut<f.end;cut++)assert.throws(()=>read(f,f.bytes.subarray(0,cut)),incompleteTitleBody);
  for(let cut=f.sectionStart;cut<f.end;cut++)assert.throws(()=>observeChartSection(f.bytes.subarray(0,cut),f.sectionStart,r.body.types,r.body.objects),e=>e.constructor===Error&&e.message==='IncompleteChartSectionObservation');
  // Nullable text/auxiliary positions are references, not required inline IDs.
  // Their null layouts are tested above with the inline payload removed.
  for(const [index,at] of f.objectOffsets.entries())for(const id of [0xffffffff,999,...(index?[0]:[])]){if(id===0xffffffff&&[f.textOffset,r.body.text.auxiliaryOffset].includes(at))continue;const b=Buffer.from(f.bytes);b.writeUInt32LE(id,at);assert.throws(()=>read(f,b),e=>e.constructor===Error&&['UnsupportedChartTitleBodyObservationObject','UnsupportedSeriesLabelObservationObject','UnsupportedAxisObservationObject','UnsupportedChartSectionObservationObject'].includes(e.message));}
  if(!known)for(const d of f.declarations)for(const at of [d.nameOffset,d.versionOffset]){const b=Buffer.from(f.bytes);b[at]^=1;assert.throws(()=>read(f,b),e=>e.constructor===Error&&['UnsupportedChartTitleBodyObservationType','UnsupportedAxisObservationType','UnsupportedChartSectionObservationType'].includes(e.message));}
  else for(const [id,d] of f.types){const types=new Map(f.types);types.set(id,{...d,version:99});assert.throws(()=>observeChartTitleBody(f.bytes,f.offset,types,f.objects,f.strings),e=>e.constructor===Error&&['UnsupportedChartTitleBodyObservationType','UnsupportedAxisObservationType','UnsupportedChartSectionObservationType'].includes(e.message));}
  for(const id of [0,1,999,0xfffffffe]){const b=Buffer.from(f.bytes);b.writeUInt32LE(id,r.section.dataOffset);assert.throws(()=>read(f,b),e=>e.constructor===Error&&e.message==='UnsupportedChartSectionObservationData');}
  assert.deepEqual(read(f),r);
 }
});
test('Title caller errors and incomplete classification do not hide host failures',()=>{
 const f=fixture();for(const offset of [-1,0.5,NaN,f.end+1])assert.throws(()=>observeChartTitleBody(f.bytes,offset,f.types,f.objects,f.strings),RangeError);
 for(const C of [WebAssembly.RuntimeError,TypeError,RangeError])assert(!incompleteTitleBody(new C('IncompleteChartSectionObservation')));assert(incompleteTitleBody(Error('IncompleteChartSectionObservation')));
});
