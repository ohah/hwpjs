import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {observedContentsCase} from './chart-observed-contents-oracle.mjs';
// Whole-assembly boundary checks; still not a comparison of all returned fields.
export async function chartObservedContentsSmoke(call,{allCuts=false}={}){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,accepted=0,rejected=0,cuts=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const {title,tail,input,wire}=observedContentsCase(b);
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
 });}finally{cfb.close();}
 assert.equal(roots,43);return {roots,accepted,rejected,cuts};
}
