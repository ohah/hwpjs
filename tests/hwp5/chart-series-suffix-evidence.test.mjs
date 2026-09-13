import assert from 'node:assert/strict';import test from 'node:test';
import {seriesSuffixFixture as fixture} from './chart-series-suffix-fixture.mjs';import {observeSeriesSuffix} from './chart-series-suffix-evidence.mjs';import {observeScopedTextFormat} from './chart-text-format-scope-evidence.mjs';
const parse=(f,b=f.bytes)=>observeSeriesSuffix(b,f.offset,f.types,f.objects,f.strings);
const expected=names=>e=>e.constructor===Error&&names.includes(e.message);
const incomplete=expected(['IncompleteSeriesSuffixObservation','IncompleteAxisObservation','IncompleteTextFormatObservation']);
test('Series suffix shares inline text body and two formats with independent scopes and nullable raw codes',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true])for(const first of ['null','alias','fresh','empty'])for(const second of ['null','alias','fresh','empty',...(first==='fresh'||first==='empty'?['first']:[])]){
  const f=fixture(offset,known,first,second),r=parse(f);assert.equal(r.end,f.end);assert.equal(r.blockId,0);assert.equal(r.body.end,f.bodyEnd);assert.equal(r.rawWord,0x1234);assert.equal(r.formats.length,2);
  for(const [i,kind] of [first,second].entries()){const x=r.formats[i].format;assert.equal(x.start,f.formats[i].start);assert.equal(x.end,f.formats[i].end);assert.equal(x.headerWord,30+i);assert.equal(x.rawWord,0xaa55);assert.equal(x.code?.hex??null,kind==='null'?null:kind==='empty'||(kind==='first'&&first==='empty')?'':'ff80');assert.equal(x.code?.introduced??false,kind==='fresh'||kind==='empty');}
  assert(!r.body.objects.has(30));assert(!r.formats[0].objects.has(31));assert.equal(r.body.types.has(501),known);assert(r.formats[0].types.has(501));assert.equal(r.objects.size,6+Number(first==='fresh'||first==='empty')+Number(second==='fresh'||second==='empty'));
  assert.deepEqual(parse(f,Buffer.concat([f.bytes,Buffer.alloc(31,255)])),r);assert.deepEqual(f.objects,new Set([99,999]));assert.equal(f.strings.size,1);assert.equal(f.types.size,known?8:7);
  f.bytes.fill(0);f.objects.clear();f.strings.clear();f.types.clear();assert.equal(r.body.text.fontName.hex,'ff80');assert.equal(r.formats[0].format.rawWord,0xaa55);
 }
});
test('Series suffix cuts type versions null IDs duplicates invalid scopes and offsets fail explicitly',()=>{
 for(const offset of [0,1,17,257])for(const known of [false,true])for(const kind of ['null','alias','fresh','empty']){
  const f=fixture(offset,known,kind,'fresh'),r=parse(f);
  for(let cut=offset;cut<f.end;cut++)assert.throws(()=>parse(f,f.bytes.subarray(0,cut)),incomplete);
  for(const at of [offset,...f.formats.map(x=>x.start)])for(const id of [0xffffffff,999]){const b=Buffer.from(f.bytes);b.writeUInt32LE(id,at);assert.throws(()=>parse(f,b),expected(['UnsupportedSeriesSuffixObservationObject','UnsupportedTextFormatObservationObject']));}
  const duplicate=Buffer.from(f.bytes);duplicate.writeUInt32LE(30,f.formats[1].start);assert.throws(()=>parse(f,duplicate),expected(['UnsupportedTextFormatObservationObject']));
  const own=Buffer.from(f.bytes);own.writeUInt32LE(30,f.formats[0].codeOffset);assert.throws(()=>parse(f,own),expected(['UnsupportedTextFormatObservationObject']));
  if(known){const types=new Map(f.types);types.set(501,{name:'VtTextFormat\0',version:99});assert.throws(()=>observeSeriesSuffix(f.bytes,offset,types,f.objects,f.strings),expected(['UnsupportedTextFormatObservationType']));}
  else for(const at of [f.formats[0].nameOffset,f.formats[0].versionOffset]){const b=Buffer.from(f.bytes);b[at]^=1;assert.throws(()=>parse(f,b),expected(['UnsupportedTextFormatObservationType']));}
  const words=Buffer.from(f.bytes);words.writeUInt16LE(65535,f.wordOffset);assert.deepEqual(parse(f,words),{...r,rawWord:65535});assert.deepEqual(parse(f),r);
 }
 const f=fixture();for(const offset of [-1,0.5,NaN,f.end+1])assert.throws(()=>observeSeriesSuffix(f.bytes,offset,f.types,f.objects,f.strings),RangeError);
});
test('nullable format is opt-in and a first format String can be reused by the second',()=>{
 for(const kind of ['null','alias','fresh','empty']){
  const f=fixture(17,false,kind,'alias'),r=parse(f),s=r.body;
  const read=allow=>observeScopedTextFormat(f.bytes,f.formats[0].start,s.types,s.objects,s.strings,allow);
  assert.deepEqual(read(true),r.formats[0]);if(kind==='null')assert.throws(()=>read(false),expected(['UnsupportedTextFormatObservationObject']));else assert.deepEqual(read(false),read(true));
 }
 const f=fixture(17,false,'fresh','first'),r=parse(f);assert.equal(r.formats[1].format.code.id,40);assert.equal(r.formats[1].format.code.introduced,false);assert.equal(r.strings.size,2);
 const f2=fixture(17,true,'alias','alias'),r2=parse(f2),s=r2.body,objects=new Set(s.objects);objects.delete(99);assert.throws(()=>observeScopedTextFormat(f2.bytes,f2.formats[0].start,s.types,objects,s.strings,true),expected(['UnsupportedTextFormatObservationObject']));
});
