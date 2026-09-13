import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {seriesCollectionOracle} from './chart-series-collection-oracle.mjs';import {observeChartTitleBody} from './chart-title-body-evidence.mjs';import {incompleteTitleBody} from './chart-title-body-errors.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,ids=0,types=0,data=0,raws=0;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const c=seriesCollectionOracle(b).r,read=bytes=>observeChartTitleBody(bytes,c.end,c.types,c.objects,c.strings),r=read(b);
 if(verify){
  for(let cut=c.end;cut<r.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),incompleteTitleBody);cuts++;}
  assert.deepEqual(read(b.subarray(0,r.end)),r);const after=Buffer.from(b);after.fill(255,r.end);assert.deepEqual(read(after),r);
  for(const at of [r.blockOffset,...r.body.text.objectOffsets,...r.section.objectOffsets]){const bad=Buffer.from(b);bad.writeUInt32LE(c.title.id,at);assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedChartTitleBodyObservationObject','UnsupportedSeriesLabelObservationObject','UnsupportedAxisObservationObject','UnsupportedChartSectionObservationObject'].includes(e.message));ids++;}
  const base=[...c.types].find(([,d])=>d.name==='VtObject\0')[0];
  for(const at of [...r.references,...r.body.text.references,...r.section.references]){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(at)===base?r.typeId:base,at);assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedChartTitleBodyObservationType','UnsupportedAxisObservationType','UnsupportedChartSectionObservationType'].includes(e.message));types++;}
  for(const id of [0,1,c.title.id,0xfffffffe]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.section.dataOffset);assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedChartSectionObservationData');data++;}
  const raw=Buffer.from(b);for(const f of r.section.rawFields)raw.fill(255,f.start,f.start+f.n);raw.writeUInt16LE(65535,r.section.suffixOffset);
  assert.deepEqual(read(raw),{...r,section:{...r.section,section:{...r.section.section,raw26:'ff'.repeat(26),raw50:'ff'.repeat(50),raw34:'ff'.repeat(34),raw4:'ff'.repeat(4),suffix:65535},rawFields:r.section.rawFields.map(f=>({...f,hex:'ff'.repeat(f.n)}))}});raws++;assert.deepEqual(read(b),r);
 }
 rows.push({sha256:digest(b),start:c.end,bodyStart:r.body.text.start,bodyEnd:r.body.end,sectionBytes:r.section.end-r.section.start,end:r.end,remaining:b.length-r.end,objects:r.objects.size-c.objects.size,strings:r.strings.size-c.strings.size,nullText:r.body.text.text===null,background:r.body.text.background!==null});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:43,verification:verify?{cuts,ids,types,data,raws}:null,rows},null,2));}finally{cfb.close();}
