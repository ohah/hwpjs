export function iccFixture(entries=[],length=132,major=4){
  const b=Buffer.alloc(length);b.writeUInt32BE(length);b.set([major,0x40,0,0],8);b.write('acsp',36);b.writeUInt32BE(entries.length,128);
  entries.forEach(([name,offset,size],i)=>{const at=132+i*12;b.write(name,at,4,'latin1');b.writeUInt32BE(offset,at+4);b.writeUInt32BE(size,at+8);});
  for(const [,offset,size] of entries)if(offset>=132+entries.length*12&&size>=8&&offset+8<=length)b.write('raw!',offset,4,'latin1');return b;
}
