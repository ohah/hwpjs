import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {observeValuePrefix:observe}=await import(process.env.CHART_VALUE_OBSERVER_MODULE?pathToFileURL(process.env.CHART_VALUE_OBSERVER_MODULE).href:'./chart-value-prefix-evidence.mjs');
function fixture({offset=1,format=false,reference=false,alias=false,header=0}={}){
 const chunks=[Buffer.alloc(offset,0xa5)],types=new Map(),declarations=[];let p=offset;
 const add=b=>{chunks.push(b);p+=b.length;};
 const number=(n,size)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);};
 const word=n=>number(n,2),long=n=>number(n,4);
 const type=(name)=>{
  if(types.has(name)){long(types.get(name));return;}
  const id=101+types.size*13;types.set(name,id);long(id);const b=Buffer.from(name+'\0');word(b.length);const nameOffset=p;add(b);const versionOffset=p;word(1);declarations.push({nameOffset,versionOffset});
 };
 const string=id=>{long(id);type('VtString');word(3);add(Buffer.from([0xff,0,0x80]));number(173,1);type('VtValue');type('VtObject');};
 for(let i=0;i<5;i++)long(0xffffffff);
 long(header);type('VtValueBlock');long(reference?7:0xffffffff);
 if(format){long(55);type('VtTextFormat');type('VtObject');word(0xaa55);string(8);}else long(0xffffffff);
 word(0x55aa);const labelOffset=p;if(alias)long(format?8:7);else string(9);
 return {bytes:Buffer.concat(chunks),offset,end:p,labelOffset,declarations,priorTypes:new Map(),priorStrings:new Map([[7,{hex:'0102',trailer:99}]])};
}
const run=f=>observe(f.bytes,f.offset,f.priorTypes,f.priorStrings);
const fails=(f,message)=>assert.throws(()=>run(f),e=>e.constructor===Error&&e.message===message);
test('nullable reference/format, string aliases, sparse types and raw values at varied offsets',()=>{
 for(const offset of [0,1,17,257])for(const format of [false,true])for(const reference of [false,true])for(const alias of [false,true])for(const header of [0,0x87654321]){
  const f=fixture({offset,format,reference,alias,header}),r=run(f);
  assert.equal(r.start,offset);assert.equal(r.end,f.end);assert.equal(r.headerWord,header);assert.deepEqual(r.slots,Array(5).fill(0xffffffff));
  assert.equal(Boolean(r.reference),reference);if(reference){assert.equal(r.reference.hex,'0102');assert.equal(r.reference.introduced,false);assert.equal(r.reference.trailer,99);}
  assert.equal(Boolean(r.format),format);if(format){assert.equal(r.format.headerWord,55);assert.equal(r.format.rawWord,0xaa55);assert.equal(r.format.code.hex,'ff0080');}
  assert.equal(r.rawBeforeLabel,0x55aa);assert.equal(r.label.introduced,!alias);assert.equal(r.label.hex,alias&&!format?'0102':'ff0080');assert.equal(r.label.trailer,alias&&!format?99:173);
  const snapshot=JSON.stringify(r);f.bytes.fill(0);f.priorStrings.get(7).hex='ffff';assert.equal(JSON.stringify(r),snapshot);assert.equal(f.priorTypes.size,0);assert.equal(f.priorStrings.size,1);
 }
});
test('all truncations and all declared class/version corruptions fail explicitly',()=>{
 for(const format of [false,true])for(const reference of [false,true])for(const alias of [false,true]){
  const f=fixture({format,reference,alias});for(let cut=f.offset;cut<f.end;cut++)fails({...f,bytes:f.bytes.subarray(0,cut)},'IncompleteValueObservation');
  for(const d of f.declarations)for(const at of [d.nameOffset,d.versionOffset]){const b=Buffer.from(f.bytes);b[at]^=1;fails({...f,bytes:b},'UnsupportedValueObservationType');}
  assert.equal(run(f).end,f.end);
 }
});
test('selected slots, null label, offsets and exact end are independently checked',()=>{
 const f=fixture();for(let i=0;i<5;i++){const b=Buffer.from(f.bytes);b.writeUInt32LE(0,f.offset+4*i);fails({...f,bytes:b},'UnsupportedValueObservationSlots');}
 const b=Buffer.from(f.bytes);b.writeUInt32LE(0xffffffff,f.labelOffset);fails({...f,bytes:b},'UnsupportedValueObservationString');
 for(const offset of [-1,0.5,NaN,Infinity,f.end+1])assert.throws(()=>run({...f,offset}),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
 assert.deepEqual(run({...f,bytes:Buffer.concat([f.bytes,Buffer.alloc(100,0xff)])}),run(f));
});
