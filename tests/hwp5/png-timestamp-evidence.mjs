import assert from 'node:assert/strict';
export function timestampEvidence({chunks}) {
  const matches=chunks.filter(c=>c.name==='tIME');assert.ok(matches.length<=1);
  if(!matches.length)return null;
  const b=matches[0].payload;assert.equal(b.length,7);
  const fields=[b.readUInt16BE(),...b.subarray(2)];
  const bounds=[[0,65535],[1,12],[1,31],[0,23],[0,59],[0,60]];
  fields.forEach((v,i)=>assert.ok(v>=bounds[i][0]&&v<=bounds[i][1]));return fields;
}
export function timestampWire(t) {
  const fields=[t.timestamp?1:0,...(t.timestamp??Array(6).fill(0)),t.deferredChunks,t.deferredBytes];
  const wire=Buffer.alloc(36);fields.forEach((v,i)=>wire.writeUInt32LE(v,i*4));return wire;
}
