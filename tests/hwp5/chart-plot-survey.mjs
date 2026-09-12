import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartLegendOracle} from './chart-legend-oracle.mjs';
import {observePlotPrefix} from './chart-plot-evidence.mjs';

const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[];
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const legend=chartLegendOracle(b);
  // These two base types were independently checked by the earlier grid oracle.
  const prior=new Map([[3,{name:'VtCollection\0',version:1}],[4,{name:'VtObject\0',version:1}]]);
  rows.push({sha256:digest(b),...observePlotPrefix(b,legend.end,prior)});
 });
 assert.equal(rows.length,43);
 const sourceCounts={};for(const r of rows)sourceCounts[r.sources.length]=(sourceCounts[r.sources.length]??0)+1;
 console.log(JSON.stringify({corpus,observations:rows.length,sourceCounts,rows},null,2));
}finally{cfb.close();}
