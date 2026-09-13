import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {nullableTitleOracle} from './chart-nullable-title-oracle.mjs';
import {axisTitleVariants} from './chart-axis-title-variants.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartNullableTitles(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=nullableTitleOracle(b);assert.equal(e.r.axis.text,null);
  const accept=bytes=>{const x=nullableTitleOracle(bytes);assert.deepEqual(call(324,x.input(),bytes.length),x.wire);accepted++;return x;};
  const reject=(bytes,error,limits={},limit=bytes.length,x=e)=>{assert.throws(()=>call(324,x.input(bytes,limits),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(324,e.input(),b.length),e.wire);};
  accept(b);accept(extent(Buffer.from(b.subarray(0,e.end))));const after=Buffer.from(b);after.fill(0xff,e.end);accept(after);
  const raw=Buffer.from(b),selector=b.readUInt16LE(e.r.axis.rawFields[0].start+6);
  for(const f of e.r.axis.rawFields)raw.fill(0xff,f.start,f.start+f.n);
  raw.writeUInt16LE(selector,e.r.axis.rawFields[0].start+6);raw.fill(0xff,e.r.tail.start,e.r.tail.baseOffset);accept(raw);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  if(e.per)reject(b,'LimitExceeded',{per:e.per-1});if(e.total)reject(b,'LimitExceeded',{total:e.total-1});
  reject(b,'LimitExceeded',{objects:e.objects-1});reject(b,'LimitExceeded',{stored:e.stored-1});reject(b,'LimitExceeded',{},b.length-1);
  const duplicate=Buffer.from(b);duplicate.writeUInt32LE(e.r.axis.axisId,e.r.axis.blockStart);reject(duplicate,'DuplicateChartObjectId');
  for(const {kind,bytes:changed,text} of axisTitleVariants(b,e)){
   const x=accept(changed);
   if(kind==='alias'){reject(changed,'LimitExceeded',{total:x.total-1},changed.length,x);continue;}
   assert.equal(x.r.axis.text.hex,text.toString('hex'));assert.equal(x.r.axis.text.introduced,true);
   reject(changed,'LimitExceeded',{objects:x.objects-1},changed.length,x);
   if(text.length)reject(changed,'LimitExceeded',{stored:x.stored-1},changed.length,x);
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected};
}
