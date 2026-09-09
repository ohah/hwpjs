import assert from 'node:assert/strict';
import {bmpFixture} from './bmp-fixture.mjs';
import {bmpHeaderOracle,bmpLayoutOracle,bmpPixelsOracle,bmpWords} from './bmp-oracle.mjs';
export function bmpInput(raw,{pixels=100000000n,bytes=67108864,palette=65536,storage=268435456,trailing=false,rgba=268435456}={},mode=286) {
  const p=Buffer.alloc(8);p.writeBigUInt64LE(BigInt(pixels));
  if(mode===285)return Buffer.concat([p,raw]);
  return Buffer.concat([...(mode===287?[bmpWords([rgba])]:[]),p,bmpWords([bytes,palette,storage]),Buffer.of(+trailing),raw]);
}
export function bmpActual(call,raw,options={}) {
  assert.deepEqual(call(285,bmpInput(raw.subarray(14),options,285)),bmpHeaderOracle(raw.subarray(14)));
  const layout=bmpLayoutOracle(raw,options);assert.deepEqual(call(286,bmpInput(raw,options)),layout.wire);
  if(layout.compression===0||layout.compression===3)assert.deepEqual(call(287,bmpInput(raw,options,287)),bmpPixelsOracle(raw,options));
  else assert.throws(()=>call(287,bmpInput(raw,options,287)),/UnsupportedBmpPixelCompression/);
  return {width:layout.width,height:layout.height,bits:layout.bits,compression:layout.compression,pixels:layout.width*layout.height};
}
export function bmpEdges(call) {
  let comparisons=0,rejected=0;
  const check=(raw,options={})=>{bmpActual(call,raw,options);comparisons+=3;};
  const reject=(raw,pattern,options={},mode=286,limit=67108864)=>{assert.throws(()=>call(mode,bmpInput(raw,options,mode),limit),pattern);rejected++;};
  for(const kind of [12,40,108,124])for(const bits of kind===12?[1,4,8,24]:[1,4,8,16,24,32])for(const compression of kind!==12&&[16,32].includes(bits)?[0,3]:[0])for(const top of kind===12?[false]:[false,true])for(const width of [1,2,3,7,8,9,17])for(const height of [1,2,5]){
    check(bmpFixture({kind,bits,compression,top,width,height,gap:3,after:5,declared:compression!==0||width%2===0}));
  }
  for(const bits of [1,4,8,16,24,32])check(bmpFixture({bits,used:bits===1?1:3}));
  for(const masks of [[0xff000000,0xff0000,0xff00,255],[0x3ff00000,0xffc00,0x3ff,0xc0000000],[0x3fffffff,0x40000000,0x80000000,0],[0x100,0x10,1,0x1000]])for(const top of [false,true])check(bmpFixture({kind:124,bits:32,compression:3,masks,top,width:17,height:9}));
  for(const [compression,bits] of [[1,8],[2,4],[4,0],[5,0]]){
    const raw=bmpFixture({compression,bits});check(raw);
    const bad=Buffer.from(raw);bad.writeInt32LE(-2,22);reject(bad,/InvalidBmpOrientation/);
  }
  const raw=bmpFixture({width:3,height:2,bits:32});
  for(let n=0;n<raw.length;n++)reject(raw.subarray(0,n),/UnexpectedEnd/);
  const change=(at,type,value)=>{const b=Buffer.from(raw);b[type](value,at);return b;};
  reject(change(0,'writeUInt16LE',0),/InvalidBmpSignature/);
  for(const at of [6,8])reject(change(at,'writeUInt16LE',1),/InvalidBmpReserved/);
  reject(change(2,'writeUInt32LE',13),/InvalidBmpFileSize/);
  reject(change(2,'writeUInt32LE',raw.length+1),/UnexpectedEnd/);
  for(const offset of [0,13,53,raw.length+1,0xffffffff])reject(change(10,'writeUInt32LE',offset),/InvalidBmpPixelOffset/);
  for(const size of [0,1,16,52,56,64,0xffffffff])reject(change(14,'writeUInt32LE',size),/UnsupportedBmpHeader/);
  for(const at of [18,22])reject(change(at,'writeInt32LE',0),/InvalidBmpDimensions/);
  reject(change(18,'writeInt32LE',-1),/InvalidBmpDimensions/);
  reject(change(22,'writeInt32LE',-2147483648),/LimitExceeded/);
  for(const planes of [0,2,65535])reject(change(26,'writeUInt16LE',planes),/InvalidBmpPlanes/);
  for(const bits of [0,2,3,15,48,64,65535])reject(change(28,'writeUInt16LE',bits),/InvalidBmpBitCount/);
  for(const compression of [6,11,12,13,0xffffffff])reject(change(30,'writeUInt32LE',compression),/UnsupportedBmpCompression/);
  for(const size of [1,23,25,0xffffffff])reject(change(34,'writeUInt32LE',size),/InvalidBmpImageSize/);
  reject(raw,/LimitExceeded/,{pixels:5});reject(raw,/LimitExceeded/,{bytes:raw.length-1});reject(raw,/LimitExceeded/,{storage:23});reject(raw,/LimitExceeded/,{rgba:23},287);
  check(raw,{pixels:6,bytes:raw.length,storage:24,rgba:24});
  const palette=bmpFixture({bits:4,used:2,width:1,height:1});
  reject(palette,/LimitExceeded/,{palette:1});
  const badIndex=Buffer.from(palette);badIndex[badIndex.readUInt32LE(10)]=0x20;reject(badIndex,/InvalidBmpPaletteIndex/,{},287);
  const badReserved=Buffer.from(palette);badReserved[57]=1;reject(badReserved,/InvalidBmpReserved/);
  const excess=Buffer.from(palette);excess.writeUInt32LE(17,46);reject(excess,/InvalidBmpPaletteCount/);
  const masked=bmpFixture({compression:3,bits:16});
  for(const [at,value,error] of [[54,0,/InvalidBmpMask/],[54,0xff0000,/InvalidBmpMask/],[54,0x5000,/InvalidBmpMask/],[58,0xf800,/OverlappingBmpMasks/]]){const b=Buffer.from(masked);b.writeUInt32LE(value,at);reject(b,error);}
  const noSize=Buffer.from(masked);noSize.writeUInt32LE(0,34);reject(noSize,/InvalidBmpImageSize/);
  const tail=Buffer.concat([raw,Buffer.of(7,8,9)]);reject(tail,/TrailingBmpBytes/);check(tail,{trailing:true});
  const wide=Buffer.from(raw.subarray(14));wide.writeInt32LE(2147483647,4);wide.writeInt32LE(-2147483648,8);
  assert.deepEqual(call(285,bmpInput(wide,{pixels:0xffffffffffffffffn},285)),bmpHeaderOracle(wide));comparisons++;
  const large=bmpFixture({width:33,height:9,bits:1});const expected=bmpPixelsOracle(large);assert.ok(bmpInput(large,{},287).length<expected.length-1);
  reject(large,/LimitExceeded/,{},287,expected.length-1);
  const input=bmpInput(raw);input[20]=2;assert.throws(()=>call(286,input),/InvalidMode/);rejected++;
  for(let n=0;n<25;n++){assert.throws(()=>call(287,bmpInput(raw,{},287).subarray(0,n)),/UnexpectedEnd/);rejected++;}
  return {comparisons,rejected};
}
