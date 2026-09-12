import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartFootnoteOracle} from './chart-footnote-oracle.mjs';
import {chartLegendOracle} from './chart-legend-oracle.mjs';
import {observePlotPrefix} from './chart-plot-evidence.mjs';
import {observeAxisPrefix} from './chart-axis-prefix-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[];
const verify=process.argv.includes('--verify');let cuts=0,versions=0;
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const footnote=chartFootnoteOracle(b),legend=chartLegendOracle(b),types=new Map([...footnote.block.types].map(([id,name])=>[id,{name,version:name==='VtChart\0'?6:name==='VtTextBlock\0'?2:1}]));
  for(const d of legend.declarations){const n=b.readUInt16LE(d.nameOffset-2);types.set(b.readUInt32LE(d.idOffset),{name:b.subarray(d.nameOffset,d.nameOffset+n).toString('latin1'),version:b.readUInt16LE(d.versionOffset)});}
  const plot=observePlotPrefix(b,legend.end,types);for(const d of plot.declarations)if(d.at<plot.end)types.set(d.id,{name:d.name,version:d.version});
  const strings=new Map(legend.priorStrings.map(s=>[s.id,{hex:s.bytes.toString('hex'),trailer:s.trailer}]));strings.set(legend.nameId,{hex:legend.name.bytes.toString('hex'),trailer:legend.name.trailer});
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
