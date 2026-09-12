import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {axesOracle} from './chart-axes-oracle.mjs';
import {observeSurfacePrefix} from './chart-surface-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,versions=0;
try{const corpus=await oleContainerSurvey((env,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
 const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const a=axesOracle(b),types=a.rows.at(-1).result.types,r=observeSurfacePrefix(b,a.end,types);
 if(verify){
  for(let cut=a.end;cut<r.end;cut++){assert.throws(()=>observeSurfacePrefix(b.subarray(0,cut),a.end,types),e=>e.constructor===Error&&e.message==='IncompleteSurfaceObservation');cuts++;}
  for(const d of r.declarations){const bad=Buffer.from(b);bad[d.versionOffset]^=1;assert.throws(()=>observeSurfacePrefix(bad,a.end,types),e=>e.constructor===Error&&e.message==='UnsupportedSurfaceObservationType');versions++;}
  assert.deepEqual(observeSurfacePrefix(b.subarray(0,r.end),a.end,types),r);
  const after=Buffer.from(b);after.fill(0xff,r.end);assert.deepEqual(observeSurfacePrefix(after,a.end,types),r);
  assert.deepEqual(observeSurfacePrefix(b,a.end,types),r);
 }
 rows.push({sha256:digest(b),result:r,nextBytes:b.subarray(r.end,r.end+32).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,observations:rows.length,verification:verify?{cuts,versions}:null,rows},null,2));}finally{cfb.close();}
