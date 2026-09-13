import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes} from './hwp-corpus-evidence.mjs';import {seriesCollectionOracle} from './chart-series-collection-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartSeriesCollections(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,series=0,points=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=seriesCollectionOracle(b),counts=e.r.series.map(s=>s.section.points.length);series+=counts.length;points+=counts.reduce((n,v)=>n+v,0);
  const accept=bytes=>{const x=seriesCollectionOracle(bytes);assert.deepEqual(call(331,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.r.objects.size,limit=bytes.length,selected=counts)=>{assert.throws(()=>call(331,e.input(bytes,maxObjects,selected),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(331,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(255,e.end);accept(after);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.r.objects.size-1);reject(b,'LimitExceeded',e.r.objects.size,b.length-1);
  reject(b,'UnsupportedChartClass',e.r.objects.size,b.length,counts.slice(0,-1));
  reject(b,'UnsupportedChartClass',e.r.objects.size+1,b.length,[...counts,0]);
  reject(b,'LimitExceeded',e.r.objects.size,b.length,[65536,...counts.slice(1)]);
  for(const at of [e.r.title.start,...e.r.series.map(s=>s.start)])for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.prior.r.array.id,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);reject(bad,error);}
  for(const d of e.r.title.declarations)for(const [at,error] of [[d.nameOffset,'UnsupportedChartClass'],[d.versionOffset,'UnsupportedChartTypeVersion']]){const bad=Buffer.from(b);bad[at]^=1;reject(bad,error);}
  const raw=Buffer.from(b);for(const s of e.r.series)raw.fill(255,s.trailerStart,s.end);accept(raw);
 });}finally{cfb.close();}
 assert.deepEqual([roots,series,points],[43,213,16]);return {roots,series,points,accepted,rejected};
}
