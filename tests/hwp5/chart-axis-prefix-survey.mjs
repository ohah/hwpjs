import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxisPrefix} from './chart-axis-prefix-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[];
const verify=process.argv.includes('--verify');let cuts=0,versions=0;
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const {plot,types,strings}=chartAxisContext(b);
  const axis=observeAxisPrefix(b,plot.end,types,strings);
  if(verify){
   for(let cut=plot.end;cut<axis.end;cut++){
    assert.throws(()=>observeAxisPrefix(b.subarray(0,cut),plot.end,types,strings),e=>e.constructor===Error&&e.message==='IncompleteAxisObservation');cuts++;
   }
   for(const d of axis.declarations){const bad=Buffer.from(b);bad[d.versionOffset]^=1;
    assert.throws(()=>observeAxisPrefix(bad,plot.end,types,strings),e=>e.constructor===Error&&e.message==='UnsupportedAxisObservationType');versions++;
   }
   assert.deepEqual(observeAxisPrefix(b,plot.end,types,strings),axis);
  }
  rows.push({sha256:digest(b),...axis});
 });
 assert.equal(rows.length,43);
 console.log(JSON.stringify({corpus,observations:rows.length,withBackdrop:rows.filter(r=>r.background).length,reusedNames:rows.filter(r=>!r.fontName.introduced).length,withScale:rows.filter(r=>r.scale).length,verification:verify?{cuts,versions}:null,rows},null,2));
}finally{cfb.close();}
