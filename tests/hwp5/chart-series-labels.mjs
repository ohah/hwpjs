import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes} from './hwp-corpus-evidence.mjs';import {seriesLabelOracle} from './chart-series-label-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartSeriesLabels(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,points=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const e=seriesLabelOracle(b);roots++;points+=e.c.points.length;
  const accept=bytes=>{const x=seriesLabelOracle(bytes);assert.deepEqual(call(328,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.c.label.objects.size,limit=bytes.length,count=e.c.points.length)=>{assert.throws(()=>call(328,e.input(bytes,maxObjects,count),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(328,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(255,e.end);accept(after);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.c.label.objects.size-1);reject(b,'LimitExceeded',e.c.label.objects.size,b.length-1);reject(b,'LimitExceeded',e.c.label.objects.size,b.length,33);
  const labels=[...e.c.points.map(p=>({prefix:p.prefix,label:p.label})),{prefix:e.c.tail,label:e.c.label}];
  for(const {prefix,label} of labels){
   for(const at of [prefix.label.start,label.text.fontOffset])for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.c.series.r.objectId,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);reject(bad,error);}
   const raw=Buffer.from(b);for(const f of label.text.rawFields)raw.fill(255,f.start,f.start+f.n);accept(raw);
  }
  for(const p of e.c.points){const raw=Buffer.from(b);raw.fill(255,p.label.end,p.baseOffset);accept(raw);const bad=Buffer.from(b);bad.writeUInt32LE(p.prefix.point.typeId,p.baseOffset);reject(bad,'UnsupportedChartClass');}
  const declarations=[...e.c.tail.declarations,...e.c.points.flatMap(p=>[...p.prefix.declarations,...p.label.text.declarations]),...e.c.label.text.declarations];
  for(const d of declarations)for(const [at,error] of [[d.nameOffset,'UnsupportedChartClass'],[d.versionOffset,'UnsupportedChartTypeVersion']]){const bad=Buffer.from(b);bad[at]^=1;reject(bad,error);}
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(points,5);return {roots,points,accepted,rejected};
}
