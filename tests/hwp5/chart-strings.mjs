import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const input=(b,utf8,scalars)=>Buffer.concat([u32(utf8),u32(scalars),b]);
function expected(b){
 const split=b.indexOf(Buffer.from([0,0]));assert.ok(split>=0);
 const legacy=b.subarray(0,split),utf16=b.subarray(split+2,-2);
 assert.ok(b.subarray(-2).equals(Buffer.from([0,0])));
 const decoded=new TextDecoder('utf-16le',{fatal:true,ignoreBOM:true}).decode(utf16),utf8=Buffer.from(decoded),count=[...decoded].length;
 return {legacy,utf16,utf8,count,decoded,wire:Buffer.concat([...[split,split+2,utf16.length,count,utf8.length].map(u32),legacy,utf16,utf8])};
}
export async function chartStrings(call){
 const cfb=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
 let roots=0,strings=0,unaligned=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const contents=Buffer.from(streamBytes(entry));if(contents.indexOf(Buffer.from('VtChart\0'))<0)return;roots++;
  for(const cell of chartGridCellsOracle(contents).cells){
   if(cell.kind!==1)continue;strings++;
   const b=cell.raw,e=expected(b);unaligned+=(e.legacy.length+2)%2;
   // Corpus agreement is evidence, not a product requirement or fallback.
   assert.equal(new TextDecoder('euc-kr',{fatal:true}).decode(e.legacy),e.decoded);
   const accept=bytes=>{const x=expected(bytes);assert.deepEqual(call(312,input(bytes,x.utf8.length,x.count),bytes.length),x.wire);accepted++;};
   const reject=(bytes,error,utf8=e.utf8.length,scalars=e.count,limit=bytes.length)=>{
    assert.throws(()=>call(312,input(bytes,utf8,scalars),limit),err=>err.constructor===Error&&err.message===error);rejected++;
    assert.deepEqual(call(312,input(b,e.utf8.length,e.count),b.length),e.wire);
   };
   accept(b);
   reject(b,'LimitExceeded',e.utf8.length-1);
   reject(b,'LimitExceeded',e.utf8.length,e.count-1);
   reject(b,'LimitExceeded',e.utf8.length,e.count,b.length-1);
   reject(Buffer.alloc(b.length,65),'InvalidChartStringLayout');
   reject(b.subarray(0,b.length-1),'InvalidChartStringLayout');
   reject(b.subarray(0,e.legacy.length+2),'InvalidChartStringLayout');
   let bad=Buffer.from(b);bad.writeUInt16LE(0xdc00,e.legacy.length+2);reject(bad,'InvalidUnicodeEncoding');
   bad=Buffer.from(b);bad.writeUInt16LE(0xd800,b.length-4);reject(bad,'UnexpectedEnd');
   bad=Buffer.from(b);bad.fill(0xff,0,e.legacy.length);accept(bad);
  }
 });}finally{cfb.close();}
 assert.deepEqual([roots,strings,unaligned,accepted,rejected],[43,272,27,544,2176]);
 for(const decoded of ['', '\ufeff \u3000\0😀\t\n ', '\u{10ffff}\uffff']){
  const b=Buffer.concat([Buffer.from([0xff,0,0]),Buffer.from(decoded,'utf16le'),Buffer.from([0,0])]);
  const e=expected(b);
  assert.deepEqual(call(312,input(b,e.utf8.length,e.count),b.length),e.wire);accepted++;
 }
 assert.equal(accepted,547);
 return {roots,strings,unaligned,accepted,rejected};
}
