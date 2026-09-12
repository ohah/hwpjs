import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartLegendOracle} from './chart-legend-oracle.mjs';
import {observePlotPrefix} from './chart-plot-evidence.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function oracle(b){
 const legend=chartLegendOracle(b),prior=new Map([[3,{name:'VtCollection\0',version:1}],[4,{name:'VtObject\0',version:1}]]);
 const e=observePlotPrefix(b,legend.end,prior),count=e.sources.length,objects=legend.objectCount+4+count;
 const wire=Buffer.concat([...[e.end,e.lightId,e.sourcesArray.id,e.sourcesArray.first,e.sourcesArray.second,count,objects].map(u32),Buffer.from(e.lightRaw10,'hex'),
  ...e.sources.map(s=>Buffer.concat([...[s.id,s.start,s.end].map(u32),Buffer.from(s.raw16,'hex')]))]);
 return {...e,objects,wire,priorId:legend.nameId};
}
export async function chartLights(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 const input=(b,n,objects)=>Buffer.concat([u32(n),u32(objects),b]);
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;const e=oracle(b);
  const accept=bytes=>{const x=oracle(bytes);assert.deepEqual(call(317,input(bytes,x.sources.length,x.objects),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,n=e.sources.length,objects=e.objects,limit=bytes.length)=>{
   assert.throws(()=>call(317,input(bytes,n,objects),limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(317,input(b,e.sources.length,e.objects),b.length),e.wire);
  };
  accept(b);
  for(let cut=e.lightStart;cut<e.end;cut++){const bad=Buffer.from(b.subarray(0,cut));bad.writeUInt32LE(cut-36,32);reject(bad,'UnexpectedEnd');}
  reject(b,'LimitExceeded',e.sources.length-1);reject(b,'LimitExceeded',e.sources.length,e.objects-1);
  reject(b,'LimitExceeded',e.sources.length,e.objects,b.length-1);
  for(const d of e.declarations.filter(d=>d.at>=e.lightStart&&d.at<e.end))for(const at of [d.nameOffset,d.versionOffset]){
   const bad=Buffer.from(b);bad[at]^=1;reject(bad,at===d.nameOffset?'UnsupportedChartClass':'UnsupportedChartTypeVersion');
  }
  for(const at of e.references.filter(at=>at>=e.lightStart&&at<e.end)){const bad=Buffer.from(b);bad.writeUInt32LE(0,at);reject(bad,'UnsupportedChartClass');}
  for(const a of [e.initialArray,e.sourcesArray])for(const at of [a.firstOffset,a.secondOffset]){
   const bad=Buffer.from(b);bad.writeUInt16LE(65535,at);reject(bad,'UnsupportedChartArrayLayout');
  }
  let bad=Buffer.from(b);bad.writeUInt16LE(1,e.initialArray.firstOffset);bad.writeUInt16LE(1,e.initialArray.secondOffset);reject(bad,'UnsupportedChartInitialArray');
  for(const at of [e.start,e.initialArray.start,e.lightStart,e.sourcesArray.start,...e.sources.map(s=>s.start)])for(const id of [0xffffffff,e.priorId]){
   bad=Buffer.from(b);bad.writeUInt32LE(id,at);reject(bad,id===0xffffffff?'UnsupportedChartObjectReference':'DuplicateChartObjectId');
  }
  bad=Buffer.from(b);bad.fill(0xff,e.lightRawStart,e.lightRawStart+10);for(const s of e.sources)bad.fill(0xff,s.rawStart,s.rawStart+16);accept(bad);
  // Zero sources removes the first source's type declaration as well.
  bad=Buffer.concat([b.subarray(0,e.sourcesArray.headerEnd),b.subarray(e.lightRawStart)]);
  bad.writeUInt16LE(0,e.sourcesArray.firstOffset);bad.writeUInt16LE(0,e.sourcesArray.secondOffset);bad.writeUInt32LE(bad.length-36,32);accept(bad);
  // Keep the original first definition; append repeated types with fresh IDs.
  for(const count of (roots===1?[3,65535]:[3])){
   const extra=[];for(let i=e.sources.length;i<count;i++)extra.push(Buffer.concat([u32(0x80000000+i),u32(e.sources[0].typeId),Buffer.alloc(16,0xff),u32(4)]));
   bad=Buffer.concat([b.subarray(0,e.lightRawStart),...extra,b.subarray(e.lightRawStart)]);
   bad.writeUInt16LE(count,e.sourcesArray.firstOffset);bad.writeUInt16LE(count,e.sourcesArray.secondOffset);bad.writeUInt32LE(bad.length-36,32);accept(bad);
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(accepted,173);
 return {roots,accepted,rejected};
}
