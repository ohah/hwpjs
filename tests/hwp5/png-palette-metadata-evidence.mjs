import assert from 'node:assert/strict';
export function paletteMetadataEvidence(structure) {
  const {chunks,fields}=structure,[,,depth,color]=fields,entries=fields[8];
  const palette=chunks.findIndex(c=>c.name==='PLTE'),data=chunks.findIndex(c=>c.name==='IDAT');
  let validatedChunks=0,validatedBytes=0,kind=0,index=0;
  const raw=[0,0,0],values=[0,0,0];let frequencies=null;
  for(const name of ['bKGD','hIST']) {
    const positions=chunks.map((c,i)=>c.name===name?i:-1).filter(i=>i>=0);assert.ok(positions.length<=1);
    if(!positions.length)continue;const at=positions[0],bytes=chunks[at].payload;
    assert.ok(at<data&&(palette<0||palette<at));
    if(name==='bKGD') {
      if(color===3){assert.ok(palette>=0);assert.equal(bytes.length,1);assert.ok(bytes[0]<entries);kind=3;index=bytes[0];}
      else {const count=[0,4].includes(color)?1:3;kind=count===1?1:2;assert.equal(bytes.length,count*2);for(let i=0;i<count;i++){raw[i]=bytes.readUInt16BE(i*2);values[i]=raw[i]%(2**depth);}}
    } else {assert.ok(palette>=0);assert.equal(bytes.length,entries*2);frequencies=Array.from({length:entries},(_,i)=>bytes.readUInt16BE(i*2));}
    validatedChunks++;validatedBytes+=bytes.length;
  }
  return {validatedChunks,validatedBytes,kind,index,raw,values,frequencies};
}
export function paletteMetadataWire(structure,transparency) {
  const m=transparency.paletteMetadata;
  const fields=[m.kind,m.index,...m.raw,...m.values,m.frequencies===null?0:1,m.frequencies?.length??0,m.frequencies!==null&&structure.fields[3]===3?1:0,transparency.deferredChunks,transparency.deferredBytes];
  const wire=Buffer.alloc(564);fields.forEach((v,i)=>wire.writeUInt32LE(v,i*4));m.frequencies?.forEach((v,i)=>wire.writeUInt16LE(v,52+i*2));return wire;
}
