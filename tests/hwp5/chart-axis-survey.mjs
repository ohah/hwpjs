import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxis} from './chart-axis-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[];
const verify=process.argv.includes('--verify');let cuts=0,selectorMutations=0,baseMutations=0;
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const context=chartAxisContext(b);let offset=context.plot.end,state={types:context.types,strings:context.strings,numbers:new Map()};const axes=[];
  do{
   const result=observeAxis(b,offset,state.types,state.strings,state.numbers);
   if(verify){
    for(let cut=offset;cut<result.end;cut++){
     assert.throws(()=>observeAxis(b.subarray(0,cut),offset,state.types,state.strings,state.numbers),e=>e.constructor===Error&&['IncompleteAxisObservation','IncompleteValueObservation','IncompleteAxisTail'].includes(e.message));cuts++;
    }
    const wrongSelector=Buffer.from(b);wrongSelector[result.axis.rawFields[0].start+6]^=1;
    assert.throws(()=>observeAxis(wrongSelector,offset,state.types,state.strings,state.numbers),e=>e.constructor===Error&&e.message==='UnsupportedAxisTailType');selectorMutations++;
    const wrongBase=Buffer.from(b);wrongBase.writeUInt32LE(0xffffffff,result.tail.baseOffset);
    assert.throws(()=>observeAxis(wrongBase,offset,state.types,state.strings,state.numbers),e=>e.constructor===Error&&e.message==='UnsupportedAxisTailType');baseMutations++;
    assert.deepEqual(observeAxis(b.subarray(0,result.end),offset,state.types,state.strings,state.numbers),result);
    const after=Buffer.from(b);after.fill(0xff,result.end);assert.deepEqual(observeAxis(after,offset,state.types,state.strings,state.numbers),result);
   }
   assert(result.end>offset);axes.push({axis:result.axis,value:result.value,tail:result.tail,end:result.end});
   offset=result.end;state=result;
  }while(b.length-offset>=8&&state.types.get(b.readUInt32LE(offset+4))?.name==='VtAxis\0');
  rows.push({sha256:digest(b),axes,end:offset,nextBytes:b.subarray(offset,offset+32).toString('hex')});
  assert.equal(axes.length,4);
 });
 assert.equal(rows.length,43);
 console.log(JSON.stringify({corpus,observations:rows.length,axisCounts:rows.map(r=>r.axes.length),verification:verify?{cuts,selectorMutations,baseMutations}:null,rows},null,2));
}finally{cfb.close();}
