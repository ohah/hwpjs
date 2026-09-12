import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartFootnoteOracle} from './chart-footnote-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,s,t)=>Buffer.concat([u32(s),u32(t),b]);
export async function chartFootnotes(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
 let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;const e=chartFootnoteOracle(b),max=Math.max(...e.block.strings.map(s=>s.bytes.length)),total=e.block.strings.reduce((n,s)=>n+s.bytes.length,0);
  const accept=bytes=>{
   const x=chartFootnoteOracle(bytes),sizes=x.block.strings.map(s=>s.bytes.length);
   assert.deepEqual(call(315,input(bytes,Math.max(...sizes),sizes.reduce((a,b)=>a+b,0)),bytes.length),x.wire);accepted++;
  };
  const reject=(bytes,error,s=max,t=total,limit=bytes.length)=>{
   assert.throws(()=>call(315,input(bytes,s,t),limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(315,input(b,max,total),b.length),e.wire);
  };
  accept(b);
  assert.equal(e.end-e.start,436);
  // The independently located next declaration is evidence, not the end rule.
  const nextLength=b.readUInt16LE(e.end+8);assert.equal(b.subarray(e.end+10,e.end+10+nextLength).toString('latin1'),'VtChartLegend\0');
  for(let cut=e.start;cut<e.end;cut++){
   const bad=Buffer.from(b.subarray(0,cut));bad.writeUInt32LE(cut-36,32);reject(bad,'UnexpectedEnd');
  }
  reject(b,'LimitExceeded',max-1);reject(b,'LimitExceeded',max,total-1);reject(b,'LimitExceeded',max,total,b.length-1);
  for(const d of e.declarations){
   let bad=Buffer.from(b);bad[d.nameOffset]=88;reject(bad,'UnsupportedChartClass');
   bad=Buffer.from(b);bad[d.versionOffset]++;reject(bad,'UnsupportedChartTypeVersion');
  }
  for(const [i,offset] of e.objectOffsets.entries()){
   let bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,offset);reject(bad,'UnsupportedChartObjectReference');
   for(const prior of e.objectOffsets.slice(0,i)){bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(prior),offset);reject(bad,'UnsupportedChartObjectReference');}
  }
  for(const offset of [...e.references,...e.bases]){const bad=Buffer.from(b);bad.writeUInt32LE(0,offset);reject(bad,'UnsupportedChartClass');}
  let bad=Buffer.from(b);bad.writeUInt32LE(0,e.picture);reject(bad,'UnsupportedChartPictureData');
  bad=Buffer.from(b);for(const [offset,length] of e.rawOffsets)bad.fill(0xa5,offset,offset+length);bad.writeUInt16LE(65535,e.suffixOffset);accept(bad);
  bad=Buffer.from(b);for(const [i,offset] of e.objectOffsets.entries())bad.writeUInt32LE([0,0xfffffffe,100,5,6,7,8,9][i],offset);accept(bad);
  bad=Buffer.from(b);for(const [i,d] of e.declarations.entries())bad.writeUInt32LE(900+i,d.idOffset);accept(bad);
  for(const length of [0,1,65535]){
   bad=Buffer.from(b);const field=Buffer.alloc(2+length,0xff);field.writeUInt16LE(length);
   for(const s of [...e.block.strings].reverse())bad=Buffer.concat([bad.subarray(0,s.lengthOffset),field,bad.subarray(s.payloadOffset+s.bytes.length)]);
   bad.writeUInt32LE(bad.length-36,32);accept(bad);
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(accepted,301);
 return {roots,accepted,rejected};
}
