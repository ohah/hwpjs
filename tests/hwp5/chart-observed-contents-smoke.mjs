import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {observedContentsCase} from './chart-observed-contents-oracle.mjs';
import {axisTitleVariants} from './chart-axis-title-variants.mjs';
import {axisExtraTailVariant} from './chart-axis-tail-variant.mjs';
import {lightSourceCountVariant} from './chart-light-source-variant.mjs';
import {gridCellVariants} from './chart-grid-cell-variants.mjs';
import {gridPreludeRawVariant} from './chart-grid-prelude-variant.mjs';
import {stringLengthVariant} from './chart-string-length-variant.mjs';
import {backdropRawVariant} from './chart-backdrop-variant.mjs';
// Whole-assembly boundary checks; still not a comparison of all returned fields.
export async function chartObservedContentsSmoke(call,{allCuts=false}={}){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0,cuts=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const {title,tail,input,wire,axes,secondary,light,lines,postLine,surface,grid,footnote,legend,transition}=observedContentsCase(b);
  assert.deepEqual(call(336,input(b),b.length),wire);accepted++;
  const reject=(bytes,error,max=tail.objects.size,limit=bytes.length)=>{assert.throws(()=>call(336,input(bytes,max),limit),e=>e.constructor===Error&&e.message===error);rejected++;assert.deepEqual(call(336,input(b),b.length),wire);};
  const extra=Buffer.concat([b,Buffer.alloc(1)]);extra.writeUInt32LE(extra.length-36,32);reject(extra,'UnexpectedChartTrailingBytes');
  for(let at=allCuts?0:b.length-1;at<b.length;at++){const cut=Buffer.from(b.subarray(0,at));if(at>=36)cut.writeUInt32LE(at-36,32);reject(cut,'UnexpectedEnd');cuts++;}
  reject(b,'LimitExceeded',tail.objects.size-1);
  reject(b,'LimitExceeded',tail.objects.size,b.length-1);
  // Opaque bytes must survive assembly, not merely preserve final counts.
  const raw=Buffer.from(b);
  for(const s of title.prior.r.series)raw.fill(255,s.trailerStart,s.end);
  for(const f of title.r.section.rawFields)raw.fill(255,f.start,f.start+f.n);
  raw.writeUInt16LE(65535,title.r.section.suffixOffset);
  const changed=observedContentsCase(raw);
  assert.notDeepEqual(changed.wire,wire);
  assert.deepEqual(call(336,changed.input(),raw.length),changed.wire);accepted++;
  const titleVariants=axisTitleVariants(b,secondary);
  for(const variant of titleVariants){
   const x=observedContentsCase(variant.bytes),text=x.secondary.r.axis.text;
   assert(text!==null);
   if(variant.kind==='alias'){assert.equal(text.introduced,false);assert.equal(text.id,secondary.r.axis.fontName.id);}
   else {assert.equal(text.introduced,true);assert.equal(text.hex,variant.text.toString('hex'));}
   assert.deepEqual(call(336,x.input(),variant.bytes.length),x.wire);accepted++;
  }
  for(const bytes of [b,...titleVariants.map(v=>v.bytes)]){
   const previous=observedContentsCase(bytes),extra=axisExtraTailVariant(bytes,previous.secondary.r),x=observedContentsCase(extra);
   assert.equal(x.secondary.r.tail.extra,'a5'.repeat(24));
   assert.deepEqual(call(336,x.input(),extra.length),x.wire);accepted++;
  }
  const axisRaw=Buffer.from(b);
  for(const r of [...axes.rows.map(row=>row.result),secondary.r]){
   const selectorAt=r.axis.rawFields[0].start+6,selector=b.readUInt16LE(selectorAt);
   for(const f of r.axis.rawFields)axisRaw.fill(255,f.start,f.start+f.n);
   axisRaw.writeUInt16LE(selector,selectorAt);
   axisRaw.fill(255,r.tail.start,r.tail.baseOffset);
  }
  const axisChanged=observedContentsCase(axisRaw);
  assert.notDeepEqual(axisChanged.wire,wire);
  assert.deepEqual(call(336,axisChanged.input(),axisRaw.length),axisChanged.wire);accepted++;
  const blockRaw=Buffer.from(b);
  blockRaw.fill(255,light.lightRawStart,light.lightRawStart+10);
  for(const source of light.sources)blockRaw.fill(255,source.rawStart,source.rawStart+16);
  for(const item of lines.rows)blockRaw.fill(255,item.rawStart,item.baseOffset);
  blockRaw.writeUInt16LE(65535,lines.start);
  blockRaw.fill(255,postLine.start,postLine.baseOffset);
  const blockChanged=observedContentsCase(blockRaw);
  assert.notDeepEqual(blockChanged.wire,wire);
  assert.deepEqual(call(336,blockChanged.input(),blockRaw.length),blockChanged.wire);accepted++;
  for(const count of [0,light.sources.length+1]){
   const bytes=lightSourceCountVariant(b,light,count),x=observedContentsCase(bytes);
   assert.equal(x.light.sources.length,count);
   assert.deepEqual(call(336,x.input(),bytes.length),x.wire);accepted++;
  }
  // The caller's Series selection is independent of these two opaque words.
  for(const [first,second] of [[0,0],[65535,65535],[0,65535],[65535,0]]){
   const bytes=Buffer.from(b);bytes.writeUInt16LE(first,postLine.array.firstOffset);bytes.writeUInt16LE(second,postLine.array.secondOffset);
   const x=observedContentsCase(bytes,{seriesCount:title.prior.r.series.length});
   assert.equal(x.postLine.array.first,first);assert.equal(x.postLine.array.second,second);
   assert.deepEqual(call(336,x.input(),bytes.length),x.wire);accepted++;
  }
  const envelopeRaw=Buffer.from(b);
  for(const [at,n] of [[light.rawStart,136],[surface.start,30],[surface.bodyStart,46],[tail.list.end,26]])envelopeRaw.fill(255,at,at+n);
  envelopeRaw.writeUInt16LE(65535,tail.list.collection.wordOffset);envelopeRaw.writeUInt16LE(0xa55a,tail.window.wordOffset);
  const envelopeCase=observedContentsCase(envelopeRaw);
  assert.notDeepEqual(envelopeCase.wire,wire);
  assert.deepEqual(call(336,envelopeCase.input(),envelopeRaw.length),envelopeCase.wire);accepted++;
  const idOffsets=[light.start,light.initialArray.start,surface.surfaceStart,surface.array.start,tail.start],newIds=Buffer.from(b);
  let fresh=0xfffffffd;
  for(const at of idOffsets){while(tail.objects.has(fresh))fresh--;newIds.writeUInt32LE(fresh--,at);}
  const idCase=observedContentsCase(newIds);
  assert.deepEqual(call(336,idCase.input(),newIds.length),idCase.wire);accepted++;
  const duplicateId=axes.seen.values().next().value;
  for(const at of idOffsets)for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[duplicateId,'DuplicateChartObjectId']]){
   const bytes=Buffer.from(b);bytes.writeUInt32LE(id,at);reject(bytes,error);
  }
  for(const [array,isSurface] of [[light.initialArray,false],[surface.array,true]])for(const [first,second] of [[1,0],[0,1],[1,1],[65535,65535]]){
   const bytes=Buffer.from(b);bytes.writeUInt16LE(first,array.firstOffset);bytes.writeUInt16LE(second,array.secondOffset);
   reject(bytes,first!==second?'UnsupportedChartArrayLayout':isSurface?'LimitExceeded':'UnsupportedChartInitialArray');
  }
  for(const bytes of gridCellVariants(b,grid)){
   const x=observedContentsCase(bytes);
   assert.deepEqual(call(336,x.input(),bytes.length),x.wire);accepted++;
  }
  const backdropRaw=backdropRawVariant(b,grid.end,transition),backdropCase=observedContentsCase(backdropRaw);
  assert.notDeepEqual(backdropCase.wire,wire);
  assert.deepEqual(call(336,backdropCase.input(),backdropRaw.length),backdropCase.wire);accepted++;
  const preludeRaw=gridPreludeRawVariant(b);
  const preludeCase=observedContentsCase(preludeRaw);
  assert.deepEqual(call(336,preludeCase.input(),preludeRaw.length),preludeCase.wire);accepted++;
  const initialRaw=Buffer.from(b);
  for(const [at,n] of [...footnote.rawOffsets,...legend.rawOffsets])initialRaw.fill(255,at,at+n);
  initialRaw.writeUInt16LE(65535,footnote.suffixOffset);initialRaw.writeUInt16LE(0xa55a,legend.suffixOffset);
  const initialCase=observedContentsCase(initialRaw);
  assert.deepEqual(call(336,initialCase.input(),initialRaw.length),initialCase.wire);accepted++;
  for(const strings of [footnote.block.strings,[legend.name]])for(const length of [0,1,65535]){
   const bytes=stringLengthVariant(b,strings,length),x=observedContentsCase(bytes);
   assert.deepEqual(call(336,x.input(),bytes.length),x.wire);accepted++;
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected,cuts};
}
