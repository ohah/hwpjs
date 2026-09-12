import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartTextBlockObjectsOracle as oracle} from './chart-text-block-objects-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,per,total,objects)=>Buffer.concat([u32(per),u32(total),u32(objects),b]);
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartTextBlockObjects(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;const e=oracle(b);
  const accept=bytes=>{const x=oracle(bytes);assert.deepEqual(call(318,input(bytes,x.per,x.total,x.objects),bytes.length),x.wire);accepted++;return x;};
  const reject=(bytes,error,per=e.per,total=e.total,objects=e.objects,limit=bytes.length)=>{
   assert.throws(()=>call(318,input(bytes,per,total,objects),limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(318,input(b,e.per,e.total,e.objects),b.length),e.wire);
  };
  accept(b);
  for(let cut=e.blockStart;cut<e.blockEnd;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.per-1);reject(b,'LimitExceeded',e.per,e.total-1);reject(b,'LimitExceeded',e.per,e.total,e.objects-1);
  reject(b,'LimitExceeded',e.per,e.total,e.objects,b.length-1);
  for(const at of e.references.filter(p=>p>=e.blockStart&&p<e.blockEnd)){const bad=Buffer.from(b);bad.writeUInt32LE(0,at);reject(bad,'UnsupportedChartClass');}
  for(const at of e.objectOffsets.filter(p=>p>=e.blockStart&&p<e.blockEnd&&p!==e.text.start&&p!==e.fontName.start))for(const id of [0xffffffff,e.fontName.id]){
   if(at===e.auxiliaryOffset&&id===0xffffffff)continue; // Legal null marker; tested by removing the complete auxiliary object below.
   const bad=Buffer.from(b);bad.writeUInt32LE(id,at);reject(bad,id===0xffffffff?'UnsupportedChartObjectReference':'DuplicateChartObjectId');
  }
  for(const at of [e.fontName.start,e.text.start]){const bad=Buffer.from(b);bad.writeUInt32LE(e.fontId,at);reject(bad,'UnsupportedChartObjectReference');}
  let bad=Buffer.from(b);bad.writeUInt32LE(1,e.rawFields.find(r=>r.n===4).start+4);reject(bad,'UnsupportedChartPictureData');
  bad=Buffer.from(b);for(const r of e.rawFields.filter(r=>r.start>=e.blockStart))bad.fill(0xff,r.start,r.start+r.n);
  for(const s of [e.fontName,e.text]){bad.fill(0xff,s.payloadOffset,s.payloadOffset+s.hex.length/2);bad[s.trailerOffset]^=255;}accept(bad);
  for(const s of [e.fontName,e.text])for(const n of [0,1,65535]){
   const value=Buffer.alloc(n+2,0xff);value.writeUInt16LE(n);bad=extent(Buffer.concat([b.subarray(0,s.lengthOffset),value,b.subarray(s.payloadOffset+s.hex.length/2)]));accept(bad);
  }
  bad=extent(Buffer.concat([b.subarray(0,e.text.start),u32(e.fontName.id),b.subarray(e.text.end)]));
  const alias=accept(bad);reject(bad,'LimitExceeded',alias.per,alias.total-1,alias.objects);
  bad=extent(Buffer.concat([b.subarray(0,e.auxiliaryOffset),u32(0xffffffff),b.subarray(e.backgroundEnd)]));accept(bad);
  // The product stops at TextBlock; no dependency on future Axis/scale bytes.
  for(const exact of [false,true]){
   bad=exact?extent(Buffer.from(b.subarray(0,e.blockEnd))):Buffer.from(b);if(!exact)bad.fill(0xff,e.blockEnd);
   assert.deepEqual(call(318,input(bad,e.per,e.total,e.objects),bad.length),e.wire);accepted++;
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(accepted,516);
 return {roots,accepted,rejected};
}
