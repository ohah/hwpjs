import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartTextBlockOracle} from './chart-text-block-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,s,t)=>Buffer.concat([u32(s),u32(t),b]);
export async function chartTextBlocks(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
 let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;const e=chartTextBlockOracle(b),max=Math.max(...e.strings.map(s=>s.bytes.length)),total=e.strings.reduce((n,s)=>n+s.bytes.length,0);
  const accept=bytes=>{
   const x=chartTextBlockOracle(bytes),sizes=x.strings.map(s=>s.bytes.length);
   assert.deepEqual(call(314,input(bytes,Math.max(...sizes),sizes.reduce((a,b)=>a+b,0)),bytes.length),x.wire);accepted++;
  };
  const reject=(bytes,error,s=max,t=total,limit=bytes.length)=>{
   assert.throws(()=>call(314,input(bytes,s,t),limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(314,input(b,max,total),b.length),e.wire);
  };
  accept(b);
  for(let cut=e.start;cut<e.end;cut++){
   const bad=Buffer.from(b.subarray(0,cut));bad.writeUInt32LE(cut-36,32);reject(bad,'UnexpectedEnd');
  }
  reject(b,'LimitExceeded',max-1);reject(b,'LimitExceeded',max,total-1);reject(b,'LimitExceeded',max,total,b.length-1);
  for(const d of e.declarations){
   let bad=Buffer.from(b);bad[d.nameOffset]=88;reject(bad,'UnsupportedChartClass');
   bad=Buffer.from(b);bad[d.versionOffset]++;reject(bad,'UnsupportedChartTypeVersion');
  }
  for(const offset of e.objectOffsets){const bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,offset);reject(bad,'UnsupportedChartObjectReference');}
  for(const offset of e.objectOffsets.slice(1)){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(e.objectOffsets[0]),offset);reject(bad,'UnsupportedChartObjectReference');}
  let bad=Buffer.from(b);bad.writeUInt32LE(0,e.auxiliary);reject(bad,'UnsupportedChartTextReference');
  for(const offset of e.bases){bad=Buffer.from(b);bad.writeUInt32LE(0,offset);reject(bad,'UnsupportedChartClass');}
  bad=Buffer.from(b);
  for(const [offset,len] of e.rawOffsets)bad.fill(0xa5,offset,offset+len);
  for(const s of e.strings){bad.fill(0xff,s.payloadOffset,s.payloadOffset+s.bytes.length);bad[s.trailerOffset]^=255;}
  accept(bad);
  bad=Buffer.from(b);for(const [i,d] of e.declarations.entries())bad.writeUInt32LE(900+i,d.idOffset);accept(bad);
  for(const length of [0,1,65535]){
   bad=Buffer.from(b);const field=Buffer.alloc(2+length,0xff);field.writeUInt16LE(length);
   for(const s of [...e.strings].reverse())bad=Buffer.concat([bad.subarray(0,s.lengthOffset),field,bad.subarray(s.payloadOffset+s.bytes.length)]);
   bad.writeUInt32LE(bad.length-36,32);accept(bad);
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(accepted,258);
 return {roots,accepted,rejected};
}
