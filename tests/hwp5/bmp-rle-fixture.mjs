import {bmpFixture} from './bmp-fixture.mjs';
export const rleExample4=Buffer.from('0304050600064556670004780002050104780000091e0001','hex');
export const rleExample8=Buffer.from('0304050600034556670002780002050102780000091e0001','hex');
export function bmpRleFixture({bits=8,width=32,height=4,commands=bits===4?rleExample4:rleExample8,...rest}={}) {
  const base=bmpFixture({bits,width,height,compression:bits===4?2:1,...rest});
  const offset=base.readUInt32LE(10),tail=base.subarray(offset+4);
  const out=Buffer.concat([base.subarray(0,offset),commands,tail]);
  out.writeUInt32LE(out.length,2);out.writeUInt32LE(commands.length,34);return out;
}
export function rleAbsolute(bits,indices,padding=0) {
  const data=Buffer.alloc(bits===8?indices.length:Math.ceil(indices.length/2));
  indices.forEach((value,i)=>{if(bits===8)data[i]=value;else data[Math.floor(i/2)]|=value<<(i%2===0?4:0);});
  return Buffer.concat([Buffer.of(0,indices.length),data,...(data.length%2?[Buffer.of(padding)]:[])]);
}
