import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {postLineOracle} from './chart-post-line-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartPostLines(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=postLineOracle(b);
  const accept=bytes=>{const x=postLineOracle(bytes);assert.deepEqual(call(326,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.objects,limit=bytes.length)=>{assert.throws(()=>call(326,e.input(bytes,maxObjects),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(326,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(0xff,e.end);accept(after);
  const raw=Buffer.from(b);raw.fill(0xff,e.start,e.r.baseOffset);accept(raw);
  const words=Buffer.from(b);words.writeUInt16LE(65535,e.r.array.firstOffset);words.writeUInt16LE(0,e.r.array.secondOffset);accept(words);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.objects-1);reject(b,'LimitExceeded',e.objects,b.length-1);
  for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.priorObjects.values().next().value,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,e.r.array.start);reject(bad,error);}
  for(const at of e.r.references){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(at)===e.r.baseTypeId?e.r.array.typeId:e.r.baseTypeId,at);reject(bad,'UnsupportedChartClass');}
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected};
}
