import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {seriesLabelContext} from './chart-series-label-context.mjs';import {observeSeriesPoint} from './chart-series-point-evidence.mjs';import {observeSeriesLabelBody} from './chart-series-label-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let pointCuts=0,labelCuts=0,collisions=0,rawVariants=0,typeRejects=0;
const incomplete=e=>e.constructor===Error&&['IncompleteSeriesBranchObservation','IncompleteAxisObservation','IncompleteSeriesPointObservation'].includes(e.message);
const comparable=({series:{input,...series},...rest})=>({...rest,series}); // Request closure identity is not parsed evidence.
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const c=seriesLabelContext(b);let state={types:c.series.r.types,objects:c.series.r.objects,strings:c.series.strings};
 for(const p of c.points){
  if(verify){const read=bytes=>observeSeriesPoint(bytes,p.start,state.types,state.objects,state.strings);for(let cut=p.start;cut<p.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),incomplete);pointCuts++;}
   assert.deepEqual(read(b.subarray(0,p.end)),p);const after=Buffer.from(b);after.fill(0xff,p.end);assert.deepEqual(read(after),p);
   const raw=Buffer.from(b);raw.fill(0xff,p.label.end,p.baseOffset);assert.deepEqual(read(raw),{...p,raw20:'ff'.repeat(20)});rawVariants++;
   const bad=Buffer.from(b);bad.writeUInt32LE(p.prefix.point.typeId,p.baseOffset);assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPointObservationType');typeRejects++;
  }state=p;
 }
 const labels=[...c.points.map(p=>({prefix:p.prefix,label:p.label})),{prefix:c.tail,label:c.label}];
 for(const {prefix,label} of labels)if(verify){
  const read=bytes=>observeSeriesLabelBody(bytes,prefix.end,prefix.types,prefix.objects,prefix.strings);
  for(let cut=prefix.end;cut<label.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),incomplete);labelCuts++;}
  assert.deepEqual(read(b.subarray(0,label.end)),label);const after=Buffer.from(b);after.fill(0xff,label.end);assert.deepEqual(read(after),label);
  const duplicate=Buffer.from(b);duplicate.writeUInt32LE(prefix.label.id,label.text.fontOffset);assert.throws(()=>read(duplicate),e=>e.constructor===Error&&e.message==='UnsupportedSeriesLabelObservationObject');collisions++;
  const raw=Buffer.from(b);for(const f of label.text.rawFields)raw.fill(0xff,f.start,f.start+f.n);const changed=read(raw);assert.deepEqual(changed,{...label,text:{...label.text,rawFields:label.text.rawFields.map(f=>({...f,hex:'ff'.repeat(f.n)}))}});rawVariants++;
  for(const id of new Set(label.text.references.map(at=>b.readUInt32LE(at)))){const wrong=new Map(prefix.types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observeSeriesLabelBody(b,prefix.end,wrong,prefix.objects,prefix.strings),e=>e.constructor===Error&&e.message==='UnsupportedAxisObservationType');typeRejects++;}
  assert.deepEqual(read(b),label);
 }
 if(verify)assert.deepEqual(comparable(seriesLabelContext(b)),comparable(c));
 rows.push({sha256:digest(b),points:c.points.map(p=>({start:p.start,end:p.end,raw20:p.raw20,labelStart:p.prefix.end,labelEnd:p.label.end})),labelStart:c.tail.end,labelEnd:c.label.end,textNull:c.label.text.text===null,textIntroduced:c.label.text.text?.introduced??false,end:c.end,nextBytes:b.subarray(c.end,c.end+32).toString('hex')});
});assert.equal(rows.length,43);assert.equal(rows.reduce((n,r)=>n+r.points.length,0),5);console.log(JSON.stringify({corpus,charts:43,points:5,labels:48,verification:verify?{pointCuts,labelCuts,collisions,rawVariants,typeRejects}:null,rows},null,2));}finally{cfb.close();}
