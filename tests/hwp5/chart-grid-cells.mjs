import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
import {chartGridGapEvidence} from './chart-grid-gap-evidence.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,caps)=>Buffer.concat([...caps.map(u32),b]);
export async function chartGridCells(call){
 const cfb=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
 let roots=0,slots=0,nulls=0,accepted=0,rejected=0,shifted=0;
 const gaps=[];
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const o=chartGridCellsOracle(b),caps=[o.maxString,o.stringBytes,o.cells.length,o.typeCount];
  const accept=bytes=>{assert.deepEqual(call(311,input(bytes,caps),bytes.length),chartGridCellsOracle(bytes).wire);accepted++;};
  const reject=(bytes,error,limits=caps,limit=bytes.length)=>{
   assert.throws(()=>call(311,input(bytes,limits),limit),e=>e.constructor===Error&&e.message===error);rejected++;
   assert.deepEqual(call(311,input(b,caps),b.length),o.wire);
  };
  roots++;slots+=o.cells.length;nulls+=o.cells.filter(c=>c.kind===0).length;
  shifted+=o.cells.filter((c,i)=>c.kind!==0&&c.id!==i+1).length;
  const emptySlots=o.cells.flatMap((c,i)=>c.kind===0?[i+1]:[]);
  if(emptySlots.length>1){
   gaps.push({sha256:createHash('sha256').update(b).digest('hex'),emptySlots,end:o.end});
   const xml=cfb.findExact('/OOXMLChartContents');assert.ok(xml);
   const source=Buffer.from(streamBytes(xml)).toString('utf8');
   chartGridGapEvidence(source,o);
   assert.throws(()=>chartGridGapEvidence(source.replace('<c:v>32</c:v>','<c:v>33</c:v>'),o),e=>e.code==='ERR_ASSERTION');
   assert.throws(()=>chartGridGapEvidence(source,{...o,cells:o.cells.filter(c=>c.kind!==0)}),e=>e.code==='ERR_ASSERTION');
  }
  accept(b);
  for(let i=0;i<4;i++){const limits=[...caps];limits[i]--;reject(b,'LimitExceeded',limits);}
  reject(b,'LimitExceeded',caps,b.length-1);
  for(let cut=0;cut<o.end;cut++){
   const short=Buffer.from(b.subarray(0,cut));if(cut>=36)short.writeUInt32LE(cut-36,32);
   reject(short,'UnexpectedEnd');
  }
  const first=o.cells.find(c=>c.kind!==0),last=o.cells.findLast(c=>c.kind!==0);
  let bad=Buffer.from(b);bad.writeUInt32LE(first.id,last.start);reject(bad,'UnsupportedChartObjectReference');
  bad=Buffer.from(b);bad.writeUInt32LE(0,last.objectBase);reject(bad,'UnsupportedChartClass');
  bad=Buffer.from(b);bad[first.start+19]^=1;reject(bad,'UnsupportedChartTypeVersion');
  const number=o.cells.find(c=>c.kind===2);
  if(number){for(const bits of [0n,0x8000000000000000n,0x7ff0000000000000n,0x7ff8000000001234n,0xffffffffffffffffn]){
   bad=Buffer.from(b);bad.writeBigUInt64LE(bits,number.payloadStart);bad.writeUInt16LE(0x1234,number.payloadStart+8);accept(bad);
  }}
  bad=Buffer.from(b);bad.fill(0xa5,first.payloadStart+2,first.payloadStart+2+first.raw.length);accept(bad);
 });}finally{cfb.close();}
 assert.deepEqual([roots,slots,nulls],[43,750,51]);
 assert.deepEqual(gaps,[
  {sha256:'6e9a21d261ce6f01a404ad003cb68dd4797071677920015b3cf7257fda2d487e',emptySlots:[1,17,18,19,20],end:772},
  {sha256:'5b3cf2ef71fdf03d26c798cb90e14b0b0de746d42b3faa6b7364f79e0ed61fff',emptySlots:[1,22,23,24,25],end:907},
 ]);
 assert.equal(shifted,10);
 assert.deepEqual([accepted,rejected],[291,28765]);
 return {roots,slots,nulls,shifted,accepted,rejected};
}
