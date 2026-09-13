import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {seriesLabelContext} from './chart-series-label-context.mjs';import {observeSeriesSuffix} from './chart-series-suffix-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,ids=0,types=0,raws=0;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const c=seriesLabelContext(b),read=bytes=>observeSeriesSuffix(bytes,c.end,c.label.types,c.label.objects,c.label.strings),r=read(b);
 if(verify){
  for(let cut=c.end;cut<r.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),e=>e.constructor===Error&&['IncompleteSeriesSuffixObservation','IncompleteAxisObservation','IncompleteTextFormatObservation'].includes(e.message));cuts++;}
  assert.deepEqual(read(b.subarray(0,r.end)),r);const after=Buffer.from(b);after.fill(255,r.end);assert.deepEqual(read(after),r);
  for(const at of [r.start,...r.formats.map(f=>f.format.start)])for(const id of [0xffffffff,c.tail.label.id]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedSeriesSuffixObservationObject','UnsupportedTextFormatObservationObject'].includes(e.message));ids++;}
  for(const d of [...r.body.text.declarations,...r.formats.flatMap(f=>f.declarations)])for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedAxisObservationType','UnsupportedTextFormatObservationType'].includes(e.message));types++;}
  const references=[...r.body.text.references,...r.formats.flatMap(f=>f.references)];
  for(const id of new Set(references.map(at=>b.readUInt32LE(at))))if(c.label.types.has(id)){const wrong=new Map(c.label.types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observeSeriesSuffix(b,c.end,wrong,c.label.objects,c.label.strings),e=>e.constructor===Error&&['UnsupportedAxisObservationType','UnsupportedTextFormatObservationType'].includes(e.message));types++;}
  const raw=Buffer.from(b);raw.writeUInt16LE(65535,r.wordOffset);assert.deepEqual(read(raw),{...r,rawWord:65535});raws++;
  const formatRaw=Buffer.from(b);for(const {format:f} of r.formats)formatRaw.writeUInt16LE(0xaa55,(f.code?.start??f.end-4)-2);assert.deepEqual(read(formatRaw),{...r,formats:r.formats.map(f=>({...f,format:{...f.format,rawWord:0xaa55}}))});raws++;
  const bodyRaw=Buffer.from(b);for(const f of r.body.text.rawFields)bodyRaw.fill(255,f.start,f.start+f.n);assert.deepEqual(read(bodyRaw),{...r,body:{...r.body,text:{...r.body.text,rawFields:r.body.text.rawFields.map(f=>({...f,hex:'ff'.repeat(f.n)}))}}});raws++;
  assert.deepEqual(read(b),r);
 }
 rows.push({sha256:digest(b),start:r.start,blockEnd:r.body.end,word:r.rawWord,formats:r.formats.map(({format:f})=>({start:f.start,end:f.end,word:f.rawWord,code:f.code?.hex??null,introduced:f.code?.introduced??false})),end:r.end,next:b.subarray(r.end,r.end+48).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:43,verification:verify?{cuts,ids,types,raws}:null,rows},null,2));}finally{cfb.close();}
