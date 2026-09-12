import assert from 'node:assert/strict';
import test from 'node:test';
import {observeAxis,observeAxisNullableTitle as observe} from './chart-axis-evidence.mjs';
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
const types=new Map(['VtAxis','VtTextBlock','VtFont','VtObject','VtArray','VtCollection','VtString','VtValue'].map((name,i)=>[100+i,{name:name+'\0',version:i===0?3:i===1?2:1}]));
const strings=new Map([[3,{hex:'ab80',trailer:73}]]);
function fixture(kind,start){
 const raw=Buffer.alloc(82,0x81);raw.writeUInt16LE(0,6);
 const text=kind==='null'?int(0xffffffff):kind==='alias'?int(3):Buffer.concat([int(4),int(106),int(kind==='empty'?0:2,2),kind==='empty'?Buffer.alloc(0):Buffer.from([255,128]),int(99,1),int(107),int(103)]);
 return Buffer.concat([Buffer.alloc(start,0xa5),int(0),int(100),raw,int(1),int(101),Buffer.alloc(12,0x81),int(0xffffffff),int(2),int(102),int(3),Buffer.alloc(14,0x81),int(103),Buffer.alloc(24,0x81),text,Buffer.alloc(26,0x81),int(103),int(5),int(104),int(0,2),int(105),int(0,2),int(103),Buffer.alloc(50,0x81),int(103)]);
}
test('nullable title preserves null empty fresh alias and required-title compatibility',()=>{
 for(const start of [0,1,17,257])for(const kind of ['null','empty','fresh','alias']){
  const b=fixture(kind,start),priorTypes=new Map(types),priorStrings=new Map(strings),r=observe(b,start,priorTypes,priorStrings);
  assert.equal(r.end,b.length);assert.equal(r.value,null);assert.equal(r.axis.text===null,kind==='null');
  assert.equal(r.strings.size,kind==='null'||kind==='alias'?1:2);
  if(kind==='null')assert.throws(()=>observeAxis(b,start,priorTypes,priorStrings),e=>e.constructor===Error&&e.message==='UnsupportedAxisObservationObject');
  else{assert.equal(r.axis.text.hex,kind==='empty'?'':kind==='alias'?'ab80':'ff80');assert.deepEqual(observeAxis(b,start,priorTypes,priorStrings),r);}
  assert.deepEqual(priorTypes,types);assert.deepEqual(priorStrings,strings);
  assert.deepEqual(observe(Buffer.concat([b,Buffer.alloc(50,255)]),start,types,strings),r);
  b.fill(0);if(r.axis.text)assert.equal(r.axis.text.hex,kind==='empty'?'':kind==='alias'?'ab80':'ff80');
 }
});
test('nullable title cuts versions and required font-name do not become permissive',()=>{
 for(const start of [0,1,17,257])for(const kind of ['null','empty','fresh','alias']){
  const b=fixture(kind,start);
  for(let cut=start;cut<b.length;cut++)assert.throws(()=>observe(b.subarray(0,cut),start,types,strings),e=>e.constructor===Error&&['IncompleteAxisObservation','IncompleteAxisTail'].includes(e.message));
  const nullName=Buffer.from(b);nullName.writeUInt32LE(0xffffffff,start+122);assert.throws(()=>observe(nullName,start,types,strings),e=>e.constructor===Error&&e.message==='UnsupportedAxisObservationObject');
  for(const id of [100,101,102,103,104,105]){const bad=new Map(types);bad.set(id,{...bad.get(id),version:99});assert.throws(()=>observe(b,start,bad,strings),e=>e.constructor===Error&&e.message==='UnsupportedAxisObservationType');}
 }
});
