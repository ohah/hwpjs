import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {observeAxisTail:observe}=await import(process.env.CHART_AXIS_TAIL_MODULE?pathToFileURL(process.env.CHART_AXIS_TAIL_MODULE).href:'./chart-axis-tail-evidence.mjs');
const types=new Map([[0xfedcba98,{name:'VtObject\0',version:1}]]);
function fixture(offset,selector){const b=Buffer.alloc(offset+54+selector*24,0xa5);b.fill(0xff,offset,offset+36);if(selector)b.fill(0x80,offset+36,offset+60);b.writeUInt32LE(0xfedcba98,b.length-4);return b;}
test('selector chooses one layout; raw values and exact end survive arbitrary offsets',()=>{
 for(const offset of [0,1,17,257])for(const selector of [0,1]){
  const b=fixture(offset,selector),r=observe(b,offset,selector,types);
  assert.equal(r.start,offset);assert.equal(r.end,b.length);assert.equal(r.selector,selector);assert.equal(r.prefix,'ff'.repeat(36));assert.equal(r.extra,selector?'80'.repeat(24):null);assert.equal(r.suffix,'a5'.repeat(14));assert.equal(r.baseOffset,b.length-4);assert.equal(r.baseTypeId,0xfedcba98);
  assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(100,0xff)]),offset,selector,types),r);
  const before=JSON.stringify(r);b.fill(0);assert.equal(JSON.stringify(r),before);
 }
});
test('every truncation, wrong selector/base/version and invalid offsets reject explicitly',()=>{
 for(const selector of [0,1]){
  const b=fixture(17,selector);
  for(let cut=17;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),17,selector,types),e=>e.constructor===Error&&e.message==='IncompleteAxisTail');
  for(const bad of [-1,2,65535,NaN])assert.throws(()=>observe(b,17,bad,types),e=>e.constructor===Error&&e.message==='UnsupportedAxisTailLayout');
  for(const map of [new Map(),new Map([[0xfedcba98,{name:'VtArray\0',version:1}]]),new Map([[0xfedcba98,{name:'VtObject\0',version:2}]])])assert.throws(()=>observe(b,17,selector,map),e=>e.constructor===Error&&e.message==='UnsupportedAxisTailType');
  for(const offset of [-1,0.5,NaN,Infinity,b.length+1])assert.throws(()=>observe(b,offset,selector,types),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
 }
});
