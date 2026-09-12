import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const types=[
 {offset:40,end:56,name:'VtChart',version:6},
 {offset:60,end:79,name:'VtDataGrid',version:1},
 {offset:79,end:96,name:'VtMatrix',version:1},
 {offset:96,end:117,name:'VtCollection',version:1},
 {offset:119,end:136,name:'VtObject',version:1},
];
const input=(b,order,caps=[5,13,50])=>{
 const count=Buffer.alloc(2);count.writeUInt16LE(order.length);
 return Buffer.concat([...caps.map(u32),count,...order.map(i=>u32(types[i].offset)),b]);
};
const expected=order=>{
 const seen=new Set(),rows=[];
 for(const id of order){
  const t=types[id],fresh=!seen.has(id),name=Buffer.from(t.name+'\0'),version=Buffer.alloc(2);version.writeUInt16LE(t.version);
  rows.push(Buffer.concat([u32(id),u32(+fresh),u32(fresh?t.end:t.offset+4),u32(name.length),version,name]));seen.add(id);
 }
 return Buffer.concat([u32(seen.size),u32([...seen].reduce((n,i)=>n+types[i].name.length+1,0)),...rows]);
};
export async function chartTypeTables(call){
 const cfb=await createCfbReader(readFileSync(new URL('../../zig-out/bin/hwpjs.wasm',import.meta.url)));
 let roots=0,accepted=0,rejected=0;
 const order=[0,1,2,3,4,0,1,2,3,4],wanted=expected(order);
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  for(const [id,t] of types.entries()){
   assert.equal(b.readUInt32LE(t.offset),id);
   assert.equal(b.readUInt16LE(t.offset+4),t.name.length+1);
   assert.deepEqual(b.subarray(t.offset+6,t.end-2),Buffer.from(t.name+'\0'));
   assert.equal(b.readUInt16LE(t.end-2),t.version);
  }
  roots++;
  for(const selected of [order,[4,2,0,3,1,4,2,0,3,1]]){
   assert.deepEqual(call(309,input(b,selected),selected.length),expected(selected));accepted++;
  }
  const reject=(wire,error,limit=100)=>{
   assert.throws(()=>call(309,wire,limit),e=>e.constructor===Error&&e.message===error);rejected++;
   assert.deepEqual(call(309,input(b,order)),wanted);
  };
  for(const caps of [[4,13,50],[5,12,50],[5,13,49]])reject(input(b,order,caps),'LimitExceeded');
  reject(input(b,order),'LimitExceeded',order.length-1);
  reject(input(b.subarray(0,124),order),'UnexpectedEnd');
  const broken=Buffer.from(b);broken[133]=1;reject(input(broken,order),'InvalidChartTypeName');
 });}finally{cfb.close();}
 assert.deepEqual([roots,accepted,rejected],[43,86,258]);
 return {roots,accepted,rejected,wireBytes:wanted.length};
}
