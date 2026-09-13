import assert from 'node:assert/strict';
import {integer} from './chart-text-body-oracle.mjs';
export function objectTableWire(objects,strings,numbers){
 for(const id of strings.keys()){assert(objects.has(id));assert(!numbers.has(id));}
 for(const id of numbers.keys())assert(objects.has(id));
 return Buffer.concat([integer(objects.size),...[...objects].sort((a,b)=>a-b).flatMap(id=>{
  if(strings.has(id)){
   const s=strings.get(id),raw=Buffer.from(s.hex,'hex');
   return [integer(id),integer(1,1),integer(id),integer(raw.length),raw,integer(s.trailer,1)];
  }
  if(numbers.has(id)){
   const n=numbers.get(id),bits=Buffer.alloc(8);bits.writeBigUInt64LE(BigInt('0x'+n.bitsHex));
   return [integer(id),integer(2,1),integer(id),bits,integer(n.trailer,2)];
  }
  return [integer(id),integer(0,1)];
 })]);
}
