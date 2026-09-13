import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {postLineOracle} from './chart-post-line-oracle.mjs';import {observeSeriesCollection} from './chart-series-collection-evidence.mjs';
import {incompleteSeriesCollection as incomplete} from './chart-series-collection-errors.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,ids=0,types=0,raws=0,counts=0;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const c=postLineOracle(b),{first,second}=c.r.array;assert.equal(first,second);assert([3,5].includes(first));
 const read=(bytes,count=first)=>observeSeriesCollection(bytes,c.end,c.r.types,c.r.objects,c.strings,count),r=read(b);
 if(verify){
  for(let cut=c.end;cut<r.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),incomplete);cuts++;}
  assert.deepEqual(read(b.subarray(0,r.end)),r);const after=Buffer.from(b);after.fill(255,r.end);assert.deepEqual(read(after),r);
  for(const [n,error] of [[first-1,'UnsupportedChartTitleHeaderObservationType'],[first+1,'UnsupportedSeriesPrefixObservationType']]){assert.throws(()=>read(b,n),e=>e.constructor===Error&&e.message===error);counts++;}
  for(const at of [r.title.start,...r.series.map(s=>s.start)]){const bad=Buffer.from(b);bad.writeUInt32LE(c.r.array.id,at);assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedSeriesPrefixObservationObject','UnsupportedChartTitleHeaderObservationObject'].includes(e.message));ids++;}
  for(const d of r.title.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedChartTitleHeaderObservationType');types++;}
  const raw=Buffer.from(b);for(const s of r.series)raw.fill(255,s.trailerStart,s.end);assert.deepEqual(read(raw),{...r,series:r.series.map(s=>({...s,raw106:'ff'.repeat(106)}))});raws+=r.series.length;assert.deepEqual(read(b),r);
 }
 rows.push({sha256:digest(b),count:first,series:r.series.map(s=>({start:s.start,points:s.section.points.length,pictureEnd:s.picture.end,trailerStart:s.trailerStart,end:s.end,raw106:s.raw106})),title:r.title.start,titleEnd:r.title.end,remaining:b.length-r.end});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:43,series:rows.reduce((n,r)=>n+r.count,0),points:rows.reduce((n,r)=>n+r.series.reduce((n,s)=>n+s.points,0),0),verification:verify?{cuts,ids,types,raws,counts}:null,rows},null,2));}finally{cfb.close();}
