import assert from 'node:assert/strict';
export function srgbEvidence({chunks},fixed){
  const indexes=chunks.map((c,i)=>c.name==='sRGB'?i:-1).filter(i=>i>=0);assert.ok(indexes.length<=1);
  if(!indexes.length)return {present:0,intent:0};
  const i=indexes[0],payload=chunks[i].payload;assert.equal(payload.length,1);assert.ok(payload[0]<=3);
  assert.ok(i<chunks.findIndex(c=>c.name==='PLTE'||c.name==='IDAT'));
  if(fixed.fields[0])assert.equal(fixed.fields[1],45455);
  if(fixed.fields[2])assert.deepEqual(fixed.fields.slice(3,11),[31270,32900,64000,33000,30000,60000,15000,6000]);
  return {present:1,intent:payload[0]};
}
export function srgbWire(t){
  const out=Buffer.alloc(28);[t.srgb.present,t.srgb.intent,t.colorFixed.fields[0],t.colorFixed.fields[2],Number(t.colorSemanticsDeferred),t.deferredChunks,t.deferredBytes].forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;
}
