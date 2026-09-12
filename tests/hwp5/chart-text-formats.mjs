import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxis} from './chart-axis-evidence.mjs';
import {textFormatCase,integer} from './chart-text-format-oracle.mjs';
export async function chartTextFormats(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));let roots=0,formats=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  const context=chartAxisContext(b);let offset=context.plot.end,state={types:context.types,strings:context.strings,numbers:new Map()};
  for(let i=0;i<4;i++){
   const result=observeAxis(b,offset,state.types,state.strings,state.numbers);
   if(result.value?.prefix.format){
    formats++;const c=textFormatCase(b,result,state.types),{f,body,raw,input,wire}=c;
    assert(f.code.introduced,'isolated scope requires fresh corpus code');
    const accept=(data=body,options={},tail=Buffer.alloc(0))=>{const bytes=input(Buffer.concat([data,tail]),options);assert.deepEqual(call(321,bytes,bytes.length),wire(data,options));accepted++;};
    const reject=(data,error,options={},limit)=>{const bytes=input(data,options);assert.throws(()=>call(321,bytes,limit??bytes.length),e=>e.constructor===Error&&e.message===error);rejected++;const good=input();assert.deepEqual(call(321,good,good.length),wire());};
    accept();accept(body,{},Buffer.from([255,255,255]));
    for(let cut=0;cut<body.length;cut++)reject(body.subarray(0,cut),'UnexpectedEnd');
    if(raw.length){reject(body,'LimitExceeded',{per:raw.length-1});reject(body,'LimitExceeded',{stored:raw.length-1});}
    reject(body,'LimitExceeded',{count:1});reject(body,'LimitExceeded',{},input().length-1);
    const changed=Buffer.from(body);changed.writeUInt16LE(0xaa55,f.code.start-f.start-2);accept(changed,{word:0xaa55});
    const alias=Buffer.concat([body.subarray(0,f.code.start-f.start),integer(f.code.id)]);accept(alias,{alias:true});
    if(raw.length)reject(alias,'LimitExceeded',{alias:true,per:raw.length-1});
    const collision=Buffer.from(body);collision.writeUInt32LE(f.headerWord,f.code.start-f.start);reject(collision,'UnsupportedChartObjectReference');
    for(const d of result.value.prefix.declarations)if(d.nameOffset>=f.start&&d.versionOffset<f.end){
     const wrong=Buffer.from(body);wrong[d.versionOffset-f.start]^=1;reject(wrong,'UnsupportedChartTypeVersion');
    }
   }
   state=result;offset=result.end;
  }
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(formats,50);return {roots,formats,accepted,rejected};
}
