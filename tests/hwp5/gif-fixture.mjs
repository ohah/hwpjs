const u=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
export function gifSubBlocks(bytes,chunk=255){const parts=[];for(let i=0;i<bytes.length;i+=chunk){const p=bytes.subarray(i,i+chunk);parts.push(Buffer.of(p.length),p);}return Buffer.concat([...parts,Buffer.of(0)]);}
// Caller-supplied codes: track decoder dictionary growth while packing widths.
export function gifPack(codes,minimum=2){
  const clear=2**minimum;let width=minimum+1,next=clear+2,previous=false,bit=0;const bytes=[];
  for(const code of codes){for(let i=0;i<width;i++,bit++)bytes[bit>>3]=(bytes[bit>>3]??0)|(((code>>i)&1)<<(bit&7));
    if(code===clear){width=minimum+1;next=clear+2;previous=false;}
    else if(code!==clear+1){if(previous&&next<4096){next++;if(next>=2**width&&width<12)width++;}previous=true;}
  }return Buffer.from(bytes);
}
export const gifControl=(flags=1,delay=123,index=1)=>Buffer.from([33,249,4,flags,delay&255,delay>>8,index,0]);
export const gifComment=()=>Buffer.from([33,254,3,65,66,67,0]);
export const gifApplication=()=>Buffer.concat([Buffer.of(33,255,11),Buffer.from('NETSCAPE2.0'),Buffer.from([3,1,0,0,0])]);
export const gifText=()=>Buffer.concat([Buffer.of(33,1,12),Buffer.alloc(12),Buffer.of(1,65,0)]);
export function gifFixture({version=89,width=3,height=2,screenWidth=width,screenHeight=height,left=0,top=0,minimum=2,global=Buffer.from([0,0,0,255,255,255]),local=null,interlace=false,codes=null,chunk=255,prefix=Buffer.alloc(0),repeat=1,aspect=0}={}){
  const f=palette=>palette?128|Math.log2(palette.length/3)-1:0;
  const header=Buffer.concat([Buffer.from('GIF'+version+'a'),u(screenWidth),u(screenHeight),Buffer.of(f(global),0,aspect),global??Buffer.alloc(0)]);
  const clear=2**minimum,values=codes??[clear,...Array.from({length:width*height},(_,i)=>i%2),clear+1];
  const frame=Buffer.concat([Buffer.of(44),u(left),u(top),u(width),u(height),Buffer.of(f(local)|(interlace?64:0)),local??Buffer.alloc(0),Buffer.of(minimum),gifSubBlocks(gifPack(values,minimum),chunk)]);
  return Buffer.concat([header,...Array.from({length:repeat},()=>Buffer.concat([prefix,frame])),Buffer.of(59)]);
}
