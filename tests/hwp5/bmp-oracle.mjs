import assert from 'node:assert/strict';
export const bmpWords=values=>{const out=Buffer.alloc(values.length*4);values.forEach((v,i)=>out.writeUInt32LE(v>>>0,i*4));return out;};
export function bmpHeaderOracle(raw) {
  const size=raw.readUInt32LE();assert.ok([12,40,108,124].includes(size));assert.ok(raw.length>=size);
  const core=size===12,width=core?raw.readUInt16LE(4):raw.readInt32LE(4),height=core?raw.readUInt16LE(6):raw.readInt32LE(8),bits=raw.readUInt16LE(core?10:14),compression=core?0:raw.readUInt32LE(16);
  assert.ok(compression<=5);if(size===124)assert.equal(raw.readUInt32LE(120),0);
  assert.ok(width>0&&height!==0);assert.equal(raw.readUInt16LE(core?8:12),1);
  assert.ok((core?[1,4,8,24]:compression===0?[1,4,8,16,24,32]:compression===1?[8]:compression===2?[4]:compression===3?[16,32]:[0]).includes(bits));
  assert.ok(height>0||compression===0||compression===3);
  const info=core?Array(5).fill(0):Array.from({length:5},(_,i)=>raw.readUInt32LE(20+i*4));
  const colour=size<108?Array(17).fill(0):Array.from({length:17},(_,i)=>raw.readUInt32LE(40+i*4));
  const profile=size<124?Array(3).fill(0):Array.from({length:3},(_,i)=>raw.readUInt32LE(108+i*4));
  return bmpWords([size,width,Math.abs(height),+(height<0),bits,compression,+!core,...info,+(size>=108),...colour,+(size===124),...profile]);
}
function channels(raw,bits) {
  let seen=new Set();return raw.map((mask,c)=>{const locations=Array.from({length:32},(_,i)=>i).filter(i=>(BigInt(mask)&(1n<<BigInt(i)))!==0n);assert.ok(c===3||locations.length);for(let j=0;j<locations.length;j++){const bit=locations[j];assert.ok(bit<bits&&!seen.has(bit));assert.equal(bit,locations[0]+j);seen.add(bit);}return locations;});
}
export function bmpLayoutOracle(raw,{trailing=false}={}) {
  assert.equal(raw.subarray(0,2).toString(),'BM');assert.equal(raw.readUInt32LE(6),0);
  const size=raw.readUInt32LE(2),offset=raw.readUInt32LE(10);assert.ok(size<=raw.length);if(!trailing)assert.equal(size,raw.length);
  const h=bmpHeaderOracle(raw.subarray(14)),kind=h.readUInt32LE(),width=h.readUInt32LE(4),height=h.readUInt32LE(8),bits=h.readUInt32LE(16),compression=h.readUInt32LE(20);
  let at=14+kind,masks=null;if(compression===3){masks=Array.from({length:kind===40?3:4},(_,i)=>raw.readUInt32LE(54+i*4));if(kind===40){at+=12;masks.push(0);}channels(masks,bits);}else if(bits===16&&compression===0)masks=[31744,992,31,0];
  const entry=kind===12?3:4,used=kind===12?0:raw.readUInt32LE(46),count=used||(bits>0&&bits<=8?2**bits:0),palette=raw.subarray(at,at+count*entry);assert.equal(palette.length,count*entry);
  if(bits>0&&bits<=8)assert.ok(count<=2**bits);if(entry===4)for(let i=3;i<palette.length;i+=4)assert.equal(palette[i],0);at+=palette.length;assert.ok(offset>=at&&offset<=size);
  const uncompressed=compression===0||compression===3,stride=uncompressed?Number(((BigInt(width)*BigInt(bits)+31n)/32n)*4n):0,declared=kind===12?0:raw.readUInt32LE(34),imageBytes=uncompressed?stride*height:declared;
  if(declared&&uncompressed)assert.equal(declared,imageBytes);if(compression!==0)assert.ok(declared>0);assert.ok(offset+imageBytes<=size);
  const pixels=raw.subarray(offset,offset+imageBytes),gap=raw.subarray(at,offset),after=raw.subarray(offset+imageBytes,size),tail=raw.subarray(size);
  const wire=Buffer.concat([h,bmpWords([size,offset,stride,imageBytes,count,entry,+!!masks,...(masks??[0,0,0,0]),gap.length,after.length,tail.length,1]),palette,pixels,gap,after,tail]);
  return {wire,width,height,bits,compression,top:!!h.readUInt32LE(12),stride,pixels,palette,entry,masks};
}
export function bmpPixelsOracle(raw,options={}) {
  const v=bmpLayoutOracle(raw,options);assert.ok(v.compression===0||v.compression===3);
  const maskBits=v.masks?channels(v.masks,v.bits):null,rows=[];
  for(let y=0;y<v.height;y++){
    const row=v.pixels.subarray(y*v.stride,(y+1)*v.stride),out=Buffer.alloc(v.width*4);
    for(let x=0;x<v.width;x++){
      let rgba;if(v.bits<=8){const bit=x*v.bits,index=Math.floor(row[Math.floor(bit/8)]/2**(8-v.bits-bit%8))%2**v.bits;assert.ok(index<v.palette.length/v.entry);const at=index*v.entry;rgba=[v.palette[at+2],v.palette[at+1],v.palette[at],255];}
      else if(maskBits){const value=BigInt(v.bits===16?row.readUInt16LE(x*2):row.readUInt32LE(x*4));rgba=maskBits.map(locations=>{if(!locations.length)return 255;const n=locations.reduce((sum,bit,i)=>sum+(((value>>BigInt(bit))&1n)<<BigInt(i)),0n),max=(1n<<BigInt(locations.length))-1n;return Number((n*510n+max)/(max*2n));});}
      else{const at=x*v.bits/8;rgba=[row[at+2],row[at+1],row[at],255];}out.set(rgba,x*4);
    }rows.push(out);
  }
  if(!v.top)rows.reverse();return Buffer.concat([bmpWords([v.width,v.height,v.width*v.height*4,1]),...rows]);
}
