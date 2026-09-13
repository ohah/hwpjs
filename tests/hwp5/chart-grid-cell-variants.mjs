import assert from 'node:assert/strict';
// Byte-preserving value variants shared by isolated and whole-Contents tests.
export function gridCellVariants(b,o){
 const result=[],number=o.cells.find(c=>c.kind===2);
 if(number)for(const bits of [0n,0x8000000000000000n,0x7ff0000000000000n,0x7ff8000000001234n,0xffffffffffffffffn]){
  const bytes=Buffer.from(b);bytes.writeBigUInt64LE(bits,number.payloadStart);bytes.writeUInt16LE(0x1234,number.payloadStart+8);result.push(bytes);
 }
 const first=o.cells.find(c=>c.kind!==0);assert.equal(first.kind,1);
 const bytes=Buffer.from(b);bytes.fill(0xa5,first.payloadStart+2,first.payloadStart+2+first.raw.length);result.push(bytes);
 return result;
}
