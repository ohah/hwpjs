import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const run=(call,b,mode)=>call(53,Buffer.concat([Buffer.from([mode]),b]));
export function drawingStyleActual(call,b,mode=1) {
  const wide=(mode&1)!==0,fillOnly=(mode&2)!==0;
  const width=wide?13:11,flags=b.readUInt32LE(width),known=(flags&~7)===0;
  const fields=[known?(fillOnly?2:1):0,flags,b.readUInt32LE(0),wide?b.readInt32LE(4):b.readInt16LE(4),b.readUInt32LE(wide?8:6),b[width-1]];
  let at=width+4,imageId=null,imageOffset=null;
  if(known){
    if(flags&1)at+=12;
    if(flags&4){const count=b.readUInt32LE(at+17);at+=21+count*(count>2?8:4);}
    if(flags&2){imageOffset=at+4;imageId=b.readUInt16LE(imageOffset);at+=6;}
    at+=4+b.readUInt32LE(at);
    if(!fillOnly){
      for(const bit of [1,4,2])fields.push(flags&bit?b[at++]:256);
      for(let i=0;i<4;i++){fields.push(b.readUInt32LE(at));at+=4;}
    }
  }
  assert.ok(at<=b.length);
  assert.deepEqual(run(call,b,mode),Buffer.concat([...fields.map(w),w(b.length-at),b.subarray(at)]));
  return {known,flags,consumed:at,extra:b.length-at,imageId,imageOffset};
}
export function drawingStyleEdges(call){
  let accepted=0,rejected=0;
  for(const mode of [0,1,2,3])for(let flags=0;flags<8;flags++){
    const border=Buffer.alloc(mode&1?13:11),parts=[border,w(flags)];
    if(flags&1)parts.push(Buffer.alloc(12));
    if(flags&4)parts.push(Buffer.alloc(21));
    if(flags&2)parts.push(Buffer.alloc(6));
    parts.push(w(3),Buffer.from([9,8,7]));
    if(!(mode&2)){
      let alpha=0;for(const bit of [1,4,2])if(flags&bit)parts.push(Buffer.from([alpha++*127]));
      const shadow=Buffer.alloc(16,255);shadow.writeInt32LE(-2147483648,8);parts.push(shadow);
    }
    const raw=Buffer.concat(parts);drawingStyleActual(call,raw,mode);accepted++;
    for(let n=0;n<raw.length;n++){assert.throws(()=>run(call,raw.subarray(0,n),mode),/UnexpectedEnd/);rejected++;}
    drawingStyleActual(call,Buffer.concat([raw,Buffer.from([0,255])]),mode);accepted++;
    drawingStyleActual(call,raw,mode);
    if(mode&2){assert.throws(()=>run(call,raw,mode&1),/UnexpectedEnd/);rejected++;}
  }
  for(const mode of [0,1,2,3]){
    const border=Buffer.alloc(mode&1?13:11);
    for(const tail of [Buffer.alloc(0),Buffer.from([1,2,3])]){drawingStyleActual(call,Buffer.concat([border,w(0x80000001),tail]),mode);accepted++;}
  }
  assert.throws(()=>run(call,Buffer.alloc(21),4),/InvalidMode/);rejected++;
  return {accepted,rejected};
}
