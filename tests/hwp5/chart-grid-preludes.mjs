import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {gridPreludeWire} from './chart-grid-prelude-wire.mjs';
import {gridPreludeRawVariant} from './chart-grid-prelude-variant.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,caps=[5,13,50,1000000])=>Buffer.concat([...caps.map(u32),b]);
const expected=gridPreludeWire;

export async function chartGridPreludes(call){
 const cfb=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
 let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;
  const accept=(bytes,caps)=>{assert.deepEqual(call(310,input(bytes,caps),bytes.length),expected(bytes));accepted++;};
  const reject=(bytes,error,caps,limit=bytes.length)=>{
   assert.throws(()=>call(310,input(bytes,caps),limit),e=>e.constructor===Error&&e.message===error);rejected++;
   assert.deepEqual(call(310,input(b),b.length),expected(b));
  };
  const cells=b.readUInt16LE(136)*b.readUInt16LE(138);
  assert.ok(cells>0);accept(b,[5,13,50,cells]);
  reject(b,'LimitExceeded',[5,13,50,cells-1]);
  for(const caps of [[4,13,50,1000000],[5,12,50,1000000],[5,13,49,1000000]])reject(b,'LimitExceeded',caps);
  reject(b,'LimitExceeded',undefined,b.length-1);
  for(let cut=0;cut<140;cut++){
   const short=Buffer.from(b.subarray(0,cut));if(cut>=36)short.writeUInt32LE(cut-36,32);
   reject(short,'UnexpectedEnd');
  }
  for(const [at,error] of [[32,'InvalidChartExtent'],[46,'UnsupportedChartClass'],[125,'UnsupportedChartClass'],[54,'UnsupportedChartTypeVersion'],[134,'UnsupportedChartTypeVersion'],[133,'InvalidChartTypeName']]){
   const broken=Buffer.from(b);broken[at]^=1;reject(broken,error);
  }
  accept(gridPreludeRawVariant(b));
  for(const rows of [0,1,65535])for(const columns of [0,1,65535]){
   const changed=Buffer.from(b);changed.writeUInt16LE(rows,136);changed.writeUInt16LE(columns,138);
   accept(changed,[5,13,50,rows*columns]);
  }
 });}finally{cfb.close();}
 assert.deepEqual([roots,accepted,rejected],[43,473,6493]);
 return {roots,accepted,rejected,wireBytes:68};
}
