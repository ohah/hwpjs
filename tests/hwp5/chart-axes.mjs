import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {axesOracle} from './chart-axes-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartAxes(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,axes=0,scales=0,longTails=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=axesOracle(b);axes+=e.rows.length;scales+=e.rows.filter(r=>r.result.value!==null).length;longTails+=e.rows.filter(r=>r.result.tail.extra!==null).length;
  const accept=(bytes,count=4)=>{const x=axesOracle(bytes,count);assert.deepEqual(call(323,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,limits={},limit=bytes.length)=>{assert.throws(()=>call(323,e.input(bytes,limits),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(323,e.input(),b.length),e.wire);};
  accept(b);for(let n=0;n<4;n++)accept(b,n);
  accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(0xff,e.end);accept(after);
  const changed=Buffer.from(b);
  for(const {result:r} of e.rows){
   const raw=r.axis.rawFields[0],selector=b.readUInt16LE(raw.start+6);
   for(const field of r.axis.rawFields)changed.fill(0xff,field.start,field.start+field.n);
   changed.writeUInt16LE(selector,raw.start+6);
   changed.fill(0xff,r.tail.start,r.tail.baseOffset);
   if(r.value){const p=r.value.prefix;changed.writeUInt32LE(0xdeadbeef,p.valueStart);changed.fill(0xff,p.label.start-2,p.label.start);changed.fill(0xff,p.end,p.end+3);if(p.format)changed.fill(0xff,p.format.code.start-2,p.format.code.start);for(const field of r.value.text.rawFields)changed.fill(0xff,field.start,field.start+field.n);}
  }
  accept(changed);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  if(e.per)reject(b,'LimitExceeded',{per:e.per-1});if(e.total)reject(b,'LimitExceeded',{total:e.total-1});
  reject(b,'LimitExceeded',{objects:e.objects-1});reject(b,'LimitExceeded',{stored:e.stored-1});reject(b,'LimitExceeded',{},b.length-1);
  for(const {result:r} of e.rows){
   const bad=Buffer.from(b);bad.writeUInt16LE(2,r.axis.rawFields[0].start+6);reject(bad,'UnsupportedChartAxisTailLayout');
   const duplicate=Buffer.from(b);duplicate.writeUInt32LE(b.readUInt32LE(e.start),r.axis.blockStart);reject(duplicate,'DuplicateChartObjectId');
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(axes,172);assert.equal(scales,69);assert.equal(longTails,6);return {roots,axes,scales,longTails,accepted,rejected};
}
