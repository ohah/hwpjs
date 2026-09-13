import assert from 'node:assert/strict';
import {integer} from './chart-text-body-oracle.mjs';
// Selected zero/extended-source fixtures; not automatic count inference.
export function lightSourceCountVariant(bytes,e,count){
 const b=Buffer.from(bytes);
 assert(Number.isInteger(count)&&count>=0&&count<=65535);
 assert(count===0||count>=e.sources.length);
 let changed;
 if(count===0)changed=Buffer.concat([b.subarray(0,e.sourcesArray.headerEnd),b.subarray(e.lightRawStart)]);
 else {
  assert(e.sources.length>0);
  const extra=[];
  for(let i=e.sources.length;i<count;i++)extra.push(Buffer.concat([integer(0x80000000+i),integer(e.sources[0].typeId),Buffer.alloc(16,255),integer(e.baseTypeId)]));
  changed=Buffer.concat([b.subarray(0,e.lightRawStart),...extra,b.subarray(e.lightRawStart)]);
 }
 changed.writeUInt16LE(count,e.sourcesArray.firstOffset);changed.writeUInt16LE(count,e.sourcesArray.secondOffset);
 changed.writeUInt32LE(changed.length-36,32);return changed;
}
