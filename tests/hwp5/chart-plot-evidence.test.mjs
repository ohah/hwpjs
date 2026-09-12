import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {observePlotPrefix:observe}=await import(process.env.CHART_PLOT_OBSERVER_MODULE?pathToFileURL(process.env.CHART_PLOT_OBSERVER_MODULE).href:'./chart-plot-evidence.mjs');
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function fixture(count=2,offset=0){
 const chunks=[Buffer.alloc(offset,0xa5)],types=new Map(),prior=new Map();let size=offset;
 const ids=new Map([['VtChartPlot',90],['VtArray',77],['VtCollection',31],['VtObject',32],['VtLight3',0xffffffff],['VtInfLight3',3],['VtAxis',5]]);
 const add=b=>{chunks.push(b);size+=b.length;};
 const type=(name,version=1)=>{
  add(u32(ids.get(name)));if(types.has(name))return;
  const bytes=Buffer.from(name+'\0');add(u16(bytes.length));add(bytes);add(u16(version));types.set(name,true);
 };
 const array=(id,n)=>{add(u32(id));type('VtArray');add(u16(n));type('VtCollection');add(u16(n));type('VtObject');};
 add(u32(0));type('VtChartPlot',4);array(1,0);const rawStart=size;add(Buffer.alloc(136,0xa5));
 const lightStart=size;add(u32(2));type('VtLight3');array(3,count);
 for(let i=0;i<count;i++){add(u32(100+i));type('VtInfLight3');add(Buffer.alloc(16,i%256));type('VtObject');}
 add(Buffer.alloc(10,0xb7));type('VtObject');const end=size;
 add(u32(999999));type('VtAxis',3);
 return {bytes:Buffer.concat(chunks),prior,offset,rawStart,lightStart,end};
}
const run=f=>observe(f.bytes,f.offset,f.prior);
const fails=(f,message)=>assert.throws(()=>run(f),e=>e.constructor===Error&&e.message===message);

test('sequential observation: sparse types, repeated references, 0/1/2/3/65535 sources, unaligned input',()=>{
 for(const count of [0,1,2,3,65535])for(const offset of (count===65535?[1]:[0,1,17,256])){
  const f=fixture(count,offset),r=run(f);
  assert.equal(r.id,0);assert.equal(r.typeId,90);assert.equal(r.lightTypeId,0xffffffff);
  assert.equal(r.initialArray.first,0);assert.equal(r.sourcesArray.first,count);assert.equal(r.sourcesArray.second,count);
  assert.equal(r.rawStart,f.rawStart);assert.equal(r.lightStart,f.lightStart);assert.equal(r.end,f.end);assert.equal(r.axisHeaderEnd,f.bytes.length);
  assert.equal(r.raw136,'a5'.repeat(136));assert.equal(r.lightRaw10,'b7'.repeat(10));assert.equal(r.sources.length,count);
  for(const [i,s] of r.sources.entries()){assert.equal(s.id,100+i);assert.equal(s.raw16,(i%256).toString(16).padStart(2,'0').repeat(16));}
  assert.equal(f.prior.size,0);const before=JSON.stringify(r);f.bytes.fill(0);assert.equal(JSON.stringify(r),before);
 }
});
test('all truncations fail explicitly, including the following Axis declaration',()=>{
 for(const count of [0,1,2,3]){
  const f=fixture(count,1);
  for(let cut=1;cut<f.bytes.length;cut++)fails({...f,bytes:f.bytes.subarray(0,cut)},'IncompletePlotObservation');
 }
});
test('does not scan forward to recover; rejects changed class, version, and known wrong type',()=>{
 const f=fixture(),r=run(f);
 for(const d of r.declarations)for(const field of ['nameOffset','versionOffset']){
  const bad=Buffer.concat([f.bytes,f.bytes]);bad[d[field]]^=1;fails({...f,bytes:bad},'UnsupportedPlotObservationType');
 }
 for(const at of r.references.slice(1)){
  const bad=Buffer.from(f.bytes);bad.writeUInt32LE(90,at);fails({...f,bytes:bad},'UnsupportedPlotObservationType');
 }
});
test('array words are explicit selected-layout gates, not silently ignored',()=>{
 const f=fixture(),r=run(f);
 for(const a of [r.initialArray,r.sourcesArray])for(const at of [a.firstOffset,a.secondOffset]){
  const bad=Buffer.from(f.bytes);bad.writeUInt16LE(65535,at);fails({...f,bytes:bad},'UnsupportedPlotObservationArray');
 }
 const bad=Buffer.from(f.bytes);bad.writeUInt16LE(1,r.initialArray.firstOffset);bad.writeUInt16LE(1,r.initialArray.secondOffset);
 fails({...f,bytes:bad},'UnsupportedPlotObservationInitialArray');
});
test('null and duplicate object IDs are not accepted as inline objects',()=>{
 const f=fixture(),r=run(f),offsets=[r.initialArray.start,r.lightStart,r.sourcesArray.start,...r.sources.map(s=>s.start),r.end];
 for(const at of offsets)for(const id of [0,0xffffffff]){const bad=Buffer.from(f.bytes);bad.writeUInt32LE(id,at);fails({...f,bytes:bad},'UnsupportedPlotObservationObject');}
 const bad=Buffer.from(f.bytes);bad.writeUInt32LE(0xffffffff);fails({...f,bytes:bad},'UnsupportedPlotObservationObject');
});
test('caller type state remains unchanged on success and late failure',()=>{
 const f=fixture(),r=run(f),prior=new Map([[90,{name:'wrong\0',version:4}]]),before=JSON.stringify([...prior]);
 fails({...f,prior},'UnsupportedPlotObservationType');assert.equal(JSON.stringify([...prior]),before);
 f.bytes[r.declarations.at(-1).versionOffset]=0;fails(f,'UnsupportedPlotObservationType');assert.equal(f.prior.size,0);
});
test('raw changes survive without float normalization or inferred property validation',()=>{
 const f=fixture(),r=run(f);
 for(const [start,n,field] of [[r.rawStart,136,'raw136'],[r.lightRawStart,10,'lightRaw10']]){
  const bad=Buffer.from(f.bytes);bad.fill(0xff,start,start+n);assert.equal(run({...f,bytes:bad})[field],'ff'.repeat(n));
 }
 const bad=Buffer.from(f.bytes);bad.fill(0xff,r.sources[0].rawStart,r.sources[0].rawStart+16);
 assert.equal(run({...f,bytes:bad}).sources[0].raw16,'ff'.repeat(16));
});
test('invalid caller offsets are explicit errors, not native Buffer traps',()=>{
 const f=fixture();for(const offset of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,f.bytes.length+1])
  assert.throws(()=>observe(f.bytes,offset,f.prior),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
 fails({...f,offset:f.bytes.length},'IncompletePlotObservation');
});
