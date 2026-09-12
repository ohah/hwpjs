import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxis} from './chart-axis-evidence.mjs';
import {textBodyCase,integer} from './chart-text-body-oracle.mjs';
export async function chartTextBodies(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,bodies=0,accepted=0,rejected=0,nullText=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const c=chartAxisContext(b);let state={types:c.types,strings:c.strings,numbers:new Map()},offset=c.plot.end;
  for(let axis=0;axis<4;axis++){
   const r=observeAxis(b,offset,state.types,state.strings,state.numbers);
   if(r.value){
    bodies++;const e=textBodyCase(b,r,state),original=e.input();if(e.text.text===null)nullText++;
    const accept=input=>{assert.deepEqual(call(319,input,input.length),e.wire);accepted++;};
    const reject=(input,error,limit=input.length)=>{
     assert.throws(()=>call(319,input,limit),err=>err.constructor===Error&&err.message===error);rejected++;
     assert.deepEqual(call(319,original,original.length),e.wire);
    };
    accept(original);accept(e.input(Buffer.concat([e.body,Buffer.alloc(32,0xff)])));
    for(let cut=0;cut<e.body.length;cut++)reject(e.input(e.body.subarray(0,cut)),'UnexpectedEnd');
    reject(e.input(e.body,{per:e.per-1}),'LimitExceeded');reject(e.input(e.body,{total:e.total-1}),'LimitExceeded');
    reject(e.input(e.body,{objects:e.objects-1}),'LimitExceeded');reject(e.input(e.body,{stored:e.stored-1}),'LimitExceeded');
    reject(original,'LimitExceeded',original.length-1);
    const bad=Buffer.from(e.body);bad.writeUInt32LE(0,e.body.length-4);reject(e.input(bad),'UnsupportedChartClass');
    const changed=bytes=>{
     const observed=observeAxis(bytes,offset,state.types,state.strings,state.numbers),x=textBodyCase(bytes,observed,state),input=x.input();
     assert.deepEqual(call(319,input,input.length),x.wire);accepted++;return x;
    };
    const raw=Buffer.from(b);for(const field of e.text.rawFields)raw.fill(0xff,field.start,field.start+field.n);changed(raw);
    const textStart=e.text.text?.start??(e.text.rawFields.find(f=>f.n===24).start+24),textEnd=e.text.text?.end??textStart+4;
    changed(Buffer.concat([b.subarray(0,textStart),integer(0xffffffff),b.subarray(textEnd)]));
    const alias=changed(Buffer.concat([b.subarray(0,textStart),integer(e.text.fontName.id),b.subarray(textEnd)]));
    reject(alias.input(alias.body,{total:alias.total-1}),'LimitExceeded');
   }
   state=r;offset=r.end;
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(bodies,69);return {roots,bodies,nullText,accepted,rejected};
}
