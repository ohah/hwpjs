import assert from "node:assert/strict";
export function lineActual(call,bytes){
  assert.ok(bytes.length>=18);
  const extra=Buffer.alloc(4);extra.writeUInt32LE(bytes.length-18);
  assert.deepEqual(call(56,bytes),Buffer.concat([bytes.subarray(0,18),extra,bytes.subarray(18)]));
  for(let n=0;n<18;n++)assert.throws(()=>call(56,bytes.subarray(0,n)),/UnexpectedEnd/);
  assert.deepEqual(call(56,bytes),Buffer.concat([bytes.subarray(0,18),extra,bytes.subarray(18)]));
  return {attributes:bytes.readUInt16LE(16),extra:bytes.length-18,rejected:18};
}
export function lineEdges(call){
  let accepted=0,rejected=0;
  for(let at=0;at<18;at++)for(const value of [1,128,255]){
    const raw=Buffer.alloc(21);raw[at]=value;raw.set([0,128,255],18);
    rejected+=lineActual(call,raw).rejected;accepted++;
  }
  rejected+=lineActual(call,Buffer.alloc(18)).rejected;accepted++;
  return {accepted,rejected};
}
