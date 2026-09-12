import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(bytes,offset=44,max=8)=>Buffer.concat([u32(offset),u32(max),bytes]);
const expected=version=>{
 const out=Buffer.alloc(18);out.writeUInt32LE(8);out.writeUInt16LE(version,4);out.writeUInt32LE(56,6);out.set(Buffer.from('VtChart\0'),10);return out;
};

export async function chartDeclarations(call){
 const cfb=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
 let roots=0,accepted=0,rejected=0,nonMarkerContents=0;
 try{
 await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});
  const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry)),marker=b.indexOf(Buffer.from('VtChart\0'));
  if(marker<0){nonMarkerContents++;return;}
  // Evidence pins for these specimens; NOT an automatic product recognizer.
  assert.equal(marker,46);assert.equal(b.readUInt32LE(32),b.length-36);
  assert.equal(b.readUInt32LE(36),0);assert.equal(b.readUInt32LE(40),0);
  assert.equal(b.readUInt16LE(44),8);assert.equal(b.readUInt16LE(54),6);
  roots++;
  for(const version of [0,1,6,256,65535]){
   const changed=Buffer.from(b);changed.writeUInt16LE(version,54);
   assert.deepEqual(call(308,input(changed)),expected(version));accepted++;
  }
  const reject=(bytes,error)=>{
   assert.throws(()=>call(308,bytes),e=>e.constructor===Error&&e.message===error);rejected++;
   assert.deepEqual(call(308,input(b)),expected(6));
  };
  for(let cut=44;cut<56;cut++)reject(input(b.subarray(0,cut)),'UnexpectedEnd');
  reject(input(b,44,7),'LimitExceeded');
  reject(input(b,0xffffffff),'UnexpectedEnd');
  const bad=Buffer.from(b);bad[53]=1;reject(input(bad),'InvalidChartTypeName');
  bad[53]=0;bad.writeUInt16LE(0,44);reject(input(bad),'InvalidChartTypeName');
 });
 }finally{cfb.close();}
 assert.deepEqual([roots,nonMarkerContents,accepted,rejected],[43,1,215,688]);
 return {roots,nonMarkerContents,accepted,rejected};
}
