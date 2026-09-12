import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {observeValueText:observe}=await import(process.env.CHART_VALUE_TEXT_MODULE?pathToFileURL(process.env.CHART_VALUE_TEXT_MODULE).href:'./chart-value-text-evidence.mjs');
function fixture(offset=1,textNull=true,freshLabel=false){
 const parts=[Buffer.alloc(offset,0xa5)];let p=offset;const refs=[];
 const add=b=>{parts.push(b);p+=b.length;};
 const n=(v,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(v,0,size);add(b);};
 const declared=new Set();
 const type=id=>{refs.push(p);n(id);if((id===5||id===6)&&!declared.has(id)){declared.add(id);const name=Buffer.from(id===5?'VtString\0':'VtValue\0');n(name.length,2);add(name);n(1,2);}};const raw=size=>add(Buffer.alloc(size,0xa5));
 for(let i=0;i<5;i++)n(0xffffffff);
 n(0);type(1);n(0xffffffff);n(0xffffffff);n(0x55aa,2);n(freshLabel?10:7);
 if(freshLabel){type(5);n(2,2);add(Buffer.from([0xff,0x80]));n(173,1);type(6);type(4);}
 const prefixEnd=p;add(Buffer.from([0xff,0x80,0x55]));type(2);raw(12);n(0xffffffff);n(9);type(3);n(freshLabel?10:7);raw(14);type(4);raw(24);
 if(textNull)n(0xffffffff);else if(freshLabel){n(11);type(5);n(2,2);add(Buffer.from([0xff,0x80]));n(173,1);type(6);type(4);}else n(7);
 raw(26);type(4);
 const types=new Map([[1,{name:'VtValueBlock\0',version:1}],[2,{name:'VtTextBlock\0',version:2}],[3,{name:'VtFont\0',version:1}],[4,{name:'VtObject\0',version:1}]]);
 return {bytes:Buffer.concat(parts),offset,prefixEnd,end:p,refs,types,strings:new Map([[7,{hex:'ff80',trailer:173}]])};
}
const run=f=>observe(f.bytes,f.offset,f.types,f.strings);
test('base has no object ID, nullable text, raw suffix and exact end at varied offsets',()=>{
 for(const offset of [0,1,17,257])for(const textNull of [false,true])for(const freshLabel of [false,true]){
  const f=fixture(offset,textNull,freshLabel),r=run(f);assert.equal(r.end,f.end);assert.equal(r.prefix.end,f.prefixEnd);assert.equal(r.rawSuffix,'ff8055');assert.equal(r.text.blockId,null);assert.equal(r.text.blockStart,f.prefixEnd+3);assert.equal(r.text.fontName.hex,'ff80');
  assert.equal(r.text.text===null,textNull);if(!textNull)assert.equal(r.text.text.hex,'ff80');
  for(const raw of r.text.rawFields)assert.equal(raw.hex,'a5'.repeat(raw.n));
  assert.deepEqual(run({...f,bytes:Buffer.concat([f.bytes,Buffer.alloc(50,0xff)])}),r);
  const copy=JSON.stringify(r);f.bytes.fill(0);f.strings.get(7).hex='00';assert.equal(JSON.stringify(r),copy);assert.equal(f.types.size,4);assert.equal(f.strings.size,1);
 }
});
test('every cut is an explicit incomplete error; prior type versions are checked',()=>{
 for(const textNull of [false,true])for(const freshLabel of [false,true]){
  const f=fixture(17,textNull,freshLabel);
  for(let cut=f.offset;cut<f.end;cut++)assert.throws(()=>run({...f,bytes:f.bytes.subarray(0,cut)}),e=>e.constructor===Error&&['IncompleteValueObservation','IncompleteAxisObservation'].includes(e.message));
  for(const [id,v] of f.types){const types=new Map(f.types);types.set(id,{...v,version:99});assert.throws(()=>run({...f,types}),e=>e.constructor===Error&&['UnsupportedValueObservationType','UnsupportedAxisObservationType'].includes(e.message));}
  assert.equal(run(f).end,f.end);
 }
});
