import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {lineItemsOracle} from './chart-line-items-oracle.mjs';
const extent=b=>{b.writeUInt32LE(b.length-36,32);return b;};
export async function chartLineItems(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,items=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const e=lineItemsOracle(b);items+=e.rows.length;
  const accept=(bytes,count=2)=>{const x=lineItemsOracle(bytes,count);assert.deepEqual(call(325,x.input(),bytes.length),x.wire);accepted++;};
  const reject=(bytes,error,maxObjects=e.objects,limit=bytes.length,count=2)=>{assert.throws(()=>call(325,e.input(bytes,maxObjects,count),limit),err=>err.constructor===Error&&err.message===error);rejected++;assert.deepEqual(call(325,e.input(),b.length),e.wire);};
  accept(b);accept(b,0);accept(b,1);accept(extent(Buffer.from(b.subarray(0,e.end))));
  const after=Buffer.from(b);after.fill(0xff,e.end);accept(after);
  const raw=Buffer.from(b);for(const r of e.rows)raw.fill(0xff,r.rawStart,r.baseOffset);accept(raw);
  const word=Buffer.from(b);word.writeUInt16LE(0xffff,e.start);accept(word);
  for(let cut=e.start;cut<e.end;cut++)reject(extent(Buffer.from(b.subarray(0,cut))),'UnexpectedEnd');
  reject(b,'LimitExceeded',e.objects-1);reject(b,'LimitExceeded',e.objects,b.length-1);reject(b,'LimitExceeded',e.objects,b.length,33);
  for(const r of e.rows){
   for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[e.axis.seen.values().next().value,'DuplicateChartObjectId']]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.start);reject(bad,error);}
   const base=Buffer.from(b);base.writeUInt32LE(r.typeId,r.baseOffset);reject(base,'UnsupportedChartClass');
   for(const d of r.declarations)for(const [at,error] of [[d.nameOffset,'UnsupportedChartClass'],[d.versionOffset,'UnsupportedChartTypeVersion']]){const bad=Buffer.from(b);bad[at]^=1;reject(bad,error);}
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(items,86);return {roots,items,accepted,rejected};
}
