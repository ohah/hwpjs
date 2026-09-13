import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes} from './hwp-corpus-evidence.mjs';import {seriesPictureOracle} from './chart-series-picture-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartSeriesPictures(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=seriesPictureOracle(b);
  const accept=bytes=>{const x=seriesPictureOracle(bytes);assert.deepEqual(call(330,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.r.objects.size,limit=bytes.length)=>{assert.throws(()=>call(330,e.input(bytes,maxObjects),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(330,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(255,e.end);accept(after);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.r.objects.size-1);reject(b,'LimitExceeded',e.r.objects.size,b.length-1);
  for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.prior.r.blockId,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,e.r.pictureStart);reject(bad,error);}
  for(const id of [0,1,e.prior.r.blockId,0xfffffffe]){const bad=Buffer.from(b);bad.writeUInt32LE(id,e.r.pictureEnd-8);reject(bad,'UnsupportedChartPictureData');}
  const refs=e.r.references;for(const [i,at] of refs.entries()){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(refs[1-i]),at);reject(bad,'UnsupportedChartClass');}
  const raw=Buffer.from(b);for(const f of e.r.rawFields)raw.fill(255,f.start,f.start+f.n);accept(raw);
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected};
}
