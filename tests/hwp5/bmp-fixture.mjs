// Independent Windows BMP generator; no native parser output used as fixtures.
export function bmpFixture({kind=40,width=3,height=2,top=false,bits=32,compression=0,masks,used=0,gap=0,after=0,declared=true}={}) {
  const indexed=bits>0&&bits<=8,count=indexed?(used||2**bits):used,entry=kind===12?3:4;
  const external=kind===40&&compression===3?12:0,offset=14+kind+external+count*entry+gap;
  const stride=Math.ceil(width*bits/32)*4,uncompressed=compression===0||compression===3,size=uncompressed?stride*height:4;
  const out=Buffer.alloc(offset+size+after);out.write('BM');out.writeUInt32LE(out.length,2);out.writeUInt32LE(offset,10);out.writeUInt32LE(kind,14);
  if(kind===12){out.writeUInt16LE(width,18);out.writeUInt16LE(height,20);out.writeUInt16LE(1,22);out.writeUInt16LE(bits,24);}
  else{out.writeInt32LE(width,18);out.writeInt32LE(top?-height:height,22);out.writeUInt16LE(1,26);out.writeUInt16LE(bits,28);out.writeUInt32LE(compression,30);out.writeUInt32LE(declared?size:0,34);out.writeInt32LE(-321,38);out.writeInt32LE(12345,42);out.writeUInt32LE(used,46);}
  if(kind>=108){out.writeUInt32LE(0x73524742,70);for(let i=0;i<9;i++)out.writeInt32LE((i-4)*1073741,74+i*4);for(let i=0;i<3;i++)out.writeUInt32LE(65537+i,110+i*4);}
  if(kind===124){out.writeUInt32LE(4,122);out.writeUInt32LE(0xffffffff,126);out.writeUInt32LE(123,130);}
  if(compression===3){masks??=bits===16?[0xf800,0x7e0,31,0]:[0xff0000,0xff00,255,kind>=108?0xff000000:0];for(let i=0;i<(external?3:4);i++)out.writeUInt32LE(masks[i],54+i*4);}
  const palette=14+kind+external;for(let i=0;i<count;i++){out[palette+i*entry]=(i*19+7)%256;out[palette+i*entry+1]=(i*43+11)%256;out[palette+i*entry+2]=(i*71+17)%256;}
  out.fill(0xa7,offset-gap,offset);out.fill(0xcb,offset+size);
  if(!uncompressed){out.set([0,0,0,1],offset);return out;}
  out.fill(0x9d,offset,offset+size);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,row=offset+(top?y:height-1-y)*stride;
    if(indexed){const index=(i*7+1)%count;if(bits===8)out[row+x]=index;else{const shift=bits===1?7-x%8:(x%2===0?4:0),at=row+Math.floor(x*bits/8),mask=(2**bits-1)<<shift;out[at]=(out[at]&~mask)|(index<<shift);}}
    else if(bits===16)out.writeUInt16LE((i*17557+0x6523)%65536,row+x*2);
    else {const at=row+x*(bits/8);out[at]=(i*71+3)%256;out[at+1]=(i*31+9)%256;out[at+2]=(i*13+27)%256;if(bits===32)out[at+3]=(i*97)%256;}
  }
  return out;
}
