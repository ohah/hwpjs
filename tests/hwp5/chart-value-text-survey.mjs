import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxisPrefix} from './chart-axis-prefix-evidence.mjs';
import {observeValueText} from './chart-value-text-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[];
const verify=process.argv.includes('--verify');let cuts=0,versions=0,withoutScale=0;
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const c=chartAxisContext(b),axis=observeAxisPrefix(b,c.plot.end,c.types,c.strings);
  if(!axis.scale){withoutScale++;return;}
  for(const d of axis.declarations)c.types.set(d.id,{name:d.name,version:d.version});
  for(const s of [axis.fontName,axis.text])c.strings.set(s.id,{hex:s.hex,trailer:s.trailer});
  const value=observeValueText(b,axis.end,c.types,c.strings);
  if(verify){
   for(let cut=axis.end;cut<value.end;cut++){
    assert.throws(()=>observeValueText(b.subarray(0,cut),axis.end,c.types,c.strings),e=>e.constructor===Error&&['IncompleteValueObservation','IncompleteAxisObservation'].includes(e.message));cuts++;
   }
   for(const d of [...value.prefix.declarations,...value.text.declarations]){const bad=Buffer.from(b);bad[d.versionOffset]^=1;
    assert.throws(()=>observeValueText(bad,axis.end,c.types,c.strings),e=>e.constructor===Error&&['UnsupportedValueObservationType','UnsupportedAxisObservationType'].includes(e.message));versions++;
   }
   assert.deepEqual(observeValueText(b,axis.end,c.types,c.strings),value);
  }
  rows.push({sha256:digest(b),...value});
 });
 assert.equal(rows.length,34);assert.equal(withoutScale,9);
 console.log(JSON.stringify({corpus,observations:rows.length,withoutScale,withReference:rows.filter(r=>r.prefix.reference).length,withFormat:rows.filter(r=>r.prefix.format).length,zeroHeaderWords:rows.filter(r=>r.prefix.headerWord===0).length,verification:verify?{cuts,versions}:null,rows},null,2));
}finally{cfb.close();}
