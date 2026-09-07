import assert from 'node:assert/strict';
export function sampleMetadataEvidence({chunks,fields}) {
  const found=name=>chunks.map((c,i)=>c.name===name?i:-1).filter(i=>i>=0);
  const p=found('pHYs'),s=found('sBIT'),idat=found('IDAT')[0],plte=found('PLTE')[0];
  assert.ok(p.length<=1&&s.length<=1);
  let physical=null,bits=null,validatedBytes=0;
  if(p.length){const i=p[0],b=chunks[i].payload;assert.ok(i<idat);assert.equal(b.length,9);
    physical=[b.readUInt32BE(0),b.readUInt32BE(4),b[8]];
    assert.ok(physical[0]<2**31&&physical[1]<2**31&&physical[2]<=1);validatedBytes+=b.length;}
  if(s.length){const i=s[0],b=chunks[i].payload,color=fields[3];assert.ok(i<idat&&(plte===undefined||i<plte));
    assert.equal(b.length,({0:1,2:3,3:3,4:2,6:4})[color]);
    assert.ok([...b].every(v=>v>=1&&v<=(color===3?8:fields[2])));bits=[...b];validatedBytes+=b.length;}
  return {physical,bits,validatedChunks:p.length+s.length,validatedBytes};
}
export function sampleMetadataWire(t) {
  const {physical:p,bits:s}=t.sampleMetadata;
  const values=[p?1:0,...(p??[0,0,0]),s?1:0,s?.length??0,...Array.from({length:4},(_,i)=>s?.[i]??0),t.deferredChunks,t.deferredBytes];
  const out=Buffer.alloc(48);values.forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;
}
