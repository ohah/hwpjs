import assert from 'node:assert/strict';
// Replace owned inline String payloads from the end so earlier offsets survive.
export function stringLengthVariant(bytes,strings,length){
 assert(Number.isInteger(length)&&length>=0&&length<=65535);
 let b=Buffer.from(bytes);const field=Buffer.alloc(length+2,255);field.writeUInt16LE(length);
 for(const s of [...strings].sort((a,b)=>b.lengthOffset-a.lengthOffset))b=Buffer.concat([b.subarray(0,s.lengthOffset),field,b.subarray(s.payloadOffset+s.bytes.length)]);
 b.writeUInt32LE(b.length-36,32);return b;
}
