import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {observeValuePrefix:observe}=await import(process.env.CHART_VALUE_OBSERVER_MODULE?pathToFileURL(process.env.CHART_VALUE_OBSERVER_MODULE).href:'./chart-value-prefix-evidence.mjs');
function fixture({offset=1,bits='8000000000000000',reference=false,labelNumber=false,declarations=false}={}){
 const chunks=[Buffer.alloc(offset,0xa5)],types=new Map(),decls=[];let p=offset;
 const add=b=>{chunks.push(b);p+=b.length;};const n=(v,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(v,0,size);add(b);};
 const type=(id,name)=>{n(id);if(declarations){const b=Buffer.from(name+'\0');n(b.length,2);const at=p;add(b);const version=p;n(1,2);decls.push({at,version});}else types.set(id,{name:name+'\0',version:1});};
 for(let i=0;i<5;i++)n(0xffffffff);n(0);type(91,'VtValueBlock');const valueStart=p;n(9);
 if(!reference){type(131,'VtDouble');const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt('0x'+bits));add(b);n(0xaa55,2);type(171,'VtValue');type(211,'VtObject');}
 n(0xffffffff);n(0x55aa,2);n(labelNumber?9:7);
 return {bytes:Buffer.concat(chunks),offset,end:p,valueStart,decls,types,strings:new Map([[7,{hex:'ff80',trailer:173}]]),numbers:new Map(reference?[[9,{bitsHex:bits,trailer:0xaa55}]]:[])};
}
const run=f=>observe(f.bytes,f.offset,f.types,f.strings,f.numbers);
test('numeric reference preserves every float bit class and raw trailer without conversion',()=>{
 for(const bits of ['0000000000000000','8000000000000000','7ff0000000000000','fff0000000000000','7ff0000000000001','7ff8000000001234','0000000000000001','ffffffffffffffff'])for(const offset of [0,1,17,257])for(const reference of [false,true])for(const declarations of [false,true]){
  const f=fixture({bits,offset,reference,declarations}),r=run(f);
  assert.equal(r.end,f.end);assert.equal(r.reference.kind,'number');assert.equal(r.reference.bitsHex,bits);assert.equal(r.reference.trailer,0xaa55);assert.equal(r.reference.introduced,!reference);assert.equal(r.label.hex,'ff80');assert.equal(r.rawBeforeLabel,0x55aa);
  if(reference)assert.equal(r.reference.end-r.reference.start,4);
  assert.deepEqual(run({...f,bytes:Buffer.concat([f.bytes,Buffer.alloc(20,0xff)])}),r);
  const saved=JSON.stringify(r);f.bytes.fill(0);for(const v of f.numbers.values())v.bitsHex='0';assert.equal(JSON.stringify(r),saved);assert.equal(f.numbers.size,reference?1:0);
 }
});
test('all numeric cuts, declared types and label numeric alias reject explicitly',()=>{
 for(const reference of [false,true])for(const declarations of [false,true]){
  const f=fixture({reference,declarations});for(let cut=f.offset;cut<f.end;cut++)assert.throws(()=>run({...f,bytes:f.bytes.subarray(0,cut)}),e=>e.constructor===Error&&e.message==='IncompleteValueObservation');
  for(const d of f.decls)for(const at of [d.at,d.version]){const b=Buffer.from(f.bytes);b[at]^=1;assert.throws(()=>run({...f,bytes:b}),e=>e.constructor===Error&&e.message==='UnsupportedValueObservationType');}
  assert.throws(()=>run(fixture({reference,declarations,labelNumber:true})),e=>e.constructor===Error&&e.message==='UnsupportedValueObservationString');
  const ambiguous=fixture({reference:true});ambiguous.strings.set(9,{hex:'00',trailer:0});assert.throws(()=>run(ambiguous),e=>e.constructor===Error&&e.message==='UnsupportedValueObservationString');
 }
});
