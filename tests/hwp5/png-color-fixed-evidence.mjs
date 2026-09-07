import assert from 'node:assert/strict';
export function colorFixedEvidence({chunks}){
  const fields=Array(12).fill(0);let count=0,bytes=0;
  for(const [name,size,presence,start] of [['gAMA',4,0,1],['cHRM',32,2,3]]){
    const indexes=chunks.map((c,i)=>c.name===name?i:-1).filter(i=>i>=0);assert.ok(indexes.length<=1);
    if(!indexes.length)continue;const index=indexes[0],payload=chunks[index].payload;assert.equal(payload.length,size);
    const stop=chunks.findIndex(c=>c.name==='PLTE'||c.name==='IDAT');assert.ok(index<stop);
    fields[presence]=1;for(let i=0;i<size/4;i++){const v=payload.readUInt32BE(i*4);assert.ok(v<=0x7fffffff);fields[start+i]=v;}
    count++;bytes+=size;
  }
  fields[11]=count>0?1:0;return {fields,count,bytes};
}
export function colorFixedWire(t){const out=Buffer.alloc(56);[...t.colorFixed.fields,t.deferredChunks,t.deferredBytes].forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;}
