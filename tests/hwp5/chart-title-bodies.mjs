import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes} from './hwp-corpus-evidence.mjs';import {titleBodyOracle} from './chart-title-body-oracle.mjs';import {integer} from './chart-text-body-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartTitleBodies(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=titleBodyOracle(b),t=e.r.body.text;
  const accept=bytes=>{const x=titleBodyOracle(bytes);assert.deepEqual(call(332,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.r.objects.size,limit=bytes.length)=>{assert.throws(()=>call(332,e.input(bytes,maxObjects),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(332,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(255,e.end);accept(after);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.r.objects.size-1);reject(b,'LimitExceeded',e.r.objects.size,b.length-1);
  for(const at of [e.r.blockOffset,...t.objectOffsets,...e.r.section.objectOffsets]){
   const isString=[t.fontName.start,t.text?.start].includes(at);
   const bad=Buffer.from(b);bad.writeUInt32LE(e.prior.r.title.id,at);reject(bad,isString?'UnsupportedChartObjectReference':'DuplicateChartObjectId');
   if(at!==t.text?.start){const bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,at);reject(bad,'UnsupportedChartObjectReference');}
  }
  const base=[...e.prior.r.types].find(([,d])=>d.name==='VtObject\0')[0];
  for(const at of [...e.r.references,...t.references,...e.r.section.references]){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(at)===base?e.r.typeId:base,at);reject(bad,'UnsupportedChartClass');}
  for(const id of [0,1,e.prior.r.title.id,0xfffffffe]){const bad=Buffer.from(b);bad.writeUInt32LE(id,e.r.section.dataOffset);reject(bad,'UnsupportedChartPictureData');}
  const raw=Buffer.from(b);for(const f of e.r.section.rawFields)raw.fill(255,f.start,f.start+f.n);raw.writeUInt16LE(65535,e.r.section.suffixOffset);accept(raw);
  const text=t.text;assert(text?.introduced);
  for(const id of [0xffffffff,t.fontName.id])accept(extent(Buffer.concat([b.subarray(0,text.start),integer(id),b.subarray(text.end)])));
  const empty=Buffer.concat([b.subarray(0,text.payloadOffset),b.subarray(text.trailerOffset)]);empty.writeUInt16LE(0,text.lengthOffset);accept(extent(empty));
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected};
}
