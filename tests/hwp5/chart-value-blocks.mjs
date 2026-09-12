import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxis} from './chart-axis-evidence.mjs';
import {valueBlockCase} from './chart-value-block-oracle.mjs';
export async function chartValueBlocks(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,blocks=0,numbers=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const context=chartAxisContext(b);let offset=context.plot.end,state={types:context.types,strings:context.strings,numbers:new Map()};
  for(let i=0;i<4;i++){
   const result=observeAxis(b,offset,state.types,state.strings,state.numbers);
   if(result.value){
    blocks++;if(result.value.prefix.reference?.kind==='number')numbers++;
    const c=valueBlockCase(b,result,state),{body,input,wire}=c;
    const accept=(data=body,expected=wire)=>{const bytes=input(data);assert.deepEqual(call(322,bytes,bytes.length),expected);accepted++;};
    const reject=(data,error,limits={},limit)=>{const bytes=input(data,limits);assert.throws(()=>call(322,bytes,limit??bytes.length),e=>e.constructor===Error&&e.message===error);rejected++;const good=input();assert.deepEqual(call(322,good,good.length),wire);};
    accept();accept(Buffer.concat([body,Buffer.from([255,255,255])]));
    const raw=Buffer.from(body);raw.writeUInt32LE(0xdeadbeef);const expected=Buffer.from(wire);expected.writeUInt32LE(0xdeadbeef);accept(raw,expected);
    const changed=Buffer.from(b),p=result.value.prefix;
    changed.fill(0xff,p.label.start-2,p.label.start);
    changed.fill(0xff,p.end,p.end+3);
    if(p.format)changed.fill(0xff,p.format.code.start-2,p.format.code.start);
    for(const r of result.value.text.rawFields)changed.fill(0xff,r.start,r.start+r.n);
    const changedResult=observeAxis(changed,offset,state.types,state.strings,state.numbers),changedCase=valueBlockCase(changed,changedResult,state);
    accept(changedCase.body,changedCase.wire);
    for(let cut=0;cut<body.length;cut++)reject(body.subarray(0,cut),'UnexpectedEnd');
    if(c.per)reject(body,'LimitExceeded',{per:c.per-1});if(c.total)reject(body,'LimitExceeded',{total:c.total-1});
    if(c.stored)reject(body,'LimitExceeded',{stored:c.stored-1});reject(body,'LimitExceeded',{objects:c.objects-1});
    reject(body,'LimitExceeded',{},input().length-1);
    for(const d of [...result.value.prefix.declarations,...result.value.text.declarations]){
     const wrong=Buffer.from(body);wrong[d.versionOffset-c.start]^=1;reject(wrong,'UnsupportedChartTypeVersion');
    }
   }
   state=result;offset=result.end;
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(blocks,69);assert.equal(numbers,2);return {roots,blocks,numbers,accepted,rejected};
}
