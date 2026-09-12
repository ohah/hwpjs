import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
const {observeAxisPrefix:observe}=await import(process.env.CHART_AXIS_OBSERVER_MODULE?pathToFileURL(process.env.CHART_AXIS_OBSERVER_MODULE).href:'./chart-axis-prefix-evidence.mjs');
const int=(n,size)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
function fixture({scale=true,background=true,offset=1,textReference=false}={}){
 const chunks=[Buffer.alloc(offset,0xa5)],types=new Map(),declarations=[];let p=offset;
 const add=b=>{chunks.push(b);p+=b.length;};
 const word=n=>add(int(n,2)),long=n=>add(int(n,4)),raw=n=>add(Buffer.alloc(n,0xa5));
 const type=(name,version=1)=>{
  if(types.has(name)){long(types.get(name));return;}
  const id=100+types.size*7;types.set(name,id);long(id);const b=Buffer.from(name+'\0');word(b.length);const at=p;add(b);const v=p;word(version);declarations.push({at,v});
 };
 const array=(id,first,second)=>{long(id);type('VtArray');word(first);type('VtCollection');word(second);type('VtObject');};
 long(0);type('VtAxis',3);raw(82);const blockStart=p;long(1);type('VtTextBlock',2);raw(12);
 const auxiliary=p;
 if(background){for(const [id,name,n] of [[2,'VtBackdrop',50],[3,'VtFill',34],[4,'VtPicture',4]]){long(id);type(name);raw(n);}long(0xffffffff);type('VtObject');word(0xaa55);type('VtObject');type('VtObject');}
 else long(0xffffffff);
 long(5);type('VtFont');const nameOffset=p;long(7);raw(14);type('VtObject');raw(24);const textOffset=p;
 if(textReference)long(7);else{long(6);type('VtString');word(2);add(Buffer.from([0xff,0x80]));add(Buffer.from([173]));type('VtValue');type('VtObject');}
 raw(26);type('VtObject');const blockEnd=p;array(8,scale?1:0,scale?1:0);
 if(scale){long(9);type('VtAxisScaleBlock');array(10,5,0);}
 return {bytes:Buffer.concat(chunks),offset,priorTypes:new Map(),priorStrings:new Map([[7,{hex:'0102',trailer:99}]]),declarations,blockStart,blockEnd,end:p,auxiliary,nameOffset,textOffset};
}
const run=f=>observe(f.bytes,f.offset,f.priorTypes,f.priorStrings);
const fails=(f,message)=>assert.throws(()=>run(f),e=>e.constructor===Error&&e.message===message);
test('auxiliary Backdrop/null, shared names/text, optional scale and unequal nested array words',()=>{
 for(const background of [false,true])for(const scale of [false,true])for(const textReference of [false,true])for(const offset of [0,1,17,257]){
  const f=fixture({background,scale,textReference,offset}),r=run(f);
  assert.equal(r.axisId,0);assert.equal(r.blockStart,f.blockStart);assert.equal(r.blockEnd,f.blockEnd);assert.equal(r.end,f.end);
  assert.equal(Boolean(r.background),background);if(background)assert.deepEqual(r.background,{ids:[2,3,4],suffix:0xaa55});
  assert.equal(r.fontName.id,7);assert.equal(r.fontName.introduced,false);assert.equal(r.fontName.hex,'0102');
  assert.equal(r.text.introduced,!textReference);assert.equal(r.text.hex,textReference?'0102':'ff80');assert.equal(r.text.trailer,textReference?99:173);
  assert.equal(Boolean(r.scale),scale);if(scale)assert.deepEqual([r.scale.array.first,r.scale.array.second],[5,0]);
  for(const raw of r.rawFields)assert.equal(raw.hex,'a5'.repeat(raw.n));
  const before=JSON.stringify(r);f.bytes.fill(0);assert.equal(JSON.stringify(r),before);assert.equal(f.priorTypes.size,0);assert.equal(f.priorStrings.size,1);
 }
});
test('all truncations and each new type name/version reject explicitly without resynchronization',()=>{
 for(const background of [false,true])for(const scale of [false,true]){
  const f=fixture({background,scale});for(let cut=f.offset;cut<f.end;cut++)fails({...f,bytes:f.bytes.subarray(0,cut)},'IncompleteAxisObservation');
  for(const d of f.declarations)for(const at of [d.at,d.v]){const b=Buffer.concat([f.bytes,f.bytes]);b[at]^=1;fails({...f,bytes:b},'UnsupportedAxisObservationType');}
 }
});
test('null object and name referencing known non-string are not accepted',()=>{
 const f=fixture();for(const at of [f.offset,f.blockStart,f.auxiliary,f.nameOffset,f.textOffset]){
  const b=Buffer.from(f.bytes);b.writeUInt32LE(at===f.auxiliary?0:0xffffffff,at);fails({...f,bytes:b},'UnsupportedAxisObservationObject');
 }
 const b=Buffer.from(f.bytes);b.writeUInt32LE(5,f.nameOffset);fails({...f,bytes:b},'UnsupportedAxisObservationObject');
});
test('invalid offsets remain caller errors and no extra bytes are required at the exact end',()=>{
 const f=fixture();for(const offset of [-1,0.5,NaN,Infinity,f.bytes.length+1])assert.throws(()=>run({...f,offset}),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
 const r=run(f);assert.deepEqual(run({...f,bytes:Buffer.concat([f.bytes,Buffer.alloc(100,0xff)])}),r);
});
