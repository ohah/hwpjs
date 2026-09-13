import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {titleBodyOracle} from './chart-title-body-oracle.mjs';
import {observeChartTail} from './chart-tail-evidence.mjs';
import {tailWire} from './chart-tail-wire.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
function oracle(b){
 const prior=titleBodyOracle(b),r=observeChartTail(b,prior.end,prior.r.types,prior.r.objects);
 return {prior,r,wire:tailWire(r)};
}
export async function chartTails(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=oracle(b);assert.equal(e.r.end,b.length);
  const accept=bytes=>{const x=oracle(bytes);assert.deepEqual(call(333,x.prior.input(bytes,x.r.objects.size),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,max=e.r.objects.size)=>{assert.throws(()=>call(333,e.prior.input(bytes,max),bytes.length),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(333,e.prior.input(b,e.r.objects.size),b.length),e.wire);};
  accept(b);accept(extent(Buffer.concat([b,Buffer.alloc(91,255)])));
  for(let cut=e.prior.end;cut<e.r.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.r.objects.size-1);
  for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.prior.r.blockId,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,e.r.start);reject(bad,error);}
  for(const d of [...e.r.list.declarations,...e.r.window.declarations])for(const [at,error] of [[d.nameOffset,'UnsupportedChartClass'],[d.versionOffset,'UnsupportedChartTypeVersion']]){const bad=Buffer.from(b);bad[at]^=1;reject(bad,error);}
  const base=e.r.list.collection.baseTypeId,collection=e.r.list.collection.typeId;
  for(const at of [...e.r.list.references,...e.r.window.references]){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(at)===base?collection:base,at);reject(bad,'UnsupportedChartClass');}
  const raw=Buffer.from(b);raw.fill(255,e.r.list.end,e.r.window.start);raw.writeUInt16LE(65535,e.r.list.collection.wordOffset);raw.writeUInt16LE(0xa55a,e.r.window.wordOffset);accept(raw);
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected};
}
