import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {valueObjectsOracle as oracle,integer} from './chart-value-objects-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
const input=(b,per,total,count)=>Buffer.concat([integer(per),integer(total),integer(count),b]);
const type=(id,name)=>{const raw=Buffer.from(name+'\0');return Buffer.concat([integer(id),integer(raw.length,2),raw,integer(1,2)]);};
const patterns=['0000000000000000','8000000000000000','7ff0000000000000','fff0000000000000','7ff0000000000001','7ff8000000001234','0000000000000001','ffffffffffffffff'];
export async function chartValueObjects(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,strings=0,numbers=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=oracle(b);strings+=e.cells.filter(c=>c.kind===1).length;numbers+=e.cells.filter(c=>c.kind===2).length;
  const accept=bytes=>{const x=oracle(bytes);assert.deepEqual(call(320,input(bytes,x.maxString,x.stringBytes,x.count),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,per=e.maxString,total=e.stringBytes,count=e.count,limit=bytes.length)=>{
   assert.throws(()=>call(320,input(bytes,per,total,count),limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(320,input(b,e.maxString,e.stringBytes,e.count),b.length),e.wire);
  };
  accept(b);
  for(let cut=140;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  if(e.maxString)reject(b,'LimitExceeded',e.maxString-1);if(e.stringBytes)reject(b,'LimitExceeded',e.maxString,e.stringBytes-1);
  if(e.count)reject(b,'LimitExceeded',e.maxString,e.stringBytes,e.count-1);
  reject(b,'LimitExceeded',e.maxString,e.stringBytes,e.count,b.length-1);
  const changed=Buffer.from(b);
  for(const c of e.cells)if(c.kind){changed.fill(0xff,c.payloadStart+(c.kind===1?2:0),c.valueBase);const bad=Buffer.from(b);bad.writeUInt32LE(0,c.objectBase);reject(bad,'UnsupportedChartClass');}
  accept(changed);accept(extent(Buffer.from(b.subarray(0,e.end))));
  if(roots===1)for(const bits of patterns){
   const head=Buffer.from(b.subarray(0,140));head.writeUInt16LE(1,136);head.writeUInt16LE(1,138);
   const raw=Buffer.alloc(8);raw.writeBigUInt64LE(BigInt('0x'+bits));
   accept(extent(Buffer.concat([head,integer(90),type(5,'VtDouble'),raw,integer(0xaa55,2),type(6,'VtValue'),integer(4)])));
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(strings,272);assert.equal(numbers,427);
 return {roots,strings,numbers,accepted,rejected};
}
