// Diagnostic candidate offsets only: not a structural Axis-tail parser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxisPrefix} from './chart-axis-prefix-evidence.mjs';
import {observeValueText} from './chart-value-text-evidence.mjs';
const verify=process.argv.includes('--verify'),rows=[];let cuts=0,withoutScale=0;
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const addTypes=(c,ds)=>{for(const d of ds)c.types.set(d.id,{name:d.name,version:d.version});};
const addStrings=(c,ss)=>{for(const s of ss)if(s&&s.kind!=='number')c.strings.set(s.id,{hex:s.hex,trailer:s.trailer});};
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const c=chartAxisContext(b),firstAxis=observeAxisPrefix(b,c.plot.end,c.types,c.strings);
  if(!firstAxis.scale){withoutScale++;return;}
  addTypes(c,firstAxis.declarations);addStrings(c,[firstAxis.fontName,firstAxis.text]);
  const first=observeValueText(b,firstAxis.end,c.types,c.strings);
  addTypes(c,[...first.prefix.declarations,...first.text.declarations]);addStrings(c,[first.prefix.reference,first.prefix.format?.code,first.prefix.label,first.text.fontName,first.text.text]);
  const candidates=[];
  for(const delta of [54,78])try{candidates.push({delta,axis:observeAxisPrefix(b,first.end+delta,c.types,c.strings)});}catch(e){
   if(e.constructor!==Error||!['IncompleteAxisObservation','UnsupportedAxisObservationObject','UnsupportedAxisObservationType','UnsupportedAxisObservationPicture','UnsupportedAxisObservationScaleArray'].includes(e.message))throw e;
  }
  assert.equal(candidates.length,1);const {delta,axis}=candidates[0];assert(axis.scale);
  addTypes(c,axis.declarations);addStrings(c,[axis.fontName,axis.text]);
  const second=observeValueText(b,axis.end,c.types,c.strings);
  if(verify){for(let cut=axis.end;cut<second.end;cut++){
   assert.throws(()=>observeValueText(b.subarray(0,cut),axis.end,c.types,c.strings),e=>e.constructor===Error&&['IncompleteValueObservation','IncompleteAxisObservation'].includes(e.message));cuts++;
  }assert.deepEqual(observeValueText(b,axis.end,c.types,c.strings),second);}
  rows.push({sha256:digest(b),candidateDelta:delta,axisStart:axis.start,valueStart:axis.end,...second});
 });
 assert.equal(rows.length,34);assert.equal(withoutScale,9);assert.equal(rows.filter(r=>r.prefix.reference?.kind==='number').length,1);
 console.log(JSON.stringify({corpus,observations:rows.length,withoutScale,cuts:verify?cuts:null,rows},null,2));
}finally{cfb.close();}
