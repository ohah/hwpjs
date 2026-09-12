import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartLegendOracle} from './chart-legend-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,name,objects,stored)=>Buffer.concat([u32(name),u32(objects),u32(stored),b]);
export async function chartLegends(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
 let roots=0,reused=0,introduced=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;const e=chartLegendOracle(b);if(e.introduced)introduced++;else reused++;
  const accept=bytes=>{const x=chartLegendOracle(bytes);assert.deepEqual(call(316,input(bytes,x.name.bytes.length,x.objectCount,x.stored),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,name=e.name.bytes.length,objects=e.objectCount,stored=e.stored,limit=bytes.length)=>{
   assert.throws(()=>call(316,input(bytes,name,objects,stored),limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(316,input(b,e.name.bytes.length,e.objectCount,e.stored),b.length),e.wire);
  };
  accept(b);
  const nextLength=b.readUInt16LE(e.end+8);assert.equal(b.subarray(e.end+10,e.end+10+nextLength).toString('latin1'),'VtChartPlot\0');
  for(let cut=e.start;cut<e.end;cut++){
   const bad=Buffer.from(b.subarray(0,cut));bad.writeUInt32LE(cut-36,32);reject(bad,'UnexpectedEnd');
  }
  reject(b,'LimitExceeded',e.name.bytes.length-1);reject(b,'LimitExceeded',e.name.bytes.length,e.objectCount-1);
  reject(b,'LimitExceeded',e.name.bytes.length,e.objectCount,e.stored-1);
  reject(b,'LimitExceeded',e.name.bytes.length,e.objectCount,e.stored,b.length-1);
  for(const d of e.declarations){
   let bad=Buffer.from(b);bad[d.nameOffset]=88;reject(bad,'UnsupportedChartClass');
   bad=Buffer.from(b);bad[d.versionOffset]++;reject(bad,'UnsupportedChartTypeVersion');
  }
  for(const offset of e.references){const bad=Buffer.from(b);bad.writeUInt32LE(0,offset);reject(bad,'UnsupportedChartClass');}
  for(const offset of e.objectOffsets){
   let bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,offset);reject(bad,'UnsupportedChartObjectReference');
   bad=Buffer.from(b);bad.writeUInt32LE(e.priorStrings[0].id,offset);reject(bad,'DuplicateChartObjectId');
  }
  let bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(e.objectOffsets[0]),e.nameOffset);reject(bad,'UnsupportedChartObjectReference');
  bad=Buffer.from(b);bad.writeUInt32LE(0,e.picture);reject(bad,'UnsupportedChartPictureData');
  bad=Buffer.from(b);for(const [offset,n] of e.rawOffsets)bad.fill(0xa5,offset,offset+n);bad.fill(0xff,e.name.payloadOffset,e.name.payloadOffset+e.name.bytes.length);bad[e.name.trailerOffset]^=255;bad.writeUInt16LE(65535,e.suffixOffset);accept(bad);
  for(const length of [0,1,65535]){
   const field=Buffer.alloc(length+2,0xff);field.writeUInt16LE(length);
   bad=Buffer.concat([b.subarray(0,e.name.lengthOffset),field,b.subarray(e.name.payloadOffset+e.name.bytes.length)]);bad.writeUInt32LE(bad.length-36,32);accept(bad);
  }
  // Resolve a different valid prior string, not just a hardcoded font-name ID.
  const target=e.priorStrings.find(s=>s.id!==e.nameId);assert.ok(target);
  bad=Buffer.concat([b.subarray(0,e.nameOffset),u32(target.id),b.subarray(e.nameEnd)]);bad.writeUInt32LE(bad.length-36,32);accept(bad);
 });}finally{cfb.close();}
 assert.deepEqual([roots,reused,introduced,accepted],[43,41,2,258]);
 return {roots,reused,introduced,accepted,rejected};
}
