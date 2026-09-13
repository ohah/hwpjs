import assert from 'node:assert/strict';
// Insert the supported optional Tail block; this is synthetic layout evidence.
export function axisExtraTailVariant(bytes,r){
 const b=Buffer.from(bytes),selectorAt=r.axis.rawFields[0].start+6;
 assert.equal(b.readUInt16LE(selectorAt),0);assert.equal(r.tail.extra,null);
 const at=r.tail.start+Buffer.from(r.tail.prefix,'hex').length;
 const changed=Buffer.concat([b.subarray(0,at),Buffer.alloc(24,0xa5),b.subarray(at)]);
 changed.writeUInt16LE(1,selectorAt);changed.writeUInt32LE(changed.length-36,32);
 return changed;
}
